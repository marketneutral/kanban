import { execFile } from "child_process";
import { mkdir, rename } from "fs/promises";
import path from "path";
import { promisify } from "util";
import { UPLOAD_ROOT } from "@/lib/uploads";

const execFileAsync = promisify(execFile);

export const CONVERTIBLE_EXTS = new Set([
  ".doc",
  ".docx",
  ".odt",
  ".rtf",
  ".xls",
  ".xlsx",
  ".ods",
  ".ppt",
  ".pptx",
  ".odp",
]);

/**
 * Convert an uploaded Office document to a PDF preview with LibreOffice.
 * Returns the preview path relative to UPLOAD_ROOT, or null when conversion
 * is unavailable or fails — previews are best-effort, never blocking.
 */
export async function generatePdfPreview(relPath: string): Promise<string | null> {
  const ext = path.extname(relPath).toLowerCase();
  if (!CONVERTIBLE_EXTS.has(ext)) return null;

  const abs = path.join(UPLOAD_ROOT, relPath);
  const outDir = path.join(path.dirname(abs), "previews");
  await mkdir(outDir, { recursive: true });

  try {
    // Separate profile dir avoids clashes when two conversions run at once.
    const profile = path.join(outDir, `.lo-${process.pid}-${Date.now()}`);
    await execFileAsync(
      "soffice",
      [
        `-env:UserInstallation=file://${profile}`,
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        outDir,
        abs,
      ],
      { timeout: 60_000 }
    );
    const produced = path.join(
      outDir,
      `${path.basename(abs, path.extname(abs))}.pdf`
    );
    // Rename to make the association with the source file explicit.
    const finalAbs = `${produced.slice(0, -4)}.preview.pdf`;
    await rename(produced, finalAbs);
    return path.relative(UPLOAD_ROOT, finalAbs);
  } catch {
    return null; // soffice missing or conversion failed — viewer falls back to download
  }
}
