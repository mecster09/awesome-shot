import { describe, expect, it } from "vitest";
import { GameSession } from "./game-session";
import { InMemoryGameSessionStore } from "./in-memory-game-session-store";

describe("GameSession setup", () => {
  it("round-trips complete backups, merges without duplicates, and protects replacement/import failures", async () => {
    const source = await GameSession.open(new InMemoryGameSessionStore());
    await source.createSeason({ name: "2026 Winter", teamName: "Roses" });
    await source.addPlayer({ name: "Natalie", nickname: "Nat" });
    const backup = source.exportBackup();
    const target = await GameSession.open(new InMemoryGameSessionStore());

    await target.importBackup(backup, "merge");
    await target.importBackup(backup, "merge");
    expect(target.setup().seasons).toHaveLength(1);
    expect(target.setup().players).toMatchObject([{ name: "Natalie", nickname: "Nat" }]);
    await expect(target.importBackup(backup, "replace")).rejects.toThrow("Confirm replacement");
    await expect(target.importBackup("not a backup", "merge")).rejects.toThrow("valid Natball Insights backup");
    await expect(target.importBackup(JSON.stringify({ format: "natball-insights-backup", version: 1, data: { seasons: [{}], players: [], opposition: [], games: [] } }), "merge")).rejects.toThrow("incompatible");
    expect(target.setup().seasons).toHaveLength(1);

    await target.importBackup(JSON.stringify({ format: "natball-insights-backup", version: 1, data: { seasons: [], players: [], opposition: [], games: [] } }), "replace", true);
    expect(target.setup().seasons).toEqual([]);
  });

  it("persists a season, player, and active opposition for a coach", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);

    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const player = await session.addPlayer({ name: "Natalie", nickname: "Nat" });
    const opposition = await session.addOpposition({ name: "Thunder" });

    const rehydrated = await GameSession.open(store);

    expect(rehydrated.setup()).toEqual({
      teams: [{ id: season.teamId, name: "Roses" }],
      seasons: [season],
      players: [player],
      opposition: [opposition],
      activeOpposition: [opposition],
      games: [],
      selectedOpposition: undefined
    });
  });

  it("uses one active season at a time and reuses teams without case or whitespace duplicates", async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    const first = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });

    await expect(session.createSeason({ name: "2027 Winter", teamName: " roses " })).rejects.toThrow("active");
    await expect(session.createTeam({ name: "Violets" })).rejects.toThrow("Rename");
    await session.endSeason(first.id);
    const second = await session.createSeason({ name: "2027 Winter", teamName: " roses " });

    expect(session.setup().teams).toMatchObject([{ name: "Roses" }]);
    expect(second.teamId).toBe(first.teamId);
    expect(session.setup().seasons).toMatchObject([
      { name: "2026 Winter", status: "ended" },
      { name: "2027 Winter", status: "active" }
    ]);
  });

  it("will not end a season while one of its matches is live", async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const match = await session.startMatch({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id), startingLineup: { "Goal Keeper": players[0].id, "Goal Defence": players[1].id, "Wing Defence": players[2].id, Centre: players[3].id, "Wing Attack": players[4].id, "Goal Attack": players[5].id, "Goal Shooter": players[6].id } });

    await expect(session.endSeason(season.id)).rejects.toThrow("terminal");
    await session.abandonGame(match.id);
    await session.endSeason(season.id);
    await expect(session.startMatch({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id), startingLineup: { "Goal Keeper": players[0].id, "Goal Defence": players[1].id, "Wing Defence": players[2].id, Centre: players[3].id, "Wing Attack": players[4].id, "Goal Attack": players[5].id, "Goal Shooter": players[6].id } })).rejects.toThrow("active");
  });

  it("renames the active Team and Season while retaining the Team name frozen on terminal Matches", async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const match = await session.startMatch({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id), startingLineup: { "Goal Keeper": players[0].id, "Goal Defence": players[1].id, "Wing Defence": players[2].id, Centre: players[3].id, "Wing Attack": players[4].id, "Goal Attack": players[5].id, "Goal Shooter": players[6].id } });

    await session.renameTeam(season.teamId, { name: "Violets" });
    await session.renameSeason(season.id, { name: "2026 Spring" });
    expect(session.setup().teams).toMatchObject([{ id: season.teamId, name: "Violets" }]);
    expect(session.setup().seasons).toMatchObject([{ id: season.id, name: "2026 Spring" }]);

    await session.abandonGame(match.id);
    const legacyBackup = JSON.parse(session.exportBackup()) as { data: { games: Array<{ teamName?: string }> } };
    delete legacyBackup.data.games[0].teamName;
    await session.importBackup(JSON.stringify(legacyBackup), "replace", true);
    await session.renameTeam(season.teamId, { name: "Orchids" });

    expect(session.terminalMatchReport(match.id).teamName).toBe("Violets");
    expect(session.setup().teams).toMatchObject([{ id: season.teamId, name: "Orchids" }]);
  });

  it("migrates legacy season team names into reusable teams without losing season records", async () => {
    const legacy = {
      seasons: [
        { id: "season-1", name: "2025 Winter", teamName: "Roses" },
        { id: "season-2", name: "2026 Winter", teamName: " roses " }
      ],
      players: [],
      opposition: [],
      games: []
    };
    const store = {
      read: async () => structuredClone(legacy),
      write: async () => undefined
    };

    const session = await GameSession.open(store as never);

    expect(session.setup().teams).toMatchObject([{ name: "Roses" }]);
    expect(session.setup().seasons).toMatchObject([
      { id: "season-1", status: "ended" },
      { id: "season-2", status: "active" }
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
  it("persists a selected Match identity until advancing to Match Squad", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });

    await session.saveMatchIdentity({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26" });

    const reopened = await GameSession.open(store);
    expect(reopened.setup().matchSetupDraft).toEqual({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", stage: "match-identity" });
  });

  it("clears an incomplete Match identity when its Season ends", async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    await session.saveMatchIdentity({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26" });

    await session.endSeason(season.id);

    expect(session.setup().matchSetupDraft).toBeUndefined();
  });

  it("rejects impossible Match identity dates", async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });

    await expect(session.saveMatchIdentity({ seasonId: season.id, oppositionId: opposition.id, date: "2026-02-31" })).rejects.toThrow("valid match date");
  });

  it("persists an incomplete Match Squad but requires five Players for Court Setup", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi"].map((name) => session.addPlayer({ name })));

    await session.saveMatchSquad({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id) });
    expect((await GameSession.open(store)).setup().matchSetupDraft).toMatchObject({ stage: "match-squad", squadPlayerIds: players.map((player) => player.id) });
    await expect(session.advanceToCourtSetup({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id) })).rejects.toThrow("at least five");
  });

  it("persists a live match only when Match Setup starts Quarter 1", async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const startingLineup = { "Goal Keeper": players[0].id, "Goal Defence": players[1].id, "Wing Defence": players[2].id, Centre: players[3].id, "Wing Attack": players[4].id };

    await expect(session.startMatch({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.slice(0, 4).map((player) => player.id), startingLineup })).rejects.toThrow("at least five");
    expect(session.matches()).toEqual([]);
    const match = await session.startMatch({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id), startingLineup });

    expect(match).toMatchObject({ status: "live", activeQuarter: 1 });
    expect(match).not.toHaveProperty("startingLineup");
    await expect(session.startMatch({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id), startingLineup })).rejects.toThrow("live match");
  });

  it("reuses normalised Opposition and player names for Match Setup", async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    const opposition = await session.addOpposition({ name: "Thunder" });
    const sameOpposition = await session.addOpposition({ name: " thunder " });
    const player = await session.addPlayer({ name: "Ava" });
    const samePlayer = await session.addPlayer({ name: " ava " });

    expect(sameOpposition.id).toBe(opposition.id);
    expect(samePlayer.id).toBe(player.id);
    expect(session.setup().opposition).toHaveLength(1);
    expect(session.setup().players).toHaveLength(1);
  });

  it("drops legacy persisted Match drafts during backup import", async () => {
    const source = await GameSession.open(new InMemoryGameSessionStore());
    const season = await source.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await source.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve"].map((name) => source.addPlayer({ name })));
    const backup = JSON.parse(source.exportBackup()) as { data: { games: unknown[] } };
    backup.data.games.push({ id: "legacy-draft", seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id), status: "draft" });
    const target = await GameSession.open(new InMemoryGameSessionStore());

    await target.importBackup(JSON.stringify(backup), "replace", true);

    expect(target.matches()).toEqual([]);
  });

});

