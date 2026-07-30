import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const assetClassNames = [
    "Equity Long/Short",
    "Credit",
    "Global Macro",
    "Private Equity",
    "Venture Capital",
    "Real Assets",
    "Multi-Strategy",
  ];
  const assetClasses: Record<string, string> = {};
  for (const name of assetClassNames) {
    const ac = await db.assetClass.upsert({ where: { name }, update: {}, create: { name } });
    assetClasses[name] = ac.id;
  }

  const users: Array<{ name: string; email: string; roles: string[] }> = [
    { name: "Avery Stone", email: "avery@example.com", roles: ["ADMIN", "DEAL_TEAM"] },
    { name: "Jordan Lee", email: "jordan@example.com", roles: ["DEAL_TEAM"] },
    { name: "Sam Rivera", email: "sam@example.com", roles: ["DEAL_TEAM"] },
    { name: "Alex Kim", email: "alex@example.com", roles: ["OPS"] },
    { name: "Priya Shah", email: "priya@example.com", roles: ["LEGAL"] },
    { name: "Morgan Chen", email: "morgan@example.com", roles: ["MD", "DEAL_TEAM"] },
    { name: "Taylor Brooks", email: "taylor@example.com", roles: ["COO"] },
    { name: "Casey Whitfield", email: "casey@example.com", roles: ["CEO"] },
  ];
  const userIds: Record<string, string> = {};
  for (const u of users) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        name: u.name,
        email: u.email,
        roles: { create: u.roles.map((role) => ({ role })) },
      },
    });
    userIds[u.name] = user.id;
  }

  const oddTemplate = [
    "Background checks — key principals",
    "DDQ received and reviewed",
    "Service provider verification (admin, auditor, PB)",
    "Compliance & regulatory review",
    "Operational site visit / call",
  ];
  const legalTemplate = [
    "LPA received",
    "LPA reviewed and negotiated",
    "Subscription docs received",
    "Subscription docs reviewed",
    "Side letter (if any) agreed",
  ];
  if ((await db.checklistTemplate.count()) === 0) {
    await db.checklistTemplate.createMany({
      data: [
        ...oddTemplate.map((label, i) => ({ track: "ODD", label, sortOrder: i })),
        ...legalTemplate.map((label, i) => ({ track: "LEGAL", label, sortOrder: i })),
      ],
    });
  }

  const standards = [
    {
      kind: "LPA",
      title: "LPA legal standards",
      prompt: `Review this Limited Partnership Agreement against our standards as an institutional LP:

FEES & ECONOMICS
- Management fee at or below 2% (expect step-downs after the investment period); performance fee/carry at or below 20% with a preferred return of 7-8% and a full GP catch-up flagged for negotiation.
- Fee offsets: 100% of transaction/monitoring/advisory fees should offset the management fee.
- Organizational expense cap present and reasonable; flag unusual expense pass-throughs (e.g. GP overhead, placement fees charged to the fund).

LIQUIDITY & STRUCTURE (where applicable)
- Redemption terms, lock-ups, gates (fund- and investor-level), side pockets, and suspension rights — flag anything beyond market norms or with unbounded GP discretion.
- In-kind distribution rights and their limits.

GOVERNANCE & PROTECTIONS
- Key person provision: triggers, consequences (investment period suspension), and cure mechanics must be present.
- GP removal: for-cause removal threshold at or below 2/3 in interest; flag absence of no-fault removal.
- LPAC composition and consent rights over conflicts, valuation, and extensions.
- Indemnification/exculpation: standard of care no weaker than gross negligence/willful misconduct/fraud; flag indemnification for ordinary negligence or breach of the agreement itself.
- Clawback: GP clawback present, ideally with interim true-ups and escrow or guarantees.

TERMS & TRANSPARENCY
- Side letter / MFN provision and its carve-outs (size-based tiers are common; flag broad carve-outs).
- Reporting: audited annuals, quarterly unaudited, ILPA-style fee reporting.
- Amendments: flag any ability to amend economic terms without affected-LP consent.
- Successor fund restrictions during the investment period.

Flag anything else a careful institutional LP would raise, including unusual or missing provisions.`,
    },
    {
      kind: "SUB_DOCS",
      title: "Subscription docs standards",
      prompt: `Review these subscription documents as an institutional LP:
- Representations we cannot make (e.g. ERISA status, sanctions/AML reps beyond standard scope, blanket tax indemnities) — flag anything unusual for an institutional allocator.
- Confirm transfer restrictions match the LPA and note any additional GP consent rights.
- Flag indemnities from the subscriber that go beyond breaches of the subscriber's own reps.
- Note any power-of-attorney grants broader than administration of the subscription.
- Check completeness: wire instructions, eligibility questionnaires, FATCA/CRS forms referenced.`,
    },
    {
      kind: "DDQ",
      title: "DDQ operational standards",
      prompt: `Review this due diligence questionnaire as an operational due diligence analyst:
- Service providers: independent administrator, auditor (recognized firm), prime broker/custodian named; flag any self-administration or affiliated providers.
- Valuation: independent pricing sources and a documented valuation policy for hard-to-value assets.
- NAV controls: who calculates, who reconciles, frequency; flag GP-only control.
- Compliance: registered status, compliance officer, personal trading policy, regulatory actions or litigation disclosed.
- Business continuity, cybersecurity, and key-person operational dependencies.
- Counterparty and cash management controls: dual authorization on wires, segregation of duties.
- Flag inconsistencies, evasive answers, or material omissions a careful ODD analyst would chase.`,
    },
  ];
  for (const s of standards) {
    await db.reviewStandard.upsert({
      where: { kind: s.kind },
      update: {},
      create: s,
    });
  }

  if ((await db.deal.count()) === 0) {
    const deals = [
      {
        managerName: "Blackwood Capital",
        fundName: "Blackwood Credit Opportunities III",
        assetClass: "Credit",
        strategy: "Distressed / special situations",
        targetSizeMm: 75,
        lead: "Jordan Lee",
        team: ["Sam Rivera"],
        source: "Prime broker cap intro",
        stage: "ONE_PAGER",
        daysAgo: 12,
      },
      {
        managerName: "Meridian Point",
        fundName: "Meridian Point Partners LP",
        assetClass: "Equity Long/Short",
        strategy: "Global TMT long/short",
        targetSizeMm: 50,
        lead: "Sam Rivera",
        team: ["Jordan Lee"],
        source: "Existing manager referral",
        stage: "FIVE_PAGER",
        daysAgo: 25,
      },
      {
        managerName: "Halcyon Ridge",
        fundName: "Halcyon Ridge Macro Fund",
        assetClass: "Global Macro",
        strategy: "Discretionary EM macro",
        targetSizeMm: 100,
        lead: "Morgan Chen",
        team: ["Jordan Lee", "Sam Rivera"],
        source: "Conference — Sohn",
        stage: "ODD_LEGAL",
        daysAgo: 18,
      },
      {
        managerName: "Foundry Green",
        fundName: "Foundry Green Ventures II",
        assetClass: "Venture Capital",
        strategy: "Early-stage climate tech",
        targetSizeMm: 25,
        lead: "Jordan Lee",
        team: [],
        source: "LP network",
        stage: "PIPELINE",
        daysAgo: 4,
      },
      {
        managerName: "Ironbark",
        fundName: "Ironbark Real Assets Fund V",
        assetClass: "Real Assets",
        strategy: "Infrastructure secondaries",
        targetSizeMm: 60,
        lead: "Sam Rivera",
        team: ["Morgan Chen"],
        source: "Placement agent",
        stage: "APPROVALS",
        daysAgo: 9,
      },
      {
        managerName: "Sable Peak",
        fundName: "Sable Peak Multi-Strategy Fund",
        assetClass: "Multi-Strategy",
        strategy: "Multi-PM platform",
        targetSizeMm: 120,
        lead: "Morgan Chen",
        team: ["Jordan Lee"],
        source: "Existing relationship",
        stage: "APPROVED",
        daysAgo: 3,
      },
    ];

    const STAGE_ORDER = [
      "PIPELINE",
      "ONE_PAGER",
      "FIVE_PAGER",
      "ODD_LEGAL",
      "PROPOSAL",
      "APPROVALS",
      "APPROVED",
    ];
    // documents/presentations required to EXIT each stage — backfilled for
    // stages a seeded deal has already passed so its history is coherent
    const STAGE_DOCS: Record<string, string> = {
      ONE_PAGER: "ONE_PAGER",
      FIVE_PAGER: "FIVE_PAGER",
      PROPOSAL: "PROPOSAL",
    };

    for (const d of deals) {
      const enteredAt = new Date(Date.now() - d.daysAgo * 86_400_000);
      const leadId = userIds[d.lead]!;
      const stageIdx = STAGE_ORDER.indexOf(d.stage);

      // Blackwood demos the IC agenda: slated for the next Monday meeting
      const nextMonday = new Date();
      nextMonday.setUTCHours(0, 0, 0, 0);
      nextMonday.setUTCDate(nextMonday.getUTCDate() + ((8 - nextMonday.getUTCDay()) % 7));

      const deal = await db.deal.create({
        data: {
          managerName: d.managerName,
          fundName: d.fundName,
          strategy: d.strategy,
          targetSizeMm: d.targetSizeMm,
          assetClassId: assetClasses[d.assetClass]!,
          leadId,
          source: d.source,
          stage: d.stage,
          stageEnteredAt: enteredAt,
          scheduledFor: d.managerName === "Blackwood Capital" ? nextMonday : null,
          team: { create: d.team.map((name) => ({ userId: userIds[name]! })) },
          events: {
            create: {
              actorId: leadId,
              action: "DEAL_CREATED",
              detail: JSON.stringify({ seeded: true }),
            },
          },
        },
      });

      // Backfill artifacts for every stage this deal has already exited.
      for (let i = 0; i < stageIdx; i++) {
        const passedStage = STAGE_ORDER[i];
        const when = new Date(enteredAt.getTime() - (stageIdx - i) * 7 * 86_400_000);
        const docKind = STAGE_DOCS[passedStage];
        if (docKind) {
          await db.document.create({
            data: {
              dealId: deal.id,
              kind: docKind,
              type: "LINK",
              name: `${d.managerName} — ${docKind === "ONE_PAGER" ? "One-Pager" : docKind === "FIVE_PAGER" ? "Five-Pager" : "Investment Proposal"}`,
              url: "https://example.com/docs",
              version: 1,
              uploadedById: leadId,
              createdAt: when,
            },
          });
          await db.presentationRecord.create({
            data: { dealId: deal.id, stage: passedStage, presentedAt: when },
          });
          await db.followUp.create({
            data: {
              dealId: deal.id,
              stage: passedStage,
              title: `Team feedback on the ${docKind === "ONE_PAGER" ? "one-pager" : docKind === "FIVE_PAGER" ? "five-pager" : "proposal"}`,
              status: "RESOLVED",
              createdById: leadId,
              resolvedAt: when,
              createdAt: when,
            },
          });
        }
      }

      // Deals at or past ODD & Legal get their checklists.
      if (stageIdx >= STAGE_ORDER.indexOf("ODD_LEGAL")) {
        const templates = await db.checklistTemplate.findMany({ orderBy: { sortOrder: "asc" } });
        const pastOdd = stageIdx > STAGE_ORDER.indexOf("ODD_LEGAL");
        const opsId = userIds["Alex Kim"]!;
        const legalId = userIds["Priya Shah"]!;
        await db.checklistItem.createMany({
          data: templates.map((t, n) => {
            // in-progress deal: first few items done; past deals: everything done
            const done = pastOdd || n % 2 === 0;
            return {
              dealId: deal.id,
              track: t.track,
              label: t.label,
              sortOrder: t.sortOrder,
              done,
              doneById: done ? (t.track === "ODD" ? opsId : legalId) : null,
              doneAt: done ? enteredAt : null,
            };
          }),
        });
        if (pastOdd) {
          await db.deal.update({
            where: { id: deal.id },
            data: { oddCompletedAt: enteredAt, oddCompletedById: opsId },
          });
          await db.document.createMany({
            data: [
              {
                dealId: deal.id,
                kind: "DDQ",
                type: "LINK",
                name: `${d.managerName} — DDQ`,
                url: "https://example.com/docs",
                version: 1,
                uploadedById: opsId,
              },
              {
                dealId: deal.id,
                kind: "LPA",
                type: "LINK",
                name: `${d.managerName} — LPA (execution copy)`,
                url: "https://example.com/docs",
                version: 1,
                uploadedById: legalId,
              },
              {
                dealId: deal.id,
                kind: "SUB_DOCS",
                type: "LINK",
                name: `${d.managerName} — Subscription docs`,
                url: "https://example.com/docs",
                version: 1,
                uploadedById: legalId,
              },
            ],
          });
        }
      }

      // Deals in (or past) the approval chain get their approval rows.
      if (stageIdx >= STAGE_ORDER.indexOf("APPROVALS")) {
        const finalized = d.stage === "APPROVED";
        const signers: Record<string, string> = {
          MD: userIds["Morgan Chen"]!,
          LEGAL: userIds["Priya Shah"]!,
          COO: userIds["Taylor Brooks"]!,
          CEO: userIds["Casey Whitfield"]!,
        };
        for (const step of ["MD", "LEGAL", "COO", "CEO"]) {
          // Ironbark mid-chain: MD + Legal signed, COO/CEO pending
          const signed = finalized || step === "MD" || step === "LEGAL";
          await db.approval.create({
            data: {
              dealId: deal.id,
              step,
              status: signed ? "APPROVED" : "PENDING",
              decidedById: signed ? signers[step] : null,
              decidedAt: signed ? enteredAt : null,
            },
          });
        }
        if (finalized) {
          await db.deal.update({ where: { id: deal.id }, data: { status: "APPROVED" } });
        }
      }

      // A live open follow-up on the in-progress pager deals for realism.
      if (d.stage === "ONE_PAGER" || d.stage === "FIVE_PAGER") {
        await db.followUp.create({
          data: {
            dealId: deal.id,
            stage: d.stage,
            title:
              d.stage === "ONE_PAGER"
                ? "Clarify capacity and expected launch AUM"
                : "Follow up on track-record attribution questions from the team",
            assigneeId: leadId,
            createdById: userIds["Morgan Chen"]!,
          },
        });
      }
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
