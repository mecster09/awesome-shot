export type Team = {
  id: string;
  name: string;
};

export type Season = {
  id: string;
  name: string;
  teamId: string;
  status: "active" | "ended";
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
export type Court = Partial<Record<Position, string>>;
export type StartingLineup = Court;

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

export type Substitution = { sequence: number; position: Position; playerId?: string };
export type QuarterNumber = 1 | 2 | 3 | 4;
export type Quarter = {
  number: QuarterNumber;
  status: "live" | "ended";
  startingLineup: StartingLineup;
  substitutions: Substitution[];
  captureActions: CaptureAction[];
};

export type PlayerStatisticTotal = { playerId: string; position: Position; statistic: PlayerStatistic; count: number };
export type ReportPlayerStatisticTotal = PlayerStatisticTotal & { playerName: string };
export type TerminalMatchReport = {
  id: string;
  date: string;
  teamName: string;
  oppositionName: string;
  status: "finalised" | "abandoned" | "terminated";
  outcome: GameOutcome;
  score: { own: number; opposition: number };
  quarters: Array<{
    number: QuarterNumber;
    ownScore: number;
    oppositionScore: number;
    startingLineup: Array<{ position: Position; playerId: string; playerName: string }>;
    substitutions: Array<{ sequence: number; position: Position; playerId?: string; playerName?: string }>;
    playerStatistics: ReportPlayerStatisticTotal[];
  }>;
  gamePlayerStatistics: ReportPlayerStatisticTotal[];
};
export type LiveQuarterCapture = {
  number: QuarterNumber;
  lineup: StartingLineup;
  substitutions: Substitution[];
  playerStatistics: PlayerStatisticTotal[];
  ownScore: number;
  oppositionScore: number;
  ownGameScore: number;
  oppositionGameScore: number;
  captureActions: CaptureAction[];
  canUndo: boolean;
};

export type GameOutcome =
  | { kind: "completed" }
  | { kind: "abandoned"; winner: "team" | "opposition" }
  | { kind: "terminated" };

export type Game = {
  id: string;
  seasonId: string;
  oppositionId: string;
  date: string;
  squadPlayerIds: string[];
  status: "live" | "finalised" | "abandoned" | "terminated";
  activeQuarter?: QuarterNumber;
  quarters?: Quarter[];
  outcome?: GameOutcome;
  incomplete?: boolean;
  finalScore?: { own: number; opposition: number };
};

export type StartMatchInput = Pick<Game, "seasonId" | "oppositionId" | "date" | "squadPlayerIds"> & { startingLineup: StartingLineup };

export type SetupData = {
  teams: Team[];
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
