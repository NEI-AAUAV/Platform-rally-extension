import { describe, expect, it } from "vitest";
import { displayRank, sortTeamsByRank, teamRank } from "./teamRanking";

type T = { total: number; name: string; classification: number };

const team = (total: number, name: string, classification = 0): T => ({
  total,
  name,
  classification,
});

describe("sortTeamsByRank", () => {
  it("orders by points descending, regardless of the server classification", () => {
    // The bug: a 100-pt team stuck at classification 4 while 0-pt teams held
    // classifications 1-3.
    const teams = [
      team(0, "Academica", 1),
      team(0, "CE", 2),
      team(0, "Coordenacao", 3),
      team(100, "Desportiva", 4),
    ];

    const sorted = sortTeamsByRank(teams);

    expect(sorted.map((t) => t.name)).toEqual(["Desportiva", "Academica", "CE", "Coordenacao"]);
  });

  it("does not mutate the input array", () => {
    const teams = [team(1, "A"), team(2, "B")];
    const snapshot = [...teams];
    sortTeamsByRank(teams);
    expect(teams).toEqual(snapshot);
  });

  it("breaks ties on equal points by server classification, then name", () => {
    const teams = [
      team(50, "Zulu", 3),
      team(50, "Alpha", 0), // unranked -> behind any real rank
      team(50, "Bravo", 2),
    ];

    expect(sortTeamsByRank(teams).map((t) => t.name)).toEqual(["Bravo", "Zulu", "Alpha"]);
  });

  it("falls back to name when points and classification are all equal", () => {
    const teams = [team(10, "Charlie", 0), team(10, "Alpha", 0), team(10, "Bravo", 0)];
    expect(sortTeamsByRank(teams).map((t) => t.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("keeps an unranked (classification 0) team last even against a ranked tie", () => {
    const teams = [team(0, "New", 0), team(0, "Ranked", 5)];
    expect(sortTeamsByRank(teams).map((t) => t.name)).toEqual(["Ranked", "New"]);
  });
});

describe("displayRank", () => {
  it("is the 1-based position in the sorted list", () => {
    expect(displayRank(0)).toBe(1);
    expect(displayRank(3)).toBe(4);
  });
});

describe("teamRank", () => {
  type R = T & { id: number };
  const ranked = (id: number, total: number, classification: number): R => ({
    id,
    total,
    name: `T${id}`,
    classification,
  });

  it("is the position in the sorted list when every score is visible", () => {
    const teams = [ranked(1, 10, 2), ranked(2, 50, 1), ranked(3, 5, 3)];

    expect(teamRank(teams, 1, { scoresRedacted: false })).toBe(2);
  });

  it("uses the server rank when other teams' scores are redacted", () => {
    // Individual mode: the API zeroes every other team, so sorting the list
    // would put the viewer's team first whatever its real standing.
    const teams = [ranked(1, 30, 4), ranked(2, 0, 0), ranked(3, 0, 0)];

    expect(teamRank(teams, 1, { scoresRedacted: true })).toBe(4);
  });

  it("is null for an unranked team under redaction", () => {
    const teams = [ranked(1, 0, 0), ranked(2, 0, 0)];

    expect(teamRank(teams, 1, { scoresRedacted: true })).toBeNull();
  });

  it("is null for a team not in the list", () => {
    expect(teamRank([ranked(1, 0, 1)], 9, { scoresRedacted: false })).toBeNull();
  });
});
