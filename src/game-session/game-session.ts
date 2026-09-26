import type { GameSessionStore, Opposition, Player, Season, SetupData, SetupSummary } from "./types";

const emptySetup = (): SetupData => ({ seasons: [], players: [], opposition: [] });

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
    return new GameSession(store, (await store.read()) ?? emptySetup());
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

  private async persist(): Promise<void> {
    await this.store.write(this.data);
  }
}
