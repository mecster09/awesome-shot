import { POSITIONS, type CreateDraftInput, type Game, type GameSessionStore, type Opposition, type Player, type Season, type SetupData, type SetupSummary, type StartingLineup } from "./types";

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
    return new GameSession(store, stored ? { ...stored, games: stored.games ?? [] } : emptySetup());
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
