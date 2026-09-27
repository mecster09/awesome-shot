import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./app";
import { GameSession } from "./game-session/game-session";
import { InMemoryGameSessionStore } from "./game-session/in-memory-game-session-store";

describe("Natball Insights setup", () => {
  it("lets a coach create reusable season, player, and opposition setup data", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    await user.type(await screen.findByLabelText("Season name"), "2026 Winter");
    await user.type(screen.getByLabelText("New team name"), "Roses");
    await user.click(screen.getByRole("button", { name: "Create season" }));

    await user.type(screen.getByLabelText("Player name"), "Natalie");
    await user.type(screen.getByLabelText("Nickname"), "Nat");
    await user.click(screen.getByRole("button", { name: "Add player" }));

    await user.type(screen.getByLabelText("Opposition name"), "Thunder");
    await user.click(screen.getByRole("button", { name: "Add opposition" }));

    expect(screen.getAllByText("2026 Winter")).not.toHaveLength(0);
    expect(screen.getByText("Natalie (Nat)")).toBeInTheDocument();
    expect(screen.getByText("Thunder")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download backup" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Import mode"), "replace");
    expect(screen.getByLabelText("I understand this permanently replaces local data.")).toBeInTheDocument();
  });

  it("requires confirmation before ending the active season and then offers its saved team for the next season", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    await user.type(await screen.findByLabelText("Season name"), "2026 Winter");
    await user.type(screen.getByLabelText("New team name"), "Roses");
    await user.click(screen.getByRole("button", { name: "Create season" }));

    const endSeason = screen.getByRole("button", { name: "Confirm end season" });
    expect(endSeason).toBeDisabled();
    await user.click(screen.getByLabelText("I understand ending this season makes it read-only."));
    await user.click(endSeason);

    await user.type(await screen.findByLabelText("Season name"), "2027 Winter");
    expect(screen.getByRole("option", { name: "Roses" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create season" }));
    expect((await screen.findAllByText("2027 Winter")).length).toBeGreaterThan(0);
  });

  it("creates a protected match draft and starts Quarter 1 from the setup screen", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const user = userEvent.setup();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: "Create match" }));
    await user.selectOptions(screen.getByLabelText("Season"), season.id);
    await user.selectOptions(screen.getByLabelText("Opposition"), opposition.id);
    await user.clear(screen.getByLabelText("Match date"));
    await user.type(screen.getByLabelText("Match date"), "2026-09-26");
    await user.type(screen.getByLabelText("New player name"), "Hana");
    await user.click(screen.getByRole("button", { name: "Add player to squad" }));
    expect(await screen.findByLabelText("Hana")).toBeChecked();
    for (const player of players) await user.click(screen.getByLabelText(player.name));
    await user.click(screen.getByRole("button", { name: "Create draft" }));

    for (const [index, position] of ["Goal Keeper", "Goal Defence", "Wing Defence", "Centre", "Wing Attack", "Goal Attack", "Goal Shooter"].entries()) {
      await user.selectOptions(screen.getByLabelText(position), players[index].id);
    }
    await user.click(screen.getByRole("button", { name: "Start Quarter 1" }));

    expect(await screen.findByText("Quarter 1 is live")).toBeInTheDocument();
  });

  it("reopens a persisted live match after an interruption", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await session.createDraft({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id) });
    await session.setStartingLineup(game.id, {
      "Goal Keeper": players[0].id,
      "Goal Defence": players[1].id,
      "Wing Defence": players[2].id,
      Centre: players[3].id,
      "Wing Attack": players[4].id,
      "Goal Attack": players[5].id,
      "Goal Shooter": players[6].id
    });
    await session.startQuarterOne(game.id);
    const user = userEvent.setup();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: "View live match" }));

    expect(await screen.findByText("Quarter 1 is live")).toBeInTheDocument();
  });

  it("captures live player and opposition statistics from the current court", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await session.createDraft({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id) });
    await session.setStartingLineup(game.id, {
      "Goal Keeper": players[0].id,
      "Goal Defence": players[1].id,
      "Wing Defence": players[2].id,
      Centre: players[3].id,
      "Wing Attack": players[4].id,
      "Goal Attack": players[5].id,
      "Goal Shooter": players[6].id
    });
    await session.startQuarterOne(game.id);
    const user = userEvent.setup();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: "View live match" }));
    await user.click(screen.getByRole("button", { name: "Record Goals for Faye" }));
    await user.click(screen.getByRole("button", { name: "Opposition goal" }));

    expect(await screen.findByText("Roses 1 — Thunder 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo last action" }));
    expect(await screen.findByText("Roses 1 — Thunder 0")).toBeInTheDocument();
  });

  it("lets a coach correct or remove an ended quarter action while the next quarter is live", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia", "Hana"].map((name) => session.addPlayer({ name })));
    const game = await session.createDraft({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id) });
    await session.setStartingLineup(game.id, { "Goal Keeper": players[0].id, "Goal Defence": players[1].id, "Wing Defence": players[2].id, Centre: players[3].id, "Wing Attack": players[4].id, "Goal Attack": players[5].id, "Goal Shooter": players[6].id });
    await session.startQuarterOne(game.id);
    await session.recordPlayerStatistic(game.id, { position: "Centre", statistic: "Tip" });
    await session.endQuarter(game.id);
    await session.startNextQuarter(game.id);
    const user = userEvent.setup();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: "View live match" }));
    expect(await screen.findByText("Quarter 1 review")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit statistic" }));
    await user.selectOptions(screen.getByLabelText("Correction player"), players[7].id);
    await user.selectOptions(screen.getByLabelText("Correction position"), "Wing Defence");
    await user.selectOptions(screen.getByLabelText("Correction statistic"), "Intercept");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    expect(await screen.findByText("Hana · Wing Defence · Intercept")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove action from Quarter 1" }));
    expect(screen.queryByText("Hana · Wing Defence · Intercept")).not.toBeInTheDocument();
  });

  it("shows read-only review and report exports only for terminal matches", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await session.createDraft({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id) });
    await session.setStartingLineup(game.id, { "Goal Keeper": players[0].id, "Goal Defence": players[1].id, "Wing Defence": players[2].id, Centre: players[3].id, "Wing Attack": players[4].id, "Goal Attack": players[5].id, "Goal Shooter": players[6].id });
    await session.startQuarterOne(game.id);
    await session.recordPlayerStatistic(game.id, { position: "Goal Attack", statistic: "Goals" });
    await session.terminateGame(game.id);
    const user = userEvent.setup();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: "View match record" }));
    expect(await screen.findByText("MATCH RECORD")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End quarter" })).not.toBeInTheDocument();
  });
});
