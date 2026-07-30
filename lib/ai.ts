import { AzureOpenAI } from "openai";
import { readFile } from "fs/promises";
import path from "path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { db } from "@/lib/db";
import { UPLOAD_ROOT } from "@/lib/uploads";

/** Extensions we can extract text from directly, without a PDF conversion. */
export const TEXT_EXTRACT_EXTS = new Set([".pdf", ".docx", ".txt", ".md"]);

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

async function extractPdfText(absPath: string): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(await readFile(absPath)) });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy().catch(() => {});
  }
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
  const standard = await db.reviewStandard.findUnique({ where: { kind: doc.kind } });
  if (!standard) throw new Error("No review standard is configured for this document kind");

  // Extract text natively from docx/pdf/plain text; anything else falls back
  // to the LibreOffice-converted PDF preview.
  const ext = path.extname(doc.name).toLowerCase();
  let docText = "";
  if (doc.type === "FILE" && doc.path) {
    const abs = path.join(UPLOAD_ROOT, doc.path);
    if (ext === ".docx") {
      docText = (await mammoth.extractRawText({ path: abs })).value;
    } else if (ext === ".pdf") {
      docText = await extractPdfText(abs);
    } else if (ext === ".txt" || ext === ".md") {
      docText = (await readFile(abs)).toString("utf-8");
    } else if (doc.previewPath) {
      docText = await extractPdfText(path.join(UPLOAD_ROOT, doc.previewPath));
    } else {
      throw new Error(`No text extraction available for ${ext || "this file type"}`);
    }
  } else {
    throw new Error("AI review needs an uploaded file — links can't be reviewed");
  }

  docText = docText.trim();
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

  const client = new AzureOpenAI({
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
  });

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
