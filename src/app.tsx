import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, ArrowRightLeft, Calendar, Check, CheckCircle2, Database, History as HistoryIcon, LayoutDashboard, List, Menu, Power, RotateCcw, Settings as SettingsIcon, Trophy, Users, X } from "lucide-react";
import { GameSession } from "./game-session/game-session";
import { IndexedDbGameSessionStore } from "./game-session/indexed-db-game-session-store";
import { PLAYER_STATISTICS, POSITIONS, SHOOTER_STATISTICS, TOTAL_QUARTERS, type BetweenQuarterStatistics, type CaptureAction, type Game, type GameSessionStore, type LiveQuarterCapture, type StatisticsSummary, type PlayerStatistic, type Position, type QuarterNumber, type SetupSummary, type StartMatchInput, type StartingLineup, type TerminalMatchReport } from "./game-session/types";
import { createMatchCsv, createMatchPdf } from "./reports";
import "./styles.css";

type AppProps = { store?: GameSessionStore };
type MatchView = { kind: "team-setup" } | { kind: "season-setup" } | { kind: "no-match" } | { kind: "match-setup" } | { kind: "court-setup" } | { kind: "settings" } | { kind: "settings-section"; section: "team" | "season" | "backup" } | { kind: "history" } | { kind: "next-quarter-setup"; gameId: string; startingLineup: StartingLineup } | { kind: "game"; gameId: string };
type MatchActions = {
  recordPlayerStatistic: (position: Position, statistic: PlayerStatistic) => Promise<void>;
  recordOppositionGoal: () => Promise<void>;
  undoCaptureAction: () => Promise<void>;
  saveSubstitutions: (lineup: StartingLineup) => Promise<void>;
  endQuarter: () => Promise<void>;
  abandon: () => Promise<void>;
  finalise: (score: { own: number; opposition: number }) => Promise<void>;
  deleteQuarterAction: (quarter: QuarterNumber, actionId: string) => Promise<void>;
  correctQuarterPlayerStatistic: (quarter: QuarterNumber, actionId: string, correction: { playerId: string; position: Position; statistic: PlayerStatistic }) => Promise<void>;
};
const isTerminalMatch = (game: Game) => game.status === "finalised" || game.status === "abandoned" || game.status === "terminated";
const terminalMatchesNewestFirst = (games: Game[]) => games.filter(isTerminalMatch).sort((left, right) => right.date.localeCompare(left.date));
type CompletedQuarterSummary = {
  number: QuarterNumber;
  ownScore: number;
  oppositionScore: number;
  ownGameScore: number;
  oppositionGameScore: number;
  eventCount: number;
};
const completedQuarterSummary = (game: Game, gameScore: { own: number; opposition: number } | undefined, quarterScore: (number: QuarterNumber) => { own: number; opposition: number }): CompletedQuarterSummary | undefined => {
  const quarter = game.quarters?.at(-1);
  if (!quarter || quarter.status !== "ended" || !gameScore) return undefined;
  const score = quarterScore(quarter.number);
  return { number: quarter.number, ownScore: score.own, oppositionScore: score.opposition, ownGameScore: gameScore.own, oppositionGameScore: gameScore.opposition, eventCount: quarter.captureActions.length };
};

export const deriveCurrentView = ({ matchView, setup, liveMatch, latestTerminalMatch, nextQuarterCourt }: { matchView?: MatchView; setup: SetupSummary; liveMatch?: Game; latestTerminalMatch?: Game; nextQuarterCourt: (gameId: string) => StartingLineup }): MatchView => {
  if (matchView) return matchView;
  if (liveMatch) {
    if (!liveMatch.activeQuarter && (liveMatch.quarters?.length ?? 0) < TOTAL_QUARTERS) return { kind: "next-quarter-setup", gameId: liveMatch.id, startingLineup: nextQuarterCourt(liveMatch.id) };
    return { kind: "game", gameId: liveMatch.id };
  }
  if (setup.seasons.some((season) => season.status === "active")) {
    if (setup.matchSetupDraft?.stage === "court-setup") return { kind: "court-setup" };
    if (setup.matchSetupDraft?.stage === "match-squad" || setup.matchSetupDraft?.stage === "match-identity") return { kind: "match-setup" };
    return { kind: "no-match" };
  }
  if (latestTerminalMatch) return { kind: "game", gameId: latestTerminalMatch.id };
  return setup.teams.length > 0 ? { kind: "season-setup" } : { kind: "team-setup" };
};

const download = (filename: string, type: string, content: string | Uint8Array) => {
  const href = URL.createObjectURL(new Blob([typeof content === "string" ? content : new Uint8Array(content).buffer], { type }));
  const link = document.createElement("a");
  link.href = href; link.download = filename; link.click();
  URL.revokeObjectURL(href);
};

const playerLabel = (player: { name: string; nickname?: string }) =>
  player.nickname ? `${player.name} (${player.nickname})` : player.name;
const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const statisticPresentation: Record<PlayerStatistic, { label: string; className: string }> = {
  "Successful Centre Pass Received": { label: "CPR", className: "event-cpr" },
  Tip: { label: "Tip", className: "event-tip" },
  Intercept: { label: "Int", className: "event-int" },
  "Unforced Errors": { label: "UE", className: "event-ue" },
  "Contact Conceded": { label: "Con", className: "event-con" },
  "Obstruction Conceded": { label: "Obs", className: "event-obs" },
  Goals: { label: "Goal", className: "event-goal" },
  Misses: { label: "Miss", className: "event-miss" }
};
const positionAbbreviation: Record<Position, string> = { "Goal Keeper": "GK", "Goal Defence": "GD", "Wing Defence": "WD", Centre: "C", "Wing Attack": "WA", "Goal Attack": "GA", "Goal Shooter": "GS" };
const browserStore = new IndexedDbGameSessionStore();

