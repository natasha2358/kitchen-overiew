import { extractText } from "unpdf";
import { openValidatedPdf } from "./pdf.ts";
export type ReceiptTextResult =
  | { route: "embedded_text"; pages: number; text: string; reason: null }
  | {
      route: "vision_required";
      pages: number;
      text: null;
      reason:
        | "no_text"
        | "sparse_text"
        | "garbled_text"
        | "partial_pages"
        | "text_limit"
        | "extraction_failed";
    };
// Conservative initial routing thresholds, not a claim of receipt/model accuracy.
export function assessReceiptText(pages: string[]): ReceiptTextResult {
  const text = pages.join("\n\n").trim();
  const fallback = (
    reason: Extract<ReceiptTextResult, { route: "vision_required" }>["reason"],
  ): ReceiptTextResult => ({
    route: "vision_required",
    pages: pages.length,
    text: null,
    reason,
  });
  if (!text) return fallback("no_text");
  if (text.length > 50_000) return fallback("text_limit");
  if (
    text.includes("\uFFFD") ||
    /[\u0000-\u0008\u000B\u000E-\u001F]/u.test(text)
  )
    return fallback("garbled_text");
  if (pages.some((page) => !page.trim())) return fallback("partial_pages");
  if (
    text.length < 80 ||
    (text.match(/\p{L}/gu)?.length ?? 0) < 20 ||
    !/\d/.test(text)
  )
    return fallback("sparse_text");
  return { route: "embedded_text", pages: pages.length, text, reason: null };
}
export async function extractReceiptText(
  bytes: Uint8Array,
): Promise<ReceiptTextResult> {
  const pdf = await openValidatedPdf(bytes);
  const pages = pdf.numPages;
  try {
    const extracted = await extractText(pdf, { mergePages: false });
    return assessReceiptText(extracted.text);
  } catch {
    return {
      route: "vision_required",
      pages,
      text: null,
      reason: "extraction_failed",
    };
  } finally {
    await pdf.loadingTask.destroy();
  }
}
