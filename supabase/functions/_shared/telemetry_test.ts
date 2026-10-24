import { observe } from "./telemetry.ts";
Deno.test(
  "request telemetry excludes payloads and exception details",
  async () => {
    const logs: string[] = [];
    const previous = console.info;
    console.info = (value: unknown) => {
      logs.push(String(value));
    };
    try {
      const handler = observe("verify-receipt", async () => {
        throw new Error("PRIVATE_RECEIPT_AND_TOKEN");
      });
      const result = await handler(
        new Request("https://example.test/?token=PRIVATE_QUERY", {
          method: "POST",
          body: "PRIVATE_BODY",
        }),
      );
      if (result.status !== 500)
        throw new Error("Expected safe failure response");
      const logged = logs.join("");
      if (
        logged.includes("PRIVATE") ||
        (await result.text()).includes("PRIVATE")
      )
        throw new Error("Private data leaked");
      const entry = JSON.parse(logs[0]);
      if (
        entry.function !== "verify-receipt" ||
        entry.outcome !== "failure" ||
        typeof entry.duration_ms !== "number"
      )
        throw new Error("Missing safe operational fields");
    } finally {
      console.info = previous;
    }
  },
);
