import { AzureOpenAI } from "openai";
import path from "path";
import { db } from "@/lib/db";
import { UPLOAD_ROOT } from "@/lib/uploads";
import { extractDocumentText } from "@/lib/extract";

export { TEXT_EXTRACT_EXTS } from "@/lib/extract";

/**
 * AI document reviews via Azure OpenAI.
 * Required env: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT
 * Optional: AZURE_OPENAI_API_VERSION (default 2024-10-21 — supports structured outputs)
 */

export const AI_MODEL = process.env.AZURE_OPENAI_DEPLOYMENT ?? "";

export function aiConfigured(): boolean {
  return !!(
    process.env.AZURE_OPENAI_ENDPOINT &&
    process.env.AZURE_OPENAI_API_KEY &&
    process.env.AZURE_OPENAI_DEPLOYMENT
  );
}

export type ReviewFinding = {
  title: string;
  severity: "info" | "caution" | "high";
  clause: string;
  excerpt: string;
  concern: string;
  suggestion: string;
};

export type ReviewResult = {
  assessment: "STANDARD" | "NEGOTIABLE_ISSUES" | "SIGNIFICANT_CONCERNS";
  summary: string;
  findings: ReviewFinding[];
};

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["assessment", "summary", "findings"],
  properties: {
    assessment: {
      type: "string",
      enum: ["STANDARD", "NEGOTIABLE_ISSUES", "SIGNIFICANT_CONCERNS"],
      description: "Overall read of the document against the standards",
    },
    summary: {
      type: "string",
      description: "3-5 sentence executive summary of the review for the deal team",
    },
    findings: {
      type: "array",
      description: "Specific issues found, most severe first. Empty if fully standard.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "severity", "clause", "excerpt", "concern", "suggestion"],
        properties: {
          title: { type: "string", description: "Short label for the finding" },
          severity: { type: "string", enum: ["info", "caution", "high"] },
          clause: {
            type: "string",
            description: "Section/clause reference in the document, or 'missing' if absent",
          },
          excerpt: {
            type: "string",
            description: "Short verbatim quote of the relevant language, empty if missing",
          },
          concern: { type: "string", description: "Why this matters for the allocator" },
          suggestion: {
            type: "string",
            description: "Concrete negotiation ask or diligence follow-up",
          },
        },
      },
    },
  },
} as const;

// generous cap that stays well inside a 128K-token context window
const MAX_DOC_CHARS = 350_000;

export function azureClient(): AzureOpenAI {
  return new AzureOpenAI({
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
  });
}

/**
 * Run an AI review of an uploaded document against the admin-maintained
 * standard for its kind. Extracts text from the PDF (original, or the
 * LibreOffice-converted preview for Office uploads) and returns structured
 * findings.
 */
export async function runDocumentReview(documentId: string): Promise<ReviewResult> {
  const doc = await db.document.findUniqueOrThrow({
    where: { id: documentId },
    include: { deal: { include: { assetClass: true } } },
  });
  const standard = await db.reviewStandard.findUnique({
    where: { kind_mode: { kind: doc.kind, mode: "STANDARDS" } },
  });
  if (!standard) throw new Error("No review standard is configured for this document kind");

  if (doc.type !== "FILE" || !doc.path) {
    throw new Error("AI review needs an uploaded file — links can't be reviewed");
  }
  let docText = (
    await extractDocumentText(
      path.join(UPLOAD_ROOT, doc.path),
      doc.previewPath ? path.join(UPLOAD_ROOT, doc.previewPath) : null
    )
  ).trim();
  if (!docText) {
    throw new Error(
      "No text could be extracted from this document — it may be a scanned image (OCR is not supported yet)"
    );
  }
  let truncated = false;
  if (docText.length > MAX_DOC_CHARS) {
    docText = docText.slice(0, MAX_DOC_CHARS);
    truncated = true;
  }

  const client = azureClient();

  const completion = await client.chat.completions.create({
    model: AI_MODEL, // Azure deployment name
    response_format: {
      type: "json_schema",
      json_schema: { name: "document_review", strict: true, schema: REVIEW_SCHEMA },
    },
    messages: [
      {
        role: "system",
        content:
          "You are reviewing an investment fund document for an institutional allocator's " +
          "internal workflow tool. Review rigorously against the firm's standards provided. " +
          "Quote the document precisely; never invent clause numbers or language. " +
          "This is a preliminary automated read to focus the professionals' attention — " +
          "not legal advice — so favor flagging genuine substance over exhaustive nitpicks.",
      },
      {
        role: "user",
        content:
          `Deal context: ${doc.deal.managerName} — ${doc.deal.fundName} ` +
          `(${doc.deal.assetClass.name}${doc.deal.strategy ? `, ${doc.deal.strategy}` : ""}).\n` +
          `Document kind: ${doc.kind}. File: ${doc.name} (v${doc.version}).\n` +
          (truncated
            ? `NOTE: the document text was truncated at ${MAX_DOC_CHARS.toLocaleString()} characters; note this limitation in your summary.\n`
            : "") +
          `\nFirm standards to review against:\n${standard.prompt}\n\n` +
          `--- DOCUMENT TEXT ---\n${docText}`,
      },
    ],
  });

  const choice = completion.choices[0];
  if (choice?.finish_reason === "content_filter") {
    throw new Error("The review was blocked by the Azure OpenAI content filter");
  }
  const content = choice?.message?.content;
  if (!content) throw new Error("The model returned no review");
  return JSON.parse(content) as ReviewResult;
}

