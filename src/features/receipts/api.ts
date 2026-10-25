import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { backend } from "../../shared/supabase";
import { useHousehold } from "../auth/useHousehold";
import { receiptReviewSchema } from "../../../supabase/functions/_shared/contracts";
export function useReceipts() {
  const h = useHousehold();
  return useQuery({
    queryKey: ["receipts", h.data?.id],
    enabled: !!h.data,
    queryFn: async () => {
      if (!h.data) throw new Error("Kitchen unavailable.");
      const r = await backend()
        .from("receipt_imports")
        .select("id,filename,status,canonical_id")
        .eq("household_id", h.data.id)
        .order("created_at", { ascending: false });
      if (r.error) throw r.error;
      return z
        .array(
          z.object({
            id: z.uuid(),
            filename: z.string(),
            status: z.string(),
            canonical_id: z.uuid().nullable(),
          }),
        )
        .parse(r.data);
    },
  });
}
export function useReceipt(id: string) {
  const h = useHousehold();
  return useQuery({
    queryKey: ["receipt", h.data?.id, id],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !!h.data && z.uuid().safeParse(id).success,
    queryFn: async () => {
      const r = await backend().rpc("get_receipt_review", { p_receipt: id });
      if (r.error) throw r.error;
      return receiptReviewSchema.parse(r.data);
    },
  });
}
export async function verifyReceipt(id: string) {
  const r = await backend().functions.invoke("verify-receipt", {
    body: { receipt_id: id },
  });
  if (r.error) {
    if (r.error.context instanceof Response) {
      const body: unknown = await r.error.context.json();
      const parsed = z.object({ error: z.string() }).safeParse(body);
      if (parsed.success) throw new Error(parsed.data.error);
    }
    throw r.error;
  }
  return z
    .object({
      id: z.uuid(),
      duplicate: z.boolean(),
      pages: z.number().int(),
      parsing: z.enum(["configured", "not_configured"]),
    })
    .parse(r.data);
}

export async function parseReceipt(id: string, revision: number) {
  const result = await backend().functions.invoke("parse-receipt", {
    body: { receipt_id: id, revision },
  });
  if (result.error) {
    if (result.error.context instanceof Response) {
      const detail = z
        .object({ error: z.string() })
        .safeParse(await result.error.context.json());
      if (detail.success) throw new Error(detail.data.error);
    }
    throw result.error;
  }
  return z
    .object({ id: z.uuid(), status: z.enum(["pending", "completed"]) })
    .parse(result.data);
}
