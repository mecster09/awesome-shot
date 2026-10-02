import { PLAYER_STATISTICS, POSITIONS, SHOOTER_STATISTICS, TOTAL_QUARTERS, type BetweenQuarterStatistics, type CaptureAction, type CourtSetupDraft, type Game, type GameSessionStore, type LiveQuarterCapture, type StatisticsSummary, type MatchIdentityDraft, type MatchSetupDraft, type MatchSquadDraft, type Opposition, type Player, type PlayerPositionStint, type PlayerStatistic, type PlayerStatisticTotal, type Position, type Quarter, type QuarterNumber, type Season, type SetupData, type SetupSummary, type StartMatchInput, type StartingLineup, type Team, type TerminalMatchReport } from "./types";

const emptySetup = (): SetupData => ({ teams: [], seasons: [], players: [], opposition: [], games: [] });
const backupFormat = "natball-insights-backup";

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object";
const hasStrings = (value: unknown, keys: string[]) => isObject(value) && keys.every((key) => typeof value[key] === "string");
const isLineup = (value: unknown) => {
  if (!isObject(value)) return false;
  const entries = Object.entries(value);
  return entries.length >= 5 && entries.length <= 7 && entries.every(([position, playerId]) => POSITIONS.includes(position as Position) && typeof playerId === "string") && new Set(entries.map(([, playerId]) => playerId)).size === entries.length;
};
const isSubstitution = (value: unknown) => isObject(value) && typeof value.sequence === "number" && POSITIONS.includes(value.position as Position) && (value.playerId === undefined || typeof value.playerId === "string");
const isQuarter = (value: unknown) => isObject(value) && [1, 2, 3, 4].includes(value.number as number) && ["live", "ended"].includes(value.status as string) && isLineup(value.startingLineup) && Array.isArray(value.substitutions) && value.substitutions.every(isSubstitution) && Array.isArray(value.captureActions) && value.captureActions.every((action) => isObject(action) && typeof action.id === "string" && (action.kind === "opposition-goal" || action.kind === "player-statistic" && typeof action.playerId === "string" && POSITIONS.includes(action.position as Position) && PLAYER_STATISTICS.includes(action.statistic as PlayerStatistic)));
const isLegacyQuarter = (value: unknown) => isObject(value) && [1, 2, 3, 4].includes(value.number as number) && ["live", "ended"].includes(value.status as string) && isLineup(value.startingLineup) && Array.isArray(value.courtChanges) && value.courtChanges.every((change) => isObject(change) && typeof change.sequence === "number" && isLineup(change.lineup)) && Array.isArray(value.captureActions);
const migrateQuarter = (quarter: Quarter & { courtChanges?: Array<{ lineup: StartingLineup }> }): Quarter => {
  if (quarter.substitutions) return quarter;
  let court = structuredClone(quarter.startingLineup);
  const substitutions = (quarter.courtChanges ?? []).flatMap((change) => POSITIONS.flatMap((position) => {
    if (court[position] === change.lineup[position]) return [];
    court = change.lineup[position] ? { ...court, [position]: change.lineup[position] } : Object.fromEntries(Object.entries(court).filter(([currentPosition]) => currentPosition !== position));
    return [{ position, ...(change.lineup[position] ? { playerId: change.lineup[position] } : {}) }];
  })).map((substitution, index) => ({ ...substitution, sequence: index + 1 }));
  const { courtChanges: _, ...migrated } = quarter;
  return { ...migrated, substitutions };
};
const isGame = (value: unknown) => hasStrings(value, ["id", "seasonId", "oppositionId", "date", "status"]) && isObject(value) && ["draft", "live", "finalised", "abandoned", "terminated"].includes(value.status as string) && Array.isArray(value.squadPlayerIds) && value.squadPlayerIds.every((id) => typeof id === "string") && (value.startingLineup === undefined || isLineup(value.startingLineup)) && (value.quarters === undefined || Array.isArray(value.quarters) && value.quarters.every((quarter) => isQuarter(quarter) || isLegacyQuarter(quarter)));
const isMatchSetupDraft = (value: unknown): value is MatchSetupDraft => {
  if (!isObject(value) || typeof value.seasonId !== "string") return false;
  if (value.stage === "match-identity") return (value.oppositionId === undefined || typeof value.oppositionId === "string") && (value.date === undefined || typeof value.date === "string");
  if (value.stage === "match-squad") return typeof value.oppositionId === "string" && typeof value.date === "string" && (value.squadPlayerIds === undefined || Array.isArray(value.squadPlayerIds) && value.squadPlayerIds.every((id) => typeof id === "string"));
  return value.stage === "court-setup" && typeof value.oppositionId === "string" && typeof value.date === "string" && Array.isArray(value.squadPlayerIds) && value.squadPlayerIds.every((id) => typeof id === "string");
};
const parseBackup = (serialized: string): SetupData => {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); } catch { throw new Error("Choose a valid Natball Insights backup file."); }
  if (!parsed || typeof parsed !== "object") throw new Error("Choose a valid Natball Insights backup file.");
  const backup = parsed as { format?: unknown; version?: unknown; data?: unknown };
  if (backup.format !== backupFormat || backup.version !== 1 || !backup.data || typeof backup.data !== "object") throw new Error("Choose a valid Natball Insights backup file.");
  const rawData = backup.data as Partial<SetupData>;
  if (!Array.isArray(rawData.seasons) || !Array.isArray(rawData.players) || !Array.isArray(rawData.opposition) || !Array.isArray(rawData.games)) throw new Error("This backup is incompatible with Natball Insights.");
  let data: SetupData;
  try { data = migrateSetup(rawData as SetupData); } catch { throw new Error("This backup is incompatible with Natball Insights."); }
  if (!Array.isArray(data.teams) || !data.teams.every((team) => hasStrings(team, ["id", "name"])) || !data.seasons.every((season) => hasStrings(season, ["id", "name", "teamId", "status"]) && ["active", "ended"].includes(season.status)) || !data.players.every((player) => hasStrings(player, ["id", "name"]) && (player.nickname === undefined || typeof player.nickname === "string")) || !data.opposition.every((opposition) => hasStrings(opposition, ["id", "name"]) && typeof opposition.archived === "boolean") || !data.games.every(isGame) || (data.selectedOppositionId !== undefined && typeof data.selectedOppositionId !== "string") || (data.matchSetupDraft !== undefined && !isMatchSetupDraft(data.matchSetupDraft))) throw new Error("This backup is incompatible with Natball Insights.");
  const seasonIds = new Set(data.seasons.map((season) => season.id)); const teamIds = new Set(data.teams.map((team) => team.id)); const playerIds = new Set(data.players.map((player) => player.id)); const oppositionIds = new Set(data.opposition.map((opposition) => opposition.id));
  if (data.seasons.some((season) => !teamIds.has(season.teamId)) || data.games.some((game) => !seasonIds.has(game.seasonId) || !oppositionIds.has(game.oppositionId) || game.squadPlayerIds.some((id) => !playerIds.has(id))) || data.selectedOppositionId && !oppositionIds.has(data.selectedOppositionId) || data.matchSetupDraft && (!seasonIds.has(data.matchSetupDraft.seasonId) || data.matchSetupDraft.oppositionId && !oppositionIds.has(data.matchSetupDraft.oppositionId))) throw new Error("This backup has broken record references.");
  return structuredClone(data as SetupData);
};

