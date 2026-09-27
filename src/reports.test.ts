import { describe, expect, it } from "vitest";
import { createMatchCsv, createMatchPdf } from "./reports";
import type { TerminalMatchReport } from "./game-session/types";

const report: TerminalMatchReport = {
  id: "game-1", date: "2026-09-26", teamName: "Roses", oppositionName: "Thunder", status: "abandoned", outcome: { kind: "abandoned" }, score: { own: 12, opposition: 9 },
  quarters: [{ number: 1, ownScore: 12, oppositionScore: 9, startingLineup: [{ position: "Goal Attack", playerId: "faye", playerName: "Faye" }], substitutions: [{ sequence: 1, position: "Goal Attack", playerId: "hana", playerName: "Hana" }], playerStatistics: [{ playerId: "faye", playerName: "Faye", position: "Goal Attack", statistic: "Goals", count: 12 }]}],
  gamePlayerStatistics: [{ playerId: "faye", playerName: "Faye", position: "Goal Attack", statistic: "Goals", count: 12 }]
};

describe("terminal match reports", () => {
  it("exports documented flat CSV rows by quarter, player, and position", () => {
    expect(createMatchCsv(report)).toBe([
      "match_id,match_date,team_name,opposition_name,terminal_status,outcome,winner,final_own_score,final_opposition_score,quarter,quarter_own_score,quarter_opposition_score,player_id,position,Successful Centre Pass Received,Tip,Intercept,Unforced Errors,Contact Conceded,Obstruction Conceded,Goals,Misses",
      "game-1,2026-09-26,Roses,Thunder,abandoned,abandoned,,12,9,1,12,9,faye,Goal Attack,0,0,0,0,0,0,12,0",
      "game-1,2026-09-26,Roses,Thunder,abandoned,abandoned,,12,9,1,12,9,hana,Goal Attack,0,0,0,0,0,0,0,0"
    ].join("\n"));
  });

  it("renders accessible PDF text for the identity, outcome, score, court, changes, and statistics", () => {
    const pdf = new TextDecoder().decode(createMatchPdf(report));
    expect(pdf).toContain("Roses v Thunder");
    expect(pdf).toContain("Outcome: Abandoned - No winner declared");
    expect(pdf).toContain("Final score: 12 - 9");
    expect(pdf).toContain("Starting court: Goal Attack: Faye");
    expect(pdf).toContain("Substitution 1: Goal Attack: Hana");
    expect(pdf).toContain("Goals: 12");
    expect(new TextDecoder().decode(createMatchPdf({ ...report, status: "finalised", outcome: { kind: "completed" }, score: { own: 12, opposition: 9 } }))).toContain("Outcome: Completed - Roses won");
  });
});
