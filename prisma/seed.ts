import { PrismaClient } from "@prisma/client";
import { copyFile, mkdir } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const db = new PrismaClient();
const execFileAsync = promisify(execFile);

const UPLOAD_ROOT = path.join(process.cwd(), "data", "uploads");
const ASSETS = path.join(process.cwd(), "seed-assets");

/** Copy a bundled sample file in as a deal document, with best-effort preview. */
async function seedAsset(opts: {
  dealId: string;
  kind: string;
  src: string;
  name: string;
  uploadedById: string;
}): Promise<string> {
  const version = 1;
  const safeName = opts.name.replace(/[^\w.\- ]+/g, "_");
  const relPath = path.join(opts.dealId, `${opts.kind.toLowerCase()}-v${version}-${safeName}`);
  const absPath = path.join(UPLOAD_ROOT, relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await copyFile(path.join(ASSETS, opts.src), absPath);

  let previewPath: string | null = null;
  if (!absPath.toLowerCase().endsWith(".pdf")) {
    try {
      const outDir = path.join(path.dirname(absPath), "previews");
      await mkdir(outDir, { recursive: true });
      await execFileAsync(
        "soffice",
        ["--headless", "--convert-to", "pdf", "--outdir", outDir, absPath],
        { timeout: 60_000 }
      );
      const produced = path.join(outDir, `${path.basename(absPath, path.extname(absPath))}.pdf`);
      previewPath = path.relative(UPLOAD_ROOT, produced);
    } catch {
      previewPath = null; // soffice unavailable — viewer falls back to download
    }
  }

  const doc = await db.document.create({
    data: {
      dealId: opts.dealId,
      kind: opts.kind,
      version,
      type: "FILE",
      name: opts.name,
      path: relPath,
      previewPath,
      uploadedById: opts.uploadedById,
      note: "Sample document (seeded)",
    },
  });
  return doc.id;
}

async function main() {
  // marketType routes the MD approval: PUBLIC → MD — Publics, PRIVATE → MD — Privates
  const assetClassDefs: Array<[string, string]> = [
    ["Equity Long/Short", "PUBLIC"],
    ["Credit", "PUBLIC"],
    ["Global Macro", "PUBLIC"],
    ["Multi-Strategy", "PUBLIC"],
    ["Private Equity", "PRIVATE"],
    ["Venture Capital", "PRIVATE"],
    ["Real Assets", "PRIVATE"],
  ];
  const assetClasses: Record<string, string> = {};
  for (const [name, marketType] of assetClassDefs) {
    const ac = await db.assetClass.upsert({
      where: { name },
      update: { marketType },
      create: { name, marketType },
    });
    assetClasses[name] = ac.id;
  }

  const users: Array<{ name: string; email: string; roles: string[] }> = [
    { name: "Avery Stone", email: "avery@example.com", roles: ["ADMIN", "DEAL_TEAM"] },
    { name: "Jordan Lee", email: "jordan@example.com", roles: ["DEAL_TEAM"] },
    { name: "Sam Rivera", email: "sam@example.com", roles: ["DEAL_TEAM"] },
    { name: "Nadia Osei", email: "nadia@example.com", roles: ["DEAL_TEAM"] },
    { name: "Marcus Webb", email: "marcus@example.com", roles: ["DEAL_TEAM"] },
    { name: "Ines Delgado", email: "ines@example.com", roles: ["DEAL_TEAM"] },
    { name: "Tom Nakamura", email: "tom@example.com", roles: ["DEAL_TEAM"] },
    { name: "Alex Kim", email: "alex@example.com", roles: ["OPS"] },
    { name: "Omar Haddad", email: "omar@example.com", roles: ["OPS"] },
    { name: "Priya Shah", email: "priya@example.com", roles: ["LEGAL"] },
    { name: "Sofia Lindgren", email: "sofia@example.com", roles: ["LEGAL"] },
    { name: "Morgan Chen", email: "morgan@example.com", roles: ["MD_PUBLIC"] },
    { name: "Grace Kimball", email: "grace@example.com", roles: ["MD_PRIVATE"] },
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
  const rubrics = [
    {
      kind: "ONE_PAGER",
      title: "Devil's advocate — one-pager rubric",
      prompt: `Argue against this idea the way our most skeptical IC member would:
- Thesis: why might the stated edge not exist, not persist, or already be priced? Who is on the other side of these trades and why are they wrong?
- Crowding & capacity: is this a consensus trade dressed up as differentiated? Does the strategy degrade at the proposed AUM?
- Track record: distinguish skill from beta, leverage, and a favorable regime. Watch for cherry-picked benchmarks, short samples, backtests presented as live results, and survivorship.
- Team: dependence on one person; unproven spin-out dynamics; why did they really leave their last firm?
- Economics: does the fee load consume the edge? Alignment of GP incentives with ours.
- Regime risk: in what plausible macro environment does this lose badly, and what is the realistic worst 12 months?
- What is conspicuously missing from the document that the team should have addressed?`,
    },
    {
      kind: "FIVE_PAGER",
      title: "Devil's advocate — five-pager rubric",
      prompt: `Full adversarial review before IC presentation:
- Attack the core thesis and each supporting pillar separately; identify the single assumption that, if wrong, breaks the case.
- Evidence quality: are return drivers demonstrated or asserted? Attribution vs luck; sample length; regime dependence; benchmark choice.
- Portfolio fit: correlation with our existing book in stress scenarios (not calm ones); what we're really paying for after fees and taxes.
- Liquidity: mismatch between fund terms and underlying assets; our exit options in a drawdown; gates and side-pocket risk in practice.
- Operational and business risk: firm viability at current AUM, key-person, concentration of investors, service-provider quality.
- Sizing: why the proposed allocation could be too large; what position would we actually want after a 20% drawdown?
- The strongest competing use of this capital, and what would need to be true to prefer this deal to it.`,
    },
    {
      kind: "PROPOSAL",
      title: "Devil's advocate — investment proposal rubric",
      prompt: `Final pressure-test before approvals:
- Has anything material changed since the five-pager (performance, personnel, terms, AUM)? Are stale numbers being carried forward?
- Do the proposed terms match what was negotiated? Any drift on fees, liquidity, or capacity rights?
- Are ODD and legal findings honestly reflected, or sanded down? Quote any tension between this document and earlier diligence.
- Concentration and pacing: portfolio-level effects of this commitment now vs waiting a quarter.
- Exit discipline: what specific, observable triggers would make us redeem or not re-up, and are they stated?
- If we had to defend this allocation to our board after a bad first year, what in this document would look naive?`,
    },
  ];
  for (const s of [...standards, ...rubrics.map((r) => ({ ...r, mode: "DEVILS_ADVOCATE" }))]) {
    const mode = "mode" in s ? (s as { mode: string }).mode : "STANDARDS";
    await db.reviewStandard.upsert({
      where: { kind_mode: { kind: s.kind, mode } },
      update: {},
      create: { kind: s.kind, mode, title: s.title, prompt: s.prompt },
    });
  }

  await db.benchmark.upsert({
    where: { name: "Global PE — TVPI quintiles by vintage (illustrative)" },
    update: {},
    create: {
      name: "Global PE — TVPI quintiles by vintage (illustrative)",
      kind: "PE_QUINTILES",
      // [q20, q40, q60, q80] boundaries per vintage. Illustrative values —
      // replace with your benchmark provider's data.
      data: JSON.stringify(
        [
          [2011, 1.35, 1.55, 1.75, 2.05],
          [2012, 1.35, 1.55, 1.8, 2.1],
          [2013, 1.32, 1.52, 1.75, 2.05],
          [2014, 1.3, 1.5, 1.72, 2.02],
          [2015, 1.28, 1.48, 1.7, 2.0],
          [2016, 1.26, 1.46, 1.66, 1.95],
          [2017, 1.24, 1.44, 1.62, 1.9],
          [2018, 1.22, 1.4, 1.58, 1.85],
          [2019, 1.18, 1.35, 1.52, 1.75],
          [2020, 1.12, 1.28, 1.45, 1.65],
          [2021, 1.05, 1.18, 1.32, 1.5],
          [2022, 1.0, 1.1, 1.22, 1.38],
        ].map(([vintage, ...q]) => ({ vintage, q }))
      ),
    },
  });

  if ((await db.deal.count()) === 0) {
    const deals = [
      {
        managerName: "Blackwood Capital",
        fundName: "Blackwood Credit Opportunities III",
        assetClass: "Credit",
        strategy: "Distressed / special situations",
        targetSizeMm: 75,
        lead: "Jordan Lee",
        team: ["Sam Rivera", "Marcus Webb"],
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
        team: ["Jordan Lee", "Tom Nakamura"],
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
        lead: "Nadia Osei",
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
        team: ["Ines Delgado"],
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
        lead: "Tom Nakamura",
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
        // The MD signature routes by market type: Grace (Privates) signs
        // Ironbark's Real Assets deal, Morgan (Publics) signs Sable Peak.
        const isPrivate = assetClassDefs.find(([n]) => n === d.assetClass)?.[1] === "PRIVATE";
        const signers: Record<string, string> = {
          MD: isPrivate ? userIds["Grace Kimball"]! : userIds["Morgan Chen"]!,
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

  // Sample files: decks, LPA, sub docs, DDQ — real uploads the demo can open,
  // preview, AI-review, and profile-extract.
  const deckDocIds: Record<string, string> = {};
  if ((await db.document.count({ where: { type: "FILE" } })) === 0) {
    const byName = async (name: string) =>
      (await db.deal.findFirst({ where: { managerName: name } }))?.id;
    const uid = async (name: string) =>
      (await db.user.findFirst({ where: { name } }))!.id;

    const blackwood = await byName("Blackwood Capital");
    const meridianId = await byName("Meridian Point");
    const halcyon = await byName("Halcyon Ridge");
    const ironbarkId = await byName("Ironbark");
    const jordan = await uid("Jordan Lee");
    const sam = await uid("Sam Rivera");
    const priya = await uid("Priya Shah");
    const alex = await uid("Alex Kim");

    if (blackwood)
      await seedAsset({
        dealId: blackwood,
        kind: "ONE_PAGER",
        src: "blackwood-onepager.docx",
        name: "Blackwood One-Pager.docx",
        uploadedById: jordan,
      });
    if (meridianId)
      deckDocIds["Meridian Point"] = await seedAsset({
        dealId: meridianId,
        kind: "PITCH_DECK",
        src: "meridian-deck.pdf",
        name: "Meridian Point — Investor Presentation.pdf",
        uploadedById: sam,
      });
    if (halcyon) {
      await seedAsset({
        dealId: halcyon,
        kind: "LPA",
        src: "halcyon-lpa.docx",
        name: "Halcyon Ridge LPA (execution draft).docx",
        uploadedById: priya,
      });
      await seedAsset({
        dealId: halcyon,
        kind: "SUB_DOCS",
        src: "halcyon-subdocs.docx",
        name: "Halcyon Subscription Agreement.docx",
        uploadedById: priya,
      });
      await seedAsset({
        dealId: halcyon,
        kind: "DDQ",
        src: "halcyon-ddq.docx",
        name: "Halcyon Ridge DDQ.docx",
        uploadedById: alex,
      });
    }
    if (ironbarkId)
      deckDocIds["Ironbark"] = await seedAsset({
        dealId: ironbarkId,
        kind: "PITCH_DECK",
        src: "ironbark-deck.pdf",
        name: "Ironbark Fund V — Investor Presentation.pdf",
        uploadedById: sam,
      });
  }

  // Demo AI manager profiles so the profile panel and charts show on first run.
  if ((await db.dealProfile.count()) === 0) {
    const avery = await db.user.findFirst({ where: { name: "Avery Stone" } });
    const meridian = await db.deal.findFirst({ where: { managerName: "Meridian Point" } });
    const ironbark = await db.deal.findFirst({ where: { managerName: "Ironbark" } });

    if (avery && meridian) {
      // deterministic pseudo-random monthly series, Jan 2019 – Jun 2026
      let s = 42;
      const rand = () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
      const gauss = () => {
        const u = Math.max(rand(), 1e-9);
        const v = rand();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      };
      const series: { period: string; fundPct: number; benchmarkPct: number }[] = [];
      for (let i = 0; i < 90; i++) {
        const yr = 2019 + Math.floor(i / 12);
        const mo = (i % 12) + 1;
        const mkt = 0.55 + 4.1 * gauss();
        const fund = 1.15 + 0.3 * (mkt / 4.1) + 2.1 * gauss();
        series.push({
          period: `${yr}-${String(mo).padStart(2, "0")}`,
          fundPct: Math.round(fund * 100) / 100,
          benchmarkPct: Math.round(mkt * 100) / 100,
        });
      }
      await db.dealProfile.create({
        data: {
          dealId: meridian.id,
          sourceDocumentId: deckDocIds["Meridian Point"] ?? null,
          managerType: "HEDGE_FUND",
          model: "seed-demo",
          createdById: avery.id,
          data: JSON.stringify({
            managerType: "HEDGE_FUND",
            summary:
              "Meridian Point runs a global TMT long/short equity strategy with a fundamental, medium-horizon process and disciplined net exposure management. The team of 14 spun out of a large multi-manager platform in 2018. Returns since inception show meaningful alpha over the MSCI World with roughly half the drawdown.",
            card: {
              managerName: "Meridian Point",
              fundName: "Meridian Point Partners LP",
              assetClassName: "Equity Long/Short",
              strategy: "Global TMT long/short",
              targetSizeMm: 50,
            },
            firm: { aum: "$2.4bn", founded: "2018", headquarters: "New York, NY" },
            keyPeople: [
              {
                name: "David Okafor",
                role: "Founder & CIO",
                background: "Ex-sector head at a large multi-manager platform; 19 yrs in TMT",
              },
              {
                name: "Lena Marsh",
                role: "Partner, PM — Software",
                background: "Joined at founding; previously TMT analyst at a global fund",
              },
              {
                name: "Kenji Sato",
                role: "COO / CCO",
                background: "Former COO of a $3bn equity manager; CPA",
              },
            ],
            keyTerms: [
              { term: "Management fee", value: "1.5%" },
              { term: "Performance fee", value: "17.5%" },
              { term: "Liquidity", value: "Quarterly, 60 days notice" },
              { term: "Lock-up", value: "12 months soft (3% fee)" },
              { term: "Minimum", value: "$5mm" },
            ],
            deadlines: [
              { date: "2026-08-25", label: "September 1 subscription cutoff" },
              { date: "2026-12-31", label: "Targeted capacity close" },
            ],
            trackRecord: {
              benchmarkName: "MSCI World TR",
              returnsSeries: series,
              funds: [],
            },
            notes: "Seeded demo profile with synthetic figures for illustration.",
          }),
        },
      });
    }

    if (avery && ironbark) {
      await db.dealProfile.create({
        data: {
          dealId: ironbark.id,
          sourceDocumentId: deckDocIds["Ironbark"] ?? null,
          managerType: "PRIVATE_MARKETS",
          model: "seed-demo",
          createdById: avery.id,
          data: JSON.stringify({
            managerType: "PRIVATE_MARKETS",
            summary:
              "Ironbark acquires infrastructure fund stakes in the secondary market, focusing on core-plus assets in OECD markets. Fund V continues the strategy of Funds I–IV with a larger allocation to GP-led continuation vehicles. Prior funds have consistently landed in the top two quintiles on TVPI.",
            card: {
              managerName: "Ironbark",
              fundName: "Ironbark Real Assets Fund V",
              assetClassName: "Real Assets",
              strategy: "Infrastructure secondaries",
              targetSizeMm: 60,
            },
            firm: { aum: "$4.1bn", founded: "2009", headquarters: "London, UK" },
            keyPeople: [
              {
                name: "Margaret Hale",
                role: "Managing Partner",
                background: "Co-founded Ironbark; previously infrastructure M&A at a bulge bracket",
              },
              {
                name: "Tomás Rivera",
                role: "Partner, Head of Secondaries",
                background: "Led European secondaries at a global alternatives firm",
              },
              {
                name: "Priya Nair",
                role: "CFO",
                background: "15 yrs fund finance across PE and infrastructure",
              },
            ],
            keyTerms: [
              { term: "Management fee", value: "2.0% on committed" },
              { term: "Carried interest", value: "20% over 8% pref" },
              { term: "Fund term", value: "10 years + two 1-yr extensions" },
              { term: "GP commitment", value: "2.5%" },
              { term: "Target size", value: "$750mm (hard cap $900mm)" },
            ],
            deadlines: [
              { date: "2026-06-30", label: "First close (completed)" },
              { date: "2026-11-30", label: "Final close" },
            ],
            trackRecord: {
              benchmarkName: "",
              returnsSeries: [],
              funds: [
                { name: "Fund I", vintage: 2012, sizeMm: 210, netIrrPct: 18.9, dpi: 1.92, tvpi: 1.95, status: "Fully realized" },
                { name: "Fund II", vintage: 2015, sizeMm: 375, netIrrPct: 16.2, dpi: 1.41, tvpi: 1.78, status: "Harvesting" },
                { name: "Fund III", vintage: 2018, sizeMm: 520, netIrrPct: 14.8, dpi: 0.62, tvpi: 1.52, status: "Harvesting" },
                { name: "Fund IV", vintage: 2021, sizeMm: 640, netIrrPct: 11.3, dpi: 0.15, tvpi: 1.21, status: "Investing" },
              ],
            },
            notes: "Seeded demo profile with synthetic figures for illustration.",
          }),
        },
      });
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
