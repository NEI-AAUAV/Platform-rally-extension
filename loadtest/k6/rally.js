// Rally load test: a full rally day with >=120 participants plus everyone else
// (staff, guides, organizers, spectators), against a real api-rally that
// validates real RS256 tokens from a fake OIDC provider.
//
//   k6 run -e PROFILE=load loadtest/k6/rally.js
//
// See loadtest/README.md for the stack, profiles and knobs.

import {
  ADMINS,
  DURATION,
  durationSeconds,
  GUIDES,
  MANAGERS,
  MEMBERS_PER_TEAM,
  PROFILE,
  SPECTATOR_RATE,
  SPIKE_TARGET,
  SSE_VUS,
  TEAMS,
} from "./lib/config.js";
import { seedEvent } from "./lib/seed.js";

export { participantJourney, scoreboardSpike } from "./scenarios/participants.js";
export { teamRoute } from "./scenarios/teams.js";
export { staffShift } from "./scenarios/staff.js";
export { adminDashboard, guideShift, spectator } from "./scenarios/backoffice.js";
export { evaluationRace, loginAbuse, securityProbe, sseListener } from "./scenarios/security.js";

const D = durationSeconds();
const PARTICIPANTS = TEAMS * MEMBERS_PER_TEAM;
const STAFF = parseInt(__ENV.CHECKPOINTS || "8", 10) * parseInt(__ENV.STAFF_PER_CHECKPOINT || "2", 10);
const at = (fraction) => `${Math.floor(D * fraction)}s`;
const ONLY = (__ENV.SCENARIOS || "").split(",").filter(Boolean);

const ALL = {
  // Every participant has the app open for the whole event.
  participants: {
    executor: "ramping-vus",
    exec: "participantJourney",
    startVUs: 0,
    stages: [
      { duration: at(0.1), target: PARTICIPANTS },
      { duration: at(0.85), target: PARTICIPANTS },
      { duration: at(0.05), target: 0 },
    ],
    gracefulRampDown: "10s",
  },
  // One phone per team walks the route post by post.
  team_route: {
    executor: "per-vu-iterations",
    exec: "teamRoute",
    vus: TEAMS,
    iterations: 1,
    maxDuration: DURATION,
  },
  staff: {
    executor: "constant-vus",
    exec: "staffShift",
    vus: STAFF,
    duration: DURATION,
  },
  guides: {
    executor: "constant-vus",
    exec: "guideShift",
    vus: GUIDES,
    duration: DURATION,
  },
  organizers: {
    executor: "constant-vus",
    exec: "adminDashboard",
    vus: ADMINS + MANAGERS,
    duration: DURATION,
  },
  spectators: {
    executor: "constant-arrival-rate",
    exec: "spectator",
    rate: SPECTATOR_RATE,
    timeUnit: "1s",
    duration: DURATION,
    preAllocatedVUs: Math.max(5, SPECTATOR_RATE),
    maxVUs: SPECTATOR_RATE * 5,
  },
  sse: {
    executor: "constant-vus",
    exec: "sseListener",
    vus: SSE_VUS,
    duration: DURATION,
  },
  security: {
    executor: "constant-vus",
    exec: "securityProbe",
    vus: 2,
    duration: DURATION,
  },
  login_abuse: {
    executor: "per-vu-iterations",
    exec: "loginAbuse",
    vus: 1,
    iterations: 1,
    startTime: at(0.3),
  },
  races: {
    executor: "per-vu-iterations",
    exec: "evaluationRace",
    vus: 1,
    iterations: 1,
    startTime: at(0.2),
  },
  // Final leaderboard reveal: everybody refreshes at once.
  scoreboard_spike: {
    executor: "ramping-arrival-rate",
    exec: "scoreboardSpike",
    startTime: at(0.75),
    startRate: 1,
    timeUnit: "1s",
    preAllocatedVUs: 50,
    maxVUs: Math.max(100, SPIKE_TARGET),
    stages: [
      { duration: at(0.04), target: SPIKE_TARGET },
      { duration: at(0.1), target: SPIKE_TARGET },
      { duration: at(0.04), target: 0 },
    ],
  },
};

const scenarios = {};
for (const [name, s] of Object.entries(ALL)) if (!ONLY.length || ONLY.includes(name)) scenarios[name] = s;

export const options = {
  scenarios,
  setupTimeout: "10m",
  // Bodies are only needed for JSON parsing, which every call does.
  discardResponseBodies: false,
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    "http_req_duration{expected_response:true}": ["p(95)<800", "p(99)<2000"],
    "http_req_duration{scenario:participants}": ["p(95)<600"],
    "http_req_duration{scenario:staff}": ["p(95)<1000"],
    "http_req_duration{scenario:team_route}": ["p(95)<800"],
    "http_req_duration{scenario:scoreboard_spike}": ["p(95)<1500"],
    "http_req_duration{name:POST /staff/teams/{id}/activities/{id}/evaluate}": ["p(95)<1200"],
    "http_req_duration{name:POST /checkpoint/{id}/arrive}": ["p(95)<800"],
    "http_req_duration{name:GET /scoreboard/live}": ["p(95)<600"],
    "checks{scenario:security}": ["rate==1"],
    "checks{scenario:races}": ["rate==1"],
    rally_teams_finished: [`count>=${Math.floor(TEAMS * 0.9)}`],
    rally_wait_for_staff_ms: ["p(95)<60000"],
  },
};

export function setup() {
  console.log(`seeding: profile=${PROFILE} teams=${TEAMS} participants=${PARTICIPANTS} staff=${STAFF} guides=${GUIDES} duration=${DURATION}`);
  const data = seedEvent();
  console.log(`seeded event ${data.eventId}: ${data.teams.length} teams, ${data.checkpoints.length} posts`);
  return data;
}