export function App({ store }: AppProps) {
  const gameSessionStore = store ?? browserStore;
  const [session, setSession] = useState<GameSession>();
  const [setup, setSetup] = useState<SetupSummary>();
  const [message, setMessage] = useState("Preparing your offline workspace…");
  const [error, setError] = useState<string>();
  const [matchView, setMatchView] = useState<MatchView>();
  const [unsavedCourts, setUnsavedCourts] = useState<Record<string, StartingLineup>>({});

  useEffect(() => {
    void GameSession.open(gameSessionStore)
      .then((openedSession) => {
        setSession(openedSession);
        setSetup(openedSession.setup());
        setMessage("");
      })
      .catch(() => setError("Natball Insights could not open its local storage."));
  }, [gameSessionStore]);

  const refresh = () => {
    if (session) setSetup(session.setup());
  };

  const perform = async (action: () => Promise<void>) => {
    try {
      setError(undefined);
      await action();
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong. Please try again.");
    }
  };

  if (!session || !setup) {
    return <main className="app-shell startup-shell">
      <div className="app-top-bar">
        <AppMark />
        <button type="button" className="menu-button" aria-label="Coach navigation is unavailable while local storage opens" disabled><Menu /></button>
        <div className="top-bar-identity"><span>Natball Insights</span><strong>Offline workspace</strong></div>
      </div>
      <div className="app-content">
        <section className={`loading${error ? " storage-error" : ""}`} aria-live="polite">
          <div className="startup-state-card">
            <p className="eyebrow">OFFLINE WORKSPACE</p>
            <h1>{error ? "Local storage unavailable" : "Preparing Natball Insights"}</h1>
            <p>{error ?? message}</p>
            <PrimaryActionBar>
              <button type="button" disabled={!error} onClick={() => window.location.reload()}>{error ? "Retry local storage" : "Preparing offline workspace…"}</button>
            </PrimaryActionBar>
          </div>
        </section>
      </div>
    </main>;
  }
  const activeSeason = setup.seasons.find((season) => season.status === "active");
  const editableTeam = activeSeason ? setup.teams.find((team) => team.id === activeSeason.teamId) : setup.teams.at(-1);
  const liveMatch = session.matches().find((game) => game.status === "live");
  const latestTerminalMatch = terminalMatchesNewestFirst(session.matches())[0];
  const matchSetupDraft = setup.matchSetupDraft;
  const courtSetupDraft = setup.matchSetupDraft?.stage === "court-setup" ? setup.matchSetupDraft : undefined;
  const currentView = deriveCurrentView({ matchView, setup, liveMatch, latestTerminalMatch, nextQuarterCourt: (gameId) => session.nextQuarterCourt(gameId) });
  const selectedTerminalMatch = currentView.kind === "game" ? session.match(currentView.gameId) : undefined;
  const navigationView = currentView.kind === "history" ? "history" : currentView.kind === "settings" || currentView.kind === "settings-section" ? "settings" : "match";
  const terminalMatchTitle = selectedTerminalMatch && isTerminalMatch(selectedTerminalMatch)
    ? `${selectedTerminalMatch.teamName ?? "Team"} vs ${setup.opposition.find((opposition) => opposition.id === selectedTerminalMatch.oppositionId)?.name ?? "Opposition"}`
    : undefined;
  const navigationTitle = navigationView === "history" ? "Match History" : navigationView === "settings" ? "Dashboard Settings" : liveMatch ? `${editableTeam?.name ?? "Team"} vs ${setup.activeOpposition.find((opposition) => opposition.id === liveMatch.oppositionId)?.name ?? "Opposition"}` : terminalMatchTitle ?? "Pre-Match Setup";
  const liveScore = liveMatch ? session.gameScore(liveMatch.id) : undefined;
  const liveQuarterScore = liveMatch?.activeQuarter ? session.quarterScore(liveMatch.id, liveMatch.activeQuarter) : undefined;

  return <main className="app-shell">
    <CoachNavigation
      activeView={navigationView}
      title={navigationTitle}
      score={navigationView === "match" ? liveScore : undefined}
      quarterScore={navigationView === "match" ? liveQuarterScore : undefined}
      quarterNumber={navigationView === "match" ? liveMatch?.activeQuarter : undefined}
      onRecordOppositionGoal={liveMatch ? () => perform(() => session.recordOppositionGoal(liveMatch.id)) : undefined}
      onOpenMatch={() => setMatchView(undefined)}
      onOpenHistory={() => setMatchView({ kind: "history" })}
      onOpenSettings={() => setMatchView({ kind: "settings" })}
    />
    <div className="app-content">
    {error && <p className="error" role="alert">{error}</p>}
    {currentView.kind === "team-setup" && <section className="match-area focused-screen setup-screen setup-flow-screen" aria-labelledby="team-setup-title">
      <div className="setup-flow-card">
        <SetupFlowHeading icon="team" step="STEP 1 OF 4" title="Setup Team" />
        <TeamForm initialName={setup.teams.at(-1)?.name} submitLabel="Next: Setup Season" onSubmit={(input) => perform(async () => { const team = setup.teams.at(-1); if (team) await session.renameTeam(team.id, input); else await session.createTeam(input); setMatchView({ kind: "season-setup" }); })} />
      </div>
    </section>}

    {currentView.kind === "season-setup" && <section className="match-area focused-screen setup-screen setup-flow-screen" aria-labelledby="season-setup-title">
      <div className="setup-flow-card">
        <SetupFlowHeading icon="season" step="STEP 2 OF 4" title="Setup Season" />
        <SeasonForm team={setup.teams.at(-1)!} submitLabel="Next: Setup Match & Squad" cancelLabel="Back" onCancel={() => setMatchView({ kind: "team-setup" })} onSubmit={(input) => perform(async () => { await session.createSeason(input); setMatchView(undefined); })} />
      </div>
    </section>}

    {currentView.kind === "settings" && <section className="match-area focused-screen management-screen settings-root" aria-labelledby="settings-title">
      <p className="eyebrow">COACH SETTINGS</p><h2 id="settings-title">Settings</h2><p>Manage your Team, Season, offline data, and active Match safely.</p>
      <div className="settings-card-grid">
        {editableTeam && <SettingsCard icon={<Users />} title="Team profile" description="Update the reusable Team name used by this Season and future Seasons."><button type="button" className="text-button" onClick={() => setMatchView({ kind: "settings-section", section: "team" })}>Edit team</button></SettingsCard>}
        <SettingsCard icon={<Calendar />} title="Season" description={activeSeason ? `${activeSeason.name} is the active Season.` : "No active Season is available."}>
          {activeSeason && <button type="button" className="text-button" onClick={() => setMatchView({ kind: "settings-section", section: "season" })}>Edit season</button>}
        </SettingsCard>
        {activeSeason && <SettingsCard icon={<Power />} title="End season" description={liveMatch ? "A Season cannot end while a live Match is in progress." : "End this Season once every Match is terminal. Ended Seasons remain readable."}><button type="button" className="text-button" disabled={Boolean(liveMatch)} onClick={() => setMatchView({ kind: "settings-section", section: "season" })}>End season</button></SettingsCard>}
        <SettingsCard icon={<Database />} title="Backup & restore" description="Export every saved record or restore a valid Natball Insights backup."><button type="button" className="text-button" onClick={() => setMatchView({ kind: "settings-section", section: "backup" })}>Backup & restore</button></SettingsCard>
        {liveMatch && <SettingsCard icon={<AlertTriangle />} title="Abandon active Match" description="End the live Match safely. Its recorded score, events, and statistics remain available read-only." tone="danger"><AbandonMatchAction onAbandon={() => perform(async () => { await session.abandonGame(liveMatch.id); setMatchView({ kind: "game", gameId: liveMatch.id }); })} /></SettingsCard>}
      </div>
    </section>}
    {currentView.kind === "settings-section" && currentView.section === "backup" && <section className="match-area focused-screen management-screen" aria-labelledby="settings-section-title"><div className="section-heading"><h2 id="settings-section-title">Backup & restore</h2><button className="text-button" onClick={() => setMatchView({ kind: "settings" })}>Back to Settings</button></div><BackupCard exportBackup={() => session.exportBackup()} onImport={(serialized, mode, confirmed) => perform(async () => { await session.importBackup(serialized, mode, confirmed); if (mode === "replace") setUnsavedCourts({}); })} /></section>}

    {currentView.kind === "settings-section" && currentView.section !== "backup" && <section className="match-area focused-screen setup-screen setup-flow-screen settings-setup-screen" aria-labelledby={currentView.section === "team" ? "team-setup-title" : "season-setup-title"}><div className="setup-flow-card">{currentView.section === "team" && editableTeam && <><SetupFlowHeading icon="team" step="STEP 1 OF 4" title="Setup Team" /><TeamForm initialName={editableTeam.name} submitLabel="Save changes" cancelLabel="Cancel" onCancel={() => setMatchView({ kind: "settings" })} onSubmit={(input) => perform(async () => { await session.renameTeam(editableTeam.id, input); setMatchView({ kind: "settings" }); })} /></>}{currentView.section === "season" && activeSeason && <><SetupFlowHeading icon="season" step="STEP 2 OF 4" title="Setup Season" /><SeasonForm team={setup.teams.find((team) => team.id === activeSeason.teamId)!} initialName={activeSeason.name} submitLabel="Save changes" cancelLabel="Cancel" onCancel={() => setMatchView({ kind: "settings" })} onSubmit={(input) => perform(async () => { await session.renameSeason(activeSeason.id, input); setMatchView({ kind: "settings" }); })} seasonLifecycleControl={!liveMatch ? <EndSeasonControl season={activeSeason} onConfirm={() => perform(async () => { await session.endSeason(activeSeason.id); setMatchView(undefined); })} /> : undefined} /></>}</div></section>}

    {currentView.kind === "no-match" && activeSeason && <section className="match-area focused-screen no-match-screen" aria-labelledby="no-match-title"><div className="no-match-card"><div className="no-match-icon" aria-hidden="true"><MatchIcon /></div><p className="eyebrow">ACTIVE SEASON</p><h2 id="no-match-title">No Match in progress</h2><p><strong>{activeSeason.name}</strong> is ready for your next Match. Add an Opposition and date when you are ready to prepare.</p><button type="button" onClick={() => setMatchView({ kind: "match-setup" })}>Start Match setup</button></div></section>}

    {currentView.kind === "match-setup" && activeSeason && <section className="match-area focused-screen setup-screen prototype-setup-screen" aria-labelledby="match-setup-title"><MatchSetupForm opposition={setup.activeOpposition} players={setup.players} draft={matchSetupDraft} onAddOpposition={async (input) => { const opponent = await session.addOpposition(input); refresh(); return opponent; }} onAddPlayer={async (input) => { const player = await session.addPlayer(input); refresh(); return player; }} onSave={(input) => perform(async () => { if (input.oppositionId && input.date) await session.saveMatchSquad({ seasonId: activeSeason.id, oppositionId: input.oppositionId, date: input.date, squadPlayerIds: input.squadPlayerIds }); else await session.saveMatchIdentity({ seasonId: activeSeason.id, oppositionId: input.oppositionId, date: input.date, squadPlayerIds: input.squadPlayerIds }); })} onProceed={(input) => perform(async () => { await session.advanceToCourtSetup({ seasonId: activeSeason.id, ...input }); setMatchView({ kind: "court-setup" }); })} onBack={() => setMatchView({ kind: "no-match" })} /></section>}
    {currentView.kind === "court-setup" && courtSetupDraft && <QuarterSetupCard match={courtSetupDraft} startingLineup={unsavedCourts["court-setup"] ?? {}} quarterNumber={1} setup={setup} mode="starting" onLineupChange={(lineup) => setUnsavedCourts((courts) => ({ ...courts, "court-setup": lineup }))} onReturnToMatchSetup={() => perform(async () => { await session.saveMatchSquad(courtSetupDraft); setMatchView({ kind: "match-setup" }); })} onStart={async (startingLineup) => {
        let started = false;
        await perform(async () => {
          const game = await session.startMatch({ ...courtSetupDraft, startingLineup });
          started = true;
          setMatchView({ kind: "game", gameId: game.id });
        });
        if (started) setUnsavedCourts((courts) => { const { "court-setup": _, ...remaining } = courts; return remaining; });
      }} />}
      {currentView?.kind === "next-quarter-setup" && (() => {
        const game = session.match(currentView.gameId);
        if (!game) return null;
        const quarterNumber = (game.quarters?.length ?? 0) + 1;
        const courtKey = `${game.id}:${quarterNumber}`;
        return <QuarterSetupCard match={game} startingLineup={unsavedCourts[courtKey] ?? currentView.startingLineup} quarterNumber={quarterNumber} setup={setup} statistics={game.activeQuarter ? undefined : session.betweenQuarterStatistics(game.id)} onReviewPreviousQuarter={() => setMatchView({ kind: "game", gameId: game.id })} onLineupChange={(lineup) => setUnsavedCourts((courts) => ({ ...courts, [courtKey]: lineup }))} onStart={async (startingLineup) => {
          let started = false;
          await perform(async () => {
            await session.startNextQuarter(game.id, startingLineup);
            started = true;
            setMatchView({ kind: "game", gameId: game.id });
          });
          if (started) setUnsavedCourts((courts) => { const { [courtKey]: _, ...remaining } = courts; return remaining; });
        }} />;
      })()}
      {currentView?.kind === "history" && <MatchHistory games={session.matches()} scores={new Map(session.matches().map((game) => [game.id, session.gameScore(game.id)]))} setup={setup} onOpen={(gameId) => setMatchView({ kind: "game", gameId })} />}
      {session.matches().map((game) => currentView?.kind === "game" && currentView.gameId === game.id && <MatchCard
        key={game.id}
        game={game}
        setup={setup}
        capture={game.status === "live" && game.activeQuarter ? session.liveQuarter(game.id) : undefined}
        quarterCapture={(quarter) => session.quarterCapture(game.id, quarter)}
        score={game.status === "live" ? session.gameScore(game.id) : undefined}
        report={game.status === "finalised" || game.status === "abandoned" || game.status === "terminated" ? session.terminalMatchReport(game.id) : undefined}
        summary={(selection) => session.statisticsSummary(game.id, selection)}
        quarterScore={(quarter) => session.quarterScore(game.id, quarter)}
        actions={{
          recordPlayerStatistic: (position, statistic) => perform(() => session.recordPlayerStatistic(game.id, { position, statistic })),
          recordOppositionGoal: () => perform(() => session.recordOppositionGoal(game.id)),
          undoCaptureAction: () => perform(() => session.undoLastCaptureAction(game.id)),
          saveSubstitutions: (lineup) => perform(() => session.saveSubstitutions(game.id, lineup)),
          endQuarter: () => perform(async () => {
            const completedQuarter = game.activeQuarter;
            await session.endQuarter(game.id);
            if (completedQuarter) setMatchView({ kind: "game", gameId: game.id });
          }),
          abandon: () => perform(async () => { await session.abandonGame(game.id); setMatchView({ kind: "game", gameId: game.id }); }),
          finalise: (score) => perform(async () => { await session.finaliseGame(game.id, score); setMatchView({ kind: "game", gameId: game.id }); }),
          deleteQuarterAction: (quarter, actionId) => perform(() => session.deleteCaptureAction(game.id, quarter, actionId)),
          correctQuarterPlayerStatistic: (quarter, actionId, correction) => perform(() => session.correctPlayerStatistic(game.id, quarter, actionId, correction))
        }}
        onOpenHistory={() => setMatchView({ kind: "history" })}
        onSetUpNextQuarter={() => setMatchView({ kind: "next-quarter-setup", gameId: game.id, startingLineup: session.nextQuarterCourt(game.id) })}
      />)}
    </div>
  </main>;
}

