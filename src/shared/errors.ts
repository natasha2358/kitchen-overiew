import { ZodError } from "zod";
export function messageOf(error: unknown): string {
  if (error instanceof ZodError)
    return error.issues.map((issue) => issue.message).join(" ");
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return "Something went wrong. Please try again.";
}
