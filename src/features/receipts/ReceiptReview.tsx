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
import { useReceipt, verifyReceipt } from "./api";
import {
  ReceiptLine,
  receiptLineSchema,
  receiptReviewSchema,
  reviewIssues,
} from "../../../supabase/functions/_shared/contracts";
function Editor({ receipt }: { receipt: z.infer<typeof receiptReviewSchema> }) {
  const [lines, setLines] = useState<ReceiptLine[]>(receipt.lines);
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
        p_revision: receipt.revision,
        p_lines: valid.map(({ proposed, ...line }) => line),
      });
      if (r.error) throw r.error;
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
          Automatic extraction is not configured. This is a manual review draft;
          no receipt parsing success is claimed.
        </Body>
        <Body>
          {dirty
            ? "Unsaved changes — keep this screen open until saved."
            : "Draft loaded. Saving never changes inventory."}
        </Body>
        {notice && <Body>{notice}</Body>}
        {error && <Problem message={error} />}
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
        <>
          {lines.map((line) => (
            <Card key={line.id}>
              <Body>Source: {line.source_label}</Body>
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
              {reviewIssues(line).map((issue) => (
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
            <Body>
              Adding reviewed lines to inventory is not enabled in this
              foundation.
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
  return (
    <Editor
      key={`${receipt.data.id}:${receipt.data.revision}:${receipt.data.status}`}
      receipt={receipt.data}
    />
  );
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
