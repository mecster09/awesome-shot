import { PLAYER_STATISTICS, POSITIONS, SHOOTER_STATISTICS, type CaptureAction, type CreateDraftInput, type Game, type GameSessionStore, type LiveQuarterCapture, type Opposition, type Player, type PlayerStatistic, type PlayerStatisticTotal, type Position, type Quarter, type QuarterNumber, type Season, type SetupData, type SetupSummary, type StartingLineup, type TerminalMatchReport } from "./types";

const emptySetup = (): SetupData => ({ seasons: [], players: [], opposition: [], games: [] });
const backupFormat = "natball-insights-backup";

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object";
const hasStrings = (value: unknown, keys: string[]) => isObject(value) && keys.every((key) => typeof value[key] === "string");
const isLineup = (value: unknown) => isObject(value) && POSITIONS.every((position) => typeof value[position] === "string");
const isQuarter = (value: unknown) => isObject(value) && [1, 2, 3, 4].includes(value.number as number) && ["live", "ended"].includes(value.status as string) && isLineup(value.startingLineup) && Array.isArray(value.courtChanges) && value.courtChanges.every((change) => isObject(change) && typeof change.sequence === "number" && isLineup(change.lineup)) && Array.isArray(value.captureActions) && value.captureActions.every((action) => isObject(action) && typeof action.id === "string" && (action.kind === "opposition-goal" || action.kind === "player-statistic" && typeof action.playerId === "string" && POSITIONS.includes(action.position as Position) && PLAYER_STATISTICS.includes(action.statistic as PlayerStatistic)));
const isGame = (value: unknown) => hasStrings(value, ["id", "seasonId", "oppositionId", "date", "status"]) && isObject(value) && ["draft", "live", "finalised", "abandoned", "terminated"].includes(value.status as string) && Array.isArray(value.squadPlayerIds) && value.squadPlayerIds.every((id) => typeof id === "string") && (value.startingLineup === undefined || isLineup(value.startingLineup)) && (value.quarters === undefined || Array.isArray(value.quarters) && value.quarters.every(isQuarter));
const parseBackup = (serialized: string): SetupData => {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); } catch { throw new Error("Choose a valid Natball Insights backup file."); }
  if (!parsed || typeof parsed !== "object") throw new Error("Choose a valid Natball Insights backup file.");
  const backup = parsed as { format?: unknown; version?: unknown; data?: unknown };
  if (backup.format !== backupFormat || backup.version !== 1 || !backup.data || typeof backup.data !== "object") throw new Error("Choose a valid Natball Insights backup file.");
  const data = backup.data as Partial<SetupData>;
  if (!Array.isArray(data.seasons) || !data.seasons.every((season) => hasStrings(season, ["id", "name", "teamName"])) || !Array.isArray(data.players) || !data.players.every((player) => hasStrings(player, ["id", "name"]) && (player.nickname === undefined || typeof player.nickname === "string")) || !Array.isArray(data.opposition) || !data.opposition.every((opposition) => hasStrings(opposition, ["id", "name"]) && typeof opposition.archived === "boolean") || !Array.isArray(data.games) || !data.games.every(isGame) || (data.selectedOppositionId !== undefined && typeof data.selectedOppositionId !== "string")) throw new Error("This backup is incompatible with Natball Insights.");
  const seasonIds = new Set(data.seasons.map((season) => season.id)); const playerIds = new Set(data.players.map((player) => player.id)); const oppositionIds = new Set(data.opposition.map((opposition) => opposition.id));
  if (data.games.some((game) => !seasonIds.has(game.seasonId) || !oppositionIds.has(game.oppositionId) || game.squadPlayerIds.some((id) => !playerIds.has(id))) || data.selectedOppositionId && !oppositionIds.has(data.selectedOppositionId)) throw new Error("This backup has broken record references.");
  return structuredClone(data as SetupData);
};

