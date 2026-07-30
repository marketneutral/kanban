import { readFile } from "fs/promises";
import path from "path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

/** Extensions we can extract text from directly, without a PDF conversion. */
export const TEXT_EXTRACT_EXTS = new Set([".pdf", ".docx", ".txt", ".md"]);

export async function extractPdfText(absPath: string): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(await readFile(absPath)) });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/**
 * Extract text from a stored file: native for docx/pdf/plain text, otherwise
 * from the supplied LibreOffice-converted PDF preview.
 */
export async function extractDocumentText(
  absPath: string,
  previewAbsPath?: string | null
): Promise<string> {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === ".docx") return (await mammoth.extractRawText({ path: absPath })).value;
  if (ext === ".pdf") return extractPdfText(absPath);
  if (ext === ".txt" || ext === ".md") return (await readFile(absPath)).toString("utf-8");
  if (previewAbsPath) return extractPdfText(previewAbsPath);
  throw new Error(`No text extraction available for ${ext || "this file type"}`);
}
