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

  it("guides a coach from Season Setup to the Setup Match empty state", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    await user.type(await screen.findByLabelText("Team name"), "Roses");
    await user.click(screen.getByRole("button", { name: "Save team" }));
    await user.type(await screen.findByLabelText("Season name"), "2026 Winter");
    await user.click(screen.getByRole("button", { name: "Create season" }));

    expect(await screen.findByRole("heading", { name: "No Match in progress" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Season Setup" })).not.toBeInTheDocument();
  });

  it("uses Coach navigation instead of a header menu and starts Setup Match from its empty state", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    await user.type(await screen.findByLabelText("Team name"), "Roses");
    await user.click(screen.getByRole("button", { name: "Save team" }));
    await user.type(await screen.findByLabelText("Season name"), "2026 Winter");
    await user.click(screen.getByRole("button", { name: "Create season" }));

    expect(await screen.findByRole("heading", { name: "No Match in progress" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Coach navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Setup Match" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Match History" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Set up a Match" }));
    expect(await screen.findByRole("heading", { name: "Add Opponent" })).toBeInTheDocument();
  });

  it("changes Coach navigation from Setup Match to Live Match after Quarter 1 begins", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    expect(await screen.findByRole("button", { name: "Live Match" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Match History" }));
    expect(await screen.findByRole("heading", { name: "Match history" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Live Match" }));
    expect(await screen.findByText("Quarter 1 is live")).toBeInTheDocument();
  });

  it("requires confirmation before ending the active season and then offers its saved team for the next season", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    await user.type(await screen.findByLabelText("Team name"), "Roses");
    await user.click(screen.getByRole("button", { name: "Save team" }));
    await user.type(screen.getByLabelText("Season name"), "2026 Winter");
    await user.click(screen.getByRole("button", { name: "Create season" }));

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "End season" }));
    const endSeason = screen.getByRole("button", { name: "Confirm end season" });
    expect(endSeason).toBeDisabled();
    await user.click(screen.getByLabelText("I understand ending this season makes it read-only."));
    await user.click(endSeason);

    await user.click(await screen.findByRole("button", { name: "Match History" }));
    await user.click(screen.getByRole("button", { name: "Setup Match" }));
    await user.type(await screen.findByLabelText("Season name"), "2027 Winter");
    expect(screen.getByText("Roses")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create season" }));
    expect(await screen.findByRole("heading", { name: "No Match in progress" })).toBeInTheDocument();
  });

  it("keeps secondary lifecycle and recovery actions in Coach navigation", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Backup & restore" }));
    expect(screen.getByRole("heading", { name: "Backup & restore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Match History" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open menu" })).not.toBeInTheDocument();
  });

  it("persists Match identity and resumes Match Squad setup after an interruption", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const user = userEvent.setup();
    const rendered = render(<App store={store} />);

    expect(await screen.findByRole("heading", { name: "No Match in progress" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set up a Match" }));
    expect(await screen.findByRole("heading", { name: "Add Opponent" })).toBeInTheDocument();
    const continueToSquad = screen.getByRole("button", { name: "Continue to Match Squad" });
    expect(continueToSquad).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Opponent"), opposition.id);
    expect(continueToSquad).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Match History" }));
    expect(await screen.findByRole("heading", { name: "Match history" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Setup Match" }));
    expect(await screen.findByRole("heading", { name: "Add Opponent" })).toBeInTheDocument();
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

  it("persists a five-Player Match Squad before advancing to Court Setup", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi"].map((name) => session.addPlayer({ name })));
    await session.advanceToMatchSquad({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26" });
    const user = userEvent.setup();
    const rendered = render(<App store={store} />);

    expect(await screen.findByRole("heading", { name: "Match Squad" })).toBeInTheDocument();
    const continueToCourt = screen.getByRole("button", { name: "Continue to Court Setup" });
    expect(continueToCourt).toBeDisabled();
    await user.type(screen.getByLabelText("New player name"), "Eve");
    await user.click(screen.getByRole("button", { name: "Add player to Match Squad" }));
    expect(await screen.findByLabelText("Eve")).toBeChecked();
    for (const player of players) await user.click(screen.getByLabelText(player.name));
    expect(screen.getByRole("button", { name: "Continue to Court Setup" })).toBeEnabled();
    await user.click(continueToCourt);

    expect(await screen.findByRole("heading", { name: "Set up Quarter 1 Court" })).toBeInTheDocument();
    const startMatch = screen.getByRole("button", { name: "Start Match" });
    expect(startMatch).toBeDisabled();
    for (const [position, playerName] of [["Goal Keeper", "Ava"], ["Goal Defence", "Bea"], ["Wing Defence", "Cora"], ["Centre", "Demi"], ["Wing Attack", "Eve"]] as const) {
      await user.selectOptions(screen.getByLabelText(position), playerName);
    }
    expect(startMatch).toBeEnabled();
    await user.click(startMatch);
    expect(await screen.findByText("Quarter 1 is live")).toBeInTheDocument();
    rendered.unmount();
    render(<App store={store} />);
    expect(await screen.findByText("Quarter 1 is live")).toBeInTheDocument();
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

  it("shows switchable previous-quarter and Match statistics beside a prefilled Court", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    await session.recordPlayerStatistic(game.id, { position: "Centre", statistic: "Tip" });
    await session.endQuarter(game.id);
    const user = userEvent.setup();
    render(<App store={store} />);

    expect(await screen.findByRole("heading", { name: "Set up Quarter 2 Court" })).toBeInTheDocument();
    expect(screen.getByLabelText("Goal Keeper")).toHaveValue(players[0].id);
    expect(screen.getByRole("option", { name: "Ava" })).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "Ava" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Previous quarter statistics" })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "LI" && element.textContent === "Demi · Centre · Tip: 1")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Centre"), "");
    await user.click(screen.getByRole("button", { name: "All Match" }));
    expect(screen.getByRole("heading", { name: "All Match statistics" })).toBeInTheDocument();
    expect(screen.getByLabelText("Centre")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Previous quarter" }));
    expect(screen.getByRole("heading", { name: "Previous quarter statistics" })).toBeInTheDocument();
    expect(screen.getByLabelText("Centre")).toHaveValue("");
    await user.selectOptions(screen.getByLabelText("Centre"), players[3].id);
    await user.click(screen.getByRole("button", { name: "Start Quarter 2" }));
    expect(await screen.findByText("Quarter 2 is live")).toBeInTheDocument();
    expect(screen.queryByLabelText("Late player name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add player to squad" })).not.toBeInTheDocument();
  });

  it("shows final score confirmation rather than another Court setup after Quarter 4", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      await session.endQuarter(game.id);
      if (quarter < 4) await session.startNextQuarter(game.id, session.nextQuarterCourt(game.id));
    }

    render(<App store={store} />);

    expect(await screen.findByRole("heading", { name: "Quarter 4 has ended" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm and finalise" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Set up Quarter 5 Court" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: "Quarter 1 event feed" })).toBeInTheDocument();
    expect(screen.getAllByText("Opposition goal")).toHaveLength(2);
    expect(screen.getByText((_, element) => element?.textContent === "Faye · GA · Goals")).toBeInTheDocument();
    expect(screen.getByText("GA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Correct event" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove event" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Undo last event" })).toBeEnabled();
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
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Record Goals for Faye" })).toHaveTextContent("◎");
    expect(screen.queryByText("Quarter 1 review")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abandon match" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Terminate game" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More match actions" }));
    expect(screen.getByRole("button", { name: "Abandon match" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByRole("heading", { name: "Match history" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End quarter" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Live Match" }));
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

    await user.click(await screen.findByRole("button", { name: "Match History" }));
    await user.click(screen.getByRole("button", { name: "View match record" }));
    expect(await screen.findByText("MATCH RECORD")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End quarter" })).not.toBeInTheDocument();
  });
});
