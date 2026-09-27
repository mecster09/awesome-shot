import type { GameSessionStore, SetupData } from "./types";

export class InMemoryGameSessionStore implements GameSessionStore {
  private data: SetupData | undefined;

  async read(): Promise<SetupData | undefined> {
    return this.data === undefined ? undefined : structuredClone(this.data);
  }

  async write(data: SetupData): Promise<void> {
    this.data = structuredClone(data);
  }
}