function CoachNavigation({ activeView, title, score, quarterScore, quarterNumber, onRecordOppositionGoal, onOpenMatch, onOpenHistory, onOpenSettings }: { activeView?: "match" | "history" | "settings"; title: string; score?: { own: number; opposition: number }; quarterScore?: { own: number; opposition: number }; quarterNumber?: QuarterNumber; onRecordOppositionGoal?: () => void; onOpenMatch: () => void; onOpenHistory: () => void; onOpenSettings: () => void }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const items: Array<{ key: "match" | "history" | "settings"; label: string; icon: ReactNode; onClick: () => void }> = [
    { key: "match" as const, label: "Match", icon: <LayoutDashboard aria-hidden="true" />, onClick: onOpenMatch },
    { key: "history" as const, label: "History", icon: <HistoryIcon aria-hidden="true" />, onClick: onOpenHistory },
    { key: "settings" as const, label: "Settings", icon: <SettingsIcon aria-hidden="true" />, onClick: onOpenSettings }
  ];

  const closeDrawer = () => {
    setDrawerOpen(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  };

  useEffect(() => {
    if (!drawerOpen) return;
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [drawerOpen]);

  const trapDrawerFocus = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || !drawer.current) return;
    const focusable = [...drawer.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <>
    <header className="app-top-bar">
      <AppMark />
      <button ref={menuButton} type="button" className="menu-button" aria-label="Open coach navigation" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><Menu /></button>
      <div className="top-bar-identity"><span>Natball Insights</span><strong>{title}</strong></div>
      {score && <div className="top-bar-score" role="group" aria-label={`Live score ${score.own} to ${score.opposition}`}>{quarterNumber && quarterScore && <small>Q{quarterNumber} {quarterScore.own} – {quarterScore.opposition}</small>}<span>{score.own} – {score.opposition}</span>{onRecordOppositionGoal && <button type="button" className="opposition-goal top-bar-opposition-goal" aria-label="Add opposition goal" onClick={onRecordOppositionGoal}>+ Opp Goal</button>}</div>}
    </header>
    {drawerOpen && <div className="navigation-overlay" onMouseDown={closeDrawer}>
      <aside ref={drawer} className="navigation-drawer" role="dialog" aria-modal="true" aria-label="Coach navigation" onKeyDown={trapDrawerFocus} onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-heading"><div className="app-identity"><AppMark /><span><strong>Natball</strong><small>Insights</small></span></div><button ref={closeButton} type="button" className="drawer-close" aria-label="Close coach navigation" onClick={closeDrawer}><X /></button></div>
        <nav aria-label="Coach navigation">{items.map((item) => <button key={item.key} type="button" className="drawer-navigation-item" aria-current={activeView === item.key ? "page" : undefined} onClick={() => { item.onClick(); closeDrawer(); }}>{item.icon}<span>{item.label}</span></button>)}</nav>
      </aside>
    </div>}
  </>;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function AppMark() {
  return <svg className="app-mark" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16" /><path d="M8 24h32M24 8c5 5 8 10 8 16s-3 11-8 16M24 8c-5 5-8 10-8 16s3 11 8 16M10 34l8-8 6 6 12-12" /></svg>;
}

const matchStatusLabel = (game: Game) => game.outcome?.kind === "completed" ? "Completed" : "Abandoned";

const terminalOutcomeLabel = (game: Game, score: { own: number; opposition: number }) => {
  if (game.outcome?.kind === "completed") return score.own === score.opposition ? "Draw" : score.own > score.opposition ? "Won" : "Lost";
  if (game.outcome?.kind === "terminated") return "Legacy record";
  return "Abandoned · no winner";
};

function MatchHistory({ games, scores, setup, onOpen }: { games: Game[]; scores: Map<string, { own: number; opposition: number }>; setup: SetupSummary; onOpen: (gameId: string) => void }) {
  const terminalMatches = terminalMatchesNewestFirst(games);
  const seasons = [...setup.seasons].reverse();
  const initiallyExpandedSeason = setup.seasons.find((season) => season.status === "active")?.id ?? setup.seasons.at(-1)?.id;

  return <section className="match-area focused-screen management-screen match-history" aria-labelledby="match-history-title"><div className="section-heading"><div><p className="eyebrow">HISTORY</p><h2 id="match-history-title">History</h2></div></div>{seasons.map((season) => {
    const matches = terminalMatches.filter((game) => game.seasonId === season.id).sort((left, right) => right.date.localeCompare(left.date));
    return <details key={season.id} className="season-history-group" aria-label={`${season.name} History`} open={season.id === initiallyExpandedSeason}><summary><span>{season.name}</span><span>{matches.length} terminal {matches.length === 1 ? "Match" : "Matches"}</span></summary>{matches.length ? <ul className="match-list" aria-label={`${season.name} terminal Matches`}>{matches.map((game) => {
      const score = game.finalScore ?? scores.get(game.id)!;
      const teamName = game.teamName ?? setup.teams.find((team) => team.id === season.teamId)?.name ?? "Team";
      const oppositionName = setup.opposition.find((opposition) => opposition.id === game.oppositionId)?.name ?? "Unknown Opposition";
      return <li key={game.id} className="history-card" data-status={game.status}><div className="history-card-copy"><strong>{teamName} <span aria-hidden="true">vs</span> {oppositionName}</strong><p className="history-card-date">{game.date}</p></div><div className="history-card-result"><strong>{score.own} – {score.opposition}</strong><p>{terminalOutcomeLabel(game, score)}</p><span className="sr-only">{matchStatusLabel(game)} · {score.own} – {score.opposition}</span><button className="text-button" onClick={() => onOpen(game.id)}>View Match Events</button></div></li>;
    })}</ul> : <p className="empty-history">No terminal Matches in this Season.</p>}</details>;
  })}</section>;
}

function SetupFlowHeading({ icon, step, title }: { icon: "team" | "season"; step: string; title: string }) {
  return <div className={`setup-flow-heading setup-flow-heading-${icon}`}><span className="setup-flow-icon" aria-hidden="true">{icon === "team" ? <TeamIcon /> : <SeasonIcon />}</span><div><p className="setup-flow-step">{step}</p><h2 id={icon === "team" ? "team-setup-title" : "season-setup-title"}>{title}</h2></div></div>;
}

function TeamIcon() {
  return <svg viewBox="0 0 24 24"><path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /></svg>;
}

function SeasonIcon() {
  return <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></svg>;
}

function MatchIcon() {
  return <svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM5 10h14M12 4v16M8 7h.01M16 17h.01" /></svg>;
}

function TeamForm({ initialName = "", submitLabel = "Save team", cancelLabel, onCancel, onSubmit }: { initialName?: string; submitLabel?: string; cancelLabel?: string; onCancel?: () => void; onSubmit: (input: { name: string }) => Promise<void> }) {
  const [name, setName] = useState(initialName);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ name });
  };
  return <form className="setup-form" onSubmit={(event) => void submit(event)}>
    <label>Team name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your team" /></label>
    <PrimaryActionBar>{cancelLabel && <button type="button" className="secondary-button" onClick={onCancel}>{cancelLabel}</button>}<button type="submit" disabled={!name.trim() || name.trim() === initialName}>{submitLabel}</button></PrimaryActionBar>
  </form>;
}

function SeasonForm({ team, initialName = "", submitLabel = "Create season", cancelLabel, onCancel, onSubmit, seasonLifecycleControl }: { team: SetupSummary["teams"][number]; initialName?: string; submitLabel?: string; cancelLabel?: string; onCancel?: () => void; onSubmit: (input: { name: string; teamId: string }) => Promise<void>; seasonLifecycleControl?: ReactNode }) {
  const [name, setName] = useState(initialName);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ name, teamId: team.id });
    setName("");
  };
  return <form className="setup-form" onSubmit={(event) => void submit(event)}>
    <label>Season title<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Winter 2026 League" /></label>
    <p><strong>Team:</strong> {team.name}</p>{seasonLifecycleControl}
    <PrimaryActionBar>{cancelLabel && <button type="button" className="secondary-button" onClick={onCancel}>{cancelLabel}</button>}<button type="submit" disabled={!name.trim() || name.trim() === initialName}>{submitLabel}</button></PrimaryActionBar>
  </form>;
}

function SettingsCard({ icon, title, description, children, tone }: { icon: ReactNode; title: string; description: string; children: ReactNode; tone?: "danger" }) {
  return <article className={`settings-card${tone === "danger" ? " settings-card-danger" : ""}`}><h3><span className="settings-card-icon" aria-hidden="true">{icon}</span>{title}</h3><p>{description}</p><div className="settings-card-actions">{children}</div></article>;
}

