import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { API_V1, OIDC_URL, THINK_SCALE } from "./config.js";
import { rand, randInt } from "./rand.js";
// Statuses that are a legitimate business answer under concurrency (a second
// staff member evaluating the same team, a stale QR token, a route that moved
// on). They are asserted with checks, so they must not count as failures.
// Latency of ordinary JSON calls only. The SSE listeners hold a stream open for
// their whole 15s timeout on purpose, so they would swamp http_req_duration.
export const apiDuration = new Trend("rally_api_duration", true);

const BUSINESS = http.expectedStatuses({ min: 200, max: 399 }, 400, 404, 409);
const OK_ONLY = http.expectedStatuses({ min: 200, max: 399 });

/**
 * Every simulated phone gets its own source address. The API runs with
 * TRUSTED_PROXIES=127.0.0.1, so X-Forwarded-For is honoured exactly as it is
 * behind the production reverse proxy and per-IP rate limits apply per person
 * instead of collapsing every VU onto the load generator's address.
 */
export function ipFor(kind, index) {
  const k = { participant: 1, team: 2, staff: 3, guide: 4, admin: 5, spectator: 6, abuse: 7, security: 8, sse: 9, seed: 10 }[kind] || 99;
  return `10.${k}.${Math.floor(index / 250) % 250}.${(index % 250) + 1}`;
}

/**
 * Thin JSON wrapper. `name` groups URLs with ids into one metric series
 * (e.g. "POST /checkpoint/{id}/arrive"); `expect` lists the statuses that are
 * a correct answer for this call.
 */
export function api(method, path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.ip) headers["X-Forwarded-For"] = opts.ip;
  Object.assign(headers, opts.headers || {});
  const params = {
    headers,
    tags: Object.assign({ name: opts.name || `${method} ${path}` }, opts.tags || {}),
    timeout: opts.timeout || "30s",
    responseCallback: opts.expect ? http.expectedStatuses(...opts.expect) : opts.business ? BUSINESS : OK_ONLY,
  };
  const body = opts.body === undefined ? null : JSON.stringify(opts.body);
  const res = http.request(method, `${API_V1}${path}`, body, params);
  apiDuration.add(res.timings.duration);
  return res;
}

export function json(res) {
  try {
    return res.json();
  } catch (_) {
    return null;
  }
}

/** api() + a check on the status; returns the parsed body (or null). */
export function call(method, path, opts = {}) {
  const res = api(method, path, opts);
  const expected = opts.expect || [200, 201];
  const label = opts.check || `${opts.name || `${method} ${path}`} -> ${expected.join("/")}`;
  const ok = check(res, { [label]: (r) => expected.includes(r.status) });
  if (!ok && __ENV.DEBUG) console.warn(`${label}: got ${res.status} ${String(res.body).slice(0, 200)}`);
  return { res, body: json(res) };
}

/** Same as call() but throws on an unexpected status: for setup, where a
 * failure means the whole run would be meaningless. */
export function must(method, path, opts = {}) {
  const res = api(method, path, opts);
  const expected = opts.expect || [200, 201];
  if (!expected.includes(res.status)) {
    throw new Error(`seed ${method} ${path} -> ${res.status}: ${String(res.body).slice(0, 300)}`);
  }
  return json(res);
}

/** Mint an RS256 access token on the fake OIDC provider. */
export function mint(sub, groups, { name, email, audience, expiresIn } = {}) {
  const res = http.post(
    `${OIDC_URL}/mint`,
    JSON.stringify({ sub, name: name || sub, groups, email: email || `${sub}@loadtest.rally`, audience, expires_in: expiresIn }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "OIDC mint" } },
  );
  if (res.status !== 200) throw new Error(`mint ${sub} -> ${res.status} ${res.body}`);
  return res.json().access_token;
}

/** Mint many tokens in parallel batches. */
export function mintMany(reqs) {
  const out = [];
  for (let i = 0; i < reqs.length; i += 50) {
    const chunk = reqs.slice(i, i + 50).map((r) => [
      "POST",
      `${OIDC_URL}/mint`,
      JSON.stringify({ sub: r.sub, name: r.name || r.sub, groups: r.groups, email: r.email }),
      { headers: { "Content-Type": "application/json" }, tags: { name: "OIDC mint" } },
    ]);
    for (const res of http.batch(chunk)) {
      if (res.status !== 200) throw new Error(`mint -> ${res.status} ${res.body}`);
      out.push(res.json().access_token);
    }
  }
  return out;
}

/** Human think time, scaled by THINK_SCALE. */
export function think(min, max) {
  sleep((min + rand() * (max - min)) * THINK_SCALE);
}

export function pick(arr) {
  return arr[randInt(arr.length)];
}

export function chance(p) {
  return rand() < p;
}

export function uuid() {
  // RFC4122-ish v4, enough for idempotency keys.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (rand() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
