import { FormEvent, useEffect, useState } from "react";
import { GameSession } from "./game-session/game-session";
import { IndexedDbGameSessionStore } from "./game-session/indexed-db-game-session-store";
import { PLAYER_STATISTICS, POSITIONS, SHOOTER_STATISTICS, TOTAL_QUARTERS, type BetweenQuarterStatistics, type CaptureAction, type Game, type GameSessionStore, type LiveQuarterCapture, type PlayerStatistic, type Position, type QuarterNumber, type SetupSummary, type StartMatchInput, type StartingLineup, type TerminalMatchReport } from "./game-session/types";
import { createMatchCsv, createMatchPdf } from "./reports";
import "./styles.css";

type AppProps = { store?: GameSessionStore };
type MatchView = { kind: "team-setup" } | { kind: "season-setup" } | { kind: "no-match" } | { kind: "match-identity" } | { kind: "match-squad" } | { kind: "court-setup" } | { kind: "settings" } | { kind: "settings-section"; section: "season" | "backup" } | { kind: "history" } | { kind: "next-quarter-setup"; gameId: string; startingLineup: StartingLineup } | { kind: "game"; gameId: string };
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
    if (setup.matchSetupDraft?.stage === "match-squad") return { kind: "match-squad" };
    if (setup.matchSetupDraft?.stage === "match-identity") return { kind: "match-identity" };
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
const statisticIcon: Record<PlayerStatistic, string> = {
  "Successful Centre Pass Received": "↗",
  Tip: "⌁",
  Intercept: "↯",
  "Unforced Errors": "!",
  "Contact Conceded": "×",
  "Obstruction Conceded": "⊘",
  Goals: "◎",
  Misses: "○"
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
  const liveMatch = session.matches().find((game) => game.status === "live");
  const matchSquadDraft = setup.matchSetupDraft?.stage === "match-squad" ? setup.matchSetupDraft : undefined;
  const courtSetupDraft = setup.matchSetupDraft?.stage === "court-setup" ? setup.matchSetupDraft : undefined;
  const currentView = deriveCurrentView({ matchView, setup, liveMatch, nextQuarterCourt: (gameId) => session.nextQuarterCourt(gameId) });
  const primaryNavigationLabel = liveMatch ? "Live Match" : "Setup Match";
  const navigationView = currentView.kind === "game" || currentView.kind === "next-quarter-setup" ? "match" : currentView.kind === "history" ? "history" : currentView.kind === "settings" || currentView.kind === "settings-section" ? "settings" : undefined;

  return <main className="app-shell">
    <CoachNavigation
      activeView={navigationView}
      primaryLabel={primaryNavigationLabel}
      onOpenMatch={() => setMatchView(undefined)}
      onOpenHistory={() => setMatchView({ kind: "history" })}
      onOpenSettings={() => setMatchView({ kind: "settings" })}
    />
    <div className="app-content">
    {error && <p className="error" role="alert">{error}</p>}
    {currentView.kind === "team-setup" && <section className="match-area focused-screen" aria-labelledby="team-setup-title">
      <p className="eyebrow">TEAM SETUP</p>
      <h2 id="team-setup-title">Team Setup</h2>
      <p>Save your reusable Team before creating a Season.</p>
      <TeamForm onSubmit={(input) => perform(async () => { await session.createTeam(input); setMatchView({ kind: "season-setup" }); })} />
    </section>}

    {currentView.kind === "season-setup" && <section className="match-area focused-screen" aria-labelledby="season-setup-title">
      <p className="eyebrow">SEASON SETUP</p>
      <h2 id="season-setup-title">Season Setup</h2>
      <p>Create an active Season before preparing a Match.</p>
      <SeasonForm team={setup.teams.at(-1)!} onSubmit={(input) => perform(async () => { await session.createSeason(input); setMatchView(undefined); })} />
    </section>}

    {currentView.kind === "settings" && <section className="match-area focused-screen settings-root" aria-labelledby="settings-title"><p className="eyebrow">COACH SETTINGS</p><h2 id="settings-title">Settings</h2><p>Manage your Season and protect your offline data.</p><div className="settings-root-actions">{activeSeason && <button type="button" className="text-button" disabled={Boolean(liveMatch)} onClick={() => setMatchView({ kind: "settings-section", section: "season" })}>End season</button>}<button type="button" className="text-button" onClick={() => setMatchView({ kind: "settings-section", section: "backup" })}>Backup & restore</button></div></section>}
    {currentView.kind === "settings-section" && <section className="match-area focused-screen" aria-labelledby="settings-section-title"><div className="section-heading"><h2 id="settings-section-title">{currentView.section === "season" ? "End season" : "Backup & restore"}</h2><button className="text-button" onClick={() => setMatchView({ kind: "settings" })}>Back to Settings</button></div>{currentView.section === "season" && activeSeason && !liveMatch && <EndSeasonControl season={activeSeason} onConfirm={() => perform(async () => { await session.endSeason(activeSeason.id); setMatchView(undefined); })} />}{currentView.section === "backup" && <BackupCard exportBackup={() => session.exportBackup()} onImport={(serialized, mode, confirmed) => perform(() => session.importBackup(serialized, mode, confirmed))} />}</section>}

    {currentView.kind === "no-match" && <section className="match-area focused-screen no-match-screen" aria-labelledby="no-match-title"><p className="eyebrow">SETUP MATCH</p><h2 id="no-match-title">No Match in progress</h2><p>Start a Match when you are ready to add an Opponent and date.</p><button type="button" onClick={() => setMatchView({ kind: "match-identity" })}>Set up a Match</button></section>}

    {currentView.kind === "match-identity" && activeSeason && <section className="match-area focused-screen" aria-labelledby="match-identity-title">
      <p className="eyebrow">MATCH SETUP · STAGE 3</p><h2 id="match-identity-title">Add Opponent</h2><p>{activeSeason.name} · choose the Opposition and Match date.</p>
      <MatchIdentityForm
        opposition={setup.activeOpposition}
        draft={setup.matchSetupDraft?.stage === "match-identity" ? setup.matchSetupDraft : undefined}
        onAddOpposition={async (input) => {
          const opposition = await session.addOpposition(input);
          refresh();
          return opposition;
        }}
        onSave={(input) => perform(async () => { await session.saveMatchIdentity({ seasonId: activeSeason.id, ...input }); })}
        onProceed={(input) => perform(async () => {
          await session.advanceToMatchSquad({ seasonId: activeSeason.id, ...input });
          setMatchView({ kind: "match-squad" });
        })}
      />
    </section>}
    {currentView.kind === "match-squad" && matchSquadDraft && <section className="match-area focused-screen" aria-labelledby="match-squad-title"><p className="eyebrow">MATCH SETUP · STAGE 4</p><h2 id="match-squad-title">Match Squad</h2><p>{matchSquadDraft.date} · {setup.opposition.find((opposition) => opposition.id === matchSquadDraft.oppositionId)?.name}</p><MatchSquadForm players={setup.players} selectedPlayerIds={matchSquadDraft.squadPlayerIds ?? []} onAddPlayer={async (input) => { const player = await session.addPlayer(input); refresh(); return player; }} onSave={(squadPlayerIds) => perform(async () => { await session.saveMatchSquad({ ...matchSquadDraft, squadPlayerIds }); })} onProceed={(squadPlayerIds) => perform(async () => { await session.advanceToCourtSetup({ ...matchSquadDraft, squadPlayerIds }); setMatchView({ kind: "court-setup" }); })} /></section>}
    {currentView.kind === "court-setup" && courtSetupDraft && <QuarterSetupCard match={courtSetupDraft} startingLineup={{}} quarterNumber={1} setup={setup} onStart={(startingLineup) => perform(async () => {
        const game = await session.startMatch({ ...courtSetupDraft, startingLineup });
        setMatchView({ kind: "game", gameId: game.id });
      })} />}
      {currentView?.kind === "next-quarter-setup" && (() => {
        const game = session.match(currentView.gameId);
        if (!game) return null;
        const quarterNumber = (game.quarters?.length ?? 0) + 1;
        return <QuarterSetupCard match={game} startingLineup={currentView.startingLineup} quarterNumber={quarterNumber} setup={setup} statistics={session.betweenQuarterStatistics(game.id)} onStart={(startingLineup) => perform(async () => {
          await session.startNextQuarter(game.id, startingLineup);
          setMatchView({ kind: "game", gameId: game.id });
        })} />;
      })()}
      {currentView?.kind === "history" && <MatchHistory games={session.matches()} setup={setup} onOpen={(gameId) => setMatchView({ kind: "game", gameId })} />}
      {session.matches().map((game) => currentView?.kind === "game" && currentView.gameId === game.id && <MatchCard
        key={game.id}
        game={game}
        setup={setup}
        capture={game.status === "live" && game.activeQuarter ? session.liveQuarter(game.id) : undefined}
        score={game.status === "live" ? session.gameScore(game.id) : undefined}
        report={game.status === "finalised" || game.status === "abandoned" || game.status === "terminated" ? session.terminalMatchReport(game.id) : undefined}
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

function CoachNavigation({ activeView, primaryLabel, onOpenMatch, onOpenHistory, onOpenSettings }: { activeView?: "match" | "history" | "settings"; primaryLabel: "Setup Match" | "Live Match"; onOpenMatch: () => void; onOpenHistory: () => void; onOpenSettings: () => void }) {
  const items: Array<{ key: "match" | "history" | "settings"; label: string; icon: "court" | "history" | "settings"; onClick: () => void }> = [
    { key: "match" as const, label: primaryLabel, icon: "court", onClick: onOpenMatch },
    { key: "history" as const, label: "Match History", icon: "history", onClick: onOpenHistory },
    { key: "settings" as const, label: "Settings", icon: "settings", onClick: onOpenSettings }
  ];

  return <nav className="coach-navigation" aria-label="Coach navigation">
    <div className="app-identity"><AppMark /><span><strong>Natball</strong><small>Insights</small></span></div>
    <div className="coach-navigation-items">{items.map((item) => <button key={item.key} type="button" className="coach-navigation-item" aria-current={activeView === item.key ? "page" : undefined} onClick={item.onClick}><NavigationIcon name={item.icon} /><span>{item.label}</span></button>)}</div>
  </nav>;
}

function AppMark() {
  return <svg className="app-mark" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16" /><path d="M8 24h32M24 8c5 5 8 10 8 16s-3 11-8 16M24 8c-5 5-8 10-8 16s3 11 8 16M10 34l8-8 6 6 12-12" /></svg>;
}

function NavigationIcon({ name }: { name: "court" | "history" | "settings" }) {
  if (name === "court") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 7h8M12 7v10M8 17h8" /></svg>;
  if (name === "history") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 7v5l3 2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2L3 14.5l2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 3.1h5l.4-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" /></svg>;
}

function MatchHistory({ games, setup, onOpen }: { games: Game[]; setup: SetupSummary; onOpen: (gameId: string) => void }) {
  return <section className="match-area focused-screen" aria-labelledby="match-history-title"><div className="section-heading"><div><p className="eyebrow">MATCH HISTORY</p><h2 id="match-history-title">Match history</h2></div></div><ul className="match-list" aria-label="Saved matches">{games.map((game) => <li key={game.id}><span><strong>{game.date}</strong> · {setup.opposition.find((opposition) => opposition.id === game.oppositionId)?.name}</span><button className="text-button" onClick={() => onOpen(game.id)}>{game.status === "live" ? "View live match" : "View match record"}</button></li>)}</ul></section>;
}

function TeamForm({ onSubmit }: { onSubmit: (input: { name: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ name });
  };
  return <form onSubmit={(event) => void submit(event)}>
    <label>Team name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your team" /></label>
    <button type="submit" disabled={!name.trim()}>Save team</button>
  </form>;
}

function SeasonForm({ team, onSubmit }: { team: SetupSummary["teams"][number]; onSubmit: (input: { name: string; teamId: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ name, teamId: team.id });
    setName("");
  };
  return <form onSubmit={(event) => void submit(event)}>
    <label>Season name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. 2026 Winter" /></label>
    <p><strong>Team:</strong> {team.name}</p>
    <button type="submit" disabled={!name.trim()}>Create season</button>
  </form>;
}

function EndSeasonControl({ season, onConfirm }: { season: { name: string }; onConfirm: () => Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false);
  return <div className="season-ending"><p><strong>{season.name}</strong> is active. End it only after every match is terminal; ended seasons remain readable.</p><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I understand ending this season makes it read-only.</label><button className="secondary-button" disabled={!confirmed} onClick={() => void onConfirm()}>Confirm end season</button></div>;
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

function MatchIdentityForm({ opposition, draft, onAddOpposition, onSave, onProceed }: { opposition: SetupSummary["activeOpposition"]; draft?: { oppositionId?: string; date?: string }; onAddOpposition: (input: { name: string }) => Promise<{ id: string }>; onSave: (input: { oppositionId?: string; date?: string }) => Promise<void>; onProceed: (input: { oppositionId: string; date: string }) => Promise<void> }) {
  const [oppositionId, setOppositionId] = useState(draft?.oppositionId ?? "");
  const [date, setDate] = useState(draft?.date ?? localDate());
  const [newOppositionName, setNewOppositionName] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onProceed({ oppositionId, date });
  };
  const addOpposition = async () => {
    const opposition = await onAddOpposition({ name: newOppositionName });
    setOppositionId(opposition.id);
    setNewOppositionName("");
    await onSave({ oppositionId: opposition.id, date });
  };
  return <form className="match-form" onSubmit={(event) => void submit(event)}>
    <div className="field-grid">
      <label>Opponent<select value={oppositionId} onChange={(event) => { setOppositionId(event.target.value); void onSave({ oppositionId: event.target.value || undefined, date }); }}><option value="">Select opponent</option>{opposition.map((opponent) => <option key={opponent.id} value={opponent.id}>{opponent.name}</option>)}</select></label>
      <label>Match date<input type="date" value={date} onChange={(event) => { setDate(event.target.value); void onSave({ oppositionId: oppositionId || undefined, date: event.target.value || undefined }); }} /></label>
    </div>
    <div className="quick-player"><label>New opposition name<input value={newOppositionName} onChange={(event) => setNewOppositionName(event.target.value)} placeholder="Opposition team" /></label><button type="button" disabled={!newOppositionName.trim()} onClick={() => void addOpposition()}>Add opposition to match</button></div>
    <button type="submit" disabled={!oppositionId || !date}>Continue to Match Squad</button>
  </form>;
}

function MatchSquadForm({ players, selectedPlayerIds, onAddPlayer, onSave, onProceed }: { players: SetupSummary["players"]; selectedPlayerIds: string[]; onAddPlayer: (input: { name: string }) => Promise<{ id: string }>; onSave: (playerIds: string[]) => Promise<void>; onProceed: (playerIds: string[]) => Promise<void> }) {
  const [playerIds, setPlayerIds] = useState(selectedPlayerIds);
  const [newPlayerName, setNewPlayerName] = useState("");
  const updatePlayers = (next: string[]) => {
    setPlayerIds(next);
    void onSave(next);
  };
  const addPlayer = async () => {
    const player = await onAddPlayer({ name: newPlayerName });
    const next = playerIds.includes(player.id) ? playerIds : [...playerIds, player.id];
    updatePlayers(next);
    setNewPlayerName("");
  };
  return <form className="match-form" onSubmit={(event) => { event.preventDefault(); void onProceed(playerIds); }}>
    <div className="quick-player" aria-label="Add a player to this Match Squad"><label>New player name<input value={newPlayerName} onChange={(event) => setNewPlayerName(event.target.value)} placeholder="Player name" /></label><button type="button" disabled={!newPlayerName.trim() || playerIds.length === 12} onClick={() => void addPlayer()}>Add player to Match Squad</button></div>
    <fieldset className="squad-picker"><legend>Match Squad <span>{playerIds.length}/12 selected</span></legend><div className="player-checks">{players.map((player) => <label key={player.id} className="player-check"><input type="checkbox" checked={playerIds.includes(player.id)} onChange={() => updatePlayers(playerIds.includes(player.id) ? playerIds.filter((id) => id !== player.id) : [...playerIds, player.id])} disabled={!playerIds.includes(player.id) && playerIds.length === 12} />{playerLabel(player)}</label>)}</div></fieldset>
    <button type="submit" disabled={playerIds.length < 5}>Continue to Court Setup</button>
  </form>;
}

function QuarterSetupCard({ match, startingLineup, quarterNumber, setup, statistics, onStart }: { match: Pick<StartMatchInput, "date" | "oppositionId" | "squadPlayerIds">; startingLineup: StartingLineup; quarterNumber: number; setup: SetupSummary; statistics?: BetweenQuarterStatistics; onStart: (startingLineup: StartingLineup) => Promise<void> }) {
  const [lineup, setLineup] = useState<StartingLineup>(startingLineup);
  const squad = setup.players.filter((player) => match.squadPlayerIds.includes(player.id));
  const canStart = Object.values(lineup).filter(Boolean).length >= 5 && new Set(Object.values(lineup).filter(Boolean)).size === Object.values(lineup).filter(Boolean).length;
  const updatePosition = (position: Position, playerId: string) => setLineup((current) => {
    if (playerId) return { ...current, [position]: playerId };
    const { [position]: _, ...remaining } = current;
    return remaining;
  });
  const availablePlayers = (position: Position) => squad.filter((player) => !Object.entries(lineup).some(([assignedPosition, playerId]) => assignedPosition !== position && playerId === player.id));
  return <section className="draft-card" aria-labelledby="quarter-setup-title"><div className="draft-heading"><div><p className="eyebrow">QUARTER SETUP</p><h2 id="quarter-setup-title">Set up Quarter {quarterNumber} Court</h2><p>{match.date} · {setup.opposition.find((opposition) => opposition.id === match.oppositionId)?.name}</p></div></div>{statistics && <BetweenQuarterStatisticsPanel statistics={statistics} players={setup.players} />}<div className="lineup-grid">{POSITIONS.map((position) => <label key={position}>{position}<select aria-label={position} value={lineup[position] ?? ""} onChange={(event) => updatePosition(position, event.target.value)}><option value="">Vacant position</option>{availablePlayers(position).map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label>)}</div><div className="draft-actions"><button disabled={!canStart} onClick={() => void onStart(lineup)}>{quarterNumber === 1 ? "Start Match" : `Start Quarter ${quarterNumber}`}</button></div></section>;
}

function BetweenQuarterStatisticsPanel({ statistics, players }: { statistics: BetweenQuarterStatistics; players: SetupSummary["players"] }) {
  const [view, setView] = useState<"previous" | "match">("previous");
  const stints = view === "previous" ? statistics.previousQuarterStints : statistics.matchStints;
  const title = view === "previous" ? "Previous quarter statistics" : "All Match statistics";
  return <section className="between-quarter-statistics" aria-labelledby="between-quarter-statistics-title"><div className="section-heading"><h3 id="between-quarter-statistics-title">{title}</h3><button type="button" className="text-button" onClick={() => setView(view === "previous" ? "match" : "previous")}>{view === "previous" ? "All Match" : "Previous quarter"}</button></div><p>{view === "previous" ? `Quarter ${statistics.previousQuarter}` : "All completed quarters"}</p><ul>{stints.map((stint) => <li key={`${stint.playerId}:${stint.position}`}><strong>{playerLabel(players.find((player) => player.id === stint.playerId) ?? { name: "Unknown player" })}</strong> · {stint.position} · {stint.playerStatistics.length ? stint.playerStatistics.map((statistic) => `${statistic.statistic}: ${statistic.count}`).join(" · ") : "No events"}</li>)}</ul></section>;
}

function MatchCard({ game, setup, capture, score, report, actions, onOpenHistory }: { game: Game; setup: SetupSummary; capture?: LiveQuarterCapture; score?: { own: number; opposition: number }; report?: TerminalMatchReport; actions: MatchActions; onOpenHistory: () => void }) {
  if (game.status === "live" && capture) return <LiveQuarterCard game={game} setup={setup} capture={capture} actions={actions} onOpenHistory={onOpenHistory} />;
  if (game.status === "live") return <section className="draft-card live-card"><p className="eyebrow">QUARTER COMPLETE</p><h2>Quarter {game.quarters?.at(-1)?.number} has ended</h2><p>Review the final Court, reposition players, and confirm before the next Quarter starts.</p>{game.quarters?.length === TOTAL_QUARTERS && <><p>Final score: {score?.own} — {score?.opposition}</p><button onClick={() => score && void actions.finalise(score)}>Confirm and finalise</button></>}<AbandonMatchAction onAbandon={actions.abandon} /></section>;
  if (report) return <TerminalMatchCard report={report} />;
  return null;
}

function TerminalMatchCard({ report }: { report: TerminalMatchReport }) {
  const outcome = report.outcome.kind === "abandoned" ? "Abandoned - no winner" : report.status === "finalised" ? "Completed" : "Terminated - no winner";
  return <section className="draft-card live-card" aria-labelledby="match-record-title"><p className="eyebrow">MATCH RECORD</p><h2 id="match-record-title">{report.teamName} {report.score.own} - {report.oppositionName} {report.score.opposition}</h2><p>{report.date} · {outcome}</p><p>This match record is read-only.</p><div className="quarter-review">{report.quarters.map((quarter) => <article key={quarter.number}><h3>Quarter {quarter.number}: {quarter.ownScore} - {quarter.oppositionScore}</h3><p>Starting court: {quarter.startingLineup.map((entry) => `${entry.position}: ${entry.playerName}`).join(", ")}</p>{quarter.substitutions.map((substitution) => <p key={substitution.sequence}>Substitution {substitution.sequence}: {substitution.position}: {substitution.playerName ?? "Vacant"}</p>)}<ul>{quarter.playerStatistics.map((statistic) => <li key={`${statistic.playerId}:${statistic.position}:${statistic.statistic}`}>{statistic.playerName} · {statistic.position} · {statistic.statistic}: {statistic.count}</li>)}</ul></article>)}</div><div className="draft-actions"><button onClick={() => download(`${report.id}.csv`, "text/csv", createMatchCsv(report))}>Download CSV</button><button className="secondary-button" onClick={() => download(`${report.id}.pdf`, "application/pdf", createMatchPdf(report))}>Download PDF</button></div></section>;
}

function BackupCard({ exportBackup, onImport }: { exportBackup: () => string; onImport: (serialized: string, mode: "merge" | "replace", confirmed: boolean) => Promise<void> }) {
  const [serialized, setSerialized] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirmed, setConfirmed] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onImport(serialized, mode, confirmed);
    setSerialized(""); setConfirmed(false);
  };
  return <section className="setup-card" aria-labelledby="backup-title"><div><h2 id="backup-title">Protect your data</h2><p>Download one backup for every saved season, lookup, match, statistic, court, and result.</p></div><button className="secondary-button" onClick={() => download("natball-insights-backup.json", "application/json", exportBackup())}>Download backup</button><form onSubmit={(event) => void submit(event)}><label>Backup data<textarea aria-label="Backup data" value={serialized} onChange={(event) => setSerialized(event.target.value)} placeholder="Paste a Natball Insights backup" /></label><label>Import mode<select aria-label="Import mode" value={mode} onChange={(event) => setMode(event.target.value as "merge" | "replace")}><option value="merge">Merge - keep current data</option><option value="replace">Replace all local data</option></select></label>{mode === "replace" && <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I understand this permanently replaces local data.</label>}<button type="submit">Import backup</button></form></section>;
}

function LiveQuarterCard({ game, setup, capture, actions, onOpenHistory }: { game: Game; setup: SetupSummary; capture: LiveQuarterCapture; actions: MatchActions; onOpenHistory: () => void }) {
  const [changingCourt, setChangingCourt] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const teamName = setup.teams.find((team) => team.id === setup.seasons.find((season) => season.id === game.seasonId)?.teamId)?.name ?? "Our team";
  const oppositionName = setup.opposition.find((opposition) => opposition.id === game.oppositionId)?.name ?? "Opposition";
  const squad = setup.players.filter((player) => game.squadPlayerIds.includes(player.id));
  return <section className="live-capture" aria-labelledby="live-quarter-title"><div className="scoreboard"><div><p className="eyebrow">MATCH CENTRE</p><p>Quarter {capture.number} is live</p><h2 id="live-quarter-title">{teamName} {capture.ownGameScore} — {oppositionName} {capture.oppositionGameScore}</h2><p className="match-score">Quarter score: {teamName} {capture.ownScore} — {oppositionName} {capture.oppositionScore}</p></div><div className="score-actions"><button className="secondary-button" disabled={!capture.canUndo} onClick={() => void actions.undoCaptureAction()}>Undo last event</button><button className="opposition-goal" onClick={() => void actions.recordOppositionGoal()}>Opposition goal</button><button className="secondary-button" onClick={() => void actions.endQuarter()}>End quarter</button></div></div><div className="court-toolbar"><strong>Current court</strong><div><button className="text-button" onClick={onOpenHistory}>History</button><button className="text-button" onClick={() => setChangingCourt((current) => !current)}>{changingCourt ? "Cancel Substitution" : "Record Substitution"}</button><button className="text-button" aria-expanded={showOverflow} onClick={() => setShowOverflow((current) => !current)}>More match actions</button></div></div>{showOverflow && <AbandonMatchAction onAbandon={actions.abandon} />}{changingCourt && <CourtChangeForm court={capture.lineup} squad={squad} onApply={async (input) => { await actions.substitutePlayer(input); setChangingCourt(false); }} />}<div aria-label="Current court event grid" style={{ display: "grid", gap: 8 }}>{POSITIONS.map((position) => <PlayerStatCard key={position} position={position} player={setup.players.find((candidate) => candidate.id === capture.lineup[position])} capture={capture} onRecord={actions.recordPlayerStatistic} />)}</div><ActiveQuarterEventFeed capture={capture} players={setup.players} actions={actions} /></section>;
}

function AbandonMatchAction({ onAbandon }: { onAbandon: () => Promise<void> }) {
  return <div className="overflow-actions"><button className="secondary-button" onClick={() => void onAbandon()}>Abandon match</button></div>;
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
  if (!player) return null;
  const statistics = PLAYER_STATISTICS;
  return <article className="player-stat-card" style={{ display: "grid", gridTemplateColumns: "minmax(90px, 1fr) 34px minmax(0, 5fr)", alignItems: "center", gap: 10 }}><h3>{playerLabel(player)}</h3><p className="eyebrow">{positionAbbreviation[position]}</p><div className="stat-buttons" style={{ gridTemplateColumns: `repeat(${statistics.length}, minmax(36px, 1fr))`, marginTop: 0 }}>{statistics.map((statistic) => { const count = capture.playerStatistics.find((total) => total.playerId === player.id && total.position === position && total.statistic === statistic)?.count ?? 0; const available = !SHOOTER_STATISTICS.includes(statistic as (typeof SHOOTER_STATISTICS)[number]) || position === "Goal Attack" || position === "Goal Shooter"; return <button key={statistic} className="stat-button" disabled={!available} onClick={() => void onRecord(position, statistic)} aria-label={available ? `Record ${statistic} for ${player.name}` : `${statistic} is unavailable for ${player.name}`}><span aria-hidden="true">{statisticIcon[statistic]}</span><span>{available ? count : "—"}</span></button>; })}</div></article>;
}

function ActiveQuarterEventFeed({ capture, players, actions }: { capture: LiveQuarterCapture; players: SetupSummary["players"]; actions: MatchActions }) {
  const [editing, setEditing] = useState<Extract<CaptureAction, { kind: "player-statistic" }>>();
  const [correction, setCorrection] = useState<{ playerId: string; position: Position; statistic: PlayerStatistic }>();
  const beginEditing = (action: Extract<CaptureAction, { kind: "player-statistic" }>) => {
    setEditing(action);
    setCorrection({ playerId: action.playerId, position: action.position, statistic: action.statistic });
  };
  return <section className="active-event-feed" aria-labelledby="active-event-feed-title"><h3 id="active-event-feed-title">Quarter {capture.number} event feed</h3>{!capture.captureActions.length && <p>No events recorded yet.</p>}<ol>{capture.captureActions.map((action) => <li key={action.id}>{action.kind === "opposition-goal" ? <span>Opposition goal</span> : <><span>{playerLabel(players.find((player) => player.id === action.playerId) ?? { name: "Unknown player" })} · {positionAbbreviation[action.position]} · {action.statistic}</span><button type="button" className="text-button" onClick={() => beginEditing(action)}>Correct event</button></>}<button type="button" className="text-button" onClick={() => void actions.deleteQuarterAction(capture.number, action.id)}>Remove event</button></li>)}</ol>{editing && correction && <form className="court-change-form" onSubmit={(event) => { event.preventDefault(); void actions.correctQuarterPlayerStatistic(capture.number, editing.id, correction).then(() => setEditing(undefined)); }}><h3>Correct event</h3><label>Player<select aria-label="Event correction player" value={correction.playerId} onChange={(event) => setCorrection({ ...correction, playerId: event.target.value })}>{players.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label><label>Position<select aria-label="Event correction position" value={correction.position} onChange={(event) => setCorrection({ ...correction, position: event.target.value as Position })}>{POSITIONS.map((position) => <option key={position} value={position}>{positionAbbreviation[position]}</option>)}</select></label><label>Event<select aria-label="Event correction statistic" value={correction.statistic} onChange={(event) => setCorrection({ ...correction, statistic: event.target.value as PlayerStatistic })}>{PLAYER_STATISTICS.map((statistic) => <option key={statistic} value={statistic}>{statistic}</option>)}</select></label><button type="submit">Save event correction</button><button type="button" className="text-button" onClick={() => setEditing(undefined)}>Cancel correction</button></form>}</section>;
}

function CourtChangeForm({ court, squad, onApply }: { court: StartingLineup; squad: { id: string; name: string; nickname?: string }[]; onApply: (input: { position: Position; playerId: string }) => Promise<void> }) {
  const [position, setPosition] = useState<Position>("Goal Keeper");
  const [playerId, setPlayerId] = useState("");
  const availablePlayers = squad.filter((player) => !Object.entries(court).some(([occupiedPosition, occupiedPlayerId]) => occupiedPosition !== position && occupiedPlayerId === player.id));
  return <div className="court-change-form"><p>Record one Substitution for a Position. It takes effect for every later player event in this Quarter.</p><label>Position<select aria-label="Substitution Position" value={position} onChange={(event) => { setPosition(event.target.value as Position); setPlayerId(""); }}>{POSITIONS.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}</select></label><label>Player<select aria-label="Substitution Player" value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Choose player</option>{availablePlayers.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label><button disabled={!playerId} onClick={() => void onApply({ position, playerId })}>Record Substitution</button></div>;
}
