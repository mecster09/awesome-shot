import { describe, expect, it } from "vitest";
import { GameSession } from "./game-session";
import { InMemoryGameSessionStore } from "./in-memory-game-session-store";

describe("GameSession setup", () => {
  it("persists a season, player, and active opposition for a coach", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);

    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const player = await session.addPlayer({ name: "Natalie", nickname: "Nat" });
    const opposition = await session.addOpposition({ name: "Thunder" });

    const rehydrated = await GameSession.open(store);

    expect(rehydrated.setup()).toEqual({
      seasons: [season],
      players: [player],
      opposition: [opposition],
      activeOpposition: [opposition]
    });
  });

  it("prefills a new season with the latest team name and retains its own snapshot", async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    await session.createSeason({ name: "2026 Winter", teamName: "Roses" });

    expect(session.newSeasonDefaults()).toEqual({ teamName: "Roses" });

    const season = await session.createSeason({ name: "2027 Winter", teamName: "Academy Roses" });

    expect(season.teamName).toBe("Academy Roses");
    expect(session.setup().seasons.map(({ name, teamName }) => ({ name, teamName }))).toEqual([
      { name: "2026 Winter", teamName: "Roses" },
      { name: "2027 Winter", teamName: "Academy Roses" }
    ]);
  });

  it("archives an opposition without losing its historical record", async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    const opposition = await session.addOpposition({ name: "Thunder" });

    await session.archiveOpposition(opposition.id);

    expect(session.setup().activeOpposition).toEqual([]);
    expect(session.setup().opposition).toEqual([{ ...opposition, archived: true }]);
  });

  it("remembers the selected opposition until it is archived", async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    const opposition = await session.addOpposition({ name: "Thunder" });

    await session.selectOpposition(opposition.id);
    expect(session.setup().selectedOpposition).toEqual(opposition);

    await session.archiveOpposition(opposition.id);
    expect(session.setup().selectedOpposition).toBeUndefined();
  });
});
