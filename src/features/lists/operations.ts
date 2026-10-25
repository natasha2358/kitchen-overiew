import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useHousehold } from "../auth/useHousehold";
import { useAuth } from "../auth/Providers";
import { readOperation, runOperation } from "../../shared/operation-intent";
import { messageOf } from "../../shared/errors";
import type { Json } from "../../shared/database.types";
export function useListOperation(
  scope: string,
  send: (
    household: string,
    operation: string,
    request: Json,
  ) => Promise<unknown>,
) {
  const h = useHousehold();
  const { online } = useAuth();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const key = `${scope}.${h.data?.id}`;
  const pending = useQuery({
    queryKey: [`${scope}-intent`, h.data?.id],
    enabled: !!h.data,
    staleTime: 0,
    queryFn: () => readOperation(key),
  });
  async function perform(request: Json, retry = false) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!online || !h.data)
        throw new Error("Reconnect before changing the list.");
      const prior = await readOperation(key);
      if (prior && !retry)
        throw new Error("Retry the pending list change first.");
      await runOperation(
        key,
        prior?.operation ?? randomUUID(),
        prior?.request ?? request,
        (operation, payload) => send(h.data.id, operation, payload),
      );
      setNotice("Saved. Inventory is unchanged.");
      await client.invalidateQueries({ queryKey: [scope, h.data.id] });
      if (scope === "planner")
        await client.invalidateQueries({
          queryKey: ["planned-meal", h.data.id],
        });
      return true;
    } catch (e) {
      setError(messageOf(e));
      return false;
    } finally {
      setBusy(false);
      await pending.refetch();
    }
  }
  return {
    busy,
    error: pending.isError ? messageOf(pending.error) : error,
    notice,
    blocked:
      busy || !online || pending.isPending || pending.isError || !!pending.data,
    pending: pending.data,
    perform,
    retry: () =>
      pending.data
        ? perform(pending.data.request, true)
        : Promise.resolve(false),
    online,
  };
}