// ---------------------------------------------------------- deck extraction

export type DeckProfile = {
  managerType: "HEDGE_FUND" | "PRIVATE_MARKETS" | "OTHER";
  summary: string;
  card: {
    managerName: string;
    fundName: string;
    assetClassName: string;
    strategy: string;
    targetSizeMm: number | null;
  };
  firm: { aum: string; founded: string; headquarters: string };
  keyPeople: { name: string; role: string; background: string }[];
  keyTerms: { term: string; value: string }[];
  deadlines: { date: string; label: string }[];
  trackRecord: {
    benchmarkName: string;
    returnsSeries: { period: string; fundPct: number; benchmarkPct: number | null }[];
    funds: {
      name: string;
      vintage: number | null;
      sizeMm: number | null;
      netIrrPct: number | null;
      dpi: number | null;
      tvpi: number | null;
      status: string;
    }[];
  };
  notes: string;
};

const DECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "managerType",
    "summary",
    "card",
    "firm",
    "keyPeople",
    "keyTerms",
    "deadlines",
    "trackRecord",
    "notes",
  ],
  properties: {
    managerType: {
      type: "string",
      enum: ["HEDGE_FUND", "PRIVATE_MARKETS", "OTHER"],
      description:
        "HEDGE_FUND for open-ended vehicles reporting periodic returns; PRIVATE_MARKETS for closed-end funds with vintages and DPI/TVPI",
    },
    summary: { type: "string", description: "3-4 sentence summary of the manager and offering" },
    card: {
      type: "object",
      additionalProperties: false,
      required: ["managerName", "fundName", "assetClassName", "strategy", "targetSizeMm"],
      properties: {
        managerName: { type: "string", description: "Management firm name" },
        fundName: { type: "string", description: "Fund/vehicle being offered" },
        assetClassName: {
          type: "string",
          description: "Best match from the provided asset class list, verbatim",
        },
        strategy: { type: "string", description: "One-line strategy description" },
        targetSizeMm: {
          type: ["number", "null"],
          description: "Fund target size or our indicative allocation, in USD millions",
        },
      },
    },
    firm: {
      type: "object",
      additionalProperties: false,
      required: ["aum", "founded", "headquarters"],
      properties: {
        aum: { type: "string", description: "Firm AUM as stated, empty if not stated" },
        founded: { type: "string", description: "Year founded, empty if not stated" },
        headquarters: { type: "string", description: "HQ location, empty if not stated" },
      },
    },
    keyPeople: {
      type: "array",
      description: "Key investment professionals and leadership",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "role", "background"],
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          background: {
            type: "string",
            description: "One line: prior firms, tenure, notable facts. Empty if not stated.",
          },
        },
      },
    },
    keyTerms: {
      type: "array",
      description:
        "Commercial terms as stated: management fee, performance fee/carry, preferred return, lock-up/liquidity, minimum, fund term, GP commitment, etc.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "value"],
        properties: { term: { type: "string" }, value: { type: "string" } },
      },
    },
    deadlines: {
      type: "array",
      description: "Known dates: first/final close, subscription cutoffs, launch dates",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "label"],
        properties: {
          date: { type: "string", description: "YYYY-MM-DD if determinable, else empty" },
          label: { type: "string" },
        },
      },
    },
    trackRecord: {
      type: "object",
      additionalProperties: false,
      required: ["benchmarkName", "returnsSeries", "funds"],
      properties: {
        benchmarkName: {
          type: "string",
          description: "Benchmark named in the deck's track record, empty if none",
        },
        returnsSeries: {
          type: "array",
          description:
            "Periodic net returns exactly as stated in the deck (monthly, quarterly, or annual), oldest first. Empty for private-markets managers.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["period", "fundPct", "benchmarkPct"],
            properties: {
              period: {
                type: "string",
                description: "YYYY-MM for monthly/quarterly points, YYYY for annual",
              },
              fundPct: { type: "number", description: "Fund net return for the period, percent" },
              benchmarkPct: {
                type: ["number", "null"],
                description: "Benchmark return for the same period if stated",
              },
            },
          },
        },
        funds: {
          type: "array",
          description:
            "Prior fund history for private-markets managers, oldest first. Empty for hedge funds.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "vintage", "sizeMm", "netIrrPct", "dpi", "tvpi", "status"],
            properties: {
              name: { type: "string" },
              vintage: { type: ["number", "null"] },
              sizeMm: { type: ["number", "null"], description: "Fund size in USD millions" },
              netIrrPct: { type: ["number", "null"] },
              dpi: { type: ["number", "null"] },
              tvpi: { type: ["number", "null"] },
              status: { type: "string", description: "e.g. Fully realized, Investing, empty" },
            },
          },
        },
      },
    },
    notes: {
      type: "string",
      description:
        "Caveats for the deal team: what was ambiguous, missing, or assumed during extraction",
    },
  },
} as const;