describe("GameSession live quarter capture", () => {
  const startLiveMatch = async () => {
    const session = await GameSession.open(new InMemoryGameSessionStore());
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia", "Hana"].map((name) => session.addPlayer({ name })));
    const game = await session.startMatch({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id), startingLineup: {
      "Goal Keeper": players[0].id,
      "Goal Defence": players[1].id,
      "Wing Defence": players[2].id,
      Centre: players[3].id,
      "Wing Attack": players[4].id,
      "Goal Attack": players[5].id,
      "Goal Shooter": players[6].id
    } });
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
    expect(session.gameScore(game.id)).toEqual({ own: 1, opposition: 1 });
    expect(capture.playerStatistics).toContainEqual({ playerId: players[3].id, position: "Centre", statistic: "Successful Centre Pass Received", count: 1 });
    expect(capture.playerStatistics).toContainEqual({ playerId: players[5].id, position: "Goal Attack", statistic: "Goals", count: 1 });
    await expect(session.recordPlayerStatistic(game.id, { position: "Centre", statistic: "Goals" })).rejects.toThrow("Goals and Misses can only be recorded");
    await expect(session.recordPlayerStatistic(game.id, { position: "Centre", statistic: "Misses" })).rejects.toThrow("Goals and Misses can only be recorded");
  });

  it("undos the latest event, including an opposition goal", async () => {
    const { session, game } = await startLiveMatch();
    await session.recordPlayerStatistic(game.id, { position: "Goal Attack", statistic: "Goals" });
    await session.recordOppositionGoal(game.id);

    await session.undoLastCaptureAction(game.id);
    expect(session.liveQuarter(game.id)).toMatchObject({ ownScore: 1, oppositionScore: 0, ownGameScore: 1, oppositionGameScore: 0 });

    await session.recordPlayerStatistic(game.id, { position: "Goal Attack", statistic: "Goals" });
    await session.undoLastCaptureAction(game.id);
    expect(session.liveQuarter(game.id)).toMatchObject({ ownScore: 1, oppositionScore: 0 });
  });

  it("records a single-position Substitution and retains event attribution", async () => {
    const { session, players, game } = await startLiveMatch();
    await session.substitutePlayer(game.id, { position: "Goal Attack", playerId: players[7].id });
    await session.recordPlayerStatistic(game.id, { position: "Goal Attack", statistic: "Goals" });

    expect(session.liveQuarter(game.id).substitutions).toEqual([{ sequence: 1, position: "Goal Attack", playerId: players[7].id }]);
    expect(session.liveQuarter(game.id)).toMatchObject({ ownScore: 1, ownGameScore: 1 });
    expect(session.liveQuarter(game.id).playerStatistics).toContainEqual({ playerId: players[7].id, position: "Goal Attack", statistic: "Goals", count: 1 });
    await expect(session.undoLastCaptureAction(game.id)).resolves.toBeUndefined();
    expect(session.liveQuarter(game.id).playerStatistics).toEqual([]);
  });

  it("progresses through ended quarters using the final court as the next starting court", async () => {
    const { session, players, game } = await startLiveMatch();
    await session.substitutePlayer(game.id, { position: "Centre", playerId: players[7].id });
    await session.endQuarter(game.id);
    await expect(session.recordOppositionGoal(game.id)).rejects.toThrow("no live quarter");
    await session.startNextQuarter(game.id, session.nextQuarterCourt(game.id));
    expect(session.match(game.id)).toMatchObject({ activeQuarter: 2 });
    expect(session.liveQuarter(game.id).lineup.Centre).toBe(players[7].id);
  });

  it("reports separate Player-Position stints for between-Quarter planning", async () => {
    const { session, players, game } = await startLiveMatch();
    await session.recordPlayerStatistic(game.id, { position: "Centre", statistic: "Tip" });
    await session.recordPlayerStatistic(game.id, { position: "Goal Keeper", statistic: "Tip" });
    await session.endQuarter(game.id);
    await session.startNextQuarter(game.id, {
      "Goal Keeper": players[0].id,
      "Goal Defence": players[1].id,
      "Wing Defence": players[2].id,
      Centre: players[4].id,
      "Wing Attack": players[3].id,
      "Goal Attack": players[5].id,
      "Goal Shooter": players[6].id
    });
    await session.recordPlayerStatistic(game.id, { position: "Wing Attack", statistic: "Tip" });
    await session.recordPlayerStatistic(game.id, { position: "Goal Keeper", statistic: "Tip" });
    await session.endQuarter(game.id);

    const statistics = session.betweenQuarterStatistics(game.id);

    expect(statistics.previousQuarterStints).toContainEqual({ playerId: players[3].id, position: "Wing Attack", playerStatistics: [{ playerId: players[3].id, position: "Wing Attack", statistic: "Tip", count: 1 }] });
    expect(statistics.matchStints).toContainEqual({ playerId: players[3].id, position: "Centre", playerStatistics: [{ playerId: players[3].id, position: "Centre", statistic: "Tip", count: 1 }] });
    expect(statistics.matchStints).toContainEqual({ playerId: players[3].id, position: "Wing Attack", playerStatistics: [{ playerId: players[3].id, position: "Wing Attack", statistic: "Tip", count: 1 }] });
    expect(statistics.matchStints).toContainEqual({ playerId: players[0].id, position: "Goal Keeper", playerStatistics: [{ playerId: players[0].id, position: "Goal Keeper", statistic: "Tip", count: 2 }] });
  });

  it("confirms five-to-seven-player courts and keeps the Match Squad fixed after Match start", async () => {
    const { session, players, game } = await startLiveMatch();
    const latePlayer = await session.addPlayer({ name: "Ivy" });
    await session.endQuarter(game.id);
    await expect(session.addPlayerToSquad(game.id, latePlayer.id)).rejects.toThrow("Match Squad is fixed");

    await session.startNextQuarter(game.id, {
      "Goal Keeper": players[0].id,
      "Goal Defence": players[1].id,
      "Wing Defence": players[2].id,
      Centre: players[3].id,
      "Wing Attack": players[4].id
    });

    expect(session.liveQuarter(game.id).lineup).toEqual({
      "Goal Keeper": players[0].id,
      "Goal Defence": players[1].id,
      "Wing Defence": players[2].id,
      Centre: players[3].id,
      "Wing Attack": players[4].id
    });
    expect(session.liveQuarter(game.id).substitutions).not.toContainEqual({ position: "Centre", playerId: latePlayer.id });
    await session.endQuarter(game.id);
    await expect(session.startNextQuarter(game.id, {
      "Goal Keeper": players[0].id,
      "Goal Defence": players[0].id,
      "Wing Defence": players[2].id,
      Centre: players[3].id,
      "Wing Attack": players[4].id
    })).rejects.toThrow("unique player");
  });

  it("corrects an ended quarter while a later quarter is live", async () => {
    const { session, players, game } = await startLiveMatch();
    await session.recordPlayerStatistic(game.id, { position: "Centre", statistic: "Tip" });
    const actionId = session.liveQuarter(game.id).captureActions[0].id;
    await session.endQuarter(game.id);
    await session.startNextQuarter(game.id, session.nextQuarterCourt(game.id));
    await session.correctPlayerStatistic(game.id, 1, actionId, { playerId: players[7].id, position: "Wing Defence", statistic: "Intercept" });
    expect(session.quarterCapture(game.id, 1).playerStatistics).toContainEqual({ playerId: players[7].id, position: "Wing Defence", statistic: "Intercept", count: 1 });
    await session.deleteCaptureAction(game.id, 1, actionId);
    expect(session.quarterCapture(game.id, 1).playerStatistics).toEqual([]);
  });

  it("finalises only a confirmed four-quarter score and makes the record immutable", async () => {
    const { session, game } = await startLiveMatch();
    await session.recordPlayerStatistic(game.id, { position: "Goal Attack", statistic: "Goals" });
    const actionId = session.liveQuarter(game.id).captureActions[0].id;
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      await session.endQuarter(game.id);
      if (quarter < 4) await session.startNextQuarter(game.id, session.nextQuarterCourt(game.id));
    }
    await expect(session.finaliseGame(game.id, { own: 0, opposition: 0 })).rejects.toThrow("Confirm the displayed");
    await session.finaliseGame(game.id, { own: 1, opposition: 0 });
    expect(session.match(game.id)).toMatchObject({ status: "finalised", finalScore: { own: 1, opposition: 0 } });
    expect(session.match(game.id)?.incomplete).toBeUndefined();
    await expect(session.startNextQuarter(game.id, {})).rejects.toThrow("Only a live game");
    await expect(session.recordOppositionGoal(game.id)).rejects.toThrow("no live quarter");
    await expect(session.deleteCaptureAction(game.id, 1, actionId)).rejects.toThrow("Only a live game");
    await expect(session.correctPlayerStatistic(game.id, 1, actionId, { playerId: session.match(game.id)!.squadPlayerIds[0], position: "Wing Defence", statistic: "Intercept" })).rejects.toThrow("Only a live game");
    await expect(session.abandonGame(game.id)).rejects.toThrow("Only a live game");
  });

  it("retains incomplete data and locks every mutation for abandoned games", async () => {
    const abandoned = await startLiveMatch();
    await abandoned.session.recordPlayerStatistic(abandoned.game.id, { position: "Goal Attack", statistic: "Goals" });
    const actionId = abandoned.session.liveQuarter(abandoned.game.id).captureActions[0].id;
    await abandoned.session.endQuarter(abandoned.game.id);
    await abandoned.session.abandonGame(abandoned.game.id);
    expect(abandoned.session.match(abandoned.game.id)).toMatchObject({ status: "abandoned", incomplete: true, outcome: { kind: "abandoned" }, finalScore: { own: 1, opposition: 0 }, quarters: [{ captureActions: [{ id: actionId }] }] });
    await expect(abandoned.session.recordOppositionGoal(abandoned.game.id)).rejects.toThrow("no live quarter");
    await expect(abandoned.session.deleteCaptureAction(abandoned.game.id, 1, actionId)).rejects.toThrow("Only a live game");
    await expect(abandoned.session.correctPlayerStatistic(abandoned.game.id, 1, actionId, { playerId: abandoned.players[7].id, position: "Wing Defence", statistic: "Intercept" })).rejects.toThrow("Only a live game");
    await expect(abandoned.session.endQuarter(abandoned.game.id)).rejects.toThrow("no live quarter");
  });

  it("exposes a read-only report model only for terminal matches", async () => {
    const { session, game } = await startLiveMatch();
    await expect(() => session.terminalMatchReport(game.id)).toThrow("Only a terminal match");
    await session.recordPlayerStatistic(game.id, { position: "Goal Attack", statistic: "Goals" });
    await session.abandonGame(game.id);

    expect(session.terminalMatchReport(game.id)).toMatchObject({
      teamName: "Roses",
      oppositionName: "Thunder",
      status: "abandoned",
      score: { own: 1, opposition: 0 },
      quarters: [{ number: 1, ownScore: 1, playerStatistics: [{ position: "Goal Attack", statistic: "Goals", count: 1 }] }]
    });
  });

  it("reports completed and abandoned outcomes without reopening their data", async () => {
    const completed = await startLiveMatch();
    await completed.session.recordPlayerStatistic(completed.game.id, { position: "Goal Attack", statistic: "Goals" });
    for (let quarter = 1; quarter <= 4; quarter += 1) { await completed.session.endQuarter(completed.game.id); if (quarter < 4) await completed.session.startNextQuarter(completed.game.id, completed.session.nextQuarterCourt(completed.game.id)); }
    await completed.session.finaliseGame(completed.game.id, { own: 1, opposition: 0 });
    expect(completed.session.terminalMatchReport(completed.game.id)).toMatchObject({ status: "finalised", outcome: { kind: "completed" }, score: { own: 1, opposition: 0 } });
    const abandoned = await startLiveMatch();
    await abandoned.session.abandonGame(abandoned.game.id);
    expect(abandoned.session.terminalMatchReport(abandoned.game.id)).toMatchObject({ status: "abandoned", outcome: { kind: "abandoned" } });
  });

  it("restores terminal history and report eligibility from a complete backup", async () => {
    const source = await startLiveMatch();
    await source.session.recordPlayerStatistic(source.game.id, { position: "Goal Attack", statistic: "Goals" });
    await source.session.substitutePlayer(source.game.id, { position: "Centre", playerId: source.players[7].id });
    await source.session.endQuarter(source.game.id);
    await source.session.abandonGame(source.game.id);
    const restored = await GameSession.open(new InMemoryGameSessionStore());

    await restored.importBackup(source.session.exportBackup(), "merge");
    expect(restored.match(source.game.id)).toMatchObject({ status: "abandoned", incomplete: true, outcome: { kind: "abandoned" }, quarters: [{ substitutions: [{ sequence: 1 }], captureActions: [{ statistic: "Goals" }] }] });
    expect(restored.terminalMatchReport(source.game.id)).toMatchObject({ score: { own: 1, opposition: 0 }, status: "abandoned" });
  });
});