function EndSeasonControl({ season, onConfirm }: { season: { name: string }; onConfirm: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  return <div className="season-ending"><p><strong>{season.name}</strong> is active. End it only after every Match is terminal; ended seasons remain readable.</p>{confirming ? <DestructiveConfirmation title="End this Season?" description={`End ${season.name}? This makes the Season read-only and cannot be undone.`} cancelLabel="Keep season active" confirmLabel="Confirm end season" onCancel={() => setConfirming(false)} onConfirm={onConfirm} /> : <button type="button" className="secondary-button" onClick={() => setConfirming(true)}>End season</button>}</div>;
}

function PlayerForm({ onSubmit }: { onSubmit: (input: { name: string; nickname?: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ name, nickname });
    setName(""); setNickname("");
  };
  return <form onSubmit={(event) => void submit(event)}>
    <label>Player name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Player name" /></label>
    <label>Nickname <span className="optional">optional</span><input aria-label="Nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Courtside name" /></label>
    <button type="submit">Add player</button>
  </form>;
}

function OppositionForm({ onSubmit }: { onSubmit: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit(name);
    setName("");
  };
  return <form onSubmit={(event) => void submit(event)}>
    <label>Opposition name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Opposition team" /></label>
    <button type="submit">Add opposition</button>
  </form>;
}

function PrimaryActionBar({ children }: { children: ReactNode }) {
  return <div className="primary-action-bar" role="group" aria-label="Primary action">{children}</div>;
}

function MatchSetupProgress({ current }: { current: "setup" | "court" }) {
  const steps = [{ key: "setup", label: "Setup Match" }, { key: "court", label: "Court setup" }] as const;
  const currentIndex = steps.findIndex((step) => step.key === current);
  return <div className="match-setup-progress" role="group" aria-label="Match setup progress"><p className="eyebrow">STEP {current === "setup" ? 3 : 4} OF 4</p><ol>{steps.map((step, index) => <li key={step.key} data-state={index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming"}>{step.label}</li>)}</ol></div>;
}

function MatchSetupForm({ opposition, players, draft, onAddOpposition, onAddPlayer, onSave, onProceed, onBack }: { opposition: SetupSummary["activeOpposition"]; players: SetupSummary["players"]; draft?: { oppositionId?: string; date?: string; squadPlayerIds?: string[] }; onAddOpposition: (input: { name: string }) => Promise<{ id: string }>; onAddPlayer: (input: { name: string }) => Promise<{ id: string }>; onSave: (input: { oppositionId?: string; date?: string; squadPlayerIds: string[] }) => Promise<void>; onProceed: (input: { oppositionId: string; date: string; squadPlayerIds: string[] }) => Promise<void>; onBack: () => void }) {
  const [oppositionId, setOppositionId] = useState(draft?.oppositionId ?? "");
  const [oppositionSearch, setOppositionSearch] = useState("");
  const [date, setDate] = useState(draft?.date ?? "");
  const [newOppositionName, setNewOppositionName] = useState("");
  const [playerIds, setPlayerIds] = useState(draft?.squadPlayerIds ?? []);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const matchingOpposition = opposition.filter((opponent) => opponent.name.toLocaleLowerCase().includes(oppositionSearch.trim().toLocaleLowerCase()));
  const matchingPlayers = players.filter((player) => playerLabel(player).toLocaleLowerCase().includes(playerSearch.trim().toLocaleLowerCase()));
  const saveDraft = (next: { oppositionId?: string; date?: string; squadPlayerIds?: string[] }) => void onSave({ oppositionId, date, squadPlayerIds: playerIds, ...next });
  const addOpposition = async () => {
    const opposition = await onAddOpposition({ name: newOppositionName });
    setOppositionId(opposition.id);
    setOppositionSearch("");
    setNewOppositionName("");
    await onSave({ oppositionId: opposition.id, date, squadPlayerIds: playerIds });
  };
  const updatePlayers = (next: string[]) => { setPlayerIds(next); saveDraft({ squadPlayerIds: next }); };
  const addPlayer = async () => {
    const player = await onAddPlayer({ name: newPlayerName });
    const next = playerIds.includes(player.id) ? playerIds : [...playerIds, player.id];
    updatePlayers(next);
    setNewPlayerName("");
  };
  return <form className="match-form setup-form prototype-setup-form" onSubmit={(event) => { event.preventDefault(); if (oppositionId && date && playerIds.length >= 5) void onProceed({ oppositionId, date, squadPlayerIds: playerIds }); }}>
    <div className="prototype-setup-heading">
      <div className="prototype-setup-title"><div className="prototype-setup-icon" aria-hidden="true"><Trophy /></div><div><p className="eyebrow">STEP 3 OF 4</p><h2 id="match-setup-title">Setup Match &amp; Squad</h2></div></div>
      <span className="squad-limit">{playerIds.length} / 12 Squad Max</span>
    </div>
    <div className="match-setup-panels">
      <section className="match-setup-panel" aria-labelledby="match-details-title"><h3 id="match-details-title">Match Details</h3><div className="match-details-fields" role="group" aria-label="Saved Oppositions">
        <label>Search opposition history<input type="search" value={oppositionSearch} onChange={(event) => setOppositionSearch(event.target.value)} placeholder="Find an Opposition" /></label>
        <label>Opposition<select value={oppositionId} onChange={(event) => { const next = event.target.value; setOppositionId(next); saveDraft({ oppositionId: next || undefined }); }}><option value="">Select Opposition</option>{matchingOpposition.map((opponent) => <option key={opponent.id} value={opponent.id}>{opponent.name}</option>)}</select></label>
        <label>Match date<input type="date" value={date} onChange={(event) => { const next = event.target.value; setDate(next); saveDraft({ date: next || undefined }); }} /></label>
      </div><div className="inline-add" role="group" aria-label="Add a new Opposition"><label>New opposition name<input value={newOppositionName} onChange={(event) => setNewOppositionName(event.target.value)} placeholder="Opposition team" /></label><button type="button" disabled={!newOppositionName.trim()} onClick={() => void addOpposition()}>Add opposition to match</button></div></section>
      <section className="match-setup-panel" aria-labelledby="add-player-title"><h3 id="add-player-title">Add Player to Squad</h3><div className="add-player-panel" aria-label="Add a player to this Match Squad"><label>New player name<input value={newPlayerName} onChange={(event) => setNewPlayerName(event.target.value)} placeholder="Player name" /></label><button type="button" disabled={!newPlayerName.trim() || playerIds.length === 12} onClick={() => void addPlayer()}>Add player to Match Squad</button></div></section>
    </div>
    <fieldset className="squad-picker" aria-label={`Match Squad ${playerIds.length}/12 selected`}><legend className="sr-only">Match Squad {playerIds.length}/12 selected</legend><div className="squad-roster-heading"><h3>Match Squad Roster ({playerIds.length} / 12)</h3><span>{playerIds.length} / 12 Squad Max</span></div>{playerIds.length > 0 && <div className="selected-player-chips" role="group" aria-label="Selected Match Squad">{players.filter((player) => playerIds.includes(player.id)).map((player) => <button key={player.id} type="button" className="player-chip" onClick={() => updatePlayers(playerIds.filter((id) => id !== player.id))}>Remove {playerLabel(player)} from Match Squad</button>)}</div>}<label className="player-search">Search players<input type="search" value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Find a Player" /></label><div className="player-picker-results">{matchingPlayers.map((player) => <label key={player.id} className="player-check"><input type="checkbox" checked={playerIds.includes(player.id)} onChange={() => updatePlayers(playerIds.includes(player.id) ? playerIds.filter((id) => id !== player.id) : [...playerIds, player.id])} disabled={!playerIds.includes(player.id) && playerIds.length === 12} />{playerLabel(player)}</label>)}{matchingPlayers.length === 0 && <p className="picker-empty">No Players match this search.</p>}</div></fieldset>
    <PrimaryActionBar><button type="button" className="secondary-button prototype-back" onClick={onBack}><ArrowLeft aria-hidden="true" />Back</button><button type="submit" disabled={!oppositionId || !date || playerIds.length < 5}>Next: Setup Quarter<ArrowRight aria-hidden="true" /></button></PrimaryActionBar>
  </form>;
}

function QuarterSetupCard({ match, startingLineup, quarterNumber, setup, statistics, onLineupChange, onStart, onReturnToMatchSetup, onReviewPreviousQuarter, mode = "next-quarter" }: { match: Pick<StartMatchInput, "date" | "oppositionId" | "squadPlayerIds">; startingLineup: StartingLineup; quarterNumber: number; setup: SetupSummary; statistics?: BetweenQuarterStatistics; onLineupChange?: (lineup: StartingLineup) => void; onStart: (startingLineup: StartingLineup) => Promise<void>; onReturnToMatchSetup?: () => void; onReviewPreviousQuarter?: () => void; mode?: "starting" | "next-quarter" | "substitution" }) {
  const [lineup, setLineup] = useState<StartingLineup>(() => Object.fromEntries(Object.entries(startingLineup).filter(([, playerId]) => match.squadPlayerIds.includes(playerId))) as StartingLineup);
  const squad = setup.players.filter((player) => match.squadPlayerIds.includes(player.id));
  const assignedPlayerIds = Object.values(lineup).filter(Boolean);
  const assignedPlayers = assignedPlayerIds.length;
  const canStart = assignedPlayers >= 5 && new Set(assignedPlayerIds).size === assignedPlayers;
  const hasChanges = POSITIONS.some((position) => lineup[position] !== startingLineup[position]);
  const startAction = mode === "substitution" ? "Save substitutions" : quarterNumber === 1 ? "Start Match" : `Start Quarter ${quarterNumber}`;
  const readiness = canStart
    ? `Court ready — ${assignedPlayers} Players assigned.${mode === "substitution" ? " Save the changed Positions when ready." : ` You can start Quarter ${quarterNumber}.`}`
    : `Assign ${5 - assignedPlayers} more ${5 - assignedPlayers === 1 ? "Player" : "Players"} to ${mode === "substitution" ? "save substitutions" : `start Quarter ${quarterNumber}`}.`;
  const updatePosition = (position: Position, playerId: string) => {
    const withoutPreviousPosition = playerId ? Object.fromEntries(Object.entries(lineup).filter(([assignedPosition, assignedPlayerId]) => assignedPosition === position || assignedPlayerId !== playerId)) as StartingLineup : lineup;
    const next = playerId ? { ...withoutPreviousPosition, [position]: playerId } : (() => { const { [position]: _, ...remaining } = lineup; return remaining; })();
    setLineup(next);
    onLineupChange?.(next);
  };
  const title = mode === "substitution" ? "Stage substitutions" : `Quarter ${quarterNumber} Lineup Selection`;
  return <section className="draft-card quarter-planner prototype-quarter-planner" aria-labelledby="quarter-setup-title"><div className="prototype-quarter-heading"><div><p className="eyebrow">{mode === "substitution" ? "SUBSTITUTION" : "STEP 4 OF 4"}</p><h2 id="quarter-setup-title">{title}</h2></div><span>Assign On-Court Positions</span></div><div className="quarter-planner-bento"><div className="quarter-court"><div className="section-heading"><div><h3>{mode === "substitution" ? "Current Court" : mode === "starting" ? "Starting Court" : "Next Court"}</h3><p className="court-guidance">Assign a Match Squad Player to each Position. Moving a Player leaves their previous Position vacant; up to two Positions may be vacant.</p></div><p className="court-count">{assignedPlayers}/7 assigned</p></div><p className={`court-readiness ${canStart ? "is-ready" : ""}`} role="status">{readiness}</p><div className="lineup-grid" aria-label="Court Positions">{POSITIONS.map((position) => <label key={position} className="court-position"><span className="position-badge">{positionAbbreviation[position]}</span><span className="position-name">{position}</span><select aria-label={position} value={lineup[position] ?? ""} onChange={(event) => updatePosition(position, event.target.value)}><option value="">Vacant position</option>{squad.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label>)}</div></div>{statistics ? <aside className="quarter-statistics"><BetweenQuarterStatisticsPanel statistics={statistics} players={setup.players} />{onReviewPreviousQuarter && <button type="button" className="text-button" onClick={onReviewPreviousQuarter}>Review previous Quarter on Match Events</button>}</aside> : onReviewPreviousQuarter && <aside className="quarter-statistics"><h3>Review the previous Quarter</h3><p>Statistics remain on Match Events while you prepare the next Court.</p><button type="button" className="text-button" onClick={onReviewPreviousQuarter}>Review previous Quarter on Match Events</button></aside>}</div><PrimaryActionBar>{onReturnToMatchSetup && <button type="button" className="secondary-button prototype-back" onClick={onReturnToMatchSetup}><ArrowLeft aria-hidden="true" />Back to Setup Match</button>}<button disabled={!canStart || mode === "substitution" && !hasChanges} onClick={() => void onStart(lineup)}><Check aria-hidden="true" />{startAction}</button></PrimaryActionBar></section>;
}

function BetweenQuarterStatisticsPanel({ statistics, players }: { statistics: BetweenQuarterStatistics; players: SetupSummary["players"] }) {
  const [view, setView] = useState<"previous" | "match">("previous");
  const stints = view === "previous" ? statistics.previousQuarterStints : statistics.matchStints;
  const title = view === "previous" ? "Previous quarter statistics" : "All Match statistics";
  return <section className="between-quarter-statistics" aria-labelledby="between-quarter-statistics-title"><div className="section-heading"><div><h3 id="between-quarter-statistics-title">{title}</h3><p>{view === "previous" ? `Quarter ${statistics.previousQuarter}` : "All completed quarters"}</p></div><button type="button" className="text-button" onClick={() => setView(view === "previous" ? "match" : "previous")}>{view === "previous" ? "All Match" : "Previous quarter"}</button></div><ul>{stints.map((stint) => <li key={`${stint.playerId}:${stint.position}`}><strong>{playerLabel(players.find((player) => player.id === stint.playerId) ?? { name: "Unknown player" })}</strong> · {positionAbbreviation[stint.position]} · {stint.playerStatistics.length ? stint.playerStatistics.map((statistic) => `${statisticPresentation[statistic.statistic].label}: ${statistic.count}`).join(" · ") : "No events"}</li>)}</ul></section>;
}

function MatchCard({ game, setup, capture, quarterCapture, score, report, summary, quarterScore, actions, onOpenHistory, onSetUpNextQuarter }: { game: Game; setup: SetupSummary; capture?: LiveQuarterCapture; quarterCapture: (quarter: QuarterNumber) => LiveQuarterCapture; score?: { own: number; opposition: number }; report?: TerminalMatchReport; summary: (selection: { scope: "match" } | { scope: "quarter"; quarter: QuarterNumber }) => StatisticsSummary; quarterScore: (quarter: QuarterNumber) => { own: number; opposition: number }; actions: MatchActions; onOpenHistory: () => void; onSetUpNextQuarter: () => void }) {
  const defaultTab = report || game.quarters?.length === TOTAL_QUARTERS && !game.activeQuarter ? "match" : game.activeQuarter ?? game.quarters?.at(-1)?.number ?? "match";
  const [tab, setTab] = useState<QuarterNumber | "match">(defaultTab);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reviewedQuarter, setReviewedQuarter] = useState<QuarterNumber>();
  const totalEventCount = game.quarters?.reduce((count, quarter) => count + quarter.captureActions.length, 0) ?? 0;
  const previousEventCount = useRef(totalEventCount);
  const [unreadEventCount, setUnreadEventCount] = useState(0);
  useEffect(() => setTab(defaultTab), [defaultTab]);
  useEffect(() => {
    if (totalEventCount > previousEventCount.current && !drawerOpen) setUnreadEventCount((count) => count + totalEventCount - previousEventCount.current);
    previousEventCount.current = totalEventCount;
  }, [drawerOpen, totalEventCount]);
  const availableTabs = summary({ scope: "match" }).availableTabs;
  const selectedSummary = tab === "match" ? summary({ scope: "match" }) : summary({ scope: "quarter", quarter: tab });
  const selectedIsLive = game.status === "live" && tab === game.activeQuarter && capture;
  const readOnlyCapture = game.status === "live" && tab !== "match" && !selectedIsLive ? quarterCapture(tab) : undefined;
  const openEventFeed = () => {
    setUnreadEventCount(0);
    setDrawerOpen(true);
  };
  const endedQuarter = game.status === "live" && !game.activeQuarter ? completedQuarterSummary(game, score, quarterScore) : undefined;
  const showEndQuarterSummary = endedQuarter && reviewedQuarter !== endedQuarter.number;
  const endQuarter = async () => { await actions.endQuarter(); };
  const finalise = async () => {
    if (!endedQuarter) return;
    await actions.finalise({ own: endedQuarter.ownGameScore, opposition: endedQuarter.oppositionGameScore });
  };
  const tabs = <div className="match-event-tabs" role="tablist" aria-label="Match Events tabs">{([1, 2, 3, 4] as QuarterNumber[]).map((quarter) => <button key={quarter} type="button" role="tab" aria-selected={tab === quarter} disabled={!availableTabs.includes(quarter)} onClick={() => setTab(quarter)}>Q{quarter}</button>)}<button type="button" role="tab" aria-selected={tab === "match"} disabled={!availableTabs.includes("match")} onClick={() => setTab("match")}>Match</button></div>;
  const content = selectedIsLive ? <LiveQuarterCard game={game} setup={setup} capture={capture} actions={actions} onOpenHistory={onOpenHistory} onOpenEventFeed={openEventFeed} unreadEventCount={unreadEventCount} onEndQuarter={endQuarter} tabs={tabs} /> : readOnlyCapture ? <ReadOnlyQuarterCard setup={setup} capture={readOnlyCapture} onOpenEventFeed={openEventFeed} tabs={tabs} /> : report ? <><TerminalMatchCard report={report} onBack={onOpenHistory} quarter={tab === "match" ? undefined : tab} /><MatchEventSummaryTable summary={selectedSummary} players={setup.players} label={tab === "match" ? "Match" : `Quarter ${tab}`} /></> : <MatchEventSummaryTable summary={selectedSummary} players={setup.players} label={tab === "match" ? "Match" : `Quarter ${tab}`} />;
  return <section className={selectedIsLive || readOnlyCapture ? "match-events live-match-events" : "match-events"} aria-labelledby="match-events-title" aria-label={selectedIsLive ? "Live Match Events" : readOnlyCapture ? `Read-only Quarter ${readOnlyCapture.number} Match Events` : undefined}>{!selectedIsLive && !readOnlyCapture && <><div className="section-heading"><div><p className="eyebrow">MATCH EVENTS</p><h2 id="match-events-title">Match Events</h2></div><button type="button" className="text-button" onClick={openEventFeed}>Open Event feed{game.status === "live" && unreadEventCount ? `, ${unreadEventCount} new event${unreadEventCount === 1 ? "" : "s"}` : ""}</button></div>{tabs}</>}{content}{game.status === "live" && !game.activeQuarter && !showEndQuarterSummary && (tab !== "match" || game.quarters?.length === TOTAL_QUARTERS) && <section className="draft-card live-card"><p className="eyebrow">QUARTER COMPLETE</p><h2>Quarter {game.quarters?.at(-1)?.number} has ended</h2><p>Review the final Court, reposition players, and confirm before the next Quarter starts.</p>{game.quarters?.length === TOTAL_QUARTERS ? <><p>Final score: {score?.own} — {score?.opposition}</p><button onClick={() => endedQuarter && void finalise()}>Confirm final score and finalise Match</button></> : <button onClick={onSetUpNextQuarter}>Set up Quarter {(game.quarters?.length ?? 0) + 1}</button>}<AbandonMatchAction onAbandon={actions.abandon} /></section>}{showEndQuarterSummary && <EndQuarterSummary quarter={endedQuarter} isFinalQuarter={endedQuarter.number === TOTAL_QUARTERS} onReview={() => { setTab(endedQuarter.number); setReviewedQuarter(endedQuarter.number); }} onSetUpNextQuarter={() => { setReviewedQuarter(endedQuarter.number); onSetUpNextQuarter(); }} onFinalise={() => void finalise()} />}{drawerOpen && <EventFeedDrawer game={game} tab={tab} players={setup.players} actions={actions} onClose={() => setDrawerOpen(false)} />}</section>;
}

function EndQuarterSummary({ quarter, isFinalQuarter, onReview, onSetUpNextQuarter, onFinalise }: { quarter: CompletedQuarterSummary; isFinalQuarter: boolean; onReview: () => void; onSetUpNextQuarter: () => void; onFinalise: () => void }) {
  const overlayRef = useOverlayFocus(onReview);
  return <div ref={overlayRef} className="end-quarter-summary-backdrop" role="dialog" aria-modal="true" aria-label={`Quarter ${quarter.number} summary`} onMouseDown={(event) => { if (event.target === event.currentTarget) onReview(); }}><section className="end-quarter-summary"><div className="end-quarter-summary-icon" aria-hidden="true">✓</div><p className="eyebrow">QUARTER COMPLETE</p><h2>Quarter {quarter.number} complete</h2><dl><div><dt>Quarter score</dt><dd>{quarter.ownScore} — {quarter.oppositionScore}</dd></div><div><dt>Match score</dt><dd>{quarter.ownGameScore} — {quarter.oppositionGameScore}</dd></div><div><dt>Recorded events</dt><dd>{quarter.eventCount}</dd></div></dl>{isFinalQuarter ? <><p>Confirm this final score to finalise the read-only Match.</p><button type="button" onClick={onFinalise}>Confirm final score and finalise Match</button><button type="button" className="secondary-button" onClick={onReview}>Review Quarter {quarter.number} statistics</button></> : <><button type="button" onClick={onSetUpNextQuarter}>Prepare Quarter {quarter.number + 1} Court</button><button type="button" className="secondary-button" onClick={onReview}>Review Quarter {quarter.number} statistics</button></>}</section></div>;
}

function MatchEventSummaryTable({ summary, players, label }: { summary: StatisticsSummary; players: SetupSummary["players"]; label: string }) {
  return <section className="match-event-summary" aria-label={`${label} statistics`}><p>{summary.readOnly ? "This Match is read-only." : "Completed event summary"}</p><div className="match-event-summary-scroll"><table><thead><tr><th>Player</th><th>Position</th><th>Events</th></tr></thead><tbody>{summary.stints.map((stint) => <tr key={`${stint.playerId}:${stint.position}`}><td>{playerLabel(players.find((player) => player.id === stint.playerId) ?? { name: "Unknown player" })}</td><td>{stint.position}</td><td>{stint.playerStatistics.length ? stint.playerStatistics.map((statistic) => `${statistic.statistic}: ${statistic.count}`).join(" · ") : "No events"}</td></tr>)}</tbody></table></div></section>;
}

function TerminalMatchCard({ report, onBack, quarter }: { report: TerminalMatchReport; onBack: () => void; quarter?: QuarterNumber }) {
  const outcome = report.outcome.kind === "completed" ? "Completed" : report.outcome.kind === "terminated" ? "Legacy terminal record - no winner" : "Abandoned - no winner";
  const reviewedQuarters = quarter ? report.quarters.filter((candidate) => candidate.number === quarter) : report.quarters;
  return <section className="terminal-match-review" aria-labelledby="match-events-record-title"><div className="terminal-match-heading"><div><p className="eyebrow">READ-ONLY MATCH EVENTS</p><h2 id="match-events-record-title" aria-label={`${report.teamName} ${report.score.own} - ${report.oppositionName} ${report.score.opposition}`}>{report.teamName} vs {report.oppositionName}</h2><p>{report.date} · {outcome}</p></div><div className="terminal-match-score"><strong>{report.score.own} – {report.score.opposition}</strong><span>Final score</span></div><button className="text-button" onClick={onBack}>Back to History</button></div><p className="terminal-read-only-note">These Match Events are read-only.</p><div className="quarter-review">{reviewedQuarters.map((reviewedQuarter) => <article key={reviewedQuarter.number}><div className="quarter-review-heading"><h3>{quarter ? `Quarter ${reviewedQuarter.number} review` : `Quarter ${reviewedQuarter.number}`}</h3><strong>{reviewedQuarter.ownScore} – {reviewedQuarter.oppositionScore}</strong></div><dl><div><dt>Starting Court</dt><dd>{reviewedQuarter.startingLineup.map((entry) => `${entry.position}: ${entry.playerName}`).join(", ") || "No retained Court"}</dd></div><div><dt>Substitutions</dt><dd>{reviewedQuarter.substitutions.length ? reviewedQuarter.substitutions.map((substitution, index) => <span key={substitution.sequence}>{index > 0 && <span aria-hidden="true"> · </span>}<span>Substitution {substitution.sequence}: {substitution.position}: {substitution.playerName ?? "Vacant"}</span></span>) : "None recorded"}</dd></div><div><dt>Events</dt><dd>{reviewedQuarter.events.length ? reviewedQuarter.events.map((event) => event.kind === "opposition-goal" ? "Opposition goal" : `${event.playerName} · ${event.position} · ${event.statistic}`).join(" · ") : "None recorded"}</dd></div></dl>{reviewedQuarter.playerStatistics.length > 0 && <ul>{reviewedQuarter.playerStatistics.map((statistic) => <li key={`${statistic.playerId}:${statistic.position}:${statistic.statistic}`}>{statistic.playerName} · {statistic.position} · {statistic.statistic}: {statistic.count}</li>)}</ul>}</article>)}</div><div className="draft-actions"><button onClick={() => download(`${report.id}.csv`, "text/csv", createMatchCsv(report))}>Download CSV</button><button className="secondary-button" onClick={() => download(`${report.id}.pdf`, "application/pdf", createMatchPdf(report))}>Download PDF</button></div></section>;
}

function BackupCard({ exportBackup, onImport }: { exportBackup: () => string; onImport: (serialized: string, mode: "merge" | "replace", confirmed: boolean) => Promise<void> }) {
  const [serialized, setSerialized] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirmingReplacement, setConfirmingReplacement] = useState(false);
  const completeImport = async (confirmed: boolean) => {
    await onImport(serialized, mode, confirmed);
    setSerialized("");
    setConfirmingReplacement(false);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === "replace") setConfirmingReplacement(true);
    else await completeImport(false);
  };
  return <section className="backup-card" aria-label="Backup and restore controls"><section className="backup-action"><h3>Create a safe backup</h3><p>Download one backup containing every saved Season, lookup, Match, statistic, Court, and result.</p><button className="secondary-button" onClick={() => download("natball-insights-backup.json", "application/json", exportBackup())}>Download backup</button></section><section className="restore-action"><h3>Restore data</h3><p>Merge adds data from a backup and keeps the data already on this device.</p><p className="destructive-note">Replace all local data is destructive and requires confirmation.</p><form onSubmit={(event) => void submit(event)}><label>Backup data<textarea aria-label="Backup data" value={serialized} onChange={(event) => setSerialized(event.target.value)} placeholder="Paste a Natball Insights backup" /></label><label>Import mode<select aria-label="Import mode" value={mode} onChange={(event) => setMode(event.target.value as "merge" | "replace")}><option value="merge">Merge - keep current data</option><option value="replace">Replace all local data</option></select></label><button type="submit">Import backup</button></form></section>{confirmingReplacement && <DestructiveConfirmation title="Replace local data?" description="Replace all local data with this backup?" cancelLabel="Keep local data" confirmLabel="Confirm replacement" onCancel={() => setConfirmingReplacement(false)} onConfirm={() => completeImport(true)} />}</section>;
}

function DestructiveConfirmation({ title, description, cancelLabel, confirmLabel, onCancel, onConfirm }: { title: string; description: string; cancelLabel: string; confirmLabel: string; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const overlayRef = useOverlayFocus(onCancel);
  return <div ref={overlayRef} className="destructive-confirmation" role="alertdialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><div className="destructive-confirmation-card"><span className="destructive-confirmation-icon" aria-hidden="true"><AlertTriangle /></span><h3>{title}</h3><p>{description}</p><div className="destructive-confirmation-actions"><button type="button" className="secondary-button" onClick={onCancel}>{cancelLabel}</button><button type="button" onClick={() => void onConfirm()}>{confirmLabel}</button></div></div></div>;
}

function useOverlayFocus(onClose: () => void, activeSurfaceSelector?: string) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const activeSurfaceSelectorRef = useRef(activeSurfaceSelector);
  closeRef.current = onClose;
  activeSurfaceSelectorRef.current = activeSurfaceSelector;
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const focusTimer = window.setTimeout(() => overlayRef.current?.querySelector<HTMLElement>("button:not([disabled]), select:not([disabled]), input:not([disabled])")?.focus());
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      if (overlayRef.current?.querySelector(".destructive-confirmation")) return;
      const activeSurface = activeSurfaceSelectorRef.current ? overlayRef.current?.querySelector(activeSurfaceSelectorRef.current) : undefined;
      const focusable = [...(activeSurface ?? overlayRef.current ?? document.createElement("div")).querySelectorAll<HTMLElement>("button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1 : currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
      event.preventDefault();
      focusable[nextIndex].focus();
    };
    document.addEventListener("keydown", handleKeyboard);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyboard);
      previouslyFocused?.focus();
    };
  }, []);
  return overlayRef;
}

