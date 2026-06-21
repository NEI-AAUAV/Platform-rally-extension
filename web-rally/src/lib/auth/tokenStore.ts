/**
 * Centralized access to auth tokens persisted in localStorage.
 *
 * Two independent auth identities can coexist (dual-role users):
 *  - staff/NEI session token  -> `rally_token`
 *  - team session token       -> `rally_team_token` (+ `rally_team_data`)
 *
 * All localStorage key access for auth must go through this module so the keys
 * and (de)serialization live in one place. Behavior matches the previous
 * inline implementations exactly.
 */

const STAFF_TOKEN_KEY = "rally_token";
const TEAM_TOKEN_KEY = "rally_team_token";
const TEAM_DATA_KEY = "rally_team_data";

export interface TeamTokenData {
  team_id: number;
  team_name: string;
}

// --- staff token ---------------------------------------------------------

export function getStaffToken(): string | null {
  return localStorage.getItem(STAFF_TOKEN_KEY);
}

export function setStaffToken(token: string): void {
  localStorage.setItem(STAFF_TOKEN_KEY, token);
}

export function removeStaffToken(): void {
  localStorage.removeItem(STAFF_TOKEN_KEY);
}

// --- team token ----------------------------------------------------------

export function getTeamToken(): string | null {
  return localStorage.getItem(TEAM_TOKEN_KEY);
}

export function setTeamToken(token: string): void {
  localStorage.setItem(TEAM_TOKEN_KEY, token);
}

export function removeTeamToken(): void {
  localStorage.removeItem(TEAM_TOKEN_KEY);
}

// --- team data -----------------------------------------------------------

/** Whether a team-data entry exists at all (even if corrupt/unparseable). */
export function hasTeamData(): boolean {
  return localStorage.getItem(TEAM_DATA_KEY) !== null;
}

/** Returns parsed team data, or null when absent or corrupt. */
export function getTeamData(): TeamTokenData | null {
  const raw = localStorage.getItem(TEAM_DATA_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TeamTokenData;
  } catch {
    return null;
  }
}

export function setTeamData(data: TeamTokenData): void {
  localStorage.setItem(TEAM_DATA_KEY, JSON.stringify(data));
}

export function removeTeamData(): void {
  localStorage.removeItem(TEAM_DATA_KEY);
}

// --- composite clears ----------------------------------------------------

/** Clear team token + data (leaves any staff session intact). */
export function clearTeamAuth(): void {
  removeTeamToken();
  removeTeamData();
}

/** Clear every auth identity (staff + team). */
export function clearAllAuth(): void {
  removeStaffToken();
  removeTeamToken();
  removeTeamData();
}
