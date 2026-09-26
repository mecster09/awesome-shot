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

export const GENERAL_STATISTICS = [
  "Successful Centre Pass Received",
  "Tip",
  "Intercept",
  "Unforced Errors",
  "Contact Conceded",
  "Obstruction Conceded"
] as const;
export const SHOOTER_STATISTICS = ["Goals", "Misses"] as const;
export const PLAYER_STATISTICS = [...GENERAL_STATISTICS, ...SHOOTER_STATISTICS] as const;
export type PlayerStatistic = (typeof PLAYER_STATISTICS)[number];

export type CaptureAction =
  | { id: string; kind: "player-statistic"; playerId: string; position: Position; statistic: PlayerStatistic }
  | { id: string; kind: "opposition-goal" };

export type CourtChange = { sequence: number; lineup: StartingLineup };
export type Quarter = {
  number: 1;
  startingLineup: StartingLineup;
  courtChanges: CourtChange[];
  captureActions: CaptureAction[];
};

export type PlayerStatisticTotal = { playerId: string; position: Position; statistic: PlayerStatistic; count: number };
export type LiveQuarterCapture = {
  lineup: StartingLineup;
  courtChanges: CourtChange[];
  playerStatistics: PlayerStatisticTotal[];
  ownScore: number;
  oppositionScore: number;
  ownGameScore: number;
  oppositionGameScore: number;
  canUndo: boolean;
};

export type Game = {
  id: string;
  seasonId: string;
  oppositionId: string;
  date: string;
  squadPlayerIds: string[];
  startingLineup?: StartingLineup;
  status: "draft" | "live";
  activeQuarter?: 1;
  quarters?: Quarter[];
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