function LiveQuarterCard({ game, setup, capture, actions, onOpenHistory, onOpenEventFeed, unreadEventCount, onEndQuarter, tabs }: { game: Game; setup: SetupSummary; capture: LiveQuarterCapture; actions: MatchActions; onOpenHistory: () => void; onOpenEventFeed: () => void; unreadEventCount: number; onEndQuarter: () => Promise<void>; tabs: ReactNode }) {
  const [substitutionOpen, setSubstitutionOpen] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [removingActionId, setRemovingActionId] = useState<string>();
  const compactCaptureControls = useCompactCaptureControls();
  const teamName = setup.teams.find((team) => team.id === setup.seasons.find((season) => season.id === game.seasonId)?.teamId)?.name ?? "Our team";
  const oppositionName = setup.opposition.find((opposition) => opposition.id === game.oppositionId)?.name ?? "Opposition";
  const openSubstitution = () => {
    setSubstitutionOpen(true);
    setShowOverflow(false);
  };
  return <section className="live-capture"><div className="sr-only"><h2>LIVE MATCH · QUARTER {capture.number}</h2><p>Quarter: {teamName} {capture.ownScore} — {oppositionName} {capture.oppositionScore}</p></div><div className="live-match-command-bar"><div className="live-match-tabs">{tabs}</div><div className="live-match-actions" role="group" aria-label="Live match actions"><button className="text-button" onClick={openSubstitution}><ArrowRightLeft aria-hidden="true" />Record Substitution</button><button className="text-button" disabled={!capture.canUndo} onClick={() => void actions.undoCaptureAction()}><RotateCcw aria-hidden="true" />Undo</button><button className="text-button" onClick={onOpenEventFeed}><List aria-hidden="true" />Event Feed{unreadEventCount ? ` (${unreadEventCount})` : ""}</button><button className="end-quarter-action" onClick={() => void onEndQuarter()}><CheckCircle2 aria-hidden="true" />End Quarter</button>{compactCaptureControls ? <AbandonMatchAction onAbandon={actions.abandon} /> : <button className="text-button" aria-expanded={showOverflow} onClick={() => setShowOverflow((current) => !current)}>More</button>}</div></div>{showOverflow && <div className="overflow-actions"><button className="text-button" onClick={onOpenHistory}>History</button><AbandonMatchAction onAbandon={actions.abandon} /></div>}{substitutionOpen && <SubstitutionModal lineup={capture.lineup} squad={setup.players.filter((player) => game.squadPlayerIds.includes(player.id))} onCancel={() => setSubstitutionOpen(false)} onConfirm={async (lineup) => { await actions.saveSubstitutions(lineup); setSubstitutionOpen(false); }} />}<div className="live-quarter-layout"><div className="current-court-scroll" role="region" aria-label="Current court event grid" tabIndex={0}><div className="current-court"><div className="court-matrix-header"><span>Player / Position</span><div>{PLAYER_STATISTICS.map((statistic) => <span key={statistic}>{statisticPresentation[statistic].label}</span>)}</div></div>{POSITIONS.map((position) => <PlayerStatCard key={position} position={position} player={setup.players.find((candidate) => candidate.id === capture.lineup[position])} capture={capture} onRecord={actions.recordPlayerStatistic} onRemove={(actionId) => setRemovingActionId(actionId)} />)}</div></div></div>{removingActionId && <DestructiveConfirmation title="Remove most recent event?" description="This removes the most recent matching event and recalculates the score and count." cancelLabel="Keep event" confirmLabel="Remove event" onCancel={() => setRemovingActionId(undefined)} onConfirm={async () => { await actions.deleteQuarterAction(capture.number, removingActionId); setRemovingActionId(undefined); }} />}</section>;
}

