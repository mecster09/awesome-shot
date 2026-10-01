import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
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
  substitutePlayer: (input: { position: Position; playerId: string }) => Promise<void>;
  endQuarter: () => Promise<void>;
  abandon: () => Promise<void>;
  finalise: (score: { own: number; opposition: number }) => Promise<void>;
  deleteQuarterAction: (quarter: QuarterNumber, actionId: string) => Promise<void>;
  correctQuarterPlayerStatistic: (quarter: QuarterNumber, actionId: string, correction: { playerId: string; position: Position; statistic: PlayerStatistic }) => Promise<void>;
};

export const deriveCurrentView = ({ matchView, setup, liveMatch, nextQuarterCourt }: { matchView?: MatchView; setup: SetupSummary; liveMatch?: Game; nextQuarterCourt: (gameId: string) => StartingLineup }): MatchView => {
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
const statisticHeader: Record<PlayerStatistic, string> = {
  "Successful Centre Pass Received": "CPR",
  Tip: "Tip",
  Intercept: "Int",
  "Unforced Errors": "UE",
  "Contact Conceded": "Con",
  "Obstruction Conceded": "Obs",
  Goals: "Goal",
  Misses: "Miss"
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
    return <main className="loading" aria-live="polite">{error ?? message}</main>;
  }
  const activeSeason = setup.seasons.find((season) => season.status === "active");
  const editableTeam = activeSeason ? setup.teams.find((team) => team.id === activeSeason.teamId) : setup.teams.at(-1);
  const liveMatch = session.matches().find((game) => game.status === "live");
  const matchSetupDraft = setup.matchSetupDraft?.stage === "match-squad" || setup.matchSetupDraft?.stage === "match-identity" ? setup.matchSetupDraft : undefined;
  const courtSetupDraft = setup.matchSetupDraft?.stage === "court-setup" ? setup.matchSetupDraft : undefined;
  const currentView = deriveCurrentView({ matchView, setup, liveMatch, nextQuarterCourt: (gameId) => session.nextQuarterCourt(gameId) });
  const navigationView = currentView.kind === "history" ? "history" : currentView.kind === "settings" || currentView.kind === "settings-section" ? "settings" : "match";

  return <main className="app-shell">
    <CoachNavigation
      activeView={navigationView}
      onOpenMatch={() => setMatchView(undefined)}
      onOpenHistory={() => setMatchView({ kind: "history" })}
      onOpenSettings={() => setMatchView({ kind: "settings" })}
    />
    <div className="app-content">
    {error && <p className="error" role="alert">{error}</p>}
    {currentView.kind === "team-setup" && <section className="match-area focused-screen setup-screen" aria-labelledby="team-setup-title">
      <p className="eyebrow">FIRST-TIME SETUP · 1 OF 2</p>
      <h2 id="team-setup-title">Team Setup</h2>
      <p>Save your reusable Team before creating a Season.</p>
      <TeamForm onSubmit={(input) => perform(async () => { await session.createTeam(input); setMatchView({ kind: "season-setup" }); })} />
    </section>}

    {currentView.kind === "season-setup" && <section className="match-area focused-screen setup-screen" aria-labelledby="season-setup-title">
      <p className="eyebrow">FIRST-TIME SETUP · 2 OF 2</p>
      <h2 id="season-setup-title">Season Setup</h2>
      <p>Team saved. Create an active Season before preparing a Match.</p>
      <SeasonForm team={setup.teams.at(-1)!} onSubmit={(input) => perform(async () => { await session.createSeason(input); setMatchView(undefined); })} />
    </section>}

    {currentView.kind === "settings" && <section className="match-area focused-screen management-screen settings-root" aria-labelledby="settings-title"><p className="eyebrow">COACH SETTINGS</p><h2 id="settings-title">Settings</h2><p>Manage your Team, Season, and offline data.</p><section className="settings-group" aria-labelledby="team-settings-title"><h3 id="team-settings-title">Team</h3><div className="settings-root-actions">{editableTeam && <button type="button" className="text-button" onClick={() => setMatchView({ kind: "settings-section", section: "team" })}>Edit team</button>}</div></section><section className="settings-group" aria-labelledby="season-settings-title"><h3 id="season-settings-title">Season</h3><div className="settings-root-actions">{activeSeason && <button type="button" className="text-button" onClick={() => setMatchView({ kind: "settings-section", section: "season" })}>Edit season</button>}{activeSeason && <button type="button" className="text-button" disabled={Boolean(liveMatch)} onClick={() => setMatchView({ kind: "settings-section", section: "season" })}>End season</button>}</div>{liveMatch && <p className="settings-guidance">End season is unavailable while a live Match is in progress.</p>}</section><section className="settings-group" aria-labelledby="data-settings-title"><h3 id="data-settings-title">Data</h3><div className="settings-root-actions"><button type="button" className="text-button" onClick={() => setMatchView({ kind: "settings-section", section: "backup" })}>Backup & restore</button></div></section></section>}
    {currentView.kind === "settings-section" && <section className="match-area focused-screen management-screen" aria-labelledby="settings-section-title"><div className="section-heading"><h2 id="settings-section-title">{currentView.section === "team" ? "Team Setup" : currentView.section === "season" ? "Season Setup" : "Backup & restore"}</h2><button className="text-button" onClick={() => setMatchView({ kind: "settings" })}>Back to Settings</button></div>{currentView.section === "team" && editableTeam && <TeamForm initialName={editableTeam.name} submitLabel="Save changes" cancelLabel="Cancel" onCancel={() => setMatchView({ kind: "settings" })} onSubmit={(input) => perform(async () => { await session.renameTeam(editableTeam.id, input); setMatchView({ kind: "settings" }); })} />}{currentView.section === "season" && activeSeason && <><SeasonForm team={setup.teams.find((team) => team.id === activeSeason.teamId)!} initialName={activeSeason.name} submitLabel="Save changes" cancelLabel="Cancel" onCancel={() => setMatchView({ kind: "settings" })} onSubmit={(input) => perform(async () => { await session.renameSeason(activeSeason.id, input); setMatchView({ kind: "settings" }); })} />{!liveMatch && <EndSeasonControl season={activeSeason} onConfirm={() => perform(async () => { await session.endSeason(activeSeason.id); setMatchView(undefined); })} />}</>}{currentView.section === "backup" && <BackupCard exportBackup={() => session.exportBackup()} onImport={(serialized, mode, confirmed) => perform(async () => { await session.importBackup(serialized, mode, confirmed); if (mode === "replace") setUnsavedCourts({}); })} />}</section>}

    {currentView.kind === "no-match" && activeSeason && <section className="match-area focused-screen no-match-screen" aria-labelledby="no-match-title"><p className="eyebrow">SETUP MATCH</p><h2 id="no-match-title">No Match in progress</h2><p><strong>{activeSeason.name} is the active Season.</strong> Add an Opposition and date when you are ready to prepare a Match.</p><button type="button" aria-label="Set up a Match" onClick={() => setMatchView({ kind: "match-setup" })}>Add Opposition</button></section>}

    {currentView.kind === "match-setup" && activeSeason && <section className="match-area focused-screen setup-screen" aria-labelledby="match-setup-title"><MatchSetupProgress current="setup" /><h2 id="match-setup-title">Setup Match</h2><p>{activeSeason.name} · choose the Opposition, date, and Match Squad.</p><MatchSetupForm opposition={setup.activeOpposition} players={setup.players} draft={matchSetupDraft} onAddOpposition={async (input) => { const opponent = await session.addOpposition(input); refresh(); return opponent; }} onAddPlayer={async (input) => { const player = await session.addPlayer(input); refresh(); return player; }} onSave={(input) => perform(async () => { if (input.oppositionId && input.date) await session.saveMatchSquad({ seasonId: activeSeason.id, oppositionId: input.oppositionId, date: input.date, squadPlayerIds: input.squadPlayerIds }); else await session.saveMatchIdentity({ seasonId: activeSeason.id, oppositionId: input.oppositionId, date: input.date }); })} onProceed={(input) => perform(async () => { await session.advanceToCourtSetup({ seasonId: activeSeason.id, ...input }); setMatchView({ kind: "court-setup" }); })} /></section>}
    {currentView.kind === "court-setup" && courtSetupDraft && <QuarterSetupCard match={courtSetupDraft} startingLineup={unsavedCourts["court-setup"] ?? {}} quarterNumber={1} setup={setup} onLineupChange={(lineup) => setUnsavedCourts((courts) => ({ ...courts, "court-setup": lineup }))} onStart={async (startingLineup) => {
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
        return <QuarterSetupCard match={game} startingLineup={unsavedCourts[courtKey] ?? currentView.startingLineup} quarterNumber={quarterNumber} setup={setup} statistics={session.betweenQuarterStatistics(game.id)} onLineupChange={(lineup) => setUnsavedCourts((courts) => ({ ...courts, [courtKey]: lineup }))} onStart={async (startingLineup) => {
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
        score={game.status === "live" ? session.gameScore(game.id) : undefined}
        report={game.status === "finalised" || game.status === "abandoned" || game.status === "terminated" ? session.terminalMatchReport(game.id) : undefined}
        summary={(selection) => session.statisticsSummary(game.id, selection)}
        actions={{
          recordPlayerStatistic: (position, statistic) => perform(() => session.recordPlayerStatistic(game.id, { position, statistic })),
          recordOppositionGoal: () => perform(() => session.recordOppositionGoal(game.id)),
          undoCaptureAction: () => perform(() => session.undoLastCaptureAction(game.id)),
          substitutePlayer: (input) => perform(() => session.substitutePlayer(game.id, input)),
          endQuarter: () => perform(async () => {
            const completedQuarter = game.activeQuarter;
            await session.endQuarter(game.id);
            if (completedQuarter && completedQuarter < TOTAL_QUARTERS) setMatchView({ kind: "next-quarter-setup", gameId: game.id, startingLineup: session.nextQuarterCourt(game.id) });
          }),
          abandon: () => perform(() => session.abandonGame(game.id)),
          finalise: (score) => perform(() => session.finaliseGame(game.id, score)),
          deleteQuarterAction: (quarter, actionId) => perform(() => session.deleteCaptureAction(game.id, quarter, actionId)),
          correctQuarterPlayerStatistic: (quarter, actionId, correction) => perform(() => session.correctPlayerStatistic(game.id, quarter, actionId, correction))
        }}
        onOpenHistory={() => setMatchView({ kind: "history" })}
      />)}
    </div>
  </main>;
}

function CoachNavigation({ activeView, onOpenMatch, onOpenHistory, onOpenSettings }: { activeView?: "match" | "history" | "settings"; onOpenMatch: () => void; onOpenHistory: () => void; onOpenSettings: () => void }) {
  const compactRail = useCompactCoachRail();
  const items: Array<{ key: "match" | "history" | "settings"; label: string; icon: "court" | "history" | "settings"; onClick: () => void }> = [
    { key: "match" as const, label: "Match", icon: "court", onClick: onOpenMatch },
    { key: "history" as const, label: "History", icon: "history", onClick: onOpenHistory },
    { key: "settings" as const, label: "Settings", icon: "settings", onClick: onOpenSettings }
  ];

  return <nav className="coach-navigation" aria-label="Coach navigation" data-layout={compactRail ? "compact-rail" : "labeled-bottom"}>
    <div className="app-identity"><AppMark /><span><strong>Natball</strong><small>Insights</small></span></div>
    <div className="coach-navigation-items">{items.map((item) => <button key={item.key} type="button" className="coach-navigation-item" aria-current={activeView === item.key ? "page" : undefined} onClick={item.onClick}><NavigationIcon name={item.icon} /><span>{item.label}</span></button>)}</div>
  </nav>;
}

function useCompactCoachRail() {
  const query = "(min-width: 768px) and (orientation: landscape)";
  return useMediaQuery(query);
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
  }, []);
  return matches;
}

function AppMark() {
  return <svg className="app-mark" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16" /><path d="M8 24h32M24 8c5 5 8 10 8 16s-3 11-8 16M24 8c-5 5-8 10-8 16s3 11 8 16M10 34l8-8 6 6 12-12" /></svg>;
}

function NavigationIcon({ name }: { name: "court" | "history" | "settings" }) {
  if (name === "court") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 7h8M12 7v10M8 17h8" /></svg>;
  if (name === "history") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 7v5l3 2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2L3 14.5l2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 3.1h5l.4-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" /></svg>;
}

function MatchHistory({ games, scores, setup, onOpen }: { games: Game[]; scores: Map<string, { own: number; opposition: number }>; setup: SetupSummary; onOpen: (gameId: string) => void }) {
  return <section className="match-area focused-screen management-screen match-history" aria-labelledby="match-history-title"><div className="section-heading"><div><p className="eyebrow">MATCH HISTORY</p><h2 id="match-history-title">Match history</h2></div></div><ul className="match-list" aria-label="Saved matches">{games.map((game) => {
    const score = game.finalScore ?? scores.get(game.id)!;
    const status = game.status === "live" ? `Live Match · Quarter ${game.activeQuarter ?? game.quarters?.length ?? 1}` : `${game.outcome?.kind === "completed" ? "Completed" : game.outcome?.kind === "terminated" ? "Terminated" : "Abandoned"} Match`;
    return <li key={game.id} data-status={game.status}><div><strong>{setup.opposition.find((opposition) => opposition.id === game.oppositionId)?.name}</strong><p>{status} · {score.own} – {score.opposition}</p><small>{game.date}</small></div><button className="text-button" onClick={() => onOpen(game.id)}>{game.status === "live" ? "View live match" : "View match record"}</button></li>;
  })}</ul></section>;
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

function SeasonForm({ team, initialName = "", submitLabel = "Create season", cancelLabel, onCancel, onSubmit }: { team: SetupSummary["teams"][number]; initialName?: string; submitLabel?: string; cancelLabel?: string; onCancel?: () => void; onSubmit: (input: { name: string; teamId: string }) => Promise<void> }) {
  const [name, setName] = useState(initialName);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ name, teamId: team.id });
    setName("");
  };
  return <form className="setup-form" onSubmit={(event) => void submit(event)}>
    <label>Season name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. 2026 Winter" /></label>
    <p><strong>Team:</strong> {team.name}</p>
    <PrimaryActionBar>{cancelLabel && <button type="button" className="secondary-button" onClick={onCancel}>{cancelLabel}</button>}<button type="submit" disabled={!name.trim() || name.trim() === initialName}>{submitLabel}</button></PrimaryActionBar>
  </form>;
}

