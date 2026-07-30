import { db } from "@/lib/db";
import { STAGES, STAGE_LABELS, stageIndex, type Stage } from "@/lib/types";

/**
 * The gate engine. One pure function decides whether a deal may leave its
 * current stage; the server actions enforce it and the UI explains it, so the
 * two can never disagree.
 */

export type Requirement = {
  key: string;
  label: string;
  met: boolean;
};

export type GateStatus = {
  nextStage: Stage | null;
  requirements: Requirement[];
  ready: boolean;
};

/** The slice of a deal the gate evaluation needs, loadable in one query. */
export type GateDeal = {
  stage: string;
  status: string;
  targetSizeMm: number | null;
  oddCompletedAt: Date | null;
  documents: { kind: string }[];
  presentations: { stage: string }[];
  followUps: { stage: string; status: string }[];
  checklistItems: { track: string; done: boolean }[];
};

export const gateInclude = {
  documents: { select: { kind: true } },
  presentations: { select: { stage: true } },
  followUps: { select: { stage: true, status: true } },
  checklistItems: { select: { track: true, done: true } },
} as const;

export async function loadGateDeal(dealId: string) {
  return db.deal.findUniqueOrThrow({ where: { id: dealId }, include: gateInclude });
}

function hasDoc(deal: GateDeal, kind: string): boolean {
  return deal.documents.some((d) => d.kind === kind);
}

function presented(deal: GateDeal, stage: string): boolean {
  return deal.presentations.some((p) => p.stage === stage);
}

function openFollowUps(deal: GateDeal, stage: string): number {
  return deal.followUps.filter((f) => f.stage === stage && f.status === "OPEN").length;
}

function followUpReq(deal: GateDeal, stage: string): Requirement {
  const open = openFollowUps(deal, stage);
  return {
    key: "followups",
    label:
      open > 0
        ? `All follow-ups resolved or waived (${open} still open)`
        : "All follow-ups resolved or waived",
    met: open === 0,
  };
}

function checklistState(deal: GateDeal, track: string): { total: number; done: number } {
  const items = deal.checklistItems.filter((c) => c.track === track);
  return { total: items.length, done: items.filter((c) => c.done).length };
}

/** Requirements to EXIT the deal's current stage. */
export function evaluateGate(deal: GateDeal): GateStatus {
  const idx = stageIndex(deal.stage);
  const nextStage =
    idx >= 0 && idx < STAGES.length - 1 ? (STAGES[idx + 1] as Stage) : null;

  let requirements: Requirement[] = [];

  switch (deal.stage as Stage) {
    case "PIPELINE":
      requirements = [
        {
          key: "size",
          label: "Target allocation size set",
          met: deal.targetSizeMm !== null,
        },
      ];
      break;

    case "ONE_PAGER":
      requirements = [
        { key: "doc", label: "One-pager attached", met: hasDoc(deal, "ONE_PAGER") },
        {
          key: "presented",
          label: "Presented to the team",
          met: presented(deal, "ONE_PAGER"),
        },
        followUpReq(deal, "ONE_PAGER"),
      ];
      break;

    case "FIVE_PAGER":
      requirements = [
        { key: "doc", label: "Five-pager attached", met: hasDoc(deal, "FIVE_PAGER") },
        {
          key: "presented",
          label: "Presented to the team",
          met: presented(deal, "FIVE_PAGER"),
        },
        followUpReq(deal, "FIVE_PAGER"),
      ];
      break;

    case "ODD_LEGAL": {
      const odd = checklistState(deal, "ODD");
      requirements = [
        {
          key: "odd-checklist",
          label:
            odd.total === 0
              ? "ODD checklist complete"
              : `ODD checklist complete (${odd.done}/${odd.total})`,
          met: odd.total > 0 && odd.done === odd.total,
        },
        {
          key: "odd-signoff",
          label: "Ops has marked ODD complete",
          met: deal.oddCompletedAt !== null,
        },
        followUpReq(deal, "ODD_LEGAL"),
      ];
      break;
    }

    case "PROPOSAL":
      requirements = [
        {
          key: "doc",
          label: "Investment proposal attached",
          met: hasDoc(deal, "PROPOSAL"),
        },
        {
          key: "presented",
          label: "Presented to the team",
          met: presented(deal, "PROPOSAL"),
        },
        followUpReq(deal, "PROPOSAL"),
      ];
      break;

    case "APPROVALS":
      // Exit happens only through the approval chain (M4), never a manual move.
      requirements = [
        { key: "chain", label: "Approval chain complete (MD + Legal → COO → CEO)", met: false },
      ];
      break;

    case "APPROVED":
      requirements = [];
      break;
  }

  return {
    nextStage,
    requirements,
    ready:
      deal.stage !== "APPROVALS" &&
      nextStage !== null &&
      requirements.every((r) => r.met),
  };
}

/**
 * Legal-track readiness: does not gate stage movement, but gates the Legal
 * approval in the chain (M4) and is surfaced on the deal page.
 */
export function evaluateLegal(deal: GateDeal): GateStatus {
  const legal = checklistState(deal, "LEGAL");
  const requirements: Requirement[] = [
    { key: "lpa", label: "LPA attached", met: hasDoc(deal, "LPA") },
    { key: "subdocs", label: "Sub docs attached", met: hasDoc(deal, "SUB_DOCS") },
    {
      key: "legal-checklist",
      label:
        legal.total === 0
          ? "Legal checklist complete"
          : `Legal checklist complete (${legal.done}/${legal.total})`,
      met: legal.total > 0 && legal.done === legal.total,
    },
  ];
  return { nextStage: null, requirements, ready: requirements.every((r) => r.met) };
}

export function unmetSummary(gate: GateStatus): string {
  return gate.requirements
    .filter((r) => !r.met)
    .map((r) => r.label)
    .join("; ");
}

/** Copy checklist items from admin templates when a deal first enters ODD & Legal. */
export async function seedChecklists(dealId: string) {
  const existing = await db.checklistItem.count({ where: { dealId } });
  if (existing > 0) return;
  const templates = await db.checklistTemplate.findMany({ orderBy: { sortOrder: "asc" } });
  if (templates.length === 0) return;
  await db.checklistItem.createMany({
    data: templates.map((t) => ({
      dealId,
      track: t.track,
      label: t.label,
      sortOrder: t.sortOrder,
    })),
  });
}

export { STAGE_LABELS };
