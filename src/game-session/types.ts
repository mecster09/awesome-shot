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

export type SetupData = {
  seasons: Season[];
  players: Player[];
  opposition: Opposition[];
  selectedOppositionId?: string;
};

export type SetupSummary = SetupData & {
  activeOpposition: Opposition[];
  selectedOpposition?: Opposition;
};

export interface GameSessionStore {
  read(): Promise<SetupData | undefined>;
  write(data: SetupData): Promise<void>;
}
