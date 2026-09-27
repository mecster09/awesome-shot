import { FormEvent, useEffect, useState } from "react";
import { GameSession } from "./game-session/game-session";
import { IndexedDbGameSessionStore } from "./game-session/indexed-db-game-session-store";
import { GENERAL_STATISTICS, PLAYER_STATISTICS, POSITIONS, SHOOTER_STATISTICS, type CaptureAction, type Game, type GameSessionStore, type LiveQuarterCapture, type PlayerStatistic, type Position, type QuarterNumber, type SetupSummary, type StartMatchInput, type StartingLineup, type TerminalMatchReport } from "./game-session/types";
import { createMatchCsv, createMatchPdf } from "./reports";
import "./styles.css";

type AppProps = { store?: GameSessionStore };
type MatchView = { kind: "team-setup" } | { kind: "season-setup" } | { kind: "match-identity" } | { kind: "match-squad" } | { kind: "settings"; section: "season" | "backup" } | { kind: "history"; returnToGameId?: string } | { kind: "quarter-setup"; input: Omit<StartMatchInput, "startingLineup"> } | { kind: "next-quarter-setup"; gameId: string; startingLineup: StartingLineup } | { kind: "game"; gameId: string };
type MatchActions = {
  recordPlayerStatistic: (position: Position, statistic: PlayerStatistic) => Promise<void>;
  recordOppositionGoal: () => Promise<void>;
  undoCaptureAction: () => Promise<void>;
  substitutePlayer: (input: { position: Position; playerId: string }) => Promise<void>;
  endQuarter: () => Promise<void>;
  abandon: () => Promise<void>;
  finalise: (score: { own: number; opposition: number }) => Promise<void>;
  deleteHistoricalAction: (quarter: QuarterNumber, actionId: string) => Promise<void>;
  correctHistoricalAction: (quarter: QuarterNumber, actionId: string, correction: { playerId: string; position: Position; statistic: PlayerStatistic }) => Promise<void>;
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
const browserStore = new IndexedDbGameSessionStore();

export function App({ store }: AppProps) {
  const gameSessionStore = store ?? browserStore;
  const [session, setSession] = useState<GameSession>();
  const [setup, setSetup] = useState<SetupSummary>();
  const [message, setMessage] = useState("Preparing your offline workspace…");
  const [error, setError] = useState<string>();
  const [matchView, setMatchView] = useState<MatchView>();
  const [menuOpen, setMenuOpen] = useState(false);

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
  const currentView = matchView ?? (liveMatch ? { kind: "game" as const, gameId: liveMatch.id } : activeSeason ? setup.matchSetupDraft?.stage === "match-squad" ? { kind: "match-squad" as const } : { kind: "match-identity" as const } : setup.teams.length > 0 ? { kind: "season-setup" as const } : { kind: "team-setup" as const });
  const openMenuView = (view: Extract<MatchView, { kind: "settings" | "history" }>) => {
    setMatchView(view);
    setMenuOpen(false);
  };

  return <main className="app-shell">
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true">N</div>
      <div>
        <p className="eyebrow">OFFLINE MATCH STATS</p>
        <h1>Natball Insights</h1>
      </div>
      <span className="offline-badge">Ready offline</span>
      <div className="header-menu">
        <button className="text-button" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>Open menu</button>
        {menuOpen && <div className="header-menu-panel" role="menu">
          {activeSeason && <button type="button" role="menuitem" disabled={Boolean(liveMatch)} onClick={() => openMenuView({ kind: "settings", section: "season" })}>End season</button>}
          <button type="button" role="menuitem" onClick={() => openMenuView({ kind: "settings", section: "backup" })}>Backup & restore</button>
          <button type="button" role="menuitem" onClick={() => openMenuView({ kind: "history" })}>Match history</button>
        </div>}
      </div>
    </header>

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

    {currentView.kind === "settings" && <section className="match-area focused-screen" aria-labelledby="settings-title"><div className="section-heading"><h2 id="settings-title">{currentView.section === "season" ? "End season" : "Backup & restore"}</h2><button className="text-button" onClick={() => setMatchView(undefined)}>Back</button></div>{currentView.section === "season" && activeSeason && !liveMatch && <EndSeasonControl season={activeSeason} onConfirm={() => perform(async () => { await session.endSeason(activeSeason.id); setMatchView(undefined); })} />}{currentView.section === "backup" && <BackupCard exportBackup={() => session.exportBackup()} onImport={(serialized, mode, confirmed) => perform(() => session.importBackup(serialized, mode, confirmed))} />}</section>}

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
    {currentView.kind === "match-squad" && setup.matchSetupDraft && <section className="match-area focused-screen" aria-labelledby="match-squad-title"><p className="eyebrow">MATCH SETUP · STAGE 4</p><h2 id="match-squad-title">Match Squad</h2><p>{setup.matchSetupDraft.date} · {setup.opposition.find((opposition) => opposition.id === setup.matchSetupDraft?.oppositionId)?.name}</p><p>Choose the Match Squad next.</p></section>}
    {currentView?.kind === "quarter-setup" && <QuarterSetupCard match={currentView.input} startingLineup={{}} quarterNumber={1} setup={setup} onCancel={() => setMatchView({ kind: "match-identity" })} onStart={(startingLineup) => perform(async () => {
        const game = await session.startMatch({ ...currentView.input, startingLineup });
        setMatchView({ kind: "game", gameId: game.id });
      })} />}
      {currentView?.kind === "next-quarter-setup" && (() => {
        const game = session.match(currentView.gameId);
        if (!game) return null;
        const quarterNumber = (game.quarters?.length ?? 0) + 1;
        return <QuarterSetupCard match={game} startingLineup={currentView.startingLineup} quarterNumber={quarterNumber} setup={setup} onCancel={() => setMatchView({ kind: "game", gameId: game.id })} onAddPlayer={async (input) => {
          const player = await session.addPlayer(input);
          await session.addPlayerToSquad(game.id, player.id);
          refresh();
        }} onStart={(startingLineup) => perform(async () => {
          await session.startNextQuarter(game.id, startingLineup);
          setMatchView({ kind: "game", gameId: game.id });
        })} />;
      })()}
      {currentView?.kind === "history" && <MatchHistory games={session.matches()} setup={setup} backLabel={currentView.returnToGameId ? "Back to Match Centre" : activeSeason ? "Back to Match Setup" : "Back to Season Setup"} onBack={() => setMatchView(currentView.returnToGameId ? { kind: "game", gameId: currentView.returnToGameId } : undefined)} onOpen={(gameId) => setMatchView({ kind: "game", gameId })} />}
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
          endQuarter: () => perform(() => session.endQuarter(game.id)),
          abandon: () => perform(() => session.abandonGame(game.id)),
          finalise: (score) => perform(() => session.finaliseGame(game.id, score)),
          deleteHistoricalAction: (quarter, actionId) => perform(() => session.deleteCaptureAction(game.id, quarter, actionId)),
          correctHistoricalAction: (quarter, actionId, correction) => perform(() => session.correctPlayerStatistic(game.id, quarter, actionId, correction))
        }}
        onSetUpNextQuarter={() => setMatchView({ kind: "next-quarter-setup", gameId: game.id, startingLineup: session.nextQuarterCourt(game.id) })}
        onOpenHistory={() => setMatchView({ kind: "history", returnToGameId: game.id })}
      />)}
  </main>;
}