function ReadOnlyQuarterCard({ setup, capture, onOpenEventFeed, tabs }: { setup: SetupSummary; capture: LiveQuarterCapture; onOpenEventFeed: () => void; tabs: ReactNode }) {
  return <section className="live-capture read-only-quarter-capture"><div className="sr-only"><h2>READ-ONLY MATCH EVENTS · QUARTER {capture.number}</h2><p>Quarter {capture.number} is complete and cannot be changed.</p></div><div className="live-match-command-bar"><div className="live-match-tabs">{tabs}</div><div className="live-match-actions" role="group" aria-label="Read-only match actions"><button className="text-button" aria-disabled="true" tabIndex={-1}><ArrowRightLeft aria-hidden="true" />Record Substitution</button><button className="text-button" aria-disabled="true" tabIndex={-1}><RotateCcw aria-hidden="true" />Undo</button><button className="text-button" onClick={onOpenEventFeed}><List aria-hidden="true" />Event Feed</button><button className="end-quarter-action" aria-disabled="true" tabIndex={-1}><CheckCircle2 aria-hidden="true" />End Quarter</button><button className="text-button" aria-disabled="true" tabIndex={-1}>More</button></div></div><div className="live-quarter-layout"><div className="current-court-scroll" role="region" aria-label={`Quarter ${capture.number} read-only event grid`} tabIndex={0}><div className="current-court"><div className="court-matrix-header"><span>Player / Position</span><div>{PLAYER_STATISTICS.map((statistic) => <span key={statistic}>{statisticPresentation[statistic].label}</span>)}</div></div>{POSITIONS.map((position) => <ReadOnlyPlayerStatCard key={position} position={position} player={setup.players.find((candidate) => candidate.id === capture.lineup[position])} capture={capture} />)}</div></div></div></section>;
}

