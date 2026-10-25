import { getDocumentProxy } from "unpdf";
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
// Reading/copying an owner-protected PDF does not require an opening password.
// PDF.js opens those normally; it rejects documents requiring a user password.
export async function openValidatedPdf(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_PDF_BYTES)
    throw new Error("Choose a PDF of at most 10 MiB.");
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error("The selected file is not a PDF.");
  let document: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    document = await getDocumentProxy(bytes.slice(), {
      useSystemFonts: false,
      disableFontFace: true,
      useWasm: false,
      verbosity: 0,
    });
  } catch {
    throw new Error(
      "This PDF is unreadable or requires an opening password. Use a readable original.",
    );
  }
  if (document.numPages < 1 || document.numPages > 10) {
    await document.loadingTask.destroy();
    throw new Error("Choose a PDF containing 1 to 10 pages.");
  }
  return document;
}
export async function validatePdf(
  bytes: Uint8Array,
): Promise<{ pages: number }> {
  const document = await openValidatedPdf(bytes);
  try {
    return { pages: document.numPages };
  } finally {
    await document.loadingTask.destroy();
  }
}
