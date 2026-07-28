/**
 * Minimal Prometheus text-exposition-format parser — just enough to read the
 * counters/gauges/histograms the backend exposes at GET /metrics. Not a
 * general-purpose parser (no exemplars, no NaN/Inf handling): the backend's
 * own series are well-formed by construction.
 */

export interface MetricSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

const LINE_RE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+(\S+)$/;
const LABEL_RE = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

function parseLabels(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const labels: Record<string, string> = {};
  for (const match of raw.matchAll(LABEL_RE)) {
    // Both groups are non-optional in LABEL_RE, so a match always has them.
    const key = match[1];
    const value = match[2];
    if (key === undefined || value === undefined) continue;
    labels[key] = value.replace(/\\"/g, '"');
  }
  return labels;
}

export function parsePrometheusText(text: string): MetricSample[] {
  const samples: MetricSample[] = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const match = LINE_RE.exec(line.trim());
    if (!match) continue;
    const name = match[1];
    const value = Number(match[4]);
    if (name === undefined || Number.isNaN(value)) continue;
    samples.push({ name, labels: parseLabels(match[3]), value });
  }
  return samples;
}

/** Sum of all samples for a metric name (across label combinations). */
export function sumByName(samples: MetricSample[], name: string): number {
  return samples.filter((s) => s.name === name).reduce((acc, s) => acc + s.value, 0);
}

/** All samples for a metric name, optionally filtered by a label predicate. */
export function byName(samples: MetricSample[], name: string): MetricSample[] {
  return samples.filter((s) => s.name === name);
}