/** Extract a structured manager profile + deal-card draft from pitch deck text. */
export async function runDeckExtraction(
  deckText: string,
  assetClassNames: string[]
): Promise<DeckProfile> {
  let text = deckText.trim();
  if (!text) {
    throw new Error(
      "No text could be extracted from this deck — it may be image-only (OCR is not supported yet)"
    );
  }
  let truncated = false;
  if (text.length > MAX_DOC_CHARS) {
    text = text.slice(0, MAX_DOC_CHARS);
    truncated = true;
  }

  const completion = await azureClient().chat.completions.create({
    model: AI_MODEL,
    response_format: {
      type: "json_schema",
      json_schema: { name: "deck_profile", strict: true, schema: DECK_SCHEMA },
    },
    messages: [
      {
        role: "system",
        content:
          "You extract structured data from investment manager pitch decks for an " +
          "institutional allocator's pipeline tool. Only report what the document states — " +
          "never invent numbers, people, or dates. Track-record figures must be transcribed " +
          "exactly as printed. Put anything ambiguous in the notes field.",
      },
      {
        role: "user",
        content:
          `Our asset class list (choose assetClassName from these, verbatim): ${assetClassNames.join(", ")}.\n` +
          (truncated ? "NOTE: deck text was truncated; mention this in notes.\n" : "") +
          `\n--- PITCH DECK TEXT ---\n${text}`,
      },
    ],
  });

  const choice = completion.choices[0];
  if (choice?.finish_reason === "content_filter") {
    throw new Error("The extraction was blocked by the Azure OpenAI content filter");
  }
  const content = choice?.message?.content;
  if (!content) throw new Error("The model returned no extraction");
  return JSON.parse(content) as DeckProfile;
}

// -------------------------------------------------------- devil's advocate

export type DevilsAdvocateResult = {
  verdict: "WELL_SUPPORTED" | "NEEDS_STRONGER_EVIDENCE" | "THESIS_AT_RISK";
  bearCase: string;
  rebuttals: {
    claim: string;
    counterargument: string;
    severity: "minor" | "notable" | "serious";
    evidenceToRequest: string;
  }[];
  keyQuestions: string[];
};

