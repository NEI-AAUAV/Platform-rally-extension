import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertTriangle, Database, Gauge, Server, Zap } from "lucide-react";
import { readinessCheck } from "@/client";
import { parsePrometheusText, sumByName, byName } from "./parsePrometheusText";

const POLL_INTERVAL_MS = 10_000;
const MAX_POINTS = 60; // ~10 min of history at the default poll interval

interface ReadinessBody {
  status: string;
  db: string;
  redis?: string;
  workers: Array<{ name: string; alive: boolean; last_beat: number }>;
}

interface LatencyPoint {
  t: string;
  avgMs: number;
}

function StatCard({
  icon: Icon,
  value,
  label,
  tone,
}: Readonly<{
  icon: typeof Activity;
  value: string;
  label: string;
  tone?: "danger" | "warning";
}>) {
  const toneClass =
    tone === "danger"
      ? "bg-red-500/10 text-red-500"
      : tone === "warning"
        ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
        : "bg-secondary text-muted-foreground";
  return (
    <div className="rally-surface flex items-center gap-4 rounded-xl border border-border p-4 shadow-[var(--rally-shadow-sm)]">
      <div className={`rounded-lg p-2 ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="rally-display text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/**
 * Fetches the raw Prometheus text exposition format from GET /metrics.
 * Not part of the generated OpenAPI client — the endpoint is deliberately
 * excluded from the schema (Prometheus scrape format isn't a JSON API
 * response). No auth header: Prometheus scrapers don't authenticate, so
 * this endpoint has none either — it must be blocked at the reverse proxy
 * in production, a backend/infra concern outside this panel.
 */
async function fetchMetricsText(): Promise<string> {
  const res = await fetch("/metrics");
  if (!res.ok) throw new Error(`metrics fetch failed: ${res.status}`);
  return res.text();
}

export default function MetricsTab() {
  const [history, setHistory] = useState<LatencyPoint[]>([]);
  const lastSeenTotalRef = useRef<{ count: number; sumSeconds: number } | null>(null);

  const { data: metricsText, isError: metricsError } = useQuery({
    queryKey: ["prometheus-metrics"],
    queryFn: fetchMetricsText,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: readiness, isError: readinessError } = useQuery({
    queryKey: ["readiness"],
    queryFn: async () => {
      const { data } = await readinessCheck();
      return data as unknown as ReadinessBody;
    },
    refetchInterval: POLL_INTERVAL_MS,
  });

  const samples = metricsText ? parsePrometheusText(metricsText) : [];

  const requestsTotal = sumByName(samples, "rally_http_requests_total");
  const errors5xx = samples
    .filter((s) => s.name === "rally_http_requests_total" && s.labels.status?.startsWith("5"))
    .reduce((acc, s) => acc + s.value, 0);
  const errorRate = requestsTotal > 0 ? (errors5xx / requestsTotal) * 100 : 0;
  const rateLimitRejections = sumByName(samples, "rally_rate_limit_rejections_total");

  const durationSum = sumByName(samples, "rally_http_request_duration_seconds_sum");
  const durationCount = sumByName(samples, "rally_http_request_duration_seconds_count");

  const workerGauges = byName(samples, "rally_worker_last_beat_age_seconds");
  const deadWorkers = workerGauges.filter((s) => s.value > 30).length;

  // Accumulate a rolling window of average latency since the page opened —
  // this is NOT historical data from the backend (it doesn't store any); it
  // is only what has been observed since this tab was opened.
  useEffect(() => {
    if (durationCount <= 0) return;
    const prev = lastSeenTotalRef.current;
    lastSeenTotalRef.current = { count: durationCount, sumSeconds: durationSum };
    if (!prev) return;

    const deltaCount = durationCount - prev.count;
    const deltaSum = durationSum - prev.sumSeconds;
    if (deltaCount <= 0) return; // no new requests since last poll

    const avgMs = (deltaSum / deltaCount) * 1000;
    setHistory((h) => [
      ...h.slice(-(MAX_POINTS - 1)),
      { t: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }), avgMs },
    ]);
  }, [durationCount, durationSum]);

  const avgLatencyMs = durationCount > 0 ? (durationSum / durationCount) * 1000 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Gauge className="h-5 w-5 text-muted-foreground" />
        <h2 className="rally-display text-lg font-bold text-foreground">Métricas</h2>
      </div>

      {(metricsError || readinessError) && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm font-medium text-red-500">
            Não foi possível obter métricas ou estado de saúde do servidor.
          </p>
        </div>
      )}

      {/* Health status */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Database}
          value={readiness?.db === "up" ? "OK" : "Em baixo"}
          label="Base de dados"
          tone={readiness?.db !== "up" ? "danger" : undefined}
        />
        <StatCard
          icon={Server}
          value={readiness?.redis ? (readiness.redis === "up" ? "OK" : "Em baixo") : "—"}
          label="Redis"
          tone={readiness?.redis === "down" ? "danger" : undefined}
        />
        <StatCard
          icon={Activity}
          value={`${(readiness?.workers ?? []).filter((w) => w.alive).length}/${(readiness?.workers ?? []).length || "—"}`}
          label="Workers vivos"
          tone={deadWorkers > 0 ? "warning" : undefined}
        />
        <StatCard
          icon={Zap}
          value={rateLimitRejections.toString()}
          label="Rejeições rate-limit"
          tone={rateLimitRejections > 0 ? "warning" : undefined}
        />
      </div>

      {/* Request stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          icon={Activity}
          value={requestsTotal.toLocaleString("pt-PT")}
          label="Pedidos totais"
        />
        <StatCard
          icon={AlertTriangle}
          value={`${errorRate.toFixed(1)}%`}
          label="Taxa de erro 5xx"
          tone={errorRate > 1 ? "danger" : undefined}
        />
        <StatCard icon={Gauge} value={`${avgLatencyMs.toFixed(0)} ms`} label="Latência média" />
      </div>

      {/* Latency over time (session-local, not historical) */}
      <div className="rally-surface rounded-xl border border-border p-5 shadow-[var(--rally-shadow-sm)]">
        <h3 className="rally-display mb-1 text-base font-bold text-foreground">
          Latência ao longo do tempo
        </h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Apenas desde que esta página foi aberta — o servidor não guarda histórico.
        </p>
        {history.length < 2 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            A recolher dados… volta a verificar dentro de alguns segundos.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="t"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={40}
                unit="ms"
              />
              <Tooltip
                formatter={(val: unknown) => [`${Number(val).toFixed(0)} ms`, "Latência média"]}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="avgMs"
                stroke="var(--rally-accent, #008542)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Worker detail */}
      {readiness?.workers && readiness.workers.length > 0 && (
        <div className="rally-surface rounded-xl border border-border p-5 shadow-[var(--rally-shadow-sm)]">
          <h3 className="rally-display mb-4 text-base font-bold text-foreground">Workers</h3>
          <div className="flex flex-col gap-2">
            {readiness.workers.map((w) => (
              <div
                key={w.name}
                className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">{w.name}</span>
                <span
                  className={
                    w.alive
                      ? "text-xs font-semibold text-green-500"
                      : "text-xs font-semibold text-red-500"
                  }
                >
                  {w.alive ? "vivo" : "morto"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
