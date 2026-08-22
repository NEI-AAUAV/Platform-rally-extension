import { mintToken, apiCall, type MintedUser } from "./fullstackAuth";

/**
 * The *people* of a peddy-tascas day, and nothing else.
 *
 * Deliberately unlike every other helper in this directory: `seedRally`,
 * `seedRallyDay`, `seedMegaRallyDay` and `seedPeddyPaper` all build the whole
 * world — event, checkpoints, activities, teams, assignments — through direct
 * `apiCall`s, which is why no spec built on them can catch a broken admin
 * form. `master-peddy-tascas-day.spec.ts` builds its event through the real
 * admin UI instead, so all it needs from a fixture is the cast: users of
 * every role, already materialized in the local `users` table so the admin
 * UI's assignment tabs can list them.
 *
 * Minting a token does not create the local user row — the backend mirrors an
 * OIDC identity on its first authenticated request — so each user here makes
 * one `/profile/me` call, the same materialization trick `seedRallyDay` and
 * `admin-setup.spec.ts` use.
 */

export interface CastMember {
  readonly user: MintedUser;
  readonly email: string;
}

export interface PeddyTascasCast {
  readonly runId: string;
  /** Full access to everything; builds the event in the véspera phase. */
  readonly admin: CastMember;
  /**
   * `manager-rally`. Exercised by no other fullstack spec in this suite —
   * the role has its own resource-unscoped action table in `app/core/abac.py`
   * and its own cross-checkpoint evaluation page (`staff-evaluation/manager-only.tsx`),
   * neither of which was covered against the real backend before this.
   */
  readonly manager: CastMember;
  /** One per staffed post, checkpoint-scoped by ABAC. */
  readonly staff: readonly CastMember[];
  /** `rally-guide`, each assigned to a team they walk the route with. */
  readonly guides: readonly CastMember[];
}

async function mintAndMaterialize(
  runId: string,
  slug: string,
  name: string,
  groups: readonly string[],
): Promise<CastMember> {
  const sub = `e2e-peddy-${slug}-${runId}`;
  const email = `${sub}@ua.pt`;
  const user = await mintToken({ sub, name, groups, email });
  // Creates the local `users` row. Without it the assignment tabs — which
  // list existing users rather than creating them — would show nothing to
  // assign.
  await apiCall("GET", "/profile/me", { token: user.accessToken });
  return { user, email };
}

export async function seedPeddyTascasCast(options: {
  staffCount: number;
  guideCount: number;
}): Promise<PeddyTascasCast> {
  const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const admin = await mintAndMaterialize(runId, "admin", "E2E Peddy Admin", ["admin"]);
  const manager = await mintAndMaterialize(runId, "manager", "E2E Peddy Coordenador", [
    "manager-rally",
  ]);

  const staff: CastMember[] = [];
  for (let i = 0; i < options.staffCount; i++) {
    staff.push(
      await mintAndMaterialize(runId, `staff-${i}`, `E2E Peddy Staff ${i}`, ["rally-staff"]),
    );
  }

  const guides: CastMember[] = [];
  for (let i = 0; i < options.guideCount; i++) {
    guides.push(
      await mintAndMaterialize(runId, `guide-${i}`, `E2E Peddy Guia ${i}`, ["rally-guide"]),
    );
  }

  return { runId, admin, manager, staff, guides };
}

/** Log a team in through the real API and return its JWT.
 *
 * Team logins are rate-limited per client IP, not per access code (see this
 * directory's README), and this spec logs in five teams. Only the one team
 * that is specifically proving the login *form* works goes through the
 * browser; the rest come through here. */
export async function loginTeam(accessCode: string): Promise<string> {
  const { access_token } = await apiCall<{ access_token: string }>("POST", "/team-auth/login", {
    body: { access_code: accessCode },
  });
  return access_token;
}
