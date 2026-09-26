import { PLAYER_STATISTICS, POSITIONS, SHOOTER_STATISTICS, type CaptureAction, type CreateDraftInput, type Game, type GameSessionStore, type LiveQuarterCapture, type Opposition, type Player, type PlayerStatistic, type Position, type Quarter, type QuarterNumber, type Season, type SetupData, type SetupSummary, type StartingLineup } from "./types";

const emptySetup = (): SetupData => ({ seasons: [], players: [], opposition: [], games: [] });

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

  gameScore(id: string): { own: number; opposition: number } {
    const game = this.data.games.find((candidate) => candidate.id === id);
    if (!game) throw new Error("Match was not found.");
    return this.score(game.quarters?.flatMap((quarter) => quarter.captureActions) ?? []);
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
    const totals = new Map<string, { playerId: string; position: Position; statistic: PlayerStatistic; count: number }>();
    for (const action of quarter.captureActions) {
      if (action.kind === "opposition-goal") continue;
      const key = `${action.playerId}:${action.position}:${action.statistic}`;
      const existing = totals.get(key);
      totals.set(key, existing ? { ...existing, count: existing.count + 1 } : { playerId: action.playerId, position: action.position, statistic: action.statistic, count: 1 });
    }
    const quarterScore = this.score(quarter.captureActions);
    const gameScore = this.score(game.quarters?.flatMap((candidate) => candidate.captureActions) ?? []);
    return {
      number: quarter.number,
      lineup: structuredClone(lineup),
      courtChanges: structuredClone(quarter.courtChanges),
      playerStatistics: [...totals.values()],
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
