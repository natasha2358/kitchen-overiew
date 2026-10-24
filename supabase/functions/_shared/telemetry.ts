import { response } from "./http.ts";
type FunctionName =
  | "verify-receipt"
  | "parse-receipt"
  | "delete-receipt-source"
  | "suggest-meals";
// No request bodies, URLs, identifiers, tokens, names or error messages are logged.
export function observe(
  name: FunctionName,
  handler: (request: Request) => Promise<Response>,
) {
  return async (request: Request): Promise<Response> => {
    const start = performance.now();
    let result: Response;
    try {
      result = await handler(request);
    } catch {
      result = response({ error: "Request failed. Please retry." }, 500);
    }
    console.info(
      JSON.stringify({
        event: "function_request",
        function: name,
        status: result.status,
        duration_ms: Math.round(performance.now() - start),
        outcome:
          result.status < 400
            ? "success"
            : result.status === 409
              ? "conflict"
              : result.status === 429
                ? "rate_limit"
                : result.status === 401 || result.status === 403
                  ? "authorization"
                  : "failure",
      }),
    );
    return result;
  };
}
export function recordUsage(
  model: string,
  prompt: string,
  usage: { input_tokens: number; output_tokens: number },
) {
  console.info(
    JSON.stringify({
      event: "model_usage",
      function: "suggest-meals",
      model,
      prompt_version: prompt,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
    }),
  );
}
