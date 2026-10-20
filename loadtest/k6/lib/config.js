// Load-test knobs. Everything is overridable with `k6 run -e NAME=value`.

const env = (name, fallback) => (__ENV[name] !== undefined && __ENV[name] !== "" ? __ENV[name] : fallback);
const int = (name, fallback) => parseInt(env(name, String(fallback)), 10);
const num = (name, fallback) => parseFloat(env(name, String(fallback)));

export const API_URL = env("API_URL", "http://127.0.0.1:8003");
export const API_V1 = `${API_URL}/api/rally/v1`;
export const OIDC_URL = env("OIDC_URL", "http://127.0.0.1:9009");

// Event shape. 30 teams x 5 members = 150 participants (>= 120 required).
export const TEAMS = int("TEAMS", 30);
export const MEMBERS_PER_TEAM = int("MEMBERS_PER_TEAM", 5);
export const CHECKPOINTS = int("CHECKPOINTS", 8);
export const STAFF_PER_CHECKPOINT = int("STAFF_PER_CHECKPOINT", 2);
export const GUIDES = int("GUIDES", 10);
export const ADMINS = int("ADMINS", 2);
export const MANAGERS = int("MANAGERS", 1);

// smoke | load | stress | soak | spike
export const PROFILE = env("PROFILE", "load");

const PROFILES = {
  smoke: { duration: "90s", thinkScale: 0.3, spectatorRate: 2, spikeTarget: 20, sseVus: 5 },
  load: { duration: "10m", thinkScale: 1, spectatorRate: 10, spikeTarget: 80, sseVus: 40 },
  stress: { duration: "10m", thinkScale: 0.25, spectatorRate: 40, spikeTarget: 250, sseVus: 120 },
  soak: { duration: "60m", thinkScale: 1, spectatorRate: 10, spikeTarget: 80, sseVus: 40 },
  spike: { duration: "5m", thinkScale: 0.5, spectatorRate: 10, spikeTarget: 400, sseVus: 60 },
};

const base = PROFILES[PROFILE] || PROFILES.load;
export const DURATION = env("DURATION", base.duration);
// Multiplies every sleep: <1 means more aggressive users than real life.
export const THINK_SCALE = num("THINK_SCALE", base.thinkScale);
export const SPECTATOR_RATE = int("SPECTATOR_RATE", base.spectatorRate);
export const SPIKE_TARGET = int("SPIKE_TARGET", base.spikeTarget);
export const SSE_VUS = int("SSE_VUS", base.sseVus);
// Seconds a team "walks" between posts (before THINK_SCALE).
export const TRAVEL_SECONDS = num("TRAVEL_SECONDS", 20);
// How long a team waits at a post for staff before it gives up and skips.
export const EVAL_WAIT_SECONDS = num("EVAL_WAIT_SECONDS", 120);

export function durationSeconds(d = DURATION) {
  const m = /^(\d+)(s|m|h)$/.exec(d);
  if (!m) return 600;
  return parseInt(m[1], 10) * { s: 1, m: 60, h: 3600 }[m[2]];
}
