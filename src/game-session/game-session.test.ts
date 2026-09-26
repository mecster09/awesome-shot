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
      activeOpposition: [opposition],
      games: [],
      selectedOpposition: undefined
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

describe("GameSession match drafts", () => {
  it("persists a draft with its selected season, opposition, date, and squad", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));

    const draft = await session.createDraft({
      seasonId: season.id,
      oppositionId: opposition.id,
      date: "2026-09-26",
      squadPlayerIds: players.map((player) => player.id)
    });

    const reopened = await GameSession.open(store);
    expect(reopened.match(draft.id)).toMatchObject({
      status: "draft",
      seasonId: season.id,
      oppositionId: opposition.id,
      date: "2026-09-26",
      squadPlayerIds: players.map((player) => player.id)
    });
  });

  it("only starts a complete unique starting seven and then locks the squad", async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia", "Hana"].map((name) => session.addPlayer({ name })));
    const draft = await session.createDraft({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id) });

    await expect(session.startQuarterOne(draft.id)).rejects.toThrow("Assign every starting position");
    await session.setStartingLineup(draft.id, {
      "Goal Keeper": players[0].id,
      "Goal Defence": players[1].id,
      "Wing Defence": players[2].id,
      Centre: players[3].id,
      "Wing Attack": players[4].id,
      "Goal Attack": players[5].id,
      "Goal Shooter": players[6].id
    });

    await session.startQuarterOne(draft.id);

    expect(session.match(draft.id)).toMatchObject({ status: "live", activeQuarter: 1 });
    await expect(session.deleteDraft(draft.id)).rejects.toThrow("Only a draft can be deleted");
    await expect(session.updateDraftSquad(draft.id, [players[0].id])).rejects.toThrow("cannot be changed after Quarter 1 starts");
  });

  it("rejects an invalid starting seven and allows a setup-only draft to be deleted", async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const draft = await session.createDraft({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id) });

    await expect(session.setStartingLineup(draft.id, {
      "Goal Keeper": players[0].id,
      "Goal Defence": players[0].id,
      "Wing Defence": players[2].id,
      Centre: players[3].id,
      "Wing Attack": players[4].id,
      "Goal Attack": players[5].id,
      "Goal Shooter": players[6].id
    })).rejects.toThrow("unique player");

    await session.deleteDraft(draft.id);
    expect(session.match(draft.id)).toBeUndefined();
  });
});

describe("GameSession live quarter capture", () => {
  const startLiveMatch = async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia", "Hana"].map((name) => session.addPlayer({ name })));
    const game = await session.createDraft({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id) });
    await session.setStartingLineup(game.id, {
      "Goal Keeper": players[0].id,
      "Goal Defence": players[1].id,
      "Wing Defence": players[2].id,
      Centre: players[3].id,
      "Wing Attack": players[4].id,
      "Goal Attack": players[5].id,
      "Goal Shooter": players[6].id
    });
    await session.startQuarterOne(game.id);
    return { session, players, game };
  };

  it("credits applicable statistics to the active player-position pairing and derives the score", async () => {
    const { session, players, game } = await startLiveMatch();

    await session.recordPlayerStatistic(game.id, { position: "Centre", statistic: "Successful Centre Pass Received" });
    await session.recordPlayerStatistic(game.id, { position: "Goal Attack", statistic: "Goals" });
    await session.recordPlayerStatistic(game.id, { position: "Goal Shooter", statistic: "Misses" });
    await session.recordOppositionGoal(game.id);

    const capture = session.liveQuarter(game.id);
    expect(capture).toMatchObject({ ownScore: 1, oppositionScore: 1, ownGameScore: 1, oppositionGameScore: 1 });
    expect(capture.playerStatistics).toContainEqual({ playerId: players[3].id, position: "Centre", statistic: "Successful Centre Pass Received", count: 1 });
    expect(capture.playerStatistics).toContainEqual({ playerId: players[5].id, position: "Goal Attack", statistic: "Goals", count: 1 });
    await expect(session.recordPlayerStatistic(game.id, { position: "Centre", statistic: "Goals" })).rejects.toThrow("Goals and Misses can only be recorded");
    await expect(session.recordPlayerStatistic(game.id, { position: "Centre", statistic: "Misses" })).rejects.toThrow("Goals and Misses can only be recorded");
  });

  it("undos only the most recent stat or opposition-goal action", async () => {
    const { session, game } = await startLiveMatch();
    await session.recordPlayerStatistic(game.id, { position: "Goal Attack", statistic: "Goals" });
    await session.recordOppositionGoal(game.id);

    await session.undoLastCaptureAction(game.id);
    expect(session.liveQuarter(game.id)).toMatchObject({ ownScore: 1, oppositionScore: 0, ownGameScore: 1, oppositionGameScore: 0 });

    await session.undoLastCaptureAction(game.id);
    expect(session.liveQuarter(game.id)).toMatchObject({ ownScore: 0, oppositionScore: 0 });
  });

  it("uses the latest valid court change for subsequent statistic attribution", async () => {
    const { session, players, game } = await startLiveMatch();
    await session.changeCourt(game.id, {
      "Goal Keeper": players[0].id,
      "Goal Defence": players[1].id,
      "Wing Defence": players[3].id,
      Centre: players[7].id,
      "Wing Attack": players[4].id,
      "Goal Attack": players[5].id,
      "Goal Shooter": players[6].id
    });
    await session.recordPlayerStatistic(game.id, { position: "Centre", statistic: "Intercept" });

    await session.changeCourt(game.id, {
      "Goal Keeper": players[0].id,
      "Goal Defence": players[1].id,
      "Wing Defence": players[2].id,
      Centre: players[3].id,
      "Wing Attack": players[4].id,
      "Goal Attack": players[5].id,
      "Goal Shooter": players[6].id
    });

    expect(session.liveQuarter(game.id).courtChanges).toMatchObject([{ sequence: 1 }, { sequence: 2 }]);
    expect(session.liveQuarter(game.id).playerStatistics).toContainEqual({ playerId: players[7].id, position: "Centre", statistic: "Intercept", count: 1 });
    await expect(session.changeCourt(game.id, {
      "Goal Keeper": players[0].id,
      "Goal Defence": players[0].id,
      "Wing Defence": players[3].id,
      Centre: players[7].id,
      "Wing Attack": players[4].id,
      "Goal Attack": players[5].id,
      "Goal Shooter": players[6].id
    })).rejects.toThrow("unique player");
  });
});
