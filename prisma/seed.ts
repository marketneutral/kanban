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
    ];

    for (const d of deals) {
      const enteredAt = new Date(Date.now() - d.daysAgo * 86_400_000);
      await db.deal.create({
        data: {
          managerName: d.managerName,
          fundName: d.fundName,
          strategy: d.strategy,
          targetSizeMm: d.targetSizeMm,
          assetClassId: assetClasses[d.assetClass]!,
          leadId: userIds[d.lead]!,
          source: d.source,
          stage: d.stage,
          stageEnteredAt: enteredAt,
          team: { create: d.team.map((name) => ({ userId: userIds[name]! })) },
          events: {
            create: {
              actorId: userIds[d.lead]!,
              action: "DEAL_CREATED",
              detail: JSON.stringify({ seeded: true }),
            },
          },
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