function MatchHistory({ games, setup, backLabel, onBack, onOpen }: { games: Game[]; setup: SetupSummary; backLabel: string; onBack: () => void; onOpen: (gameId: string) => void }) {
  return <section className="match-area focused-screen" aria-labelledby="match-history-title"><div className="section-heading"><div><p className="eyebrow">MATCH HISTORY</p><h2 id="match-history-title">Match history</h2></div><button className="text-button" onClick={onBack}>{backLabel}</button></div><ul className="match-list" aria-label="Saved matches">{games.map((game) => <li key={game.id}><span><strong>{game.date}</strong> · {setup.opposition.find((opposition) => opposition.id === game.oppositionId)?.name}</span><button className="text-button" onClick={() => onOpen(game.id)}>{game.status === "live" ? "View live match" : "View match record"}</button></li>)}</ul></section>;
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

function QuarterSetupCard({ match, startingLineup, quarterNumber, setup, onCancel, onAddPlayer, onStart }: { match: Pick<StartMatchInput, "date" | "oppositionId" | "squadPlayerIds">; startingLineup: StartingLineup; quarterNumber: number; setup: SetupSummary; onCancel: () => void; onAddPlayer?: (input: { name: string }) => Promise<void>; onStart: (startingLineup: StartingLineup) => Promise<void> }) {
  const [lineup, setLineup] = useState<StartingLineup>(startingLineup);
  const [latePlayerName, setLatePlayerName] = useState("");
  const squad = setup.players.filter((player) => match.squadPlayerIds.includes(player.id));
  const updatePosition = (position: Position, playerId: string) => setLineup((current) => {
    if (playerId) return { ...current, [position]: playerId };
    const { [position]: _, ...remaining } = current;
    return remaining;
  });
  const availablePlayers = (position: Position) => squad.filter((player) => !Object.entries(lineup).some(([assignedPosition, playerId]) => assignedPosition !== position && playerId === player.id));
  return <section className="draft-card" aria-labelledby="quarter-setup-title"><div className="draft-heading"><div><p className="eyebrow">QUARTER SETUP</p><h2 id="quarter-setup-title">Set up Quarter {quarterNumber} Court</h2><p>{match.date} · {setup.opposition.find((opposition) => opposition.id === match.oppositionId)?.name}</p></div><button className="text-button" onClick={onCancel}>Cancel Match Setup</button></div>{onAddPlayer && <div className="quick-player"><label>Late player name<input value={latePlayerName} onChange={(event) => setLatePlayerName(event.target.value)} placeholder="Player name" /></label><button type="button" disabled={!latePlayerName.trim() || match.squadPlayerIds.length === 12} onClick={() => void onAddPlayer({ name: latePlayerName }).then(() => setLatePlayerName(""))}>Add player to squad</button></div>}<div className="lineup-grid">{POSITIONS.map((position) => <label key={position}>{position}<select aria-label={position} value={lineup[position] ?? ""} onChange={(event) => updatePosition(position, event.target.value)}><option value="">Vacant position</option>{availablePlayers(position).map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label>)}</div><div className="draft-actions"><button onClick={() => void onStart(lineup)}>Start Quarter {quarterNumber}</button></div></section>;
}

function MatchCard({ game, setup, capture, score, report, actions, onSetUpNextQuarter, onOpenHistory }: { game: Game; setup: SetupSummary; capture?: LiveQuarterCapture; score?: { own: number; opposition: number }; report?: TerminalMatchReport; actions: MatchActions; onSetUpNextQuarter: () => void; onOpenHistory: () => void }) {
  if (game.status === "live" && capture) return <LiveQuarterCard game={game} setup={setup} capture={capture} actions={actions} onOpenHistory={onOpenHistory} />;
  if (game.status === "live") return <section className="draft-card live-card"><p className="eyebrow">QUARTER COMPLETE</p><h2>Quarter {game.quarters?.at(-1)?.number} has ended</h2><p>Review the final Court, reposition players, and confirm before the next Quarter starts.</p>{game.quarters?.length === 4 ? <><p>Final score: {score?.own} — {score?.opposition}</p><button onClick={() => score && void actions.finalise(score)}>Confirm and finalise</button></> : <button onClick={onSetUpNextQuarter}>Set up Quarter {(game.quarters?.length ?? 0) + 1}</button>}<AbandonMatchAction onAbandon={actions.abandon} /></section>;
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
  return <section className="live-capture" aria-labelledby="live-quarter-title"><div className="scoreboard"><div><p className="eyebrow">MATCH CENTRE</p><p>Quarter {capture.number} is live</p><h2 id="live-quarter-title">{teamName} {capture.ownGameScore} — {oppositionName} {capture.oppositionGameScore}</h2><p className="match-score">Quarter score: {teamName} {capture.ownScore} — {oppositionName} {capture.oppositionScore}</p></div><div className="score-actions"><button className="secondary-button" disabled={!capture.canUndo} onClick={() => void actions.undoCaptureAction()}>Undo last player event</button><button className="opposition-goal" onClick={() => void actions.recordOppositionGoal()}>Opposition goal</button><button className="secondary-button" onClick={() => void actions.endQuarter()}>End quarter</button></div></div><div className="court-toolbar"><strong>Current court</strong><div><button className="text-button" onClick={onOpenHistory}>History</button><button className="text-button" onClick={() => setChangingCourt((current) => !current)}>{changingCourt ? "Cancel Substitution" : "Record Substitution"}</button><button className="text-button" aria-expanded={showOverflow} onClick={() => setShowOverflow((current) => !current)}>More match actions</button></div></div>{showOverflow && <AbandonMatchAction onAbandon={actions.abandon} />}{changingCourt && <CourtChangeForm court={capture.lineup} squad={squad} onApply={async (input) => { await actions.substitutePlayer(input); setChangingCourt(false); }} />}<div className="live-card-grid">{POSITIONS.map((position) => <PlayerStatCard key={position} position={position} player={setup.players.find((candidate) => candidate.id === capture.lineup[position])} capture={capture} onRecord={actions.recordPlayerStatistic} />)}</div></section>;
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
  const statistics = position === "Goal Attack" || position === "Goal Shooter" ? [...GENERAL_STATISTICS, ...SHOOTER_STATISTICS] : GENERAL_STATISTICS;
  return <article className="player-stat-card"><p className="eyebrow">{position}</p><h3>{playerLabel(player)}</h3><div className="stat-buttons">{statistics.map((statistic) => { const count = capture.playerStatistics.find((total) => total.playerId === player.id && total.position === position && total.statistic === statistic)?.count ?? 0; return <button key={statistic} className="stat-button" onClick={() => void onRecord(position, statistic)} aria-label={`Record ${statistic} for ${player.name}`}><span aria-hidden="true">{statisticIcon[statistic]}</span><span>{count}</span></button>; })}</div></article>;
}

function CourtChangeForm({ court, squad, onApply }: { court: StartingLineup; squad: { id: string; name: string; nickname?: string }[]; onApply: (input: { position: Position; playerId: string }) => Promise<void> }) {
  const [position, setPosition] = useState<Position>("Goal Keeper");
  const [playerId, setPlayerId] = useState("");
  const availablePlayers = squad.filter((player) => !Object.entries(court).some(([occupiedPosition, occupiedPlayerId]) => occupiedPosition !== position && occupiedPlayerId === player.id));
  return <div className="court-change-form"><p>Record one Substitution for a Position. It takes effect for every later player event in this Quarter.</p><label>Position<select aria-label="Substitution Position" value={position} onChange={(event) => { setPosition(event.target.value as Position); setPlayerId(""); }}>{POSITIONS.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}</select></label><label>Player<select aria-label="Substitution Player" value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Choose player</option>{availablePlayers.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label><button disabled={!playerId} onClick={() => void onApply({ position, playerId })}>Record Substitution</button></div>;
}
