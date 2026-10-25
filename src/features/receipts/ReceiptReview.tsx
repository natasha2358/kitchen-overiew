import { runOperation, readOperation } from "../../shared/operation-intent";
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { z } from "zod";
import { backend } from "../../shared/supabase";
import { messageOf } from "../../shared/errors";
import {
  Body,
  Button,
  Card,
  Field,
  Loading,
  Problem,
  Screen,
} from "../../shared/ui";
import { AuthGate } from "../auth/AuthGate";
import { useAuth } from "../auth/Providers";
import { useHousehold } from "../auth/useHousehold";
import { useLocations, useProducts } from "../inventory/api";
import { matchProducts } from "../inventory/quantity";
import { useReceipt, verifyReceipt, parseReceipt } from "./api";
import {
  ReceiptLine,
  receiptLineSchema,
  receiptReviewSchema,
  reviewIssues,
} from "../../../supabase/functions/_shared/contracts";
function ProposalDetails({ proposed }: { proposed: unknown }) {
  const parsed = z
    .object({
      proposed_name: z.string().nullable(),
      quantity: z.string().nullable(),
      unit: z.string().nullable(),
      issues: z.array(z.string()),
      quantity_evidence: z.string().nullable().optional(),
      purchase_count: z.string().nullable().optional(),
      package_quantity: z.string().nullable().optional(),
      package_unit: z.string().nullable().optional(),
    })
    .safeParse(proposed);
  if (!parsed.success) return null;
  return (
    <>
      <Body>
        AI proposed: {parsed.data.proposed_name ?? "Unresolved product"};{" "}
        {parsed.data.quantity ?? "Unknown quantity"} {parsed.data.unit ?? ""}
      </Body>
      {parsed.data.quantity_evidence && (
        <Body>Quantity source: {parsed.data.quantity_evidence}</Body>
      )}
      {parsed.data.purchase_count && (
        <Body>Proposed purchase count: {parsed.data.purchase_count}</Body>
      )}
      {parsed.data.package_quantity && (
        <Body>
          Proposed package size: {parsed.data.package_quantity}{" "}
          {parsed.data.package_unit}. Confirm the count and size before using a
          total.
        </Body>
      )}
      {parsed.data.issues.map((issue, index) => (
        <Body key={index}>Review: {issue}</Body>
      ))}
    </>
  );
}
export function ReceiptEditor({
  receipt,
}: {
  receipt: z.infer<typeof receiptReviewSchema>;
}) {
  const [lines, setLines] = useState<ReceiptLine[]>(receipt.lines);
  const [revision, setRevision] = useState(receipt.revision);
  const [metadata, setMetadata] = useState({
    merchant: receipt.merchant ?? "",
    receipt_number: receipt.receipt_number ?? "",
    purchased_on: receipt.purchased_on ?? "",
    total: receipt.total ?? "",
    currency: receipt.currency ?? "",
  });
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [source, setSource] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const locations = useLocations();
  const products = useProducts();
  const { online } = useAuth();
  const h = useHousehold();
  const client = useQueryClient();
  const router = useRouter();
  function change(id: string, changes: Partial<ReceiptLine>) {
    setLines((old) => old.map((l) => (l.id === id ? { ...l, ...changes } : l)));
    setDirty(true);
    setNotice("");
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!online) throw new Error("Reconnect before saving.");
      const valid = z.array(receiptLineSchema).max(200).parse(lines);
      const r = await backend().rpc("save_receipt_review", {
        p_receipt: receipt.id,
        p_revision: revision,
        p_metadata: Object.fromEntries(
          Object.entries(metadata).map(([k, v]) => [k, v.trim() || null]),
        ),
        p_lines: valid.map(({ proposed, ...line }) => line),
      });
      if (r.error) throw r.error;
      setRevision(r.data);
      setDirty(false);
      setNotice("Draft saved. Inventory is unchanged.");
      await client.invalidateQueries({
        queryKey: ["receipt", h.data?.id, receipt.id],
      });
      await client.invalidateQueries({ queryKey: ["receipts", h.data?.id] });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    setError("");
    try {
      if (!online) throw new Error("Reconnect before reloading.");
      const result = await backend().rpc("get_receipt_review", {
        p_receipt: receipt.id,
      });
      if (result.error) throw result.error;
      const latest = receiptReviewSchema.parse(result.data);
      setLines(latest.lines);
      setRevision(latest.revision);
      setMetadata({
        merchant: latest.merchant ?? "",
        receipt_number: latest.receipt_number ?? "",
        purchased_on: latest.purchased_on ?? "",
        total: latest.total ?? "",
        currency: latest.currency ?? "",
      });
      setAcknowledged([]);
      setDirty(false);
      setNotice("Latest saved review loaded.");
      client.setQueryData(["receipt", h.data?.id, receipt.id], latest);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      if (!online || !h.data) throw new Error("Reconnect first.");
      const key = `receipt-confirm.${h.data.id}.${receipt.id}`;
      const pending = await readOperation(key);
      const request = pending?.request ?? {
        receipt_id: receipt.id,
        revision,
        acknowledged,
      };
      await runOperation(
        key,
        pending?.operation ?? randomUUID(),
        request,
        async (operation, payload) => {
          const args = z
            .object({
              receipt_id: z.uuid(),
              revision: z.number().int(),
              acknowledged: z.array(z.uuid()),
            })
            .parse(payload);
          const result = await backend().rpc("confirm_receipt", {
            p_receipt: args.receipt_id,
            p_revision: args.revision,
            p_operation: operation,
            p_acknowledged: args.acknowledged,
          });
          if (result.error) throw result.error;
          return result.data;
        },
      );
      setNotice("Receipt confirmed. Inventory updated.");
      await client.invalidateQueries();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function deleteSource() {
    setBusy(true);
    setError("");
    try {
      if (!online) throw new Error("Reconnect first.");
      const result = await backend().functions.invoke("delete-receipt-source", {
        body: { receipt_id: receipt.id },
      });
      if (result.error) throw result.error;
      z.object({ deleted: z.literal(true) }).parse(result.data);
      setNotice(
        "Source PDF deleted. Import identity and stock history retained.",
      );
      setDeleteRequested(false);
      await client.invalidateQueries({
        queryKey: ["receipt", h.data?.id, receipt.id],
      });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function parse() {
    setBusy(true);
    setError("");
    try {
      if (!online || dirty)
        throw new Error("Reconnect and save or discard local edits first.");
      const result = await parseReceipt(receipt.id, revision);
      if (result.status === "completed") {
        await reload();
        setNotice(
          "AI draft loaded. Check every line, choose locations and save your review before confirming stock.",
        );
      } else {
        setNotice(
          "Receipt processing is active. Reload to check it; retry after its one-minute lease if interrupted.",
        );
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      await client.invalidateQueries({
        queryKey: ["receipt", h.data?.id, receipt.id],
      });
      await client.invalidateQueries({ queryKey: ["receipts", h.data?.id] });
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setError("");
    try {
      if (!online) throw new Error("Reconnect first.");
      const r = await verifyReceipt(receipt.id);
      if (r.id !== receipt.id)
        router.replace({ pathname: "/receipts/[id]", params: { id: r.id } });
      else
        await client.invalidateQueries({
          queryKey: ["receipt", h.data?.id, receipt.id],
        });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  if (receipt.status === "duplicate")
    return (
      <Card>
        <Body>This PDF already has a canonical receipt.</Body>
        {receipt.canonical_id && (
          <Button
            title="Open original receipt"
            onPress={() =>
              router.replace({
                pathname: "/receipts/[id]",
                params: { id: receipt.canonical_id ?? receipt.id },
              })
            }
          />
        )}
      </Card>
    );
  return (
    <>
      <Card>
        <Body>{receipt.filename}</Body>
        <Body>
          AI proposals require your review. Missing quantities stay unresolved;
          deposits and non-food lines are excluded proposals you can correct.
          You can always enter lines manually.
        </Body>
        <Body>
          {dirty
            ? "Unsaved changes — keep this screen open until saved."
            : "Draft loaded. Saving never changes inventory."}
        </Body>
        {receipt.extraction && (
          <Body>
            Processing: {receipt.extraction.status}; attempts{" "}
            {receipt.extraction.attempts}/2.
            {receipt.extraction.route
              ? ` Route: ${receipt.extraction.route}.`
              : ""}
            {receipt.extraction.reason
              ? ` Reason: ${receipt.extraction.reason}.`
              : ""}
            {receipt.extraction.error
              ? ` Last result: ${receipt.extraction.error}.`
              : ""}
          </Body>
        )}
        {receipt.status === "uploaded" && !receipt.source_deleted && (
          <>
            <Body>
              Generate a draft sends extracted receipt text to OpenAI. If
              server-side vision is enabled, the PDF may also be sent when text
              is unusable or incomplete. Each explicit attempt permits at most
              two model calls.
            </Body>
            <Button
              title={busy ? "Processing…" : "Generate / retry receipt draft"}
              onPress={() => void parse()}
              disabled={
                busy ||
                !online ||
                dirty ||
                (receipt.extraction?.attempts === 2 &&
                  receipt.extraction.status !== "pending")
              }
            />
          </>
        )}
        {notice && <Body>{notice}</Body>}
        {error && <Problem message={error} />}
        {receipt.revision > revision && (
          <Problem message="A newer saved review is available. Your edits have been kept. Reload it before making further changes." />
        )}
        <Button
          title={
            dirty
              ? "Discard my edits and reload saved review"
              : "Reload saved review"
          }
          onPress={() => void reload()}
          disabled={busy || !online}
        />
        {receipt.status === "uploading" && (
          <>
            <Body>
              Verification has not completed. If the upload was interrupted,
              reselect the original PDF from the receipt list.
            </Body>
            <Button
              title="Retry verification"
              onPress={() => void verify()}
              disabled={busy || !online}
            />
          </>
        )}
      </Card>
      {receipt.status !== "uploading" && (
        <Card>
          <Body>
            {receipt.source_deleted
              ? "Source PDF deleted; receipt identity retained."
              : "The private source PDF is retained."}
          </Body>
          {!receipt.source_deleted && (
            <Button
              title={
                deleteRequested
                  ? "Confirm source PDF deletion / retry"
                  : "Delete source PDF…"
              }
              onPress={() =>
                deleteRequested ? void deleteSource() : setDeleteRequested(true)
              }
              disabled={busy || !online}
            />
          )}
          {deleteRequested && (
            <Button
              title="Cancel deletion"
              onPress={() => setDeleteRequested(false)}
              disabled={busy}
            />
          )}
          {receipt.confirmation && (
            <Body>
              Confirmed: {receipt.confirmation.batches.length} inventory
              batches. This receipt cannot be added twice.
            </Body>
          )}
        </Card>
      )}
      {receipt.status !== "uploading" && receipt.status !== "confirmed" && (
        <>
          <Card>
            <Body>
              Optional receipt details help detect possible duplicates. Leave
              missing values blank.
            </Body>
            {(Object.keys(metadata) as (keyof typeof metadata)[]).map((key) => (
              <Field
                key={key}
                label={
                  key === "purchased_on"
                    ? "Purchase date (YYYY-MM-DD)"
                    : key === "currency"
                      ? "Currency (three-letter code)"
                      : key.replaceAll("_", " ")
                }
                value={metadata[key]}
                editable={!busy}
                onChangeText={(value) => {
                  setMetadata((old) => ({ ...old, [key]: value }));
                  setDirty(true);
                  setAcknowledged([]);
                }}
              />
            ))}
          </Card>
          {lines.map((line) => (
            <Card key={line.id}>
              <Body>Source: {line.source_label}</Body>
              <ProposalDetails proposed={line.proposed} />
              {matchProducts(line.source_label, products.data ?? []).length >
                0 && (
                <Body>
                  Matching saved names/aliases:{" "}
                  {matchProducts(line.source_label, products.data ?? [])
                    .map((p) => p.name)
                    .join(", ")}
                  . Choose the correct product explicitly.
                </Body>
              )}
              <Field
                label="Reviewed product name"
                value={line.reviewed_name ?? ""}
                onChangeText={(v) =>
                  change(line.id, {
                    reviewed_name: v || null,
                    product_id: null,
                  })
                }
                editable={!busy}
              />
              <Body>Existing product (optional)</Body>
              {products.data?.map((p) => (
                <Button
                  key={p.id}
                  title={(line.product_id === p.id ? "✓ " : "") + p.name}
                  onPress={() =>
                    change(line.id, { product_id: p.id, reviewed_name: p.name })
                  }
                  disabled={busy}
                />
              ))}
              <Field
                label="Quantity (blank if unresolved)"
                value={line.quantity ?? ""}
                onChangeText={(v) => change(line.id, { quantity: v || null })}
                keyboardType="decimal-pad"
                editable={!busy}
              />
              <Body>Unit: {line.unit ?? "Unresolved"}</Body>
              {(["g", "kg", "ml", "l", "item"] as const).map((u) => (
                <Button
                  key={u}
                  title={(line.unit === u ? "✓ " : "") + u}
                  onPress={() => change(line.id, { unit: u })}
                  disabled={busy}
                />
              ))}
              <Body>Storage location</Body>
              {locations.data?.map((l) => (
                <Button
                  key={l.id}
                  title={(line.location_id === l.id ? "✓ " : "") + l.name}
                  onPress={() => change(line.id, { location_id: l.id })}
                  disabled={busy}
                />
              ))}
              <Field
                label="Expiry (YYYY-MM-DD, optional)"
                value={line.expiry ?? ""}
                onChangeText={(v) => change(line.id, { expiry: v || null })}
                editable={!busy}
              />
              <Button
                title={
                  line.included ? "Exclude this line" : "Include this line"
                }
                onPress={() => change(line.id, { included: !line.included })}
                disabled={busy}
              />
              {reviewIssues(
                line,
                products.data?.find((p) => p.id === line.product_id),
              ).map((issue) => (
                <Body key={issue}>{issue}</Body>
              ))}
            </Card>
          ))}
          <Card>
            <Field
              label="Source label for a missing line"
              value={source}
              onChangeText={setSource}
              editable={!busy}
            />
            <Button
              title="Add manual line"
              onPress={() => {
                if (!source.trim()) return;
                setLines((old) => [
                  ...old,
                  {
                    id: randomUUID(),
                    source_label: source.trim(),
                    reviewed_name: null,
                    quantity: null,
                    unit: null,
                    product_id: null,
                    location_id: null,
                    expiry: null,
                    included: true,
                  },
                ]);
                setSource("");
                setDirty(true);
              }}
              disabled={busy || lines.length >= 200}
            />
            <Button
              title={busy ? "Saving…" : "Save review draft"}
              onPress={() => void save()}
              disabled={busy || !online || !dirty}
            />
            {receipt.duplicates.map((d) => (
              <Body key={d.id}>
                Possible duplicate: {d.filename} ({d.status})
              </Body>
            ))}
            {receipt.duplicates.length > 0 && (
              <Button
                title={
                  receipt.duplicates.every((d) => acknowledged.includes(d.id))
                    ? "✓ These are separate purchases"
                    : "Acknowledge these are separate purchases"
                }
                onPress={() =>
                  setAcknowledged((old) =>
                    receipt.duplicates.every((d) => old.includes(d.id))
                      ? []
                      : receipt.duplicates.map((d) => d.id),
                  )
                }
                disabled={busy || dirty}
              />
            )}
            <Button
              title="Confirm saved receipt into inventory / retry"
              onPress={() => void confirm()}
              disabled={
                busy || !online || dirty || receipt.status !== "review_ready"
              }
            />
            <Body>
              Confirmation adds all included saved lines once. If a response is
              lost, retry uses the original request.
            </Body>
          </Card>
        </>
      )}
    </>
  );
}
function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const receipt = useReceipt(id);
  if (receipt.isPending) return <Loading />;
  if (receipt.isError) return <Problem message={messageOf(receipt.error)} />;
  return <ReceiptEditor key={receipt.data.id} receipt={receipt.data} />;
}
export function ReceiptReview() {
  return (
    <Screen title="Review receipt">
      <AuthGate>
        <Review />
      </AuthGate>
    </Screen>
  );
}
