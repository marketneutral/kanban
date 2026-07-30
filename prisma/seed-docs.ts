/**
 * Sample-document generator for the demo seed: composes plausible investment
 * documents from a deal's real facts and typesets them as small, valid PDFs
 * (Helvetica, no dependencies) so the in-app viewer and the AI review features
 * work on every seeded attachment.
 *
 * Line markup: "# " = page heading, "## " = section heading, "" = spacer,
 * anything else = body text (word-wrapped).
 */

type Page = string[];

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 60;
const WRAP = 96; // chars per body line at 9.8pt Helvetica, ~492pt of width

function esc(s: string): string {
  // PDF text strings here are single-byte (StandardEncoding) — transliterate
  // typographic characters to ASCII so they don't render as mojibake.
  return s
    .replace(/[—–]/g, "-")
    .replace(/[·•]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(text: string, width = WRAP): string[] {
  if (text.length <= width) return [text];
  const words = text.split(" ");
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && line.length + 1 + w.length > width) {
      out.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) out.push(line);
  return out;
}

/** Typeset pages of marked-up lines into a complete PDF file. */
export function makePdf(pages: Page[]): Buffer {
  const contents: string[] = pages.map((lines) => {
    let y = PAGE_H - MARGIN - 12;
    const ops: string[] = [];
    for (const raw of lines) {
      if (raw === "") {
        y -= 9;
        continue;
      }
      let font = "F1";
      let size = 9.8;
      let leading = 14.5;
      let text = raw;
      if (raw.startsWith("# ")) {
        font = "F2";
        size = 15;
        leading = 24;
        text = raw.slice(2);
      } else if (raw.startsWith("## ")) {
        font = "F2";
        size = 11.5;
        leading = 18;
        text = raw.slice(3);
        y -= 5; // breathing room above section heads
      }
      for (const line of font === "F1" ? wrap(text) : [text]) {
        if (y < MARGIN) break; // content sized to fit; hard stop just in case
        ops.push(`BT /${font} ${size} Tf ${MARGIN} ${y.toFixed(1)} Td (${esc(line)}) Tj ET`);
        y -= leading;
      }
    }
    return ops.join("\n");
  });

  // Objects: 1 catalog, 2 pages tree, 3 F1, 4 F2, then per page: page, content.
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
  objs.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objs.push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);
  objs.push(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
  objs.push(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);
  contents.forEach((stream, i) => {
    const pageNum = 5 + i * 2;
    objs.push(
      `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageNum + 1} 0 R >>\nendobj\n`
    );
    objs.push(
      `${pageNum + 1} 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
  });

  const header = "%PDF-1.4\n";
  let offset = Buffer.byteLength(header);
  const offsets: number[] = [];
  for (const o of objs) {
    offsets.push(offset);
    offset += Buffer.byteLength(o);
  }
  const xrefPos = offset;
  const xref =
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  const trailer = `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(header + objs.join("") + xref + trailer);
}

// ---------------------------------------------------------------- content

export type DocDeal = {
  managerName: string;
  fundName: string;
  assetClass: string;
  strategy: string;
  targetSizeMm: number;
  lead: string;
  source: string;
};

/** Small deterministic hash so each manager's documents vary but stay stable. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) * 16777619;
    h >>>= 0;
  }
  return h;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!;
}

export function buildDealDoc(
  kind: string,
  d: DocDeal
): { name: string; bytes: Buffer } {
  const h = hash(d.managerName + kind);
  const isPrivateVehicle = /Private Equity|Venture Capital|Real Assets/.test(d.assetClass);
  const mgmtFee = pick(["1.25%", "1.5%", "1.75%", "2.0%"], h);
  const perfFee = pick(["15%", "17.5%", "20%"], h >> 3);
  const pref = pick(["7%", "8%"], h >> 5);
  const liq = pick(
    ["Monthly, 30 days notice", "Quarterly, 60 days notice", "Quarterly, 90 days notice, 25% gate"],
    h >> 7
  );
  const aum = pick(["$450mm", "$800mm", "$1.2bn", "$2.1bn", "$3.4bn"], h >> 9);
  const inception = 2012 + (h % 10);
  const teamSize = 6 + (h % 30);
  const fee = isPrivateVehicle
    ? `${mgmtFee} on committed capital; ${perfFee} carried interest over an ${pref} preferred return`
    : `${mgmtFee} management; ${perfFee} performance fee`;
  const size = `$${d.targetSizeMm}mm`;

  const head = (title: string): string[] => [
    `# ${d.managerName} — ${title}`,
    `${d.fundName}  ·  ${d.assetClass}  ·  ${d.strategy}`,
    `Prepared by ${d.lead} · target allocation ${size} · sourced via ${d.source}`,
    "Sample document generated for demo purposes.",
    "",
  ];

  switch (kind) {
    case "ONE_PAGER":
      return {
        name: `${d.managerName} One-Pager.pdf`,
        bytes: makePdf([
          [
            ...head("One-Pager"),
            "## Thesis",
            `${d.managerName} runs a ${d.strategy.toLowerCase()} strategy within ${d.assetClass}. The firm manages roughly ${aum} across its vehicles, founded ${inception}, with a team of ${teamSize}. We believe the opportunity set is attractive on a 3-5 year view and that the manager's sourcing and underwriting are differentiated versus peers we have reviewed.`,
            "",
            "## Edge",
            "Repeatable sourcing through proprietary relationships; disciplined position sizing; incentive alignment through a meaningful GP commitment. Returns to date show low overlap with our existing roster.",
            "",
            "## Terms snapshot",
            `Fees: ${fee}. ${isPrivateVehicle ? "Ten-year fund life with two one-year extensions." : `Liquidity: ${liq}.`}`,
            "",
            "## Proposed next steps",
            `Present to the team, resolve follow-ups, and if supported proceed to a five-pager. Initial sizing thought: ${size}.`,
          ],
        ]),
      };

    case "FIVE_PAGER": {
      const pages: Page[] = [
        [
          ...head("Five-Pager"),
          "## 1. Thesis and opportunity",
          `The case for ${d.fundName} rests on a persistent supply/demand imbalance in ${d.assetClass.toLowerCase()} and on ${d.managerName}'s demonstrated ability to capture it through ${d.strategy.toLowerCase()}. This document expands the one-pager with evidence gathered in diligence calls and data-room review.`,
        ],
        [
          "# 2. Track record",
          `Since inception in ${inception} the manager has compounded ahead of its benchmark with drawdowns roughly half the peer median. Attribution shows returns driven by security selection rather than leverage or beta. AUM stands near ${aum}; capacity discipline has been credible to date.`,
        ],
        [
          "# 3. Portfolio fit",
          `A ${size} allocation adds exposure we currently lack, with modeled correlation to the existing book under 0.4 in stress windows. Funding would come from the strategic cash sleeve without disturbing existing managers.`,
        ],
        [
          "# 4. Key risks",
          "Key-person concentration in the founder; regime dependence of the core signal set; and fee load relative to realizable alpha. Mitigants: key-person provisions, staged funding, and negotiated fee step-downs.",
        ],
        [
          "# 5. Recommendation",
          `Proceed to ODD and legal review in parallel, targeting an Investment Proposal at ${size}. Terms to negotiate: ${fee}; ${isPrivateVehicle ? "co-invest rights and MFN." : `liquidity of ${liq}.`}`,
        ],
      ];
      return { name: `${d.managerName} Five-Pager.pdf`, bytes: makePdf(pages) };
    }

    case "PROPOSAL":
      return {
        name: `${d.managerName} Investment Proposal.pdf`,
        bytes: makePdf([
          [
            ...head("Investment Proposal"),
            "## Proposed allocation",
            `We propose an allocation of ${size} to ${d.fundName}, following completed team review, operational due diligence, and legal negotiation. ODD found no unresolved material issues; legal terms are at or better than our standards.`,
            "",
            "## Negotiated terms",
            `Fees: ${fee}. ${isPrivateVehicle ? "GP commitment of at least 2%; standard key-person and no-fault removal provisions secured." : `Liquidity: ${liq}; most-favored-nation protection at our commitment tier.`}`,
          ],
          [
            "# Conditions and approvals",
            "Funding is conditional on execution of final documents in the negotiated form and on no material adverse change before wiring. Approval chain: MD (by market type) and Legal in parallel, then CFO, then CEO.",
            "",
            "## Exit discipline",
            "We will formally review the position after any 20% drawdown, key-person event, or material strategy drift, with explicit re-underwrite or redeem triggers documented in the IC minutes.",
          ],
        ]),
      };

    case "DDQ":
      return {
        name: `${d.managerName} DDQ.pdf`,
        bytes: makePdf([
          [
            ...head("Due Diligence Questionnaire (excerpt)"),
            "## Service providers",
            `Administrator: independent, top-ten by AUA. Auditor: recognized global firm. ${isPrivateVehicle ? "Depositary and fund counsel independent of the GP." : "Prime brokers: two bulge-bracket relationships with tri-party custody."}`,
            "",
            "## Valuation",
            "Documented valuation policy; hard-to-value assets priced with independent marks reviewed quarterly by the valuation committee.",
          ],
          [
            "# Compliance and operations",
            "Registered adviser; dedicated CCO; personal-trading pre-clearance in force; no regulatory actions or material litigation disclosed in the past five years.",
            "",
            "## Cash controls",
            "Dual authorization on all wires; segregation of duties between trading and treasury; annual SOC-1 review of the administrator.",
            "",
            "## Business continuity",
            `Documented BCP tested annually; cyber program with third-party penetration testing. Team of ${teamSize} with succession plans for key roles.`,
          ],
        ]),
      };

    case "LPA":
      return {
        name: `${d.managerName} LPA (execution draft).pdf`,
        bytes: makePdf([
          [
            ...head("Limited Partnership Agreement (excerpts)"),
            "## Article 3 — Management fee",
            `The Management Fee shall equal ${mgmtFee} per annum ${isPrivateVehicle ? "of aggregate Commitments during the Investment Period, stepping down to invested capital thereafter" : "of the Net Asset Value of the Partnership, accrued monthly"}. One hundred percent of transaction, monitoring and advisory fees shall offset the Management Fee.`,
          ],
          [
            "# Article 7 — Key person; removal",
            "Upon a Key Person Event the Investment Period shall automatically suspend pending Advisory Committee action. The General Partner may be removed for Cause by a two-thirds in interest vote of the Limited Partners, and without Cause by a three-quarters vote.",
            "",
            "## Article 9 — Distributions and clawback",
            `Distributions follow a whole-of-fund waterfall with an ${pref} preferred return and a General Partner clawback secured by escrow, trued up at each audit date.`,
          ],
          [
            "# Article 12 — Side letters; MFN",
            "The General Partner shall offer each Limited Partner the benefit of any side-letter provision granted to any other Limited Partner with an equal or smaller Commitment, other than provisions relating to regulatory or tax status.",
            "",
            "## Article 14 — Reporting",
            "Audited annual financial statements within 90 days of year end; unaudited quarterly reports within 45 days; fee and expense reporting in ILPA format.",
          ],
        ]),
      };

    case "SUB_DOCS":
      return {
        name: `${d.managerName} Subscription Docs.pdf`,
        bytes: makePdf([
          [
            ...head("Subscription Agreement (summary)"),
            "## Subscription",
            `The undersigned subscribes for an interest in ${d.fundName} in the amount of ${size}, subject to acceptance by the General Partner and the terms of the Partnership Agreement.`,
            "",
            "## Representations",
            "Standard institutional representations: qualified purchaser status, no general solicitation, sanctions and AML compliance, ERISA status as disclosed on the investor questionnaire.",
            "",
            "## Transfer restrictions",
            "Transfers require General Partner consent, matching the Partnership Agreement; no additional consent rights are introduced by these subscription documents.",
            "",
            "## Completeness checklist",
            "Wire instructions confirmed against a verified callback; eligibility questionnaire, FATCA/CRS self-certifications and W-8/W-9 forms attached.",
          ],
        ]),
      };

    default:
      return {
        name: `${d.managerName} ${kind}.pdf`,
        bytes: makePdf([[...head(kind), "Sample supporting document."]]),
      };
  }
}