const requireText = (value: string, field: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required.`);
  }
  return trimmed;
};

export class GameSession {
  private constructor(
    private readonly store: GameSessionStore,
    private data: SetupData
  ) {}

  static async open(store: GameSessionStore): Promise<GameSession> {
    const stored = await store.read();
    if (!stored) return new GameSession(store, emptySetup());
    return new GameSession(store, {
      ...stored,
      games: (stored.games ?? []).map((game) => game.status === "live" && !game.quarters && game.startingLineup
        ? { ...game, quarters: [{ number: 1, status: "live", startingLineup: structuredClone(game.startingLineup), courtChanges: [], captureActions: [] }] }
        : game)
    });
  }

  setup(): SetupSummary {
    return {
      ...structuredClone(this.data),
      activeOpposition: this.data.opposition.filter((opposition) => !opposition.archived),
      selectedOpposition: this.data.opposition.find((opposition) => opposition.id === this.data.selectedOppositionId)
    };
  }

  newSeasonDefaults(): { teamName: string } {
    return { teamName: this.data.seasons.at(-1)?.teamName ?? "" };
  }

  async createSeason(input: { name: string; teamName: string }): Promise<Season> {
    const season: Season = {
      id: crypto.randomUUID(),
      name: requireText(input.name, "Season name"),
      teamName: requireText(input.teamName, "Team name")
    };
    this.data.seasons.push(season);
    await this.persist();
    return structuredClone(season);
  }

  async addPlayer(input: { name: string; nickname?: string }): Promise<Player> {
    const nickname = input.nickname?.trim();
    const player: Player = {
      id: crypto.randomUUID(),
      name: requireText(input.name, "Player name"),
      ...(nickname ? { nickname } : {})
    };
    this.data.players.push(player);
    await this.persist();
    return structuredClone(player);
  }

  async addOpposition(input: { name: string }): Promise<Opposition> {
    const opposition: Opposition = {
      id: crypto.randomUUID(),
      name: requireText(input.name, "Opposition name"),
      archived: false
    };
    this.data.opposition.push(opposition);
    await this.persist();
    return structuredClone(opposition);
  }

  async archiveOpposition(id: string): Promise<void> {
    const opposition = this.data.opposition.find((candidate) => candidate.id === id);
    if (!opposition) {
      throw new Error("Opposition was not found.");
    }
    opposition.archived = true;
    if (this.data.selectedOppositionId === id) {
      this.data.selectedOppositionId = undefined;
    }
    await this.persist();
  }

  async selectOpposition(id: string): Promise<void> {
    const opposition = this.data.opposition.find((candidate) => candidate.id === id);
    if (!opposition || opposition.archived) {
      throw new Error("Select an active opposition.");
    }
    this.data.selectedOppositionId = id;
    await this.persist();
  }

  match(id: string): Game | undefined {
    const game = this.data.games.find((candidate) => candidate.id === id);
    return game ? structuredClone(game) : undefined;
  }

  matches(): Game[] {
    return structuredClone(this.data.games);
  }

  exportBackup(): string {
    return JSON.stringify({ format: backupFormat, version: 1, data: this.data });
  }

  async importBackup(serialized: string, mode: "merge" | "replace", replacementConfirmed = false): Promise<void> {
    const imported = parseBackup(serialized);
    if (mode === "replace" && !replacementConfirmed) throw new Error("Confirm replacement before deleting local data.");
    if (mode === "replace") {
      this.data = imported;
    } else {
      const merge = <T extends { id: string }>(current: T[], incoming: T[]) => [...current, ...incoming.filter((candidate) => !current.some((existing) => existing.id === candidate.id || JSON.stringify(existing) === JSON.stringify(candidate)))];
      this.data = {
        seasons: merge(this.data.seasons, imported.seasons),
        players: merge(this.data.players, imported.players),
        opposition: merge(this.data.opposition, imported.opposition),
        games: merge(this.data.games, imported.games),
        selectedOppositionId: this.data.selectedOppositionId ?? imported.selectedOppositionId
      };
    }
    await this.persist();
  }

  gameScore(id: string): { own: number; opposition: number } {
    const game = this.data.games.find((candidate) => candidate.id === id);
    if (!game) throw new Error("Match was not found.");
    return this.score(game.quarters?.flatMap((quarter) => quarter.captureActions) ?? []);
  }

  terminalMatchReport(id: string): TerminalMatchReport {
    const game = this.data.games.find((candidate) => candidate.id === id);
    if (!game || (game.status !== "finalised" && game.status !== "abandoned" && game.status !== "terminated") || !game.outcome) throw new Error("Only a terminal match can be reviewed.");
    const playerName = (playerId: string) => this.data.players.find((player) => player.id === playerId)?.name ?? "Unknown player";
    const lineup = (court: StartingLineup) => POSITIONS.map((position) => ({ position, playerId: court[position], playerName: playerName(court[position]) }));
    const quarters = (game.quarters ?? []).map((quarter) => ({
      number: quarter.number,
      ownScore: this.score(quarter.captureActions).own,
      oppositionScore: this.score(quarter.captureActions).opposition,
      startingLineup: lineup(quarter.startingLineup),
      courtChanges: quarter.courtChanges.map((change) => ({ sequence: change.sequence, lineup: lineup(change.lineup) })),
      playerStatistics: this.statisticTotals(quarter.captureActions).map((statistic) => ({ ...statistic, playerName: playerName(statistic.playerId) }))
    }));
    return structuredClone({
      id: game.id,
      date: game.date,
      teamName: this.requireSeason(game.seasonId).teamName,
      oppositionName: this.data.opposition.find((opposition) => opposition.id === game.oppositionId)?.name ?? "Unknown opposition",
      status: game.status,
      outcome: game.outcome,
      score: game.finalScore ?? this.gameScore(id),
      quarters,
      gamePlayerStatistics: this.statisticTotals((game.quarters ?? []).flatMap((quarter) => quarter.captureActions)).map((statistic) => ({ ...statistic, playerName: playerName(statistic.playerId) }))
    });
  }

  async createDraft(input: CreateDraftInput): Promise<Game> {
    this.requireSeason(input.seasonId);
    this.requireActiveOpposition(input.oppositionId);
    const game: Game = {
      id: crypto.randomUUID(),
      seasonId: input.seasonId,
      oppositionId: input.oppositionId,
      date: this.requireDate(input.date),
      squadPlayerIds: this.validSquad(input.squadPlayerIds),
      status: "draft"
    };
    this.data.games.push(game);
    await this.persist();
    return structuredClone(game);
  }

  async updateDraftSquad(id: string, squadPlayerIds: string[]): Promise<void> {
    const game = this.requireDraft(id, "The squad cannot be changed after Quarter 1 starts.");
    game.squadPlayerIds = this.validSquad(squadPlayerIds);
    game.startingLineup = undefined;
    await this.persist();
  }

  async setStartingLineup(id: string, lineup: StartingLineup): Promise<void> {
    const game = this.requireDraft(id, "The starting court cannot be changed after Quarter 1 starts.");
    this.validateStartingLineup(game, lineup);
    game.startingLineup = structuredClone(lineup);
    await this.persist();
  }

  async startQuarterOne(id: string): Promise<void> {
    const game = this.requireDraft(id, "Quarter 1 has already started.");
    if (!game.startingLineup) {
      throw new Error("Assign every starting position before starting Quarter 1.");
    }
    this.validateStartingLineup(game, game.startingLineup);
    game.status = "live";
    game.activeQuarter = 1;
    game.quarters = [{ number: 1, status: "live", startingLineup: structuredClone(game.startingLineup), courtChanges: [], captureActions: [] }];
    await this.persist();
  }

  async deleteDraft(id: string): Promise<void> {
    const game = this.data.games.find((candidate) => candidate.id === id);
    if (!game || game.status !== "draft") {
      throw new Error("Only a draft can be deleted.");
    }
    this.data.games = this.data.games.filter((candidate) => candidate.id !== id);
    await this.persist();
  }

  async endQuarter(id: string): Promise<void> {
    const { game, quarter } = this.requireLiveQuarter(id);
    quarter.status = "ended";
    game.activeQuarter = undefined;
    await this.persist();
  }

  async startNextQuarter(id: string): Promise<void> {
    const game = this.requireLiveGame(id);
    if (game.activeQuarter) throw new Error("End the current quarter before starting the next one.");
    const previous = game.quarters?.at(-1);
    if (!previous || previous.status !== "ended") throw new Error("End the previous quarter before starting the next one.");
    if (previous.number === 4) throw new Error("All four quarters have ended.");
    const number = (previous.number + 1) as QuarterNumber;
    game.quarters?.push({ number, status: "live", startingLineup: structuredClone(this.currentLineup(previous)), courtChanges: [], captureActions: [] });
    game.activeQuarter = number;
    await this.persist();
  }

  quarterCapture(id: string, number: QuarterNumber): LiveQuarterCapture {
    const game = this.requireLiveGame(id);
    const quarter = game.quarters?.find((candidate) => candidate.number === number);
    if (!quarter) throw new Error("Quarter was not found.");
    return this.capture(game, quarter);
  }

  async deleteCaptureAction(id: string, number: QuarterNumber, actionId: string): Promise<void> {
    const game = this.requireLiveGame(id);
    const quarter = this.requireUnfinalisedQuarter(game, number);
    const actionIndex = quarter.captureActions.findIndex((action) => action.id === actionId);
    if (actionIndex < 0) throw new Error("Capture action was not found.");
    quarter.captureActions.splice(actionIndex, 1);
    await this.persist();
  }

  async correctPlayerStatistic(id: string, number: QuarterNumber, actionId: string, input: { playerId: string; position: Position; statistic: PlayerStatistic }): Promise<void> {
    const game = this.requireLiveGame(id);
    const quarter = this.requireUnfinalisedQuarter(game, number);
    const action = quarter.captureActions.find((candidate) => candidate.id === actionId);
    if (!action || action.kind !== "player-statistic") throw new Error("Player statistic was not found.");
    if (!game.squadPlayerIds.includes(input.playerId) || !PLAYER_STATISTICS.includes(input.statistic)) throw new Error("Choose a valid player statistic correction.");
    if (SHOOTER_STATISTICS.includes(input.statistic as (typeof SHOOTER_STATISTICS)[number]) && input.position !== "Goal Attack" && input.position !== "Goal Shooter") throw new Error("Goals and Misses can only be recorded for Goal Attack or Goal Shooter.");
    Object.assign(action, input);
    await this.persist();
  }

  async finaliseGame(id: string, confirmedScore: { own: number; opposition: number }): Promise<void> {
    const game = this.requireLiveGame(id);
    if (game.activeQuarter || game.quarters?.length !== 4 || game.quarters.some((quarter) => quarter.status !== "ended")) throw new Error("End all four quarters before finalising.");
    const score = this.gameScore(id);
    if (score.own !== confirmedScore.own || score.opposition !== confirmedScore.opposition) throw new Error("Confirm the displayed final score before finalising.");
    game.status = "finalised";
    game.outcome = { kind: "completed" };
    game.finalScore = score;
    await this.persist();
  }

  async abandonGame(id: string, winner: "team" | "opposition"): Promise<void> {
    await this.endIncompleteGame(id, { kind: "abandoned", winner });
  }

  async terminateGame(id: string): Promise<void> {
    await this.endIncompleteGame(id, { kind: "terminated" });
  }

  private async endIncompleteGame(id: string, outcome: Exclude<NonNullable<Game["outcome"]>, { kind: "completed" }>): Promise<void> {
    const game = this.requireLiveGame(id);
    game.status = outcome.kind;
    game.outcome = outcome;
    game.incomplete = true;
    game.finalScore = this.gameScore(id);
    await this.persist();
  }

  liveQuarter(id: string): LiveQuarterCapture {
    const { game, quarter } = this.requireLiveQuarter(id);
    return this.capture(game, quarter);
  }

  private capture(game: Game, quarter: Quarter): LiveQuarterCapture {
    const lineup = this.currentLineup(quarter);
    const quarterScore = this.score(quarter.captureActions);
    const gameScore = this.score(game.quarters?.flatMap((candidate) => candidate.captureActions) ?? []);
    return {
      number: quarter.number,
      lineup: structuredClone(lineup),
      courtChanges: structuredClone(quarter.courtChanges),
      playerStatistics: this.statisticTotals(quarter.captureActions),
      ownScore: quarterScore.own,
      oppositionScore: quarterScore.opposition,
      ownGameScore: gameScore.own,
      oppositionGameScore: gameScore.opposition,
      captureActions: structuredClone(quarter.captureActions),
      canUndo: quarter.captureActions.length > 0
    };
  }

  async recordPlayerStatistic(id: string, input: { position: Position; statistic: PlayerStatistic }): Promise<void> {
    const { quarter } = this.requireLiveQuarter(id);
    if (!PLAYER_STATISTICS.includes(input.statistic)) {
      throw new Error("Choose a supported player statistic.");
    }
    if (SHOOTER_STATISTICS.includes(input.statistic as (typeof SHOOTER_STATISTICS)[number]) && input.position !== "Goal Attack" && input.position !== "Goal Shooter") {
      throw new Error("Goals and Misses can only be recorded for Goal Attack or Goal Shooter.");
    }
    const lineup = this.currentLineup(quarter);
    quarter.captureActions.push({ id: crypto.randomUUID(), kind: "player-statistic", playerId: lineup[input.position], position: input.position, statistic: input.statistic });
    await this.persist();
  }

  async recordOppositionGoal(id: string): Promise<void> {
    const { quarter } = this.requireLiveQuarter(id);
    quarter.captureActions.push({ id: crypto.randomUUID(), kind: "opposition-goal" });
    await this.persist();
  }

  async undoLastCaptureAction(id: string): Promise<void> {
    const { quarter } = this.requireLiveQuarter(id);
    if (!quarter.captureActions.pop()) {
      throw new Error("There is no capture action to undo.");
    }
    await this.persist();
  }

  async changeCourt(id: string, lineup: StartingLineup): Promise<void> {
    const { game, quarter } = this.requireLiveQuarter(id);
    this.validateStartingLineup(game, lineup);
    quarter.courtChanges.push({ sequence: quarter.courtChanges.length + 1, lineup: structuredClone(lineup) });
    await this.persist();
  }

  private requireSeason(id: string): Season {
    const season = this.data.seasons.find((candidate) => candidate.id === id);
    if (!season) throw new Error("Select a saved season.");
    return season;
  }

  private requireActiveOpposition(id: string): Opposition {
    const opposition = this.data.opposition.find((candidate) => candidate.id === id && !candidate.archived);
    if (!opposition) throw new Error("Select an active opposition.");
    return opposition;
  }

  private validSquad(playerIds: string[]): string[] {
    const uniqueIds = [...new Set(playerIds)];
    if (!uniqueIds.length) throw new Error("Choose at least one squad player.");
    if (uniqueIds.length > 12) throw new Error("A match squad can contain at most 12 players.");
    if (uniqueIds.length !== playerIds.length || uniqueIds.some((id) => !this.data.players.some((player) => player.id === id))) {
      throw new Error("Choose unique saved players for the squad.");
    }
    return uniqueIds;
  }

  private requireDate(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).valueOf())) {
      throw new Error("Enter a valid match date.");
    }
    return value;
  }

  private requireDraft(id: string, liveMessage: string): Game {
    const game = this.data.games.find((candidate) => candidate.id === id);
    if (!game) throw new Error("Match draft was not found.");
    if (game.status !== "draft") throw new Error(liveMessage);
    return game;
  }

  private requireLiveQuarter(id: string): { game: Game; quarter: NonNullable<Game["quarters"]>[number] } {
    const game = this.data.games.find((candidate) => candidate.id === id);
    const quarter = game?.quarters?.find((candidate) => candidate.number === game.activeQuarter);
    if (!game || game.status !== "live" || !quarter || quarter.status !== "live") {
      throw new Error("There is no live quarter.");
    }
    return { game, quarter };
  }

  private requireLiveGame(id: string): Game {
    const game = this.data.games.find((candidate) => candidate.id === id);
    if (!game || game.status !== "live") throw new Error("Only a live game can be changed.");
    return game;
  }

  private requireUnfinalisedQuarter(game: Game, number: QuarterNumber): Quarter {
    const quarter = game.quarters?.find((candidate) => candidate.number === number);
    if (!quarter) throw new Error("Quarter was not found.");
    return quarter;
  }

  private currentLineup(quarter: Quarter): StartingLineup {
    return quarter.courtChanges.at(-1)?.lineup ?? quarter.startingLineup;
  }

  private score(actions: CaptureAction[]): { own: number; opposition: number } {
    return actions.reduce((score, action) => {
      if (action.kind === "opposition-goal") return { ...score, opposition: score.opposition + 1 };
      return action.statistic === "Goals" ? { ...score, own: score.own + 1 } : score;
    }, { own: 0, opposition: 0 });
  }

  private statisticTotals(actions: CaptureAction[]): PlayerStatisticTotal[] {
    const totals = new Map<string, PlayerStatisticTotal>();
    for (const action of actions) {
      if (action.kind === "opposition-goal") continue;
      const key = `${action.playerId}:${action.position}:${action.statistic}`;
      const existing = totals.get(key);
      totals.set(key, existing ? { ...existing, count: existing.count + 1 } : { playerId: action.playerId, position: action.position, statistic: action.statistic, count: 1 });
    }
    return [...totals.values()];
  }

  private validateStartingLineup(game: Game, lineup: StartingLineup): void {
    if (!POSITIONS.every((position) => lineup[position])) {
      throw new Error("Assign every starting position before starting Quarter 1.");
    }
    const playerIds = POSITIONS.map((position) => lineup[position]);
    if (new Set(playerIds).size !== playerIds.length) {
      throw new Error("Assign a unique player to every starting position.");
    }
    if (playerIds.some((id) => !game.squadPlayerIds.includes(id))) {
      throw new Error("Every starter must be in the match squad.");
    }
  }

  private async persist(): Promise<void> {
    await this.store.write(this.data);
  }
}
