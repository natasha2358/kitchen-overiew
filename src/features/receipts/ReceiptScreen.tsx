import { useRef, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { z } from "zod";
import { backend } from "../../shared/supabase";
import { messageOf } from "../../shared/errors";
import { Body, Button, Card, Loading, Problem, Screen } from "../../shared/ui";
import { AuthGate } from "../auth/AuthGate";
import { useAuth } from "../auth/Providers";
import { useHousehold } from "../auth/useHousehold";
import { useReceipts, verifyReceipt } from "./api";
function Receipts() {
  const h = useHousehold();
  const { online } = useAuth();
  const receipts = useReceipts();
  const client = useQueryClient();
  const router = useRouter();
  const [disclosed, setDisclosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<{
    asset: DocumentPicker.DocumentPickerAsset;
    operation: string;
  } | null>(null);
  async function upload(retry = false) {
    setBusy(true);
    setError("");
    try {
      if (!online || !h.data) throw new Error("Connect before uploading.");
      if (!retry || !pending.current) {
        const selection = await DocumentPicker.getDocumentAsync({
          type: "application/pdf",
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (selection.canceled) return;
        const asset = selection.assets[0];
        if (!asset) return;
        if (asset.size !== undefined && asset.size > 10 * 1024 * 1024)
          throw new Error("Choose a PDF of at most 10 MiB.");
        pending.current = { asset, operation: randomUUID() };
      }
      const { asset, operation } = pending.current;
      const bytes = asset.file
        ? await asset.file.arrayBuffer()
        : await new File(asset.uri).arrayBuffer();
      if (bytes.byteLength > 10 * 1024 * 1024 || bytes.byteLength === 0)
        throw new Error("Choose a PDF of 1 byte to 10 MiB.");
      setStage("Preparing private upload…");
      const prepared = await backend().rpc("prepare_receipt", {
        p_household: h.data.id,
        p_operation: operation,
        p_filename: asset.name,
      });
      if (prepared.error) throw prepared.error;
      const receipt = z
        .object({ id: z.uuid(), object_path: z.string(), status: z.string() })
        .parse(prepared.data);
      setStage("Uploading PDF…");
      const uploaded = await backend()
        .storage.from("receipts")
        .upload(receipt.object_path, bytes, {
          contentType: "application/pdf",
          upsert: false,
        });
      // A stored immutable object may be the successful result of a disconnected prior attempt.
      if (
        uploaded.error &&
        uploaded.error.message !== "The resource already exists" &&
        !(
          "statusCode" in uploaded.error &&
          String(uploaded.error.statusCode) === "409"
        )
      )
        throw uploaded.error;
      setStage("Verifying PDF…");
      const result = await verifyReceipt(receipt.id);
      pending.current = null;
      await client.invalidateQueries({ queryKey: ["receipts", h.data.id] });
      router.push({ pathname: "/receipts/[id]", params: { id: result.id } });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
      setStage("");
      void client.invalidateQueries({ queryKey: ["receipts", h.data?.id] });
    }
  }
  return (
    <>
      <Card>
        <Body>
          Your PDFs are private to your household. Choosing Generate receipt
          draft sends extracted text to OpenAI when the server is configured. If
          PDF vision is enabled, the PDF may be sent for fallback. You can
          instead enter and review lines manually.
        </Body>
        <Body>
          Uploads and draft saves do not add groceries. Review quantities and
          storage locations, save your corrections, then explicitly confirm the
          receipt to add stock.
        </Body>
        {!disclosed ? (
          <Button
            title="I understand — enable PDF selection"
            onPress={() => setDisclosed(true)}
          />
        ) : (
          <Button
            title={busy ? stage || "Selecting PDF…" : "Select receipt PDF"}
            onPress={() => void upload()}
            disabled={busy || !online}
          />
        )}
        {error && <Problem message={error} />}
        {error && (
          <Button
            title="Retry selected upload"
            onPress={() => void upload(true)}
            disabled={busy || !online}
          />
        )}
      </Card>
      {receipts.isPending && <Loading />}
      {receipts.isError && <Problem message={messageOf(receipts.error)} />}
      {receipts.data?.length === 0 && <Body>No receipt drafts yet.</Body>}
      {receipts.data?.map((r) => (
        <Card key={r.id}>
          <Body>
            {r.filename} · {r.status}
          </Body>
          <Button
            title={
              r.canonical_id
                ? "Open existing identical receipt"
                : "Open receipt"
            }
            onPress={() =>
              router.push({
                pathname: "/receipts/[id]",
                params: { id: r.canonical_id ?? r.id },
              })
            }
          />
        </Card>
      ))}
    </>
  );
}
export function ReceiptScreen() {
  return (
    <Screen
      title="Receipt drafts"
      subtitle="Upload privately. Review carefully."
    >
      <AuthGate>
        <Receipts />
      </AuthGate>
    </Screen>
  );
}
