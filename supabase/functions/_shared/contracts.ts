import { z } from "zod";
export const receiptLineSchema = z
  .object({
    id: z.uuid(),
    source_label: z.string().min(1).max(500),
    proposed: z.unknown().nullable().optional(),
    reviewed_name: z.string().trim().max(120).nullable(),
    quantity: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,6})?$/)
      .refine((v) => Number(v) > 0)
      .nullable(),
    unit: z.enum(["g", "kg", "ml", "l", "item"]).nullable(),
    product_id: z.uuid().nullable(),
    location_id: z.uuid().nullable(),
    expiry: z.iso.date().nullable(),
    included: z.boolean(),
  })
  .refine(
    (l) =>
      l.unit !== "item" ||
      l.quantity === null ||
      /^\d+(\.0+)?$/.test(l.quantity),
    "Items must be whole numbers",
  );
export type ReceiptLine = z.infer<typeof receiptLineSchema>;
export const receiptReviewSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  filename: z.string(),
  status: z.enum(["uploading", "uploaded", "review_ready", "duplicate"]),
  canonical_id: z.uuid().nullable(),
  lines: z.array(receiptLineSchema).max(200),
});
export const extractionProposalSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            source_label: z.string().min(1).max(500),
            proposed_name: z.string().max(120).nullable(),
            quantity: z
              .string()
              .regex(/^\d{1,12}(\.\d{1,6})?$/)
              .refine((v) => Number(v) > 0)
              .nullable(),
            unit: z.enum(["g", "kg", "ml", "l", "item"]).nullable(),
            issues: z.array(z.string().max(200)).max(10),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export function reviewIssues(
  line: ReceiptLine,
  product?: { base_unit: "g" | "ml" | "item" },
): string[] {
  if (!line.included) return [];
  const issues: string[] = [];
  if (!receiptLineSchema.safeParse(line).success)
    issues.push("Correct invalid quantity, date, or line values.");
  const base = line.unit === "kg" ? "g" : line.unit === "l" ? "ml" : line.unit;
  if (product && base && product.base_unit !== base)
    issues.push("The unit does not match the selected product.");
  if (!line.reviewed_name?.trim() && !line.product_id)
    issues.push("Choose a product or name.");
  if (!line.quantity || !line.unit)
    issues.push("Review the quantity and unit.");
  if (!line.location_id) issues.push("Choose a storage location.");
  return issues;
}
