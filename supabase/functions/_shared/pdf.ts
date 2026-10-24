import { PDFDocument } from "pdf-lib";
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export async function validatePdf(
  bytes: Uint8Array,
): Promise<{ pages: number }> {
  if (!bytes.length || bytes.length > MAX_PDF_BYTES)
    throw new Error("Choose a PDF of at most 10 MiB.");
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error("The selected file is not a PDF.");
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(bytes, { throwOnInvalidObject: true });
  } catch {
    throw new Error(
      "This PDF is unreadable or encrypted. Use an unencrypted original.",
    );
  }
  const pages = document.getPageCount();
  if (pages < 1 || pages > 10)
    throw new Error("Choose a PDF containing 1 to 10 pages.");
  return { pages };
}