function SubstitutionModal({ lineup, squad, onCancel, onConfirm }: { lineup: StartingLineup; squad: SetupSummary["players"]; onCancel: () => void; onConfirm: (lineup: StartingLineup) => Promise<void> }) {
  const overlayRef = useOverlayFocus(onCancel);
  const [position, setPosition] = useState<Position>(POSITIONS[0]);
  const [playerId, setPlayerId] = useState(lineup[POSITIONS[0]] ?? "");
  const nextLineup = () => {
    const next = { ...lineup };
    if (playerId) {
      const previousPosition = POSITIONS.find((candidate) => candidate !== position && lineup[candidate] === playerId);
      if (previousPosition) delete next[previousPosition];
      next[position] = playerId;
    } else delete next[position];
    return next;
  };
  const next = nextLineup();
  const assignedPlayers = POSITIONS.filter((candidate) => next[candidate]).length;
  const hasChanged = POSITIONS.some((candidate) => lineup[candidate] !== next[candidate]);
  const canConfirm = hasChanged && assignedPlayers >= 5;
  const selectPosition = (value: Position) => {
    setPosition(value);
    setPlayerId(lineup[value] ?? "");
  };
  return <div ref={overlayRef} className="substitution-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="substitution-modal" role="dialog" aria-modal="true" aria-label="Record Substitution"><div className="section-heading"><div><p className="eyebrow">LIVE QUARTER</p><h2>Record Substitution</h2></div><button type="button" className="text-button" onClick={onCancel}>Close substitution</button></div><p>Choose a Court Position and a Match Squad Player. Choosing someone already on Court repositions them and leaves their previous Position vacant.</p><label>Court position<select aria-label="Court position" value={position} onChange={(event) => selectPosition(event.target.value as Position)}>{POSITIONS.map((candidate) => <option key={candidate} value={candidate}>{positionAbbreviation[candidate]} — {lineup[candidate] ? playerLabel(squad.find((player) => player.id === lineup[candidate]) ?? { name: "Unknown player" }) : "Vacant"}</option>)}</select></label><label>Incoming player<select aria-label="Incoming player" value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Vacate this Position</option>{squad.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label><p className="substitution-readiness" role="status">{assignedPlayers}/7 Players will be on Court.{assignedPlayers < 5 && " Choose a Player to keep at least five on Court."}</p><div className="substitution-modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel substitution</button><button type="button" disabled={!canConfirm} onClick={() => void onConfirm(next)}>Confirm substitution</button></div></section></div>;
}

function useCompactCaptureControls() {
  const query = "(min-width: 768px) and (orientation: landscape) and (max-height: 700px)";
  return useMediaQuery(query);
}

