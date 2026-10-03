import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import { GameSession } from "./game-session/game-session";
import { InMemoryGameSessionStore } from "./game-session/in-memory-game-session-store";

const startLiveMatch = (session: GameSession, seasonId: string, oppositionId: string, players: Array<{ id: string }>) => session.startMatch({ seasonId, oppositionId, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id), startingLineup: { "Goal Keeper": players[0].id, "Goal Defence": players[1].id, "Wing Defence": players[2].id, Centre: players[3].id, "Wing Attack": players[4].id, "Goal Attack": players[5].id, "Goal Shooter": players[6].id } });
const coachNavigation = () => {
  fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
  return within(screen.getByRole("dialog", { name: "Coach navigation" }));
};

afterEach(() => vi.unstubAllGlobals());

describe("Natball Insights setup", () => {
  it("shows the prototype-style Setup Team card and advances to Setup Season after saving a Team", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    expect(await screen.findByRole("heading", { name: "Setup Team" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Setup Season" })).not.toBeInTheDocument();
    expect(screen.getByText("STEP 1 OF 4")).toBeInTheDocument();
    expect(screen.queryByLabelText(/club|association/i)).not.toBeInTheDocument();
    const saveTeam = screen.getByRole("button", { name: "Next: Setup Season" });
    expect(screen.getByRole("group", { name: "Primary action" })).toContainElement(saveTeam);
    expect(saveTeam).toBeDisabled();

    await user.type(screen.getByLabelText("Team name"), "Roses");
    await user.click(saveTeam);

    expect(await screen.findByRole("heading", { name: "Setup Season" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Setup Team" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Setup Team" })).toBeInTheDocument();
    expect(screen.getByLabelText("Team name")).toHaveValue("Roses");
  });

  it("returns to Team Setup when Match is opened from History or Settings on first run", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    expect(await screen.findByRole("heading", { name: "Setup Team" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Open navigation menu" });
    await user.click(coachNavigation().getByRole("button", { name: "History" }));
    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    await user.click(coachNavigation().getByRole("button", { name: "Match" }));
    expect(await screen.findByRole("heading", { name: "Setup Team" })).toBeInTheDocument();
    await user.click(coachNavigation().getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await user.click(coachNavigation().getByRole("button", { name: "Match" }));
    expect(await screen.findByRole("heading", { name: "Setup Team" })).toBeInTheDocument();
  });

  it("guides a coach from Season Setup to the Setup Match empty state", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    await user.type(await screen.findByLabelText("Team name"), "Roses");
    await user.click(screen.getByRole("button", { name: "Next: Setup Season" }));
    await user.type(await screen.findByLabelText("Season title"), "2026 Winter");
    await user.click(screen.getByRole("button", { name: "Next: Setup Match & Squad" }));

    expect(await screen.findByRole("heading", { name: "No Match in progress" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Setup Season" })).not.toBeInTheDocument();
  });

  it("presents the resumable Match Setup journey and keeps Squad selection scannable", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve"].map((name) => session.addPlayer({ name })));
    const user = userEvent.setup();
    render(<App store={store} />);

    expect(await screen.findByText("2026 Winter")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start Match setup" }));

    expect(await screen.findByText("STEP 3 OF 4")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Match setup progress" })).toHaveTextContent("Setup Match");
    expect(screen.getByRole("group", { name: "Saved Oppositions" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Add a new Opposition" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Opposition"), opposition.id);
    await user.type(screen.getByLabelText("Match date"), "2026-09-26");
    expect(screen.getByRole("group", { name: /Match Squad/ })).toBeInTheDocument();
    for (const player of players) await user.click(screen.getByLabelText(player.name));
    expect(screen.getByRole("group", { name: "Selected Match Squad" })).toHaveTextContent("Ava");
    expect(screen.getByRole("button", { name: "Remove Ava from Match Squad" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next: Setup Quarter" }));

    expect(await screen.findByText("STEP 4 OF 4")).toBeInTheDocument();
  });

  it("filters a large Opposition history and adds a new Opposition in Setup Match", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    await Promise.all(Array.from({ length: 20 }, (_, index) => session.addOpposition({ name: `Club ${index}` })));
    const user = userEvent.setup();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: "Start Match setup" }));
    await user.type(screen.getByRole("searchbox", { name: "Search opposition history" }), "Club 19");
    expect(screen.getByRole("option", { name: "Club 19" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Club 1" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("New opposition name"));
    await user.type(screen.getByLabelText("New opposition name"), "Comets");
    await user.click(screen.getByRole("button", { name: "Add opposition to match" }));
    expect(await screen.findByRole("option", { name: "Comets" })).toBeInTheDocument();
    expect(screen.getByLabelText("Opposition")).not.toHaveValue("");
  });

  it("keeps a twelve-Player Squad unique, removable, and resumable across a large Player history", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(Array.from({ length: 20 }, (_, index) => session.addPlayer({ name: `Player ${index}` })));
    await session.advanceToMatchSquad({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26" });
    await session.saveMatchSquad({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.slice(0, 12).map((player) => player.id) });
    const user = userEvent.setup();
    render(<App store={store} />);

    const search = await screen.findByRole("searchbox", { name: "Search players" });
    await user.type(search, "Player 12");
    expect(screen.getByLabelText("Player 12")).toBeDisabled();
    await user.clear(search);
    await user.click(screen.getByRole("button", { name: "Remove Player 0 from Match Squad" }));
    expect(screen.getByRole("group", { name: /Match Squad 11\/12 selected/ })).toBeInTheDocument();
    await user.type(search, "Player 12");
    expect(screen.getByLabelText("Player 12")).toBeEnabled();
    await screen.findByRole("button", { name: "Open navigation menu" });
    await user.click(coachNavigation().getByRole("button", { name: "History" }));
    await user.click(coachNavigation().getByRole("button", { name: "Match" }));
    expect(await screen.findByRole("group", { name: /Match Squad 11\/12 selected/ })).toBeInTheDocument();
  });

  it("opens a prototype-inspired navigation drawer and starts Setup Match from its empty state", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    await user.type(await screen.findByLabelText("Team name"), "Roses");
    await user.click(screen.getByRole("button", { name: "Next: Setup Season" }));
    await user.type(await screen.findByLabelText("Season title"), "2026 Winter");
    await user.click(screen.getByRole("button", { name: "Next: Setup Match & Squad" }));

    expect(await screen.findByRole("heading", { name: "No Match in progress" })).toBeInTheDocument();
    const menu = screen.getByRole("button", { name: "Open navigation menu" });
    expect(screen.queryByRole("dialog", { name: "Coach navigation" })).not.toBeInTheDocument();
    await user.click(menu);
    expect(screen.getByRole("dialog", { name: "Coach navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Match" })).toHaveAttribute("aria-current", "page");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Coach navigation" })).not.toBeInTheDocument();
    await waitFor(() => expect(menu).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Start Match setup" }));
    expect(await screen.findByRole("heading", { name: "Setup Match" })).toBeInTheDocument();
  });

  it("keeps Match as the state-resolving Coach navigation destination after Quarter 1 begins", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia", "Hana"].map((name) => session.addPlayer({ name })));
    await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    expect(await screen.findByRole("button", { name: "Open navigation menu" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Open navigation menu" });
    await user.click(coachNavigation().getByRole("button", { name: "History" }));
    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    await user.click(coachNavigation().getByRole("button", { name: "Match" }));
    expect(await screen.findByText("LIVE MATCH · QUARTER 1")).toBeInTheDocument();
  });

  it("groups terminal Matches by Season, orders them newest first, and reopens both terminal outcomes", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const completedMatch = await startLiveMatch(session, season.id, opposition.id, players);
    await session.abandonGame(completedMatch.id);
    const abandonedMatch = await startLiveMatch(session, season.id, opposition.id, players);
    await session.abandonGame(abandonedMatch.id);
    const backup = JSON.parse(session.exportBackup());
    backup.data.games[0] = { ...backup.data.games[0], date: "2026-09-27", status: "finalised", outcome: { kind: "completed" }, finalScore: { own: 0, opposition: 0 } };
    backup.data.games[1].date = "2026-01-12";
    await session.importBackup(JSON.stringify(backup), "replace", true);
    await session.endSeason(season.id);
    const currentSeason = await session.createSeason({ name: "2027 Winter", teamName: "Roses" });
    await startLiveMatch(session, currentSeason.id, opposition.id, players);
    const currentMatch = session.matches().find((game) => game.status === "live")!;
    await session.abandonGame(currentMatch.id);
    const currentBackup = JSON.parse(session.exportBackup());
    currentBackup.data.games.find((game: { id: string }) => game.id === currentMatch.id).seasonId = currentSeason.id;
    currentBackup.data.games.find((game: { id: string }) => game.id === currentMatch.id).date = "2027-01-09";
    await session.importBackup(JSON.stringify(currentBackup), "replace", true);
    await startLiveMatch(session, currentSeason.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    await screen.findByRole("button", { name: "Open navigation menu" });
    await user.click(coachNavigation().getByRole("button", { name: "History" }));

    const currentGroup = screen.getByRole("group", { name: "2027 Winter History" });
    const previousGroup = screen.getByRole("group", { name: "2026 Winter History" });
    expect(currentGroup).toHaveAttribute("open");
    expect(previousGroup).not.toHaveAttribute("open");
    expect(within(currentGroup).getByText("Abandoned · 0 – 0")).toBeInTheDocument();
    expect(screen.queryByText("Live Match · Quarter 1 · 0 – 0")).not.toBeInTheDocument();

    await user.click(within(previousGroup).getByText("2026 Winter"));
    const previousMatches = within(previousGroup).getByRole("list", { name: "2026 Winter terminal Matches" });
    expect(within(previousMatches).getAllByRole("listitem").map((entry) => entry.textContent)).toEqual([
      expect.stringContaining("2026-09-27"),
      expect.stringContaining("2026-01-12")
    ]);
    await user.click(within(previousMatches).getAllByRole("button", { name: "View Match Events" })[0]);
    expect(await screen.findByText("READ-ONLY MATCH EVENTS")).toBeInTheDocument();
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to History" }));
    const returnedPreviousGroup = screen.getByRole("group", { name: "2026 Winter History" });
    await user.click(within(returnedPreviousGroup).getByText("2026 Winter"));
    await user.click(within(returnedPreviousGroup).getAllByRole("button", { name: "View Match Events" })[1]);
    expect(await screen.findByText("READ-ONLY MATCH EVENTS")).toBeInTheDocument();
    expect(screen.getByText(/Abandoned - no winner/)).toBeInTheDocument();
  });

  it("keeps Coach destinations available from the drawer in landscape", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })));
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    await screen.findByRole("button", { name: "Open navigation menu" });
    const navigation = coachNavigation();
    expect(navigation.getByRole("button", { name: "Match" })).toBeVisible();
    expect(navigation.getByRole("button", { name: "History" })).toBeVisible();
    expect(navigation.getByRole("button", { name: "Settings" })).toBeVisible();
    expect(screen.getByText("LIVE MATCH · QUARTER 1")).toBeInTheDocument();
    await user.click(coachNavigation().getByRole("button", { name: "History" }));

    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    await user.click(coachNavigation().getByRole("button", { name: "Match" }));
    expect(await screen.findByText("LIVE MATCH · QUARTER 1")).toBeInTheDocument();
  });

  it("requires confirmation before ending the active season and then offers its saved team for the next season", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    await user.type(await screen.findByLabelText("Team name"), "Roses");
    await user.click(screen.getByRole("button", { name: "Next: Setup Season" }));
    await user.type(screen.getByLabelText("Season title"), "2026 Winter");
    await user.click(screen.getByRole("button", { name: "Next: Setup Match & Squad" }));

    await user.click(coachNavigation().getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "End season" }));
    await user.click(screen.getByRole("button", { name: "End season" }));
    await user.click(screen.getByRole("button", { name: "Confirm end season" }));

    await user.click(coachNavigation().getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Edit team" }));
    await user.clear(screen.getByLabelText("Team name"));
    await user.type(screen.getByLabelText("Team name"), "Violets");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.click(coachNavigation().getByRole("button", { name: "History" }));
    await user.click(coachNavigation().getByRole("button", { name: "Match" }));
    await user.type(await screen.findByLabelText("Season title"), "2027 Winter");
    expect(screen.getByText("Violets")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next: Setup Match & Squad" }));
    expect(await screen.findByRole("heading", { name: "No Match in progress" })).toBeInTheDocument();
  });

  it("edits Team and Season from Settings with explicit save and cancel actions", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const user = userEvent.setup();
    render(<App store={store} />);

    await screen.findByRole("button", { name: "Open navigation menu" });
    await user.click(coachNavigation().getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Edit team" }));
    expect(await screen.findByRole("heading", { name: "Team Setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.clear(screen.getByLabelText("Team name"));
    await user.type(screen.getByLabelText("Team name"), "Violets");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(session.setup().teams).toMatchObject([{ name: "Roses" }]);

    await user.click(screen.getByRole("button", { name: "Edit team" }));
    await user.clear(screen.getByLabelText("Team name"));
    await user.type(screen.getByLabelText("Team name"), "Violets");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect((await GameSession.open(store)).setup().teams).toMatchObject([{ name: "Violets" }]);

    await user.click(screen.getByRole("button", { name: "Edit season" }));
    expect(await screen.findByRole("heading", { name: "Season Setup" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Season title"));
    await user.type(screen.getByLabelText("Season title"), "2026 Spring");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect((await GameSession.open(store)).setup().seasons).toMatchObject([{ name: "2026 Winter" }]);

    await user.click(screen.getByRole("button", { name: "Edit season" }));
    await user.clear(screen.getByLabelText("Season title"));
    await user.type(screen.getByLabelText("Season title"), "2026 Spring");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect((await GameSession.open(store)).setup().seasons).toMatchObject([{ name: "2026 Spring" }]);
  });

  it("uses explicit destructive confirmations for ending a Season and replacing local data", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const user = userEvent.setup();
    render(<App store={store} />);

    await screen.findByRole("button", { name: "Open navigation menu" });
    await user.click(coachNavigation().getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "End season" }));
    await user.click(screen.getByRole("button", { name: "End season" }));
    expect(screen.getByRole("alertdialog", { name: "End this Season?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep season active" }));
    expect(session.setup().seasons[0].status).toBe("active");

    await user.click(screen.getByRole("button", { name: "Back to Settings" }));
    await user.click(screen.getByRole("button", { name: "Backup & restore" }));
    await user.selectOptions(screen.getByLabelText("Import mode"), "replace");
    await user.click(screen.getByLabelText("Backup data"));
    await user.paste(session.exportBackup());
    await user.click(screen.getByRole("button", { name: "Import backup" }));
    expect(screen.getByRole("alertdialog", { name: "Replace local data?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep local data" }));
    expect(session.setup().seasons).toHaveLength(1);
  });

  it("explains why Season lifecycle controls are unavailable during a live Match", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    await screen.findByRole("button", { name: "Open navigation menu" });
    await user.click(coachNavigation().getByRole("button", { name: "Settings" }));

    expect(screen.getByRole("button", { name: "End season" })).toBeDisabled();
    expect(screen.getByText("End season is unavailable while a live Match is in progress.")).toBeInTheDocument();
  });

  it("separates safe backup from destructive data replacement", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    await user.type(await screen.findByLabelText("Team name"), "Roses");
    await user.click(screen.getByRole("button", { name: "Next: Setup Season" }));
    await user.type(screen.getByLabelText("Season title"), "2026 Winter");
    await user.click(screen.getByRole("button", { name: "Next: Setup Match & Squad" }));
    await user.click(coachNavigation().getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Backup & restore" }));

    expect(screen.getByRole("heading", { name: "Create a safe backup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Restore data" })).toBeInTheDocument();
    expect(screen.getByText("Replace all local data is destructive and requires confirmation.")).toBeInTheDocument();
  });

  it("keeps the compact landscape rail beside the dense Backup and restore surface", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })));
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    await user.type(await screen.findByLabelText("Team name"), "Roses");
    await user.click(screen.getByRole("button", { name: "Next: Setup Season" }));
    await user.type(screen.getByLabelText("Season title"), "2026 Winter");
    await user.click(screen.getByRole("button", { name: "Next: Setup Match & Squad" }));
    await user.click(coachNavigation().getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Backup & restore" }));

    expect(screen.getByRole("heading", { name: "Backup & restore" }).closest("section")).toHaveClass("management-screen");
    expect(screen.getByRole("heading", { name: "Create a safe backup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Restore data" })).toBeInTheDocument();
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

    await screen.findByRole("button", { name: "Open navigation menu" });
    await user.click(coachNavigation().getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Backup & restore" }));
    expect(screen.getByRole("heading", { name: "Backup & restore" })).toBeInTheDocument();
    expect(coachNavigation().getByRole("button", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeInTheDocument();
  });

  it("keeps Match details and Squad selection together and resumes them after navigation", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const user = userEvent.setup();
    const rendered = render(<App store={store} />);

    expect(await screen.findByRole("heading", { name: "No Match in progress" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start Match setup" }));
    expect(await screen.findByRole("heading", { name: "Setup Match" })).toBeInTheDocument();
    const continueToCourt = screen.getByRole("button", { name: "Next: Setup Quarter" });
    expect(continueToCourt).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Opposition"), opposition.id);
    expect(screen.getByRole("heading", { name: "Setup Match" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Open navigation menu" });
    await user.click(coachNavigation().getByRole("button", { name: "History" }));
    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    await user.click(coachNavigation().getByRole("button", { name: "Match" }));
    expect(await screen.findByRole("heading", { name: "Setup Match" })).toBeInTheDocument();
    const date = screen.getByLabelText("Match date").getAttribute("value");
    rendered.unmount();
    const resumed = render(<App store={store} />);
    expect(await screen.findByRole("heading", { name: "Setup Match" })).toBeInTheDocument();
    expect(screen.getByLabelText("Opposition")).toHaveValue(opposition.id);
    expect(screen.getByLabelText("Match date")).toHaveValue(date ?? "");
    expect(screen.getByRole("group", { name: /Match Squad/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next: Setup Quarter" })).toBeDisabled();
  });

  it("starts a Match & Squad screen without sample details and presents prototype-style panels", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const user = userEvent.setup();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: "Start Match setup" }));

    expect(screen.getByRole("heading", { name: "Match Details" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add Player to Squad" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Match Squad Roster \(0 \/ 12\)/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Match date")).toHaveValue("");
    expect(screen.getByLabelText("Opposition")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Next: Setup Quarter" })).toBeDisabled();
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

    expect(await screen.findByRole("heading", { name: "Setup Match" })).toBeInTheDocument();
    const continueToCourt = screen.getByRole("button", { name: "Next: Setup Quarter" });
    expect(continueToCourt).toBeDisabled();
    await user.type(screen.getByLabelText("New player name"), "Eve");
    await user.click(screen.getByRole("button", { name: "Add player to Match Squad" }));
    expect(await screen.findByLabelText("Eve")).toBeChecked();
    for (const player of players) await user.click(screen.getByLabelText(player.name));
    expect(screen.getByRole("button", { name: "Next: Setup Quarter" })).toBeEnabled();
    await user.click(continueToCourt);

    expect(await screen.findByRole("heading", { name: "Set up Quarter 1 Court" })).toBeInTheDocument();
    const startMatch = screen.getByRole("button", { name: "Start Match" });
    expect(startMatch).toBeDisabled();
    expect(screen.getByText("Assign 5 more Players to start Quarter 1.")).toBeInTheDocument();
    for (const [position, playerName] of [["Goal Keeper", "Ava"], ["Goal Defence", "Bea"], ["Wing Defence", "Cora"], ["Centre", "Demi"], ["Wing Attack", "Eve"]] as const) {
      await user.selectOptions(screen.getByLabelText(position), playerName);
    }
    expect(startMatch).toBeEnabled();
    expect(screen.getByText("Court ready — 5 Players assigned. You can start Quarter 1.")).toBeInTheDocument();
    await user.click(startMatch);
    expect(await screen.findByText("LIVE MATCH · QUARTER 1")).toBeInTheDocument();
    rendered.unmount();
    render(<App store={store} />);
    expect(await screen.findByText("LIVE MATCH · QUARTER 1")).toBeInTheDocument();
  });

  it("returns from Quarter 1 to Setup Match while retaining Court assignments for retained Squad Players", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye"].map((name) => session.addPlayer({ name })));
    await session.advanceToCourtSetup({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26", squadPlayerIds: players.map((player) => player.id) });
    const user = userEvent.setup();
    render(<App store={store} />);

    await screen.findByRole("heading", { name: "Set up Quarter 1 Court" });
    for (const [position, player] of [["Goal Keeper", players[0]], ["Goal Defence", players[1]], ["Wing Defence", players[2]], ["Centre", players[3]], ["Wing Attack", players[4]]] as const) await user.selectOptions(screen.getByLabelText(position), player.id);
    await user.click(screen.getByRole("button", { name: "Back to Setup Match" }));
    expect(await screen.findByRole("heading", { name: "Setup Match" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Ava from Match Squad" }));
    await user.click(screen.getByRole("button", { name: "Next: Setup Quarter" }));

    expect(await screen.findByRole("heading", { name: "Set up Quarter 1 Court" })).toBeInTheDocument();
    expect(screen.getByLabelText("Goal Keeper")).toHaveValue("");
    expect(screen.getByLabelText("Goal Defence")).toHaveValue(players[1].id);
  });

  it("uses a searchable Player picker with selected Squad chips and a persistent primary action", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye"].map((name) => session.addPlayer({ name })));
    await session.advanceToMatchSquad({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-26" });
    const user = userEvent.setup();
    render(<App store={store} />);

    const search = await screen.findByRole("searchbox", { name: "Search players" });
    await user.type(search, "Ava");
    expect(screen.getByLabelText("Ava")).toBeInTheDocument();
    expect(screen.queryByLabelText("Bea")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Ava"));
    expect(screen.getByRole("button", { name: "Remove Ava from Match Squad" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Primary action" })).toContainElement(screen.getByRole("button", { name: "Next: Setup Quarter" }));
  });

  it("reopens a persisted live match after an interruption", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    const rendered = render(<App store={store} />);

    expect(await screen.findByText("LIVE MATCH · QUARTER 1")).toBeInTheDocument();
    rendered.unmount();
    render(<App store={store} />);
    expect(await screen.findByText("LIVE MATCH · QUARTER 1")).toBeInTheDocument();
  });

  it("links from later Court setup to the previous Quarter on Match Events", async () => {
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
    expect(screen.getAllByRole("option", { name: "Ava" })).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Review previous Quarter on Match Events" })).toBeInTheDocument();
    expect(screen.getByText("Court ready — 7 Players assigned. You can start Quarter 2.")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Centre"), "");
    expect(screen.getByText("Court ready — 6 Players assigned. You can start Quarter 2.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review previous Quarter on Match Events" }));
    expect(await screen.findByLabelText("Quarter 1 statistics")).toHaveTextContent("Demi");
    expect(screen.getByLabelText("Quarter 1 statistics")).toHaveTextContent("Tip: 1");
    await user.click(coachNavigation().getByRole("button", { name: "Match" }));
    expect(await screen.findByLabelText("Centre")).toHaveValue("");
    await user.selectOptions(screen.getByLabelText("Centre"), players[3].id);
    await user.click(screen.getByRole("button", { name: "Start Quarter 2" }));
    expect(await screen.findByText("LIVE MATCH · QUARTER 2")).toBeInTheDocument();
    expect(screen.queryByLabelText("Late player name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add player to squad" })).not.toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "Previous quarter statistics" })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "LI" && element.textContent === "Demi · C · Tip: 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All Match" }));
    expect(screen.getByRole("heading", { name: "All Match statistics" })).toBeInTheDocument();
    expect(screen.getByLabelText("Goal Keeper")).toHaveValue(players[0].id);
  });

  it("moves a Player to a newly selected Court Position without duplicating the Court", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    await session.endQuarter(game.id);
    const user = userEvent.setup();
    render(<App store={store} />);

    await screen.findByRole("heading", { name: "Set up Quarter 2 Court" });
    await user.selectOptions(screen.getByLabelText("Goal Defence"), players[0].id);

    expect(screen.getByLabelText("Goal Keeper")).toHaveValue("");
    expect(screen.getByLabelText("Goal Defence")).toHaveValue(players[0].id);
    expect(screen.getByRole("button", { name: "Start Quarter 2" })).toBeEnabled();
  });

  it("retains an unsaved next Court while visiting History or Backup", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    await session.endQuarter(game.id);
    const user = userEvent.setup();
    render(<App store={store} />);

    await screen.findByRole("heading", { name: "Set up Quarter 2 Court" });
    await user.selectOptions(screen.getByLabelText("Centre"), "");
    await user.click(coachNavigation().getByRole("button", { name: "History" }));
    await user.click(coachNavigation().getByRole("button", { name: "Match" }));
    expect(await screen.findByLabelText("Centre")).toHaveValue("");

    await user.click(coachNavigation().getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Backup & restore" }));
    await user.click(coachNavigation().getByRole("button", { name: "Match" }));
    expect(await screen.findByLabelText("Centre")).toHaveValue("");
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

    expect(await screen.findByRole("dialog", { name: "Quarter 4 summary" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Match" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Confirm final score and finalise Match" })).toBeInTheDocument();
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

    await screen.findByText("LIVE MATCH · QUARTER 1");
    await user.click(screen.getByRole("button", { name: "Record Goals for Faye" }));
    await user.click(screen.getByRole("button", { name: "Opponent goal" }));
    await user.click(screen.getByRole("button", { name: "Record Substitution" }));
    const substitution = await screen.findByRole("dialog", { name: "Record Substitution" });
    await user.selectOptions(within(substitution).getByLabelText("Court position"), "Centre");
    await user.selectOptions(within(substitution).getByLabelText("Incoming player"), players[7].id);
    await user.click(within(substitution).getByRole("button", { name: "Confirm substitution" }));

    expect(await screen.findByText("Roses 1 — Thunder 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hana" })).toBeInTheDocument();
    expect((await GameSession.open(store)).match(game.id)?.quarters?.[0].substitutions).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /Event Feed/ }));
    expect(screen.getByRole("heading", { name: "Quarter 1 events" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "Event feed" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Faye · GA · Goals✎×",
      "Opponent goal×",
      "Substitution · C: Hana"
    ]);
    expect(screen.getAllByText("Opponent goal")).toHaveLength(2);
    expect(screen.getByText((_, element) => element?.textContent === "Faye · GA · Goals")).toBeInTheDocument();
    expect(screen.getByText("GA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Correct event" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove event" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    expect(await screen.findByText("Roses 1 — Thunder 1")).toBeInTheDocument();
  });

  it("repositions Court Players, fills the resulting vacancy, and retains the original event attribution", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia", "Hana"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    const view = render(<App store={store} />);

    await screen.findByText("LIVE MATCH · QUARTER 1");
    await user.click(screen.getByRole("button", { name: "Record Goals for Faye" }));
    await user.click(screen.getByRole("button", { name: "Record Substitution" }));
    let substitution = await screen.findByRole("dialog", { name: "Record Substitution" });
    await user.selectOptions(within(substitution).getByLabelText("Court position"), "Centre");
    await user.selectOptions(within(substitution).getByLabelText("Incoming player"), players[5].id);
    await user.click(within(substitution).getByRole("button", { name: "Confirm substitution" }));

    expect((await GameSession.open(store)).liveQuarter(game.id).lineup).toMatchObject({ Centre: players[5].id });
    expect((await GameSession.open(store)).liveQuarter(game.id).lineup["Goal Attack"]).toBeUndefined();
    expect((await GameSession.open(store)).liveQuarter(game.id).playerStatistics).toContainEqual({ playerId: players[5].id, position: "Goal Attack", statistic: "Goals", count: 1 });

    await user.click(screen.getByRole("button", { name: "Record Substitution" }));
    substitution = await screen.findByRole("dialog", { name: "Record Substitution" });
    await user.selectOptions(within(substitution).getByLabelText("Court position"), "Goal Attack");
    await user.selectOptions(within(substitution).getByLabelText("Incoming player"), players[7].id);
    await user.click(within(substitution).getByRole("button", { name: "Confirm substitution" }));
    expect(await screen.findByRole("heading", { name: "Hana" })).toBeInTheDocument();

    view.unmount();
    await (await GameSession.open(store)).abandonGame(game.id);
    render(<App store={store} />);
    await user.click(await screen.findByRole("button", { name: "Open navigation menu" }));
    await user.click(within(screen.getByRole("dialog", { name: "Coach navigation" })).getByRole("button", { name: "History" }));
    await user.click(within(await screen.findByRole("group", { name: "2026 Winter History" })).getByRole("button", { name: "View Match Events" }));
    expect(await screen.findByText("Substitution 1: Centre: Faye")).toBeInTheDocument();
    expect(screen.getByText("Substitution 2: Goal Attack: Vacant")).toBeInTheDocument();
    expect(screen.getByText("Substitution 3: Goal Attack: Hana")).toBeInTheDocument();
  });

  it("keeps five Match Events tabs available and reviews completed Quarter statistics while a later Quarter is live", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia", "Hana"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    await session.recordPlayerStatistic(game.id, { position: "Centre", statistic: "Tip" });
    await session.substitutePlayer(game.id, { position: "Centre", playerId: players[7].id });
    await session.endQuarter(game.id);
    await session.startNextQuarter(game.id, session.nextQuarterCourt(game.id));
    const user = userEvent.setup();
    render(<App store={store} />);

    const tabs = await screen.findByRole("tablist", { name: "Match Events tabs" });
    expect(within(tabs).getByRole("tab", { name: "Q1" })).toBeEnabled();
    expect(within(tabs).getByRole("tab", { name: "Q2" })).toBeEnabled();
    expect(within(tabs).getByRole("tab", { name: "Q3" })).toBeDisabled();
    expect(within(tabs).getByRole("tab", { name: "Q4" })).toBeDisabled();
    expect(within(tabs).getByRole("tab", { name: "Match" })).toBeEnabled();
    await user.click(within(tabs).getByRole("tab", { name: "Q1" }));
    expect(await screen.findByLabelText("Quarter 1 statistics")).toHaveTextContent("Demi");
    expect(screen.getByLabelText("Quarter 1 statistics")).toHaveTextContent("Hana");
    expect(screen.getByLabelText("Quarter 1 statistics")).toHaveTextContent("No events");
  });

  it("keeps compact Match capture actions reachable without an overlay", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })));
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia", "Hana"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    expect(await screen.findByRole("heading", { name: "Roses 0 — Thunder 0" })).toBeInTheDocument();
    expect(screen.getByText("Quarter: Roses 0 — Thunder 0")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Record Goals for Faye" })).toHaveTextContent("Goal");
    expect(screen.queryByText("Quarter 1 review")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record Substitution" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Event Feed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End Quarter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abandon match" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opponent goal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Event Feed" }));
    expect(screen.getByRole("heading", { name: "Quarter 1 events" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close Event feed" }));

    await user.click(screen.getByRole("button", { name: "Record Goals for Faye" }));
    await user.click(screen.getByRole("button", { name: "Opponent goal" }));
    expect(await screen.findByRole("heading", { name: "Roses 1 — Thunder 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    await waitFor(async () => expect((await GameSession.open(store)).gameScore(game.id)).toEqual({ own: 1, opposition: 1 }));

    await user.click(screen.getByRole("button", { name: "Record Substitution" }));
    const substitution = await screen.findByRole("dialog", { name: "Record Substitution" });
    await user.selectOptions(within(substitution).getByLabelText("Court position"), "Centre");
    await user.selectOptions(within(substitution).getByLabelText("Incoming player"), players[7].id);
    await user.click(within(substitution).getByRole("button", { name: "Cancel substitution" }));
    expect(screen.queryByRole("dialog", { name: "Record Substitution" })).not.toBeInTheDocument();
    expect((await GameSession.open(store)).liveQuarter(game.id).lineup.Centre).toBe(players[3].id);
    expect((await GameSession.open(store)).match(game.id)?.quarters?.[0].substitutions).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "End Quarter" }));
    expect(await screen.findByLabelText("Quarter 1 statistics")).toHaveTextContent("Faye");
    const quarterSummary = screen.getByRole("dialog", { name: "Quarter 1 summary" });
    expect(quarterSummary).toHaveTextContent("Quarter score1 — 1");
    expect(quarterSummary).toHaveTextContent("Match score1 — 1");
    expect(quarterSummary).toHaveTextContent("Recorded events2");
    await user.click(within(quarterSummary).getByRole("button", { name: "Prepare Quarter 2 Court" }));
    expect(await screen.findByRole("heading", { name: "Set up Quarter 2 Court" })).toBeInTheDocument();
    const persistedSession = await GameSession.open(store);
    expect(persistedSession.match(game.id)?.status).toBe("live");
    expect(persistedSession.gameScore(game.id)).toEqual({ own: 1, opposition: 1 });
  });

  it("carries every completed Quarter through finalisation and reveals both terminal exports", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    for (const quarter of [1, 2, 3] as const) {
      await user.click(await screen.findByRole("button", { name: "End Quarter" }));
      expect(await screen.findByLabelText(`Quarter ${quarter} statistics`)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: `Prepare Quarter ${quarter + 1} Court` }));
      await user.click(await screen.findByRole("button", { name: `Start Quarter ${quarter + 1}` }));
    }
    await user.click(await screen.findByRole("button", { name: "End Quarter" }));
    const finalSummary = await screen.findByRole("dialog", { name: "Quarter 4 summary" });
    expect(finalSummary).toHaveTextContent("Match score0 — 0");
    await user.click(within(finalSummary).getByRole("button", { name: "Confirm final score and finalise Match" }));
    expect(await screen.findByText("READ-ONLY MATCH EVENTS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
    const createObjectURL = vi.fn(() => "blob:match-report");
    const revokeObjectURL = vi.fn();
    const downloadClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    await user.click(screen.getByRole("button", { name: "Download CSV" }));
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(downloadClick).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
    downloadClick.mockRestore();
  });

  it("keeps the Event-feed drawer closed until the coach opens it, without moving the capture grid", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    await session.recordPlayerStatistic(game.id, { position: "Goal Attack", statistic: "Goals" });
    const user = userEvent.setup();
    render(<App store={store} />);
    const grid = await screen.findByLabelText("Current court event grid");
    expect(screen.queryByRole("dialog", { name: "Event feed" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Event Feed/ }));
    expect(screen.getByRole("dialog", { name: "Event feed" })).toBeInTheDocument();
    expect(screen.getByText("Faye · GA · Goals")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close Event feed" }));
    expect(screen.queryByRole("dialog", { name: "Event feed" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Current court event grid")).toBe(grid);
    await user.click(screen.getByRole("button", { name: "Record Goals for Faye" }));
    expect(await screen.findByRole("button", { name: "Event Feed (1)" })).toBeInTheDocument();
  });

  it("confirms the live count badge before removing its most recent matching event", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: "Record Goals for Faye" }));
    await user.click(screen.getByRole("button", { name: "Remove most recent Goals for Faye" }));
    expect(screen.getByRole("alertdialog", { name: "Remove most recent event?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove event" }));
    await waitFor(async () => expect((await GameSession.open(store)).gameScore(game.id)).toEqual({ own: 0, opposition: 0 }));
    expect(screen.queryByRole("button", { name: "Remove most recent Goals for Faye" })).not.toBeInTheDocument();
  });

  it("scopes drawer events to its selected tab and corrects or deletes them with confirmation", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    const game = await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    await session.recordPlayerStatistic(game.id, { position: "Goal Attack", statistic: "Goals" });
    await session.endQuarter(game.id);
    await session.startNextQuarter(game.id, session.nextQuarterCourt(game.id));
    await session.recordPlayerStatistic(game.id, { position: "Goal Attack", statistic: "Misses" });
    render(<App store={store} />);

    const tabs = await screen.findByRole("tablist", { name: "Match Events tabs" });
    await user.click(within(tabs).getByRole("tab", { name: "Q1" }));
    await user.click(screen.getByRole("button", { name: /Open Event feed/ }));
    expect(screen.getByText("Faye · GA · Goals")).toBeInTheDocument();
    expect(screen.queryByText("Faye · GA · Misses")).not.toBeInTheDocument();
    await user.click(within(tabs).getByRole("tab", { name: "Match" }));
    expect(screen.getByText("Faye · GA · Goals")).toBeInTheDocument();
    expect(screen.getByText("Faye · GA · Misses")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Correct event" })[0]);
    expect(screen.getByRole("dialog", { name: "Correct event" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Event correction statistic"), "Misses");
    await user.click(screen.getByRole("button", { name: "Save event correction" }));
    expect(await screen.findAllByText(/Faye · GA · Misses/)).toHaveLength(2);
    await waitFor(async () => expect((await GameSession.open(store)).gameScore(game.id)).toEqual({ own: 0, opposition: 0 }));
    await user.click(screen.getAllByRole("button", { name: "Remove event" })[0]);
    expect(screen.getByRole("alertdialog", { name: "Delete event?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete event" }));
    expect(await screen.findAllByRole("button", { name: "Remove event" })).toHaveLength(1);
    await waitFor(async () => expect((await GameSession.open(store)).gameScore(game.id)).toEqual({ own: 0, opposition: 0 }));
  });

  it("requires confirmation before abandoning a live Match", async () => {
    const store = new InMemoryGameSessionStore();
    const session = await GameSession.open(store);
    const season = await session.createSeason({ name: "2026 Winter", teamName: "Roses" });
    const opposition = await session.addOpposition({ name: "Thunder" });
    const players = await Promise.all(["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"].map((name) => session.addPlayer({ name })));
    await startLiveMatch(session, season.id, opposition.id, players);
    const user = userEvent.setup();
    render(<App store={store} />);

    await user.click(await screen.findByRole("button", { name: "Record Goals for Faye" }));
    await user.click(await screen.findByRole("button", { name: "More" }));
    await user.click(screen.getByRole("button", { name: "Abandon match" }));
    expect(screen.getByRole("alertdialog", { name: "Abandon this Match?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep recording" }));
    expect(session.matches().find((game) => game.status === "live")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Abandon match" }));
    await user.click(screen.getByRole("button", { name: "Confirm abandonment" }));
    expect(await screen.findByText("READ-ONLY MATCH EVENTS")).toBeInTheDocument();
    expect(screen.getByText(/Abandoned - no winner/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Roses 1 - Thunder 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
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

    await screen.findByText("LIVE MATCH · QUARTER 2");
    expect(screen.queryByText("Quarter 1 review")).not.toBeInTheDocument();
    await user.click(coachNavigation().getByRole("button", { name: "History" }));
    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
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

    await screen.findByRole("button", { name: "Open navigation menu" });
    await user.click(coachNavigation().getByRole("button", { name: "History" }));
    await user.click(screen.getByRole("button", { name: "View Match Events" }));
    expect(await screen.findByText("READ-ONLY MATCH EVENTS")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Match" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("These Match Events are read-only.")).toBeInTheDocument();
    expect(screen.getByText("Roses vs Thunder")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Q1" }));
    expect(screen.getByText("Quarter 1 review")).toBeInTheDocument();
    expect(screen.getByText(/Starting Court/)).toBeInTheDocument();
    expect(screen.getByText(/Goal Attack · Goals: 1/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to History" }));
    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End quarter" })).not.toBeInTheDocument();
  });

  it("opens a terminal Match on its read-only Match tab without a legacy Match Record route", async () => {
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
    await session.finaliseGame(game.id, session.gameScore(game.id));
    await session.advanceToMatchSquad({ seasonId: season.id, oppositionId: opposition.id, date: "2026-09-27" });
    const user = userEvent.setup();
    render(<App store={store} />);

    expect(await screen.findByRole("heading", { name: "Setup Match" })).toBeInTheDocument();
    await user.click(coachNavigation().getByRole("button", { name: "History" }));
    await user.click(await screen.findByRole("button", { name: "View Match Events" }));
    expect(await screen.findByRole("heading", { name: "Match Events" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Match" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("READ-ONLY MATCH EVENTS")).toBeInTheDocument();
    expect(screen.queryByText("Match Record")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End quarter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Opponent goal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record .* for/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Q4" }));
    expect(screen.getByLabelText("Quarter 4 statistics")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Correct event" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove event" })).not.toBeInTheDocument();
    await user.click(coachNavigation().getByRole("button", { name: "Match" }));
    expect(await screen.findByRole("heading", { name: "Setup Match" })).toBeInTheDocument();
  });
});
