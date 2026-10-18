/** Where a dashboard metric's number came from. A failed or pending fetch
 * must never render as a genuine zero — "0 equipas" reads as "the event is
 * empty", not "the request failed". */
export type MetricStatus = "ready" | "loading" | "error";

export function statusOf(query: { isLoading: boolean; isError: boolean }): MetricStatus {
  if (query.isError) return "error";
  if (query.isLoading) return "loading";
  return "ready";
}

/** The text a metric shows: the value only once its request succeeded. */
export function displayMetric(value: number | string, status: MetricStatus): number | string {
  if (status === "loading") return "…";
  if (status === "error") return "—";
  return value;
}