function AbandonMatchAction({ onAbandon }: { onAbandon: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  return <div className="overflow-actions">{confirming ? <DestructiveConfirmation title="Abandon this Match?" description="Its recorded score and statistics will be kept, but it cannot be resumed." cancelLabel="Keep recording" confirmLabel="Confirm abandonment" onCancel={() => setConfirming(false)} onConfirm={onAbandon} /> : <button className="secondary-button" onClick={() => setConfirming(true)}>Abandon match</button>}</div>;
}

function QuarterReview({ quarters, players, onDeleteAction, onCorrectAction }: { quarters: { number: QuarterNumber; captureActions: CaptureAction[] }[]; players: { id: string; name: string; nickname?: string }[]; onDeleteAction: (quarter: QuarterNumber, actionId: string) => Promise<void>; onCorrectAction: (quarter: QuarterNumber, actionId: string, correction: { playerId: string; position: Position; statistic: PlayerStatistic }) => Promise<void> }) {
  const [editing, setEditing] = useState<{ quarter: QuarterNumber; action: Extract<CaptureAction, { kind: "player-statistic" }> }>();
  const [correction, setCorrection] = useState<{ playerId: string; position: Position; statistic: PlayerStatistic }>();
  const beginEditing = (quarter: QuarterNumber, action: Extract<CaptureAction, { kind: "player-statistic" }>) => {
    setEditing({ quarter, action });
    setCorrection({ playerId: action.playerId, position: action.position, statistic: action.statistic });
  };
  return <section className="quarter-review" aria-label="Review ended quarters">{quarters.map((quarter) => <article key={quarter.number}><h3>Quarter {quarter.number} review</h3>{!quarter.captureActions.length && <p>No recorded actions.</p>}<ul>{quarter.captureActions.map((action) => <li key={action.id}>{action.kind === "opposition-goal" ? <span>Opposition goal</span> : <><span>{playerLabel(players.find((player) => player.id === action.playerId) ?? { name: "Unknown player" })} · {action.position} · {action.statistic}</span><button className="text-button" onClick={() => beginEditing(quarter.number, action)}>Edit statistic</button></>}<button className="text-button" onClick={() => void onDeleteAction(quarter.number, action.id)} aria-label={`Remove action from Quarter ${quarter.number}`}>Remove action</button></li>)}</ul></article>)}{editing && correction && <form className="court-change-form" onSubmit={(event) => { event.preventDefault(); void onCorrectAction(editing.quarter, editing.action.id, correction).then(() => setEditing(undefined)); }}><h3>Correct Quarter {editing.quarter} statistic</h3><label>Correction player<select aria-label="Correction player" value={correction.playerId} onChange={(event) => setCorrection({ ...correction, playerId: event.target.value })}>{players.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label><label>Correction position<select aria-label="Correction position" value={correction.position} onChange={(event) => setCorrection({ ...correction, position: event.target.value as Position })}>{POSITIONS.map((position) => <option key={position} value={position}>{position}</option>)}</select></label><label>Correction statistic<select aria-label="Correction statistic" value={correction.statistic} onChange={(event) => setCorrection({ ...correction, statistic: event.target.value as PlayerStatistic })}>{PLAYER_STATISTICS.map((statistic) => <option key={statistic} value={statistic}>{statistic}</option>)}</select></label><button type="submit">Save correction</button><button type="button" className="text-button" onClick={() => setEditing(undefined)}>Cancel correction</button></form>}</section>;
}

function PlayerStatCard({ position, player, capture, onRecord, onRemove }: { position: Position; player: { id: string; name: string; nickname?: string } | undefined; capture: LiveQuarterCapture; onRecord: (position: Position, statistic: PlayerStatistic) => Promise<void>; onRemove: (actionId: string) => void }) {
  const [feedbackCell, setFeedbackCell] = useState<PlayerStatistic>();
  if (!player) return null;
  const statistics = PLAYER_STATISTICS;
  const record = (statistic: PlayerStatistic) => {
    setFeedbackCell(statistic);
    window.setTimeout(() => setFeedbackCell((current) => current === statistic ? undefined : current), 500);
    void onRecord(position, statistic);
  };
  return <article className="player-stat-card"><div className="player-court-identity"><p className="eyebrow">{positionAbbreviation[position]}</p><h3>{playerLabel(player)}</h3></div><div className="stat-buttons">{statistics.map((statistic) => { const count = capture.playerStatistics.find((total) => total.playerId === player.id && total.position === position && total.statistic === statistic)?.count ?? 0; const latestAction = [...capture.captureActions].reverse().find((action) => action.kind === "player-statistic" && action.playerId === player.id && action.position === position && action.statistic === statistic); const available = !SHOOTER_STATISTICS.includes(statistic as (typeof SHOOTER_STATISTICS)[number]) || position === "Goal Attack" || position === "Goal Shooter"; return <div key={statistic} className="event-cell-wrap"><button className={`event-cell ${statisticPresentation[statistic].className} ${feedbackCell === statistic ? "event-feedback" : ""}`} disabled={!available} onClick={() => record(statistic)} aria-label={available ? `Record ${statistic} for ${player.name}` : `${statistic} is unavailable for ${player.name}`}><span aria-hidden="true">{statisticPresentation[statistic].label}</span><span>{available ? count : "—"}</span></button>{latestAction && <button type="button" className="event-minus-badge" aria-label={`Remove most recent ${statistic} for ${player.name}`} onClick={() => onRemove(latestAction.id)}>−</button>}</div>; })}</div></article>;
}

function ReadOnlyPlayerStatCard({ position, player, capture }: { position: Position; player: { id: string; name: string; nickname?: string } | undefined; capture: LiveQuarterCapture }) {
  if (!player) return null;
  return <article className="player-stat-card"><div className="player-court-identity"><p className="eyebrow">{positionAbbreviation[position]}</p><h3>{playerLabel(player)}</h3></div><div className="stat-buttons">{PLAYER_STATISTICS.map((statistic) => { const count = capture.playerStatistics.find((total) => total.playerId === player.id && total.position === position && total.statistic === statistic)?.count ?? 0; const available = !SHOOTER_STATISTICS.includes(statistic as (typeof SHOOTER_STATISTICS)[number]) || position === "Goal Attack" || position === "Goal Shooter"; return <div key={statistic} className="event-cell-wrap"><button className={`event-cell ${statisticPresentation[statistic].className}`} aria-disabled="true" tabIndex={-1} aria-label={`${statistic} for ${player.name}: ${available ? count : "unavailable"}`}><span aria-hidden="true">{statisticPresentation[statistic].label}</span><span>{available ? count : "—"}</span></button></div>; })}</div></article>;
}

function captureActionLabel(action: CaptureAction, players: SetupSummary["players"]) {
  if (action.kind === "opposition-goal") return "Opponent goal";
  return `${playerLabel(players.find((player) => player.id === action.playerId) ?? { name: "Unknown player" })} · ${positionAbbreviation[action.position]} · ${action.statistic}`;
}

function EventFeedDrawer({ game, tab, players, actions, onClose }: { game: Game; tab: QuarterNumber | "match"; players: SetupSummary["players"]; actions: MatchActions; onClose: () => void }) {
  const [editing, setEditing] = useState<{ quarter: QuarterNumber; action: Extract<CaptureAction, { kind: "player-statistic" }> }>();
  const [correction, setCorrection] = useState<{ playerId: string; position: Position; statistic: PlayerStatistic }>();
  const [deleting, setDeleting] = useState<{ quarter: QuarterNumber; actionId: string }>();
  const overlayRef = useOverlayFocus(() => editing ? setEditing(undefined) : deleting ? setDeleting(undefined) : onClose(), editing ? ".event-correction-modal" : deleting ? ".destructive-confirmation-card" : undefined);
  useEffect(() => {
    if (!editing) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const focusTimer = window.setTimeout(() => overlayRef.current?.querySelector<HTMLElement>(".event-correction-modal select")?.focus());
    return () => {
      window.clearTimeout(focusTimer);
      previouslyFocused?.focus();
    };
  }, [editing]);
  const quarters = tab === "match" ? game.quarters ?? [] : (game.quarters ?? []).filter((quarter) => quarter.number === tab);
  const beginEditing = (quarter: QuarterNumber, action: Extract<CaptureAction, { kind: "player-statistic" }>) => {
    setEditing({ quarter, action });
    setCorrection({ playerId: action.playerId, position: action.position, statistic: action.statistic });
  };
  const entries = quarters.flatMap((quarter) => {
    const ordered = [...quarter.captureActions.map((action) => ({ kind: "event" as const, order: action.captureOrder, action })), ...quarter.substitutions.map((substitution) => ({ kind: "substitution" as const, order: substitution.captureOrder, substitution }))];
    const hasSharedOrder = ordered.length > 0 && ordered.every((entry) => entry.order !== undefined);
    return hasSharedOrder ? ordered.sort((left, right) => left.order! - right.order!).map((entry) => ({ quarter: quarter.number, ...entry })) : [...quarter.captureActions.map((action) => ({ quarter: quarter.number, kind: "event" as const, action })), ...quarter.substitutions.map((substitution) => ({ quarter: quarter.number, kind: "substitution" as const, substitution }))];
  });
  return <div ref={overlayRef} className="event-feed-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !editing) onClose(); }}><section className="event-feed-drawer" role="dialog" aria-modal="true" aria-label="Event feed"><div className="section-heading"><div><p className="eyebrow">EVENT FEED</p><h2>{tab === "match" ? "All Match events" : `Quarter ${tab} events`}</h2></div><button type="button" className="text-button" onClick={onClose}>Close Event feed</button></div><div className="event-feed-drawer-scroll">{!entries.length && <p>No events recorded yet.</p>}<ol>{entries.map((entry) => <li key={entry.kind === "event" ? entry.action.id : `${entry.quarter}-${entry.substitution.sequence}`}>{tab === "match" && <strong>Quarter {entry.quarter} · </strong>}{entry.kind === "event" ? <><span>{captureActionLabel(entry.action, players)}</span>{game.status === "live" && entry.action.kind === "player-statistic" && <button type="button" className="text-button" aria-label="Correct event" onClick={() => beginEditing(entry.quarter, entry.action as Extract<CaptureAction, { kind: "player-statistic" }>)}><span aria-hidden="true">✎</span></button>}{game.status === "live" && <button type="button" className="text-button" aria-label="Remove event" onClick={() => setDeleting({ quarter: entry.quarter, actionId: entry.action.id })}><span aria-hidden="true">×</span></button>}</> : <span>Substitution · {positionAbbreviation[entry.substitution.position]}: {entry.substitution.playerId ? playerLabel(players.find((player) => player.id === entry.substitution.playerId) ?? { name: "Unknown player" }) : "Vacant"}</span>}</li>)}</ol></div>{editing && correction && <div className="event-correction-modal" role="dialog" aria-modal="true" aria-label="Correct event" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(undefined); }}><form className="court-change-form" onSubmit={(event) => { event.preventDefault(); void actions.correctQuarterPlayerStatistic(editing.quarter, editing.action.id, correction).then(() => setEditing(undefined)); }}><h3>Correct event</h3><label>Player<select aria-label="Event correction player" value={correction.playerId} onChange={(event) => setCorrection({ ...correction, playerId: event.target.value })}>{players.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label><label>Position<select aria-label="Event correction position" value={correction.position} onChange={(event) => setCorrection({ ...correction, position: event.target.value as Position })}>{POSITIONS.map((position) => <option key={position} value={position}>{positionAbbreviation[position]}</option>)}</select></label><label>Event<select aria-label="Event correction statistic" value={correction.statistic} onChange={(event) => setCorrection({ ...correction, statistic: event.target.value as PlayerStatistic })}>{PLAYER_STATISTICS.map((statistic) => <option key={statistic} value={statistic}>{statistic}</option>)}</select></label><button type="submit">Save event correction</button><button type="button" className="text-button" onClick={() => setEditing(undefined)}>Cancel correction</button></form></div>}{deleting && <DestructiveConfirmation title="Delete event?" description="This recorded event will be removed and all derived scores and summaries will update." cancelLabel="Keep event" confirmLabel="Delete event" onCancel={() => setDeleting(undefined)} onConfirm={async () => { await actions.deleteQuarterAction(deleting.quarter, deleting.actionId); setDeleting(undefined); }} />}</section></div>;
}
