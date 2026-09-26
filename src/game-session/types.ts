export type Season = {
  id: string;
  name: string;
  teamName: string;
};

export type Player = {
  id: string;
  name: string;
  nickname?: string;
};

export type Opposition = {
  id: string;
  name: string;
  archived: boolean;
};

export const POSITIONS = [
  "Goal Keeper",
  "Goal Defence",
  "Wing Defence",
  "Centre",
  "Wing Attack",
  "Goal Attack",
  "Goal Shooter"
] as const;

export type Position = (typeof POSITIONS)[number];
export type StartingLineup = Record<Position, string>;

export type Game = {
  id: string;
  seasonId: string;
  oppositionId: string;
  date: string;
  squadPlayerIds: string[];
  startingLineup?: StartingLineup;
  status: "draft" | "live";
  activeQuarter?: 1;
};

export type CreateDraftInput = Pick<Game, "seasonId" | "oppositionId" | "date" | "squadPlayerIds">;

export type SetupData = {
  seasons: Season[];
  players: Player[];
  opposition: Opposition[];
  selectedOppositionId?: string;
  games: Game[];
};

export type SetupSummary = SetupData & {
  activeOpposition: Opposition[];
  selectedOpposition?: Opposition;
};

export interface GameSessionStore {
  read(): Promise<SetupData | undefined>;
  write(data: SetupData): Promise<void>;
}
