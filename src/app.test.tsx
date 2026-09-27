import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./app";
import { GameSession } from "./game-session/game-session";
import { InMemoryGameSessionStore } from "./game-session/in-memory-game-session-store";

const startLiveMatch = (session: GameSession, seasonId: string, oppositionId: string, players: Array<{ id: string }>) => session.startMatch({ seasonId, oppositionId, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id), startingLineup: { "Goal Keeper": players[0].id, "Goal Defence": players[1].id, "Wing Defence": players[2].id, Centre: players[3].id, "Wing Attack": players[4].id, "Goal Attack": players[5].id, "Goal Shooter": players[6].id } });

describe("Natball Insights setup", () => {
  it("shows only Team Setup on first launch and advances to Season Setup after saving a Team", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    expect(await screen.findByRole("heading", { name: "Team Setup" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Season Setup" })).not.toBeInTheDocument();
    const saveTeam = screen.getByRole("button", { name: "Save team" });
    expect(saveTeam).toBeDisabled();

    await user.type(screen.getByLabelText("Team name"), "Roses");
    await user.click(saveTeam);

    expect(await screen.findByRole("heading", { name: "Season Setup" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Team Setup" })).not.toBeInTheDocument();
  });

  it("guides a coach from Season Setup to the focused Match identity screen", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    await user.type(await screen.findByLabelText("Team name"), "Roses");
    await user.click(screen.getByRole("button", { name: "Save team" }));
    await user.type(await screen.findByLabelText("Season name"), "2026 Winter");
    await user.click(screen.getByRole("button", { name: "Create season" }));

    expect(await screen.findByRole("heading", { name: "Add Opponent" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Season Setup" })).not.toBeInTheDocument();
  });

  it("requires confirmation before ending the active season and then offers its saved team for the next season", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    await user.type(await screen.findByLabelText("Team name"), "Roses");
    await user.click(screen.getByRole("button", { name: "Save team" }));
    await user.type(screen.getByLabelText("Season name"), "2026 Winter");
    await user.click(screen.getByRole("button", { name: "Create season" }));

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("menuitem", { name: "End season" }));
    const endSeason = screen.getByRole("button", { name: "Confirm end season" });
    expect(endSeason).toBeDisabled();
    await user.click(screen.getByLabelText("I understand ending this season makes it read-only."));
    await user.click(endSeason);

    await user.click(await screen.findByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Match history" }));
    await user.click(screen.getByRole("button", { name: "Back to Season Setup" }));
    await user.type(await screen.findByLabelText("Season name"), "2027 Winter");
    expect(screen.getByText("Roses")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create season" }));
    expect(await screen.findByRole("heading", { name: "Add Opponent" })).toBeInTheDocument();
  });

  it("keeps secondary lifecycle and recovery actions in the header menu", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("menuitem", { name: "End season" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Backup & restore" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Match history" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Season settings" })).not.toBeInTheDocument();
  });

  it("persists Match identity and resumes Match Squad setup after an interruption", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const user = userEvent.setup();
    const rendered = render(<App store={store} />);

    expect(await screen.findByRole("heading", { name: "Add Opponent" })).toBeInTheDocument();
    const continueToSquad = screen.getByRole("button", { name: "Continue to Match Squad" });
    expect(continueToSquad).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Opponent"), opposition.id);
    expect(continueToSquad).toBeEnabled();
    const date = screen.getByLabelText("Match date").getAttribute("value");
    rendered.unmount();
    const resumed = render(<App store={store} />);
    expect(await screen.findByRole("heading", { name: "Add Opponent" })).toBeInTheDocument();
    expect(screen.getByLabelText("Opponent")).toHaveValue(opposition.id);
    expect(screen.getByLabelText("Match date")).toHaveValue(date ?? "");
    await user.click(screen.getByRole("button", { name: "Continue to Match Squad" }));

    expect(await screen.findByRole("heading", { name: "Match Squad" })).toBeInTheDocument();
    resumed.unmount();
    render(<App store={store} />);
    expect(await screen.findByRole("heading", { name: "Match Squad" })).toBeInTheDocument();
  });

  it("reopens a persisted live match after an interruption", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    expect(await screen.findByText("Quarter 1 is live")).toBeInTheDocument();
  });

  it("requires a confirmed, repositionable Court before starting a later Quarter", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    await session.endQuarter(game.id);
    const user = userEvent.setup();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: "Set up Quarter 2" }));

    expect(await screen.findByRole("heading", { name: "Set up Quarter 2 Court" })).toBeInTheDocument();
    expect(screen.getByLabelText("Goal Keeper")).toHaveValue(players[0].id);
    expect(screen.getByRole("option", { name: "Ava" })).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "Ava" })).toHaveLength(1);
    await user.type(screen.getByLabelText("Late player name"), "Hana");
    await user.click(screen.getByRole("button", { name: "Add player to squad" }));
    expect(await screen.findAllByRole("option", { name: "Hana" })).not.toHaveLength(0);
  });

  it("captures live player and opposition statistics from the current court", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia", "Hana"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    await screen.findByText("Quarter 1 is live");
    await user.click(screen.getByRole("button", { name: "Record Goals for Faye" }));
    await user.click(screen.getByRole("button", { name: "Opposition goal" }));
    await user.click(screen.getByRole("button", { name: "Record Substitution" }));
    await user.selectOptions(screen.getByLabelText("Substitution Position"), "Centre");
    await user.selectOptions(screen.getByLabelText("Substitution Player"), players[7].id);
    await user.click(screen.getAllByRole("button", { name: "Record Substitution" }).at(-1)!);

    expect(await screen.findByText("Roses 1 — Thunder 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last player event" })).toBeDisabled();
    expect(await screen.findByText("Roses 1 — Thunder 1")).toBeInTheDocument();
  });

  it("keeps Match Centre recording compact and secondary actions separate", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    expect(await screen.findByRole("heading", { name: "Roses 0 — Thunder 0" })).toBeInTheDocument();
    expect(screen.getByText("Quarter score: Roses 0 — Thunder 0")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Record Goals for Faye" })).toHaveTextContent("◎");
    expect(screen.queryByText("Quarter 1 review")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abandon match" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Terminate game" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More match actions" }));
    expect(screen.getByRole("button", { name: "Abandon match" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByRole("heading", { name: "Match history" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End quarter" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Match Centre" }));
    expect(await screen.findByRole("button", { name: "End quarter" })).toBeInTheDocument();
    expect(session.match(game.id)?.status).toBe("live");
  });

  it("opens ended Quarter history away from the live Match Centre", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia", "Hana"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    await session.recordPlayerStatistic(game.id, { position: "Centre", statistic: "Tip" });
    await session.endQuarter(game.id);
    await session.startNextQuarter(game.id, session.nextQuarterCourt(game.id));
    const user = userEvent.setup();
    render(<App store={store} />);

    await screen.findByText("Quarter 2 is live");
    expect(screen.queryByText("Quarter 1 review")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByRole("heading", { name: "Match history" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End quarter" })).not.toBeInTheDocument();
  });

  it("shows read-only review and report exports only for terminal matches", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    await session.recordPlayerStatistic(game.id, { position: "Goal Attack", statistic: "Goals" });
    await session.abandonGame(game.id);
    const user = userEvent.setup();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Match history" }));
    await user.click(screen.getByRole("button", { name: "View match record" }));
    expect(await screen.findByText("MATCH RECORD")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End quarter" })).not.toBeInTheDocument();
  });
});