const requireText = (value: string, field: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required.`);
  }
  return trimmed;
};
const nameKey = (name: string) => name.trim().toLocaleLowerCase();
const isTerminalMatch = (game: Game) => ["finalised", "abandoned", "terminated"].includes(game.status);

const migrateSetup = (stored: SetupData): SetupData => {
  const legacy = stored as unknown as { teams?: Team[]; seasons: Array<{ id: string; name: string; teamId?: string; teamName?: string; status?: Season["status"] }> };
  const teams: Team[] = [];
  const teamsByName = new Map<string, Team>();
  const canonicalTeamIds = new Map<string, string>();
  for (const storedTeam of legacy.teams ?? []) {
    const name = requireText(storedTeam.name, "Team name");
    let team = teamsByName.get(nameKey(name));
    if (!team) {
      team = { id: storedTeam.id, name };
      teams.push(team);
      teamsByName.set(nameKey(name), team);
    }
    canonicalTeamIds.set(storedTeam.id, team.id);
  }
  const legacySeasons = legacy.seasons ?? [];
  const lastLegacySeason = legacySeasons.reduce((last, season, index) => season.status === undefined ? index : last, -1);
  const seasons = legacySeasons.map((season, index) => {
    let teamId = season.teamId ? canonicalTeamIds.get(season.teamId) ?? season.teamId : undefined;
    if (!teamId) {
      const name = requireText(season.teamName ?? "", "Team name");
      let team = teamsByName.get(nameKey(name));
      if (!team) {
        team = { id: crypto.randomUUID(), name };
        teams.push(team);
        teamsByName.set(nameKey(name), team);
      }
      teamId = team.id;
    }
    return { id: season.id, name: season.name, teamId, status: season.status ?? (index === lastLegacySeason ? "active" : "ended") };
  });
  const activeSeasons = seasons.filter((season) => season.status === "active");
  for (const season of activeSeasons.slice(0, -1)) season.status = "ended";
  return { ...structuredClone(stored), teams, seasons };
};

export class GameSession {
  private constructor(
    private readonly store: GameSessionStore,
    private data: SetupData
  ) {}

  static async open(store: GameSessionStore): Promise<GameSession> {
    const stored = await store.read();
    if (!stored) return new GameSession(store, emptySetup());
    const migrated = migrateSetup(stored);
    const data: SetupData = {
      ...migrated,
      games: (migrated.games ?? []).filter((game) => (game as { status: string }).status !== "draft").map((game) => {
        const legacyGame = game as Game & { startingLineup?: StartingLineup };
        const { startingLineup, ...withoutSeparateStartingLineup } = legacyGame;
        return legacyGame.status === "live" && !legacyGame.quarters && startingLineup
          ? { ...withoutSeparateStartingLineup, quarters: [{ number: 1 as QuarterNumber, status: "live" as const, startingLineup: structuredClone(startingLineup), substitutions: [], captureActions: [] }] }
          : { ...withoutSeparateStartingLineup, ...(legacyGame.status === "abandoned" ? { outcome: { kind: "abandoned" } } : {}), quarters: legacyGame.quarters?.map((quarter) => migrateQuarter(quarter as Quarter & { courtChanges?: Array<{ lineup: StartingLineup }> })) };
      })
    };
    if (JSON.stringify(stored) !== JSON.stringify(data)) await store.write(data);
    return new GameSession(store, data);
  }

  setup(): SetupSummary {
    return {
      ...structuredClone(this.data),
      activeOpposition: this.data.opposition.filter((opposition) => !opposition.archived),
      selectedOpposition: this.data.opposition.find((opposition) => opposition.id === this.data.selectedOppositionId)
    };
  }

  newSeasonDefaults(): { teamName: string } {
    return { teamName: this.data.teams.at(-1)?.name ?? "" };
  }

  async createTeam(input: { name: string }): Promise<Team> {
    const name = requireText(input.name, "Team name");
    const existing = this.data.teams.find((team) => nameKey(team.name) === nameKey(name));
    if (existing) return structuredClone(existing);
    if (this.data.teams.length) throw new Error("Rename the saved team instead of creating another.");
    const team = { id: crypto.randomUUID(), name };
    this.data.teams.push(team);
    await this.persist();
    return structuredClone(team);
  }

  async renameTeam(id: string, input: { name: string }): Promise<void> {
    const team = this.requireTeam(id);
    const name = requireText(input.name, "Team name");
    const duplicate = this.data.teams.find((candidate) => candidate.id !== id && nameKey(candidate.name) === nameKey(name));
    if (duplicate) throw new Error("A team with this name already exists.");
    for (const game of this.data.games) {
      if (isTerminalMatch(game) && !game.teamName && this.requireSeason(game.seasonId).teamId === id) game.teamName = team.name;
    }
    team.name = name;
    await this.persist();
  }

  async createSeason(input: { name: string; teamId?: string; teamName?: string }): Promise<Season> {
    if (this.data.seasons.some((season) => season.status === "active")) throw new Error("End the active season before creating another.");
    const team = input.teamId ? this.requireTeam(input.teamId) : input.teamName ? await this.createTeam({ name: input.teamName }) : undefined;
    if (!team) throw new Error("Select a saved team.");
    const season: Season = {
      id: crypto.randomUUID(),
      name: requireText(input.name, "Season name"),
      teamId: team.id,
      status: "active"
    };
    this.data.seasons.push(season);
    await this.persist();
    return structuredClone(season);
  }

  async renameSeason(id: string, input: { name: string }): Promise<void> {
    const season = this.requireActiveSeason(id);
    season.name = requireText(input.name, "Season name");
    await this.persist();
  }

  async endSeason(id: string): Promise<void> {
    const season = this.requireSeason(id);
    if (season.status !== "active") throw new Error("Only the active season can be ended.");
    if (this.data.games.some((game) => game.seasonId === id && !isTerminalMatch(game))) throw new Error("All matches must be terminal before ending a season.");
    season.status = "ended";
    if (this.data.matchSetupDraft?.seasonId === id) this.data.matchSetupDraft = undefined;
    await this.persist();
  }

  async addPlayer(input: { name: string; nickname?: string }): Promise<Player> {
    const nickname = input.nickname?.trim();
    const name = requireText(input.name, "Player name");
    const existing = this.data.players.find((player) => nameKey(player.name) === nameKey(name));
    if (existing) return structuredClone(existing);
    const player: Player = {
      id: crypto.randomUUID(),
      name,
      ...(nickname ? { nickname } : {})
    };
    this.data.players.push(player);
    await this.persist();
    return structuredClone(player);
  }

  async addOpposition(input: { name: string }): Promise<Opposition> {
    const name = requireText(input.name, "Opposition name");
    const existing = this.data.opposition.find((opposition) => nameKey(opposition.name) === nameKey(name));
    if (existing) {
      if (existing.archived) {
        existing.archived = false;
        await this.persist();
      }
      return structuredClone(existing);
    }
    const opposition: Opposition = {
      id: crypto.randomUUID(),
      name,
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
        teams: merge(this.data.teams, imported.teams),
        seasons: merge(this.data.seasons, imported.seasons),
        players: merge(this.data.players, imported.players),
        opposition: merge(this.data.opposition, imported.opposition),
        games: merge(this.data.games, imported.games),
        selectedOppositionId: this.data.selectedOppositionId ?? imported.selectedOppositionId
      };
    }
    this.data = migrateSetup(this.data);
    this.data.games = this.data.games.filter((game) => (game as { status: string }).status !== "draft").map((game) => ({ ...game, ...(game.status === "abandoned" ? { outcome: { kind: "abandoned" } } : {}), quarters: game.quarters?.map((quarter) => migrateQuarter(quarter as Quarter & { courtChanges?: Array<{ lineup: StartingLineup }> })) }));
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
    const lineup = (court: StartingLineup) => POSITIONS.flatMap((position) => court[position] ? [{ position, playerId: court[position], playerName: playerName(court[position]) }] : []);
    const quarters = (game.quarters ?? []).map((quarter) => ({
      number: quarter.number,
      ownScore: this.score(quarter.captureActions).own,
      oppositionScore: this.score(quarter.captureActions).opposition,
      startingLineup: lineup(quarter.startingLineup),
      substitutions: quarter.substitutions.map((substitution) => ({ ...substitution, ...(substitution.playerId ? { playerName: playerName(substitution.playerId) } : {}) })),
      playerStatistics: this.statisticTotals(quarter.captureActions).map((statistic) => ({ ...statistic, playerName: playerName(statistic.playerId) })),
      events: quarter.captureActions.map((action, index) => action.kind === "opposition-goal"
        ? { sequence: index + 1, kind: "opposition-goal" as const }
        : { sequence: index + 1, kind: "player-statistic" as const, playerId: action.playerId, playerName: playerName(action.playerId), position: action.position, statistic: action.statistic })
    }));
    return structuredClone({
      id: game.id,
      date: game.date,
      teamName: game.teamName ?? this.teamNameFor(game),
      oppositionName: this.data.opposition.find((opposition) => opposition.id === game.oppositionId)?.name ?? "Unknown opposition",
      status: game.status,
      outcome: game.outcome,
      score: game.finalScore ?? this.gameScore(id),
      quarters,
      gamePlayerStatistics: this.statisticTotals((game.quarters ?? []).flatMap((quarter) => quarter.captureActions)).map((statistic) => ({ ...statistic, playerName: playerName(statistic.playerId) }))
    });
  }

  async saveMatchIdentity(input: Pick<MatchIdentityDraft, "seasonId" | "oppositionId" | "date" | "squadPlayerIds">): Promise<MatchIdentityDraft> {
    this.requireActiveSeason(input.seasonId);
    if (input.oppositionId) this.requireActiveOpposition(input.oppositionId);
    const draft: MatchIdentityDraft = {
      seasonId: input.seasonId,
      ...(input.oppositionId ? { oppositionId: input.oppositionId } : {}),
      ...(input.date ? { date: this.requireDate(input.date) } : {}),
      ...(input.squadPlayerIds ? { squadPlayerIds: this.validPartialMatchSquad(input.squadPlayerIds) } : {}),
      stage: "match-identity"
    };
    this.data.matchSetupDraft = draft;
    await this.persist();
    return structuredClone(draft);
  }

  async advanceToMatchSquad(input: Pick<MatchSquadDraft, "seasonId" | "oppositionId" | "date">): Promise<MatchSquadDraft> {
    this.requireActiveSeason(input.seasonId);
    this.requireActiveOpposition(input.oppositionId);
    const draft: MatchSquadDraft = {
      seasonId: input.seasonId,
      oppositionId: input.oppositionId,
      date: this.requireDate(input.date),
      stage: "match-squad"
    };
    this.data.matchSetupDraft = draft;
    await this.persist();
    return structuredClone(draft);
  }

  async saveMatchSquad(input: Pick<MatchSquadDraft, "seasonId" | "oppositionId" | "date"> & { squadPlayerIds: string[] }): Promise<MatchSquadDraft> {
    this.requireActiveSeason(input.seasonId);
    this.requireActiveOpposition(input.oppositionId);
    const draft: MatchSquadDraft = {
      seasonId: input.seasonId,
      oppositionId: input.oppositionId,
      date: this.requireDate(input.date),
      squadPlayerIds: this.validPartialMatchSquad(input.squadPlayerIds),
      stage: "match-squad"
    };
    this.data.matchSetupDraft = draft;
    await this.persist();
    return structuredClone(draft);
  }

  async advanceToCourtSetup(input: Pick<CourtSetupDraft, "seasonId" | "oppositionId" | "date" | "squadPlayerIds">): Promise<CourtSetupDraft> {
    this.requireActiveSeason(input.seasonId);
    this.requireActiveOpposition(input.oppositionId);
    const draft: CourtSetupDraft = {
      seasonId: input.seasonId,
      oppositionId: input.oppositionId,
      date: this.requireDate(input.date),
      squadPlayerIds: this.validReadyMatchSquad(input.squadPlayerIds),
      stage: "court-setup"
    };
    this.data.matchSetupDraft = draft;
    await this.persist();
    return structuredClone(draft);
  }

  async startMatch(input: StartMatchInput): Promise<Game> {
    if (this.data.games.some((game) => game.status === "live")) throw new Error("Finish the live match before starting another.");
    if (this.requireSeason(input.seasonId).status !== "active") throw new Error("Select the active season.");
    this.requireActiveOpposition(input.oppositionId);
    const game: Game = {
      id: crypto.randomUUID(),
      seasonId: input.seasonId,
      oppositionId: input.oppositionId,
      date: this.requireDate(input.date),
      squadPlayerIds: this.validReadyMatchSquad(input.squadPlayerIds),
      status: "live",
      activeQuarter: 1,
      quarters: []
    };
    this.validateCourt(game, input.startingLineup);
    game.quarters = [{ number: 1, status: "live", startingLineup: structuredClone(input.startingLineup), substitutions: [], captureActions: [] }];
    this.data.games.push(game);
    this.data.matchSetupDraft = undefined;
    await this.persist();
    return structuredClone(game);
  }

  async endQuarter(id: string): Promise<void> {
    const { game, quarter } = this.requireLiveQuarter(id);
    quarter.status = "ended";
    game.activeQuarter = undefined;
    await this.persist();
  }

  async addPlayerToSquad(id: string, playerId: string): Promise<void> {
    this.requireLiveGame(id);
    void playerId;
    throw new Error("The Match Squad is fixed once the Match begins.");
  }

  async startNextQuarter(id: string, startingLineup: StartingLineup): Promise<void> {
    const game = this.requireLiveGame(id);
    if (game.activeQuarter) throw new Error("End the current quarter before starting the next one.");
    const previous = this.previousQuarter(game);
    if (previous.number === TOTAL_QUARTERS) throw new Error("All four quarters have ended.");
    const number = (previous.number + 1) as QuarterNumber;
    this.validateCourt(game, startingLineup);
    game.quarters?.push({ number, status: "live", startingLineup: structuredClone(this.currentLineup(previous)), substitutions: this.preQuarterSubstitutions(this.currentLineup(previous), startingLineup), captureActions: [] });
    game.activeQuarter = number;
    await this.persist();
  }

  nextQuarterCourt(id: string): StartingLineup {
    const game = this.requireLiveGame(id);
    if (game.activeQuarter) throw new Error("End the current quarter before setting up the next one.");
    return structuredClone(this.currentLineup(this.previousQuarter(game)));
  }

  betweenQuarterStatistics(id: string): BetweenQuarterStatistics {
    const game = this.requireLiveGame(id);
    if (game.activeQuarter) throw new Error("End the current quarter before reviewing statistics.");
    const previousQuarter = this.previousQuarter(game);
    const quarters = game.quarters ?? [];
    return structuredClone({
      previousQuarter: previousQuarter.number,
      previousQuarterStints: this.playerPositionStints(game, [previousQuarter]),
      matchStints: this.playerPositionStints(game, quarters)
    });
  }

  quarterCapture(id: string, number: QuarterNumber): LiveQuarterCapture {
    const game = this.requireLiveGame(id);
    const quarter = game.quarters?.find((candidate) => candidate.number === number);
    if (!quarter) throw new Error("Quarter was not found.");
    return this.capture(game, quarter);
  }

  statisticsSummary(id: string, selection: { scope: "match" } | { scope: "quarter"; quarter: QuarterNumber }): StatisticsSummary {
    const game = this.data.games.find((candidate) => candidate.id === id);
    if (!game) throw new Error("Match was not found.");
    const quarters = game.quarters ?? [];
    const selectedQuarters = selection.scope === "match" ? quarters : quarters.filter((quarter) => quarter.number === selection.quarter);
    if (!selectedQuarters.length) throw new Error("Quarter was not found.");
    return structuredClone({
      availableTabs: [...quarters.map((quarter) => quarter.number), "match"],
      stints: this.playerPositionStints(game, selectedQuarters),
      readOnly: isTerminalMatch(game)
    });
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
    if (game.activeQuarter || game.quarters?.length !== TOTAL_QUARTERS || game.quarters.some((quarter) => quarter.status !== "ended")) throw new Error("End all four quarters before finalising.");
    const score = this.gameScore(id);
    if (score.own !== confirmedScore.own || score.opposition !== confirmedScore.opposition) throw new Error("Confirm the displayed final score before finalising.");
    game.status = "finalised";
    game.outcome = { kind: "completed" };
    game.finalScore = score;
    game.teamName = this.teamNameFor(game);
    await this.persist();
  }

  async abandonGame(id: string): Promise<void> {
    await this.endIncompleteGame(id, { kind: "abandoned" });
  }

  private async endIncompleteGame(id: string, outcome: Exclude<NonNullable<Game["outcome"]>, { kind: "completed" }>): Promise<void> {
    const game = this.requireLiveGame(id);
    game.status = outcome.kind;
    game.outcome = outcome;
    game.incomplete = true;
    game.finalScore = this.gameScore(id);
    game.teamName = this.teamNameFor(game);
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
      substitutions: structuredClone(quarter.substitutions),
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
    const playerId = this.currentLineup(quarter)[input.position];
    if (!playerId) throw new Error("Assign a player to this position before recording a statistic.");
    quarter.captureActions.push({ id: crypto.randomUUID(), kind: "player-statistic", playerId, position: input.position, statistic: input.statistic });
    await this.persist();
  }

  async recordOppositionGoal(id: string): Promise<void> {
    const { quarter } = this.requireLiveQuarter(id);
    quarter.captureActions.push({ id: crypto.randomUUID(), kind: "opposition-goal" });
    await this.persist();
  }

  async undoLastCaptureAction(id: string): Promise<void> {
    const { quarter } = this.requireLiveQuarter(id);
    if (!quarter.captureActions.length) throw new Error("No event is available to undo.");
    quarter.captureActions.pop();
    await this.persist();
  }

  async substitutePlayer(id: string, input: { position: Position; playerId: string }): Promise<void> {
    const { quarter } = this.requireLiveQuarter(id);
    await this.saveSubstitutions(id, { ...this.currentLineup(quarter), [input.position]: input.playerId });
  }

  async saveSubstitutions(id: string, nextCourt: StartingLineup): Promise<void> {
    const { game, quarter } = this.requireLiveQuarter(id);
    const court = this.currentLineup(quarter);
    this.validateCourt(game, nextCourt);
    const changes = POSITIONS.filter((position) => court[position] !== nextCourt[position]);
    if (!changes.length) throw new Error("Change at least one Court Position before saving.");
    quarter.substitutions.push(...changes.map((position, index) => ({ sequence: quarter.substitutions.length + index + 1, position, ...(nextCourt[position] ? { playerId: nextCourt[position] } : {}) })));
    await this.persist();
  }

  private requireSeason(id: string): Season {
    const season = this.data.seasons.find((candidate) => candidate.id === id);
    if (!season) throw new Error("Select a saved season.");
    return season;
  }

  private requireTeam(id: string): Team {
    const team = this.data.teams.find((candidate) => candidate.id === id);
    if (!team) throw new Error("Team was not found.");
    return team;
  }

  private teamNameFor(game: Game): string {
    return this.requireTeam(this.requireSeason(game.seasonId).teamId).name;
  }

  private requireActiveOpposition(id: string): Opposition {
    const opposition = this.data.opposition.find((candidate) => candidate.id === id && !candidate.archived);
    if (!opposition) throw new Error("Select an active opposition.");
    return opposition;
  }

  private validReadyMatchSquad(playerIds: string[]): string[] {
    const uniqueIds = [...new Set(playerIds)];
    if (uniqueIds.length < 5) throw new Error("Choose at least five squad players.");
    if (uniqueIds.length > 12) throw new Error("A match squad can contain at most 12 players.");
    if (uniqueIds.length !== playerIds.length || uniqueIds.some((id) => !this.data.players.some((player) => player.id === id))) {
      throw new Error("Choose unique saved players for the squad.");
    }
    return uniqueIds;
  }

  private validPartialMatchSquad(playerIds: string[]): string[] {
    const uniqueIds = [...new Set(playerIds)];
    if (uniqueIds.length > 12 || uniqueIds.length !== playerIds.length || uniqueIds.some((id) => !this.data.players.some((player) => player.id === id))) throw new Error("Choose up to 12 unique saved players for the Match Squad.");
    return uniqueIds;
  }

  private requireDate(value: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      throw new Error("Enter a valid match date.");
    }
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error("Enter a valid match date.");
    return value;
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
    this.requireActiveSeason(game.seasonId);
    return game;
  }

  private requireActiveSeason(id: string): Season {
    const season = this.requireSeason(id);
    if (season.status !== "active") throw new Error("This season is read-only.");
    return season;
  }

  private requireUnfinalisedQuarter(game: Game, number: QuarterNumber): Quarter {
    const quarter = game.quarters?.find((candidate) => candidate.number === number);
    if (!quarter) throw new Error("Quarter was not found.");
    return quarter;
  }

  private previousQuarter(game: Game): Quarter {
    const previous = game.quarters?.at(-1);
    if (!previous || previous.status !== "ended") throw new Error("End the previous quarter before starting the next one.");
    return previous;
  }

  private currentLineup(quarter: Quarter): StartingLineup {
    return quarter.substitutions.reduce<StartingLineup>((court, substitution) => {
      if (substitution.playerId) return { ...court, [substitution.position]: substitution.playerId };
      const { [substitution.position]: _, ...remaining } = court;
      return remaining;
    }, structuredClone(quarter.startingLineup));
  }

  private preQuarterSubstitutions(previousCourt: StartingLineup, nextCourt: StartingLineup): Quarter["substitutions"] {
    return POSITIONS.filter((position) => previousCourt[position] !== nextCourt[position]).map((position, index) => ({ sequence: index + 1, position, ...(nextCourt[position] ? { playerId: nextCourt[position] } : {}) }));
  }

  private score(actions: CaptureAction[]): { own: number; opposition: number } {
    return actions.reduce((score, action) => {
      if (action.kind === "opposition-goal") return { ...score, opposition: score.opposition + 1 };
      return action.statistic === "Goals" ? { ...score, own: score.own + 1 } : score;
    }, { own: 0, opposition: 0 });
  }

  private playerPositionStints(game: Game, quarters: Quarter[]): PlayerPositionStint[] {
    const stints = new Map<string, PlayerPositionStint>();
    const addStint = (playerId: string, position: Position) => {
      if (!game.squadPlayerIds.includes(playerId)) return;
      const key = `${playerId}:${position}`;
      if (!stints.has(key)) stints.set(key, { playerId, position, playerStatistics: [] });
    };
    for (const quarter of quarters) {
      for (const position of POSITIONS) {
        const playerId = quarter.startingLineup[position];
        if (playerId) addStint(playerId, position);
      }
      for (const substitution of quarter.substitutions) {
        if (substitution.playerId) addStint(substitution.playerId, substitution.position);
      }
    }
    for (const statistic of this.statisticTotals(quarters.flatMap((quarter) => quarter.captureActions))) {
      const stint = stints.get(`${statistic.playerId}:${statistic.position}`);
      if (stint) stint.playerStatistics.push(statistic);
    }
    return [...stints.values()].sort((left, right) => POSITIONS.indexOf(left.position) - POSITIONS.indexOf(right.position));
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

  private validateCourt(game: Game, lineup: StartingLineup): void {
    const playerIds = POSITIONS.flatMap((position) => lineup[position] ? [lineup[position]] : []);
    if (playerIds.length < 5 || playerIds.length > 7) {
      throw new Error("Assign five to seven players to the Court.");
    }
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