const DA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "bearCase", "rebuttals", "keyQuestions"],
  properties: {
    verdict: {
      type: "string",
      enum: ["WELL_SUPPORTED", "NEEDS_STRONGER_EVIDENCE", "THESIS_AT_RISK"],
      description: "How well the document's thesis survives adversarial scrutiny",
    },
    bearCase: {
      type: "string",
      description:
        "The strongest coherent bear case against this investment, in 4-6 sentences, written as a skeptical IC member would state it",
    },
    rebuttals: {
      type: "array",
      description: "Specific claims challenged, most damaging first",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "counterargument", "severity", "evidenceToRequest"],
        properties: {
          claim: {
            type: "string",
            description: "The document's claim, quoted or tightly paraphrased",
          },
          counterargument: {
            type: "string",
            description: "The strongest honest rebuttal of that claim",
          },
          severity: { type: "string", enum: ["minor", "notable", "serious"] },
          evidenceToRequest: {
            type: "string",
            description: "What evidence would settle it — the ask for the deal team",
          },
        },
      },
    },
    keyQuestions: {
      type: "array",
      description: "The 3-6 hardest questions the IC should ask the presenting team",
      items: { type: "string" },
    },
  },
} as const;

/**
 * 😈 Adversarial read of a one-pager / five-pager / proposal against the
 * firm's devil's-advocate rubric for that document kind.
 */
export async function runDevilsAdvocate(documentId: string): Promise<DevilsAdvocateResult> {
  const doc = await db.document.findUniqueOrThrow({
    where: { id: documentId },
    include: { deal: { include: { assetClass: true } } },
  });
  const rubric = await db.reviewStandard.findUnique({
    where: { kind_mode: { kind: doc.kind, mode: "DEVILS_ADVOCATE" } },
  });
  if (!rubric) throw new Error("No devil's-advocate rubric is configured for this document kind");
  if (doc.type !== "FILE" || !doc.path) {
    throw new Error("Devil's advocate needs an uploaded file — links can't be analyzed");
  }

  let text = (
    await extractDocumentText(
      path.join(UPLOAD_ROOT, doc.path),
      doc.previewPath ? path.join(UPLOAD_ROOT, doc.previewPath) : null
    )
  ).trim();
  if (!text) {
    throw new Error("No text could be extracted from this document (scanned image?)");
  }
  if (text.length > MAX_DOC_CHARS) text = text.slice(0, MAX_DOC_CHARS);

  const completion = await azureClient().chat.completions.create({
    model: AI_MODEL,
    response_format: {
      type: "json_schema",
      json_schema: { name: "devils_advocate", strict: true, schema: DA_SCHEMA },
    },
    messages: [
      {
        role: "system",
        content:
          "You are the designated devil's advocate on an institutional investment " +
          "committee. Your job is to argue AGAINST the investment as persuasively as honesty " +
          "allows: attack the thesis, the evidence, and the incentives. Be specific and " +
          "steelman the counterarguments — no generic risk boilerplate. Stay honest: do not " +
          "invent facts, and concede strength where the document earns it. The deal team " +
          "will use this to pressure-test the idea before presenting.",
      },
      {
        role: "user",
        content:
          `Deal: ${doc.deal.managerName} — ${doc.deal.fundName} ` +
          `(${doc.deal.assetClass.name}${doc.deal.strategy ? `, ${doc.deal.strategy}` : ""}).\n` +
          `Document: ${doc.kind}, "${doc.name}" (v${doc.version}).\n\n` +
          `The committee's devil's-advocate rubric:\n${rubric.prompt}\n\n` +
          `--- DOCUMENT TEXT ---\n${text}`,
      },
    ],
  });

  const choice = completion.choices[0];
  if (choice?.finish_reason === "content_filter") {
    throw new Error("The analysis was blocked by the Azure OpenAI content filter");
  }
  const content = choice?.message?.content;
  if (!content) throw new Error("The model returned no analysis");
  return JSON.parse(content) as DevilsAdvocateResult;
}
