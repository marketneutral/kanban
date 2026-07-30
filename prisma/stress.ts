/**
 * Bulk synthetic deals for scale-testing the board and pipeline map.
 *
 *   npx tsx prisma/stress.ts 200     # insert 200 tagged deals
 *   npx tsx prisma/stress.ts --clean # remove them
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const TAG = "stress-test";

const ADJ = ["Blue", "North", "Silver", "Granite", "Cedar", "Falcon", "Harbor", "Summit", "Vantage", "Copper", "Atlas", "Beacon", "Crescent", "Drift", "Ember", "Frontier"];
const NOUN = ["Ridge", "Point", "Peak", "Gate", "Rock", "Field", "Bridge", "Grove", "Bay", "Crest", "Hollow", "Spring", "Vale", "Reach", "Sound", "Bluff"];
const VEHICLE = ["Partners", "Capital", "Opportunities Fund", "Master Fund", "Fund II", "Fund III", "Fund IV", "Offshore Ltd", "Select Fund"];
const STAGES = ["PIPELINE", "ONE_PAGER", "FIVE_PAGER", "ODD_LEGAL", "PROPOSAL", "APPROVALS"];

async function main() {
  const arg = process.argv[2];

  if (arg === "--clean") {
    const { count } = await db.deal.deleteMany({ where: { source: TAG } });
    console.log(`Removed ${count} stress-test deals.`);
    return;
  }

  const n = Math.max(1, Math.min(2000, parseInt(arg ?? "150", 10) || 150));
  const classes = await db.assetClass.findMany();
  // only deal-team members lead deals — MDs and executives sign, not source
  const leads = await db.user.findMany({
    where: { active: true, roles: { some: { role: "DEAL_TEAM" } } },
  });
  if (classes.length === 0 || leads.length === 0) {
    throw new Error("Seed the database first (npm run db:seed)");
  }

  let s = 20260730;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;

  for (let i = 0; i < n; i++) {
    const manager = `${pick(ADJ)}${pick(NOUN).toLowerCase()} ${rand() > 0.5 ? "Capital" : "Advisors"}`;
    const daysAgo = Math.floor(rand() * 120);
    const team = [...new Set([pick(leads).id, pick(leads).id])];
    const lead = pick(leads);
    await db.deal.create({
      data: {
        managerName: manager,
        fundName: `${manager.split(" ")[0]} ${pick(VEHICLE)}`,
        assetClassId: pick(classes).id,
        leadId: lead.id,
        strategy: null,
        // log-uniform 3–900mm so the map shows real size contrast
        targetSizeMm: Math.round(3 * Math.pow(300, rand())),
        source: TAG,
        stage: pick(STAGES),
        status: rand() < 0.06 ? "ON_HOLD" : "ACTIVE",
        stageEnteredAt: new Date(Date.now() - daysAgo * 86_400_000),
        team: { create: team.filter((id) => id !== lead.id).map((userId) => ({ userId })) },
      },
    });
  }
  console.log(`Inserted ${n} stress-test deals (source="${TAG}").`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
