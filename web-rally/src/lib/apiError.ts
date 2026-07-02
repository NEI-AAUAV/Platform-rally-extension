import { ApiError } from "@/client";

/** Best-effort human message from a thrown API error, honouring FastAPI detail. */
export function apiErrorMessage(error: unknown, fallback = "Ocorreu um erro."): string {
  if (error instanceof ApiError) {
    const body = error.body as { detail?: unknown } | undefined;
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    // 422 validation errors: [{loc, msg, ...}]
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
    if (error.status === 409) return "Já existe.";
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
