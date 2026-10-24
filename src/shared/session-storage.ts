import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
// Native tokens stay in platform secure storage. Web sessions end with the tab.
export const sessionStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web")
      return typeof sessionStorage === "undefined"
        ? null
        : sessionStorage.getItem(key);
    const raw = await SecureStore.getItemAsync(key + ".count");
    if (!raw) return null;
    const count = Number(raw);
    if (!Number.isInteger(count) || count < 1 || count > 100) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.getItemAsync(key + "." + i),
      ),
    );
    return chunks.some((v) => v === null) ? null : chunks.join("");
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === "web") {
      if (typeof sessionStorage !== "undefined")
        sessionStorage.setItem(key, value);
      return;
    }
    const chunks = value.match(/[\s\S]{1,1800}/g) ?? [""];
    const previous = Math.min(
      Number(await SecureStore.getItemAsync(key + ".count")) || 0,
      100,
    );
    await SecureStore.deleteItemAsync(key + ".count");
    for (let i = 0; i < chunks.length; i++)
      await SecureStore.setItemAsync(key + "." + i, chunks[i] ?? "");
    for (let i = chunks.length; i < previous; i++)
      await SecureStore.deleteItemAsync(key + "." + i);
    await SecureStore.setItemAsync(key + ".count", String(chunks.length));
  },
  async removeItem(key: string) {
    if (Platform.OS === "web") {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
      return;
    }
    const count = Number(await SecureStore.getItemAsync(key + ".count"));
    await SecureStore.deleteItemAsync(key + ".count");
    for (let i = 0; i < Math.min(count, 100); i++)
      await SecureStore.deleteItemAsync(key + "." + i);
  },
};