function EndSeasonControl({ season, onConfirm }: { season: { name: string }; onConfirm: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  return <div className="season-ending"><p><strong>{season.name}</strong> is active. End it only after every Match is terminal; ended seasons remain readable.</p>{confirming ? <DestructiveConfirmation title="End this Season?" description={`End ${season.name}? This makes the Season read-only and cannot be undone.`} cancelLabel="Keep season active" confirmLabel="Confirm end season" onCancel={() => setConfirming(false)} onConfirm={onConfirm} /> : <button className="secondary-button" onClick={() => setConfirming(true)}>End season</button>}</div>;
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
  return <div className="match-setup-progress" role="group" aria-label="Match setup progress"><p className="eyebrow">MATCH SETUP · {currentIndex + 1} OF {steps.length}</p><ol>{steps.map((step, index) => <li key={step.key} data-state={index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming"}>{step.label}</li>)}</ol></div>;
}

function MatchSetupForm({ opposition, players, draft, onAddOpposition, onAddPlayer, onSave, onProceed }: { opposition: SetupSummary["activeOpposition"]; players: SetupSummary["players"]; draft?: { oppositionId?: string; date?: string; squadPlayerIds?: string[] }; onAddOpposition: (input: { name: string }) => Promise<{ id: string }>; onAddPlayer: (input: { name: string }) => Promise<{ id: string }>; onSave: (input: { oppositionId?: string; date?: string; squadPlayerIds: string[] }) => Promise<void>; onProceed: (input: { oppositionId: string; date: string; squadPlayerIds: string[] }) => Promise<void> }) {
  const [oppositionId, setOppositionId] = useState(draft?.oppositionId ?? "");
  const [oppositionSearch, setOppositionSearch] = useState("");
  const [date, setDate] = useState(draft?.date ?? localDate());
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
  return <form className="match-form setup-form" onSubmit={(event) => { event.preventDefault(); if (oppositionId && date && playerIds.length >= 5) void onProceed({ oppositionId, date, squadPlayerIds: playerIds }); }}>
    <div className="field-grid" role="group" aria-label="Saved Oppositions">
      <label>Search opposition history<input type="search" value={oppositionSearch} onChange={(event) => setOppositionSearch(event.target.value)} placeholder="Find an Opposition" /></label>
      <label>Opposition<select value={oppositionId} onChange={(event) => { const next = event.target.value; setOppositionId(next); saveDraft({ oppositionId: next || undefined }); }}><option value="">Select Opposition</option>{matchingOpposition.map((opponent) => <option key={opponent.id} value={opponent.id}>{opponent.name}</option>)}</select></label>
      <label>Match date<input type="date" value={date} onChange={(event) => { const next = event.target.value; setDate(next); saveDraft({ date: next || undefined }); }} /></label>
    </div>
    <div className="quick-player" role="group" aria-label="Add a new Opposition"><label>New opposition name<input value={newOppositionName} onChange={(event) => setNewOppositionName(event.target.value)} placeholder="Opposition team" /></label><button type="button" disabled={!newOppositionName.trim()} onClick={() => void addOpposition()}>Add opposition to match</button></div>
    <div className="quick-player" aria-label="Add a player to this Match Squad"><label>New player name<input value={newPlayerName} onChange={(event) => setNewPlayerName(event.target.value)} placeholder="Player name" /></label><button type="button" disabled={!newPlayerName.trim() || playerIds.length === 12} onClick={() => void addPlayer()}>Add player to Match Squad</button></div>
    <fieldset className="squad-picker"><legend>Match Squad <span>{playerIds.length}/12 selected</span></legend>{playerIds.length > 0 && <div className="selected-player-chips" role="group" aria-label="Selected Match Squad">{players.filter((player) => playerIds.includes(player.id)).map((player) => <button key={player.id} type="button" className="player-chip" onClick={() => updatePlayers(playerIds.filter((id) => id !== player.id))}>Remove {playerLabel(player)} from Match Squad</button>)}</div>}<label className="player-search">Search players<input type="search" value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Find a Player" /></label><div className="player-picker-results">{matchingPlayers.map((player) => <label key={player.id} className="player-check"><input type="checkbox" checked={playerIds.includes(player.id)} onChange={() => updatePlayers(playerIds.includes(player.id) ? playerIds.filter((id) => id !== player.id) : [...playerIds, player.id])} disabled={!playerIds.includes(player.id) && playerIds.length === 12} />{playerLabel(player)}</label>)}{matchingPlayers.length === 0 && <p className="picker-empty">No Players match this search.</p>}</div></fieldset>
    <PrimaryActionBar><button type="submit" disabled={!oppositionId || !date || playerIds.length < 5}>Continue to Court Setup</button></PrimaryActionBar>
  </form>;
}

function QuarterSetupCard({ match, startingLineup, quarterNumber, setup, statistics, onLineupChange, onStart }: { match: Pick<StartMatchInput, "date" | "oppositionId" | "squadPlayerIds">; startingLineup: StartingLineup; quarterNumber: number; setup: SetupSummary; statistics?: BetweenQuarterStatistics; onLineupChange: (lineup: StartingLineup) => void; onStart: (startingLineup: StartingLineup) => Promise<void> }) {
  const [lineup, setLineup] = useState<StartingLineup>(startingLineup);
  const squad = setup.players.filter((player) => match.squadPlayerIds.includes(player.id));
  const assignedPlayerIds = Object.values(lineup).filter(Boolean);
  const assignedPlayers = assignedPlayerIds.length;
  const canStart = assignedPlayers >= 5 && new Set(assignedPlayerIds).size === assignedPlayers;
  const startAction = quarterNumber === 1 ? "Start Match" : `Start Quarter ${quarterNumber}`;
  const readiness = canStart
    ? `Court ready — ${assignedPlayers} Players assigned. You can start Quarter ${quarterNumber}.`
    : `Assign ${5 - assignedPlayers} more ${5 - assignedPlayers === 1 ? "Player" : "Players"} to start Quarter ${quarterNumber}.`;
  const updatePosition = (position: Position, playerId: string) => {
    const next = playerId ? { ...lineup, [position]: playerId } : (() => { const { [position]: _, ...remaining } = lineup; return remaining; })();
    setLineup(next);
    onLineupChange(next);
  };
  const availablePlayers = (position: Position) => squad.filter((player) => !Object.entries(lineup).some(([assignedPosition, playerId]) => assignedPosition !== position && playerId === player.id));
  return <section className="draft-card quarter-planner" aria-labelledby="quarter-setup-title">{quarterNumber === 1 && <MatchSetupProgress current="court" />}<div className="draft-heading"><div><p className="eyebrow">QUARTER SETUP</p><h2 id="quarter-setup-title">Set up Quarter {quarterNumber} Court</h2><p>{match.date} · {setup.opposition.find((opposition) => opposition.id === match.oppositionId)?.name}</p></div></div><div className="quarter-planner-bento"><div className="quarter-court"><div className="section-heading"><div><h3>Next Court</h3><p className="court-guidance">Assign a unique Match Squad Player to each Position. Up to two Positions may be vacant.</p></div><p className="court-count">{assignedPlayers}/7 assigned</p></div><p className={`court-readiness ${canStart ? "is-ready" : ""}`} role="status">{readiness}</p><div className="lineup-grid" aria-label="Court Positions">{POSITIONS.map((position) => <label key={position} className="court-position"><span>{position}</span><select aria-label={position} value={lineup[position] ?? ""} onChange={(event) => updatePosition(position, event.target.value)}><option value="">Vacant position</option>{availablePlayers(position).map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label>)}</div></div><aside className="quarter-statistics">{statistics ? <BetweenQuarterStatisticsPanel statistics={statistics} players={setup.players} /> : <><h3>Previous quarter statistics</h3><p>Statistics will be available after Quarter 1.</p></>}</aside></div><PrimaryActionBar><button disabled={!canStart} onClick={() => void onStart(lineup)}>{startAction}</button></PrimaryActionBar></section>;
}

function BetweenQuarterStatisticsPanel({ statistics, players }: { statistics: BetweenQuarterStatistics; players: SetupSummary["players"] }) {
  const [view, setView] = useState<"previous" | "match">("previous");
  const stints = view === "previous" ? statistics.previousQuarterStints : statistics.matchStints;
  const title = view === "previous" ? "Previous quarter statistics" : "All Match statistics";
  return <section className="between-quarter-statistics" aria-labelledby="between-quarter-statistics-title"><div className="section-heading"><h3 id="between-quarter-statistics-title">{title}</h3><button type="button" className="text-button" onClick={() => setView(view === "previous" ? "match" : "previous")}>{view === "previous" ? "All Match" : "Previous quarter"}</button></div><p>{view === "previous" ? `Quarter ${statistics.previousQuarter}` : "All completed quarters"}</p><ul>{stints.map((stint) => <li key={`${stint.playerId}:${stint.position}`}><strong>{playerLabel(players.find((player) => player.id === stint.playerId) ?? { name: "Unknown player" })}</strong> · {stint.position} · {stint.playerStatistics.length ? stint.playerStatistics.map((statistic) => `${statistic.statistic}: ${statistic.count}`).join(" · ") : "No events"}</li>)}</ul></section>;
}

function MatchCard({ game, setup, capture, score, report, summary, actions, onOpenHistory }: { game: Game; setup: SetupSummary; capture?: LiveQuarterCapture; score?: { own: number; opposition: number }; report?: TerminalMatchReport; summary: (selection: { scope: "match" } | { scope: "quarter"; quarter: QuarterNumber }) => StatisticsSummary; actions: MatchActions; onOpenHistory: () => void }) {
  const defaultTab = report ? "match" : game.activeQuarter ?? game.quarters?.at(-1)?.number ?? "match";
  const [tab, setTab] = useState<QuarterNumber | "match">(defaultTab);
  useEffect(() => setTab(defaultTab), [defaultTab]);
  const availableTabs = summary({ scope: "match" }).availableTabs;
  const selectedSummary = tab === "match" ? summary({ scope: "match" }) : summary({ scope: "quarter", quarter: tab });
  const selectedIsLive = game.status === "live" && tab === game.activeQuarter && capture;
  return <section className="match-events" aria-labelledby="match-events-title"><div className="section-heading"><div><p className="eyebrow">MATCH EVENTS</p><h2 id="match-events-title">Match Events</h2></div></div><div className="match-event-tabs" role="tablist" aria-label="Match Events tabs">{([1, 2, 3, 4] as QuarterNumber[]).map((quarter) => <button key={quarter} type="button" role="tab" aria-selected={tab === quarter} disabled={!availableTabs.includes(quarter)} onClick={() => setTab(quarter)}>Q{quarter}</button>)}<button type="button" role="tab" aria-selected={tab === "match"} disabled={!availableTabs.includes("match")} onClick={() => setTab("match")}>Match</button></div>{selectedIsLive ? <LiveQuarterCard game={game} setup={setup} capture={capture} actions={actions} onOpenHistory={onOpenHistory} /> : report && tab === "match" ? <><TerminalMatchCard report={report} onBack={onOpenHistory} /><MatchEventSummaryTable summary={selectedSummary} players={setup.players} label="Match" /></> : <MatchEventSummaryTable summary={selectedSummary} players={setup.players} label={tab === "match" ? "Match" : `Quarter ${tab}`} />}{game.status === "live" && !game.activeQuarter && tab !== "match" && <section className="draft-card live-card"><p className="eyebrow">QUARTER COMPLETE</p><h2>Quarter {game.quarters?.at(-1)?.number} has ended</h2><p>Review the final Court, reposition players, and confirm before the next Quarter starts.</p>{game.quarters?.length === TOTAL_QUARTERS && <><p>Final score: {score?.own} — {score?.opposition}</p><button onClick={() => score && void actions.finalise(score)}>Confirm and finalise</button></>}<AbandonMatchAction onAbandon={actions.abandon} /></section>}</section>;
}

function MatchEventSummaryTable({ summary, players, label }: { summary: StatisticsSummary; players: SetupSummary["players"]; label: string }) {
  return <section className="match-event-summary" aria-label={`${label} statistics`}><p>{summary.readOnly ? "This Match is read-only." : "Completed event summary"}</p><div className="match-event-summary-scroll"><table><thead><tr><th>Player</th><th>Position</th><th>Events</th></tr></thead><tbody>{summary.stints.map((stint) => <tr key={`${stint.playerId}:${stint.position}`}><td>{playerLabel(players.find((player) => player.id === stint.playerId) ?? { name: "Unknown player" })}</td><td>{stint.position}</td><td>{stint.playerStatistics.length ? stint.playerStatistics.map((statistic) => `${statistic.statistic}: ${statistic.count}`).join(" · ") : "No events"}</td></tr>)}</tbody></table></div></section>;
}

function TerminalMatchCard({ report, onBack }: { report: TerminalMatchReport; onBack: () => void }) {
  const outcome = report.outcome.kind === "abandoned" ? "Abandoned - no winner" : report.status === "finalised" ? "Completed" : "Terminated - no winner";
  return <section className="draft-card live-card" aria-labelledby="match-record-title"><div className="section-heading"><div><p className="eyebrow">MATCH RECORD</p><h2 id="match-record-title">{report.teamName} {report.score.own} - {report.oppositionName} {report.score.opposition}</h2></div><button className="text-button" onClick={onBack}>Back to Match History</button></div><p>{report.date} · {outcome}</p><p>This match record is read-only.</p><div className="quarter-review">{report.quarters.map((quarter) => <article key={quarter.number}><h3>Quarter {quarter.number}: {quarter.ownScore} - {quarter.oppositionScore}</h3><p>Starting court: {quarter.startingLineup.map((entry) => `${entry.position}: ${entry.playerName}`).join(", ")}</p>{quarter.substitutions.map((substitution) => <p key={substitution.sequence}>Substitution {substitution.sequence}: {substitution.position}: {substitution.playerName ?? "Vacant"}</p>)}<ul>{quarter.playerStatistics.map((statistic) => <li key={`${statistic.playerId}:${statistic.position}:${statistic.statistic}`}>{statistic.playerName} · {statistic.position} · {statistic.statistic}: {statistic.count}</li>)}</ul></article>)}</div><div className="draft-actions"><button onClick={() => download(`${report.id}.csv`, "text/csv", createMatchCsv(report))}>Download CSV</button><button className="secondary-button" onClick={() => download(`${report.id}.pdf`, "application/pdf", createMatchPdf(report))}>Download PDF</button></div></section>;
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
  return <section className="backup-card" aria-label="Backup and restore controls"><section className="backup-action"><h3>Create a safe backup</h3><p>Download one backup containing every saved Season, lookup, Match, statistic, Court, and result.</p><button className="secondary-button" onClick={() => download("natball-insights-backup.json", "application/json", exportBackup())}>Download backup</button></section><section className="restore-action"><h3>Restore data</h3><p>Merge adds data from a backup and keeps the data already on this device.</p><p className="destructive-note">Replace all local data is destructive and requires confirmation.</p><form onSubmit={(event) => void submit(event)}><label>Backup data<textarea aria-label="Backup data" value={serialized} onChange={(event) => setSerialized(event.target.value)} placeholder="Paste a Natball Insights backup" /></label><label>Import mode<select aria-label="Import mode" value={mode} onChange={(event) => setMode(event.target.value as "merge" | "replace")}><option value="merge">Merge - keep current data</option><option value="replace">Replace all local data</option></select></label><button type="submit">Import backup</button></form></section>{confirmingReplacement && <DestructiveConfirmation title="Replace local data?" description="Replace all local data with this backup? Any unsaved Court selection will be discarded." cancelLabel="Keep local data" confirmLabel="Confirm replacement" onCancel={() => setConfirmingReplacement(false)} onConfirm={() => completeImport(true)} />}</section>;
}

function DestructiveConfirmation({ title, description, cancelLabel, confirmLabel, onCancel, onConfirm }: { title: string; description: string; cancelLabel: string; confirmLabel: string; onCancel: () => void; onConfirm: () => Promise<void> }) {
  return <div className="destructive-confirmation" role="alertdialog" aria-modal="true" aria-label={title}><div className="destructive-confirmation-card"><h3>{title}</h3><p>{description}</p><div className="destructive-confirmation-actions"><button type="button" className="secondary-button" onClick={onCancel}>{cancelLabel}</button><button type="button" onClick={() => void onConfirm()}>{confirmLabel}</button></div></div></div>;
}

function LiveQuarterCard({ game, setup, capture, actions, onOpenHistory }: { game: Game; setup: SetupSummary; capture: LiveQuarterCapture; actions: MatchActions; onOpenHistory: () => void }) {
  const [changingCourt, setChangingCourt] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const compactCaptureControls = useCompactCaptureControls();
  const teamName = setup.teams.find((team) => team.id === setup.seasons.find((season) => season.id === game.seasonId)?.teamId)?.name ?? "Our team";
  const oppositionName = setup.opposition.find((opposition) => opposition.id === game.oppositionId)?.name ?? "Opposition";
  const squad = setup.players.filter((player) => game.squadPlayerIds.includes(player.id));
  const openSubstitution = () => {
    setChangingCourt((current) => !current);
    setShowOverflow(false);
  };
  return <section className="live-capture" aria-labelledby="live-quarter-title"><div className="score-strip"><div><p className="eyebrow">LIVE MATCH · QUARTER {capture.number}</p><h2 id="live-quarter-title">{teamName} {capture.ownGameScore} — {oppositionName} {capture.oppositionGameScore}</h2><p>Quarter: {teamName} {capture.ownScore} — {oppositionName} {capture.oppositionScore}</p></div><button className="opposition-goal" onClick={() => void actions.recordOppositionGoal()}>Opponent goal</button></div><div className="court-toolbar"><strong>Current Court</strong><div><button className="text-button" disabled={!capture.canUndo} onClick={() => void actions.undoCaptureAction()}>Undo</button>{compactCaptureControls ? <><button className="text-button" onClick={openSubstitution}>{changingCourt ? "Cancel Substitution" : "Record Substitution"}</button><button className="text-button" onClick={() => void actions.endQuarter()}>End quarter</button><AbandonMatchAction onAbandon={actions.abandon} /></> : <><button className="text-button" onClick={onOpenHistory}>History</button><button className="text-button" onClick={openSubstitution}>{changingCourt ? "Cancel Substitution" : "Record Substitution"}</button><button className="text-button" onClick={() => void actions.endQuarter()}>End quarter</button><button className="text-button" aria-expanded={showOverflow} onClick={() => setShowOverflow((current) => !current)}>More</button></>}</div></div>{showOverflow && <AbandonMatchAction onAbandon={actions.abandon} />}{changingCourt && <CourtChangeForm court={capture.lineup} squad={squad} onApply={async (input) => { await actions.substitutePlayer(input); setChangingCourt(false); }} />}<div className="live-quarter-layout"><div className="current-court" aria-label="Current court event grid">{POSITIONS.map((position) => <PlayerStatCard key={position} position={position} player={setup.players.find((candidate) => candidate.id === capture.lineup[position])} capture={capture} onRecord={actions.recordPlayerStatistic} />)}</div><ActiveQuarterEventFeed capture={capture} players={setup.players} actions={actions} /></div></section>;
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

function PlayerStatCard({ position, player, capture, onRecord }: { position: Position; player: { id: string; name: string; nickname?: string } | undefined; capture: LiveQuarterCapture; onRecord: (position: Position, statistic: PlayerStatistic) => Promise<void> }) {
  const [feedbackCell, setFeedbackCell] = useState<PlayerStatistic>();
  if (!player) return null;
  const statistics = PLAYER_STATISTICS;
  const record = (statistic: PlayerStatistic) => {
    setFeedbackCell(statistic);
    window.setTimeout(() => setFeedbackCell((current) => current === statistic ? undefined : current), 500);
    void onRecord(position, statistic);
  };
  return <article className="player-stat-card"><h3>{playerLabel(player)}</h3><p className="eyebrow">{positionAbbreviation[position]}</p><div className="stat-buttons">{statistics.map((statistic) => { const count = capture.playerStatistics.find((total) => total.playerId === player.id && total.position === position && total.statistic === statistic)?.count ?? 0; const available = !SHOOTER_STATISTICS.includes(statistic as (typeof SHOOTER_STATISTICS)[number]) || position === "Goal Attack" || position === "Goal Shooter"; return <button key={statistic} className={`event-cell ${statistic === "Goals" ? "goal-event" : statistic === "Misses" ? "miss-event" : ""} ${feedbackCell === statistic ? "event-feedback" : ""}`} disabled={!available} onClick={() => record(statistic)} aria-label={available ? `Record ${statistic} for ${player.name}` : `${statistic} is unavailable for ${player.name}`}><span aria-hidden="true">{statisticHeader[statistic]}</span><span>{available ? count : "—"}</span></button>; })}</div></article>;
}

function captureActionLabel(action: CaptureAction, players: SetupSummary["players"]) {
  if (action.kind === "opposition-goal") return "Opponent goal";
  return `${playerLabel(players.find((player) => player.id === action.playerId) ?? { name: "Unknown player" })} · ${positionAbbreviation[action.position]} · ${action.statistic}`;
}

function ActiveQuarterEventFeed({ capture, players, actions }: { capture: LiveQuarterCapture; players: SetupSummary["players"]; actions: MatchActions }) {
  const [editing, setEditing] = useState<Extract<CaptureAction, { kind: "player-statistic" }>>();
  const [correction, setCorrection] = useState<{ playerId: string; position: Position; statistic: PlayerStatistic }>();
  const [unreadEventCount, setUnreadEventCount] = useState(0);
  const compactDrawer = useCompactCaptureControls();
  const [drawerOpen, setDrawerOpen] = useState(() => !compactDrawer);
  const scrollArea = useRef<HTMLDivElement>(null);
  const wasAtLatest = useRef(true);
  const previousActionCount = useRef(capture.captureActions.length);
  useEffect(() => {
    setDrawerOpen(!compactDrawer);
  }, [compactDrawer]);
  useEffect(() => {
    const element = scrollArea.current;
    if (element) wasAtLatest.current = element.scrollTop + element.clientHeight >= element.scrollHeight - 16;
  }, []);
  useEffect(() => {
    if (capture.captureActions.length <= previousActionCount.current) {
      previousActionCount.current = capture.captureActions.length;
      return;
    }
    const newEventCount = capture.captureActions.length - previousActionCount.current;
    previousActionCount.current = capture.captureActions.length;
    if (wasAtLatest.current && scrollArea.current) {
      scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
      setUnreadEventCount(0);
    } else {
      setUnreadEventCount((current) => current + newEventCount);
    }
  }, [capture.captureActions.length]);
  const beginEditing = (action: Extract<CaptureAction, { kind: "player-statistic" }>) => {
    setEditing(action);
    setCorrection({ playerId: action.playerId, position: action.position, statistic: action.statistic });
  };
  const latest = capture.captureActions.at(-1);
  const latestLabel = latest ? captureActionLabel(latest, players) : "No events recorded yet";
  const followLatest = () => {
    if (scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
    wasAtLatest.current = true;
    setUnreadEventCount(0);
  };
  return <section className="active-event-feed" aria-labelledby="active-event-feed-title"><details open={drawerOpen} onToggle={(event) => setDrawerOpen(event.currentTarget.open)}><summary>Event feed · {latestLabel}</summary><div className="event-feed-content"><h3 id="active-event-feed-title">Quarter {capture.number} event feed</h3>{unreadEventCount > 0 && <button type="button" className="new-events" onClick={followLatest}>{unreadEventCount} new event{unreadEventCount === 1 ? "" : "s"}</button>}<div ref={scrollArea} className="event-feed-scroll" aria-label={`Quarter ${capture.number} Event feed`} onScroll={(event) => { const element = event.currentTarget; wasAtLatest.current = element.scrollTop + element.clientHeight >= element.scrollHeight - 16; }}>{!capture.captureActions.length && <p>No events recorded yet.</p>}<ol>{capture.captureActions.map((action) => <li key={action.id}>{action.kind === "opposition-goal" ? <span>{captureActionLabel(action, players)}</span> : <><span>{captureActionLabel(action, players)}</span><button type="button" className="text-button" onClick={() => beginEditing(action)}>Correct event</button></>}<button type="button" className="text-button" onClick={() => void actions.deleteQuarterAction(capture.number, action.id)}>Remove event</button></li>)}</ol>{editing && correction && <form className="court-change-form" onSubmit={(event) => { event.preventDefault(); void actions.correctQuarterPlayerStatistic(capture.number, editing.id, correction).then(() => setEditing(undefined)); }}><h3>Correct event</h3><label>Player<select aria-label="Event correction player" value={correction.playerId} onChange={(event) => setCorrection({ ...correction, playerId: event.target.value })}>{players.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label><label>Position<select aria-label="Event correction position" value={correction.position} onChange={(event) => setCorrection({ ...correction, position: event.target.value as Position })}>{POSITIONS.map((position) => <option key={position} value={position}>{positionAbbreviation[position]}</option>)}</select></label><label>Event<select aria-label="Event correction statistic" value={correction.statistic} onChange={(event) => setCorrection({ ...correction, statistic: event.target.value as PlayerStatistic })}>{PLAYER_STATISTICS.map((statistic) => <option key={statistic} value={statistic}>{statistic}</option>)}</select></label><button type="submit">Save event correction</button><button type="button" className="text-button" onClick={() => setEditing(undefined)}>Cancel correction</button></form>}</div></div></details></section>;
}

function CourtChangeForm({ court, squad, onApply }: { court: StartingLineup; squad: { id: string; name: string; nickname?: string }[]; onApply: (input: { position: Position; playerId: string }) => Promise<void> }) {
  const [position, setPosition] = useState<Position>("Goal Keeper");
  const [playerId, setPlayerId] = useState("");
  const availablePlayers = squad.filter((player) => !Object.entries(court).some(([occupiedPosition, occupiedPlayerId]) => occupiedPosition !== position && occupiedPlayerId === player.id));
  return <div className="court-change-form"><p>Record one Substitution for a Position. It takes effect for every later player event in this Quarter.</p><label>Position<select aria-label="Substitution Position" value={position} onChange={(event) => { setPosition(event.target.value as Position); setPlayerId(""); }}>{POSITIONS.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}</select></label><label>Player<select aria-label="Substitution Player" value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Choose player</option>{availablePlayers.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label><button disabled={!playerId} onClick={() => void onApply({ position, playerId })}>Record Substitution</button></div>;
}
