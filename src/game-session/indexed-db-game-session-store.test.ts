import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { GameSession } from "./game-session";
import { IndexedDbGameSessionStore } from "./indexed-db-game-session-store";

describe("IndexedDbGameSessionStore", () => {
  it("rehydrates setup data from durable browser storage", async () => {
    const databaseName = `natball-test-${crypto.randomUUID()}`;
    const firstSession = await GameSession.open(new IndexedDbGameSessionStore(databaseName));
    await firstSession.createSeason({ name: "2026 Winter", teamName: "Roses" });
    await firstSession.addPlayer({ name: "Natalie" });

    const reopenedSession = await GameSession.open(new IndexedDbGameSessionStore(databaseName));

    expect(reopenedSession.setup().seasons).toHaveLength(1);
    expect(reopenedSession.setup().players).toMatchObject([{ name: "Natalie" }]);
  });
});
