import { FormEvent, useEffect, useState } from "react";
import { GameSession } from "./game-session/game-session";
import { IndexedDbGameSessionStore } from "./game-session/indexed-db-game-session-store";
import { GENERAL_STATISTICS, PLAYER_STATISTICS, POSITIONS, SHOOTER_STATISTICS, type CaptureAction, type Game, type GameSessionStore, type LiveQuarterCapture, type PlayerStatistic, type Position, type QuarterNumber, type SetupSummary, type StartMatchInput, type StartingLineup, type TerminalMatchReport } from "./game-session/types";
import { createMatchCsv, createMatchPdf } from "./reports";
import "./styles.css";

type AppProps = { store?: GameSessionStore };
type MatchView = { kind: "new" } | { kind: "quarter-setup"; input: Omit<StartMatchInput, "startingLineup"> } | { kind: "next-quarter-setup"; gameId: string; startingLineup: StartingLineup } | { kind: "game"; gameId: string };
type MatchActions = {
  recordPlayerStatistic: (position: Position, statistic: PlayerStatistic) => Promise<void>;
  recordOppositionGoal: () => Promise<void>;
  undoCaptureAction: () => Promise<void>;
  substitutePlayer: (input: { position: Position; playerId: string }) => Promise<void>;
  endQuarter: () => Promise<void>;
  abandon: (winner: "team" | "opposition") => Promise<void>;
  terminate: () => Promise<void>;
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

  return <main className="app-shell">
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true">N</div>
      <div>
        <p className="eyebrow">OFFLINE MATCH STATS</p>
        <h1>Natball Insights</h1>
      </div>
      <span className="offline-badge">Ready offline</span>
    </header>

    <section className="welcome" aria-labelledby="welcome-title">
      <p className="eyebrow">YOUR SEASON HUB</p>
      <h2 id="welcome-title">Set up once. Focus on the court.</h2>
      <p>Create your season, player list, and opposition lookup now. Your data stays securely on this device.</p>
    </section>

    {error && <p className="error" role="alert">{error}</p>}

    <div className="setup-grid">
      <SetupCard title="Seasons" description="Create one active season at a time and reuse your saved teams.">
        {activeSeason
          ? <EndSeasonControl season={activeSeason} onConfirm={() => perform(() => session.endSeason(activeSeason.id))} />
          : <SeasonForm teams={setup.teams} defaultTeamName={session.newSeasonDefaults().teamName} onSubmit={(input) => perform(async () => { await session.createSeason(input); })} />}
        <ul className="record-list" aria-label="Saved seasons">
          {setup.seasons.map((season) => <li key={season.id}><strong>{season.name}</strong><span>{setup.teams.find((team) => team.id === season.teamId)?.name} · {season.status === "active" ? "Active" : "Ended"}</span></li>)}
          {!setup.seasons.length && <EmptyState>Start with your current season.</EmptyState>}
        </ul>
      </SetupCard>

      <SetupCard title="Players" description="Add names and optional nicknames for quick recognition.">
        <PlayerForm onSubmit={(input) => perform(async () => { await session.addPlayer(input); })} />
        <ul className="record-list" aria-label="Saved players">
          {setup.players.map((player) => <li key={player.id}><strong>{playerLabel(player)}</strong></li>)}
          {!setup.players.length && <EmptyState>Your squad will be ready when you are.</EmptyState>}
        </ul>
      </SetupCard>

      <SetupCard title="Opposition" description="Keep frequently played teams ready for match setup.">
        <OppositionForm onSubmit={(name) => perform(async () => { await session.addOpposition({ name }); })} />
        <ul className="record-list" aria-label="Active opposition">
          {setup.activeOpposition.map((opposition) => <li key={opposition.id}><strong>{opposition.name}{setup.selectedOpposition?.id === opposition.id && <span className="selected-label">Selected</span>}</strong><span className="record-actions"><button className="text-button" onClick={() => void perform(() => session.selectOpposition(opposition.id))}>{setup.selectedOpposition?.id === opposition.id ? "Selected" : "Select"}</button><button className="text-button" onClick={() => void perform(() => session.archiveOpposition(opposition.id))}>Archive</button></span></li>)}
          {!setup.activeOpposition.length && <EmptyState>Add an opposition team when you need one.</EmptyState>}
        </ul>
      </SetupCard>
    </div>

    <BackupCard exportBackup={() => session.exportBackup()} onImport={(serialized, mode, confirmed) => perform(() => session.importBackup(serialized, mode, confirmed))} />

    <section className="next-step" aria-label="Next step">
      <span className="step-number">1</span>
      <div><strong>Match setup ready</strong><p>Choose your squad and starting seven before Quarter 1.</p></div>
    </section>

    <section className="match-area" aria-labelledby="match-title">
      <div className="section-heading"><div><p className="eyebrow">MATCH CENTRE</p><h2 id="match-title">Prepare your next game</h2></div><button disabled={!activeSeason || !!liveMatch} onClick={() => setMatchView({ kind: "new" })}>Create match</button></div>
      {matchView?.kind === "new" && <NewMatchForm
        setup={setup}
        onAddPlayer={async (input) => {
          const player = await session.addPlayer(input);
          refresh();
          return player;
        }}
        onAddOpposition={async (input) => {
          const opposition = await session.addOpposition(input);
          refresh();
          return opposition;
        }}
        onProceed={(input) => setMatchView({ kind: "quarter-setup", input })}
      />}
      {matchView?.kind === "quarter-setup" && <QuarterSetupCard match={matchView.input} startingLineup={{}} quarterNumber={1} setup={setup} onCancel={() => setMatchView({ kind: "new" })} onStart={(startingLineup) => perform(async () => {
        const game = await session.startMatch({ ...matchView.input, startingLineup });
        setMatchView({ kind: "game", gameId: game.id });
      })} />}
      {matchView?.kind === "next-quarter-setup" && (() => {
        const game = session.match(matchView.gameId);
        if (!game) return null;
        const quarterNumber = (game.quarters?.length ?? 0) + 1;
        return <QuarterSetupCard match={game} startingLineup={matchView.startingLineup} quarterNumber={quarterNumber} setup={setup} onCancel={() => setMatchView({ kind: "game", gameId: game.id })} onAddPlayer={async (input) => {
          const player = await session.addPlayer(input);
          await session.addPlayerToSquad(game.id, player.id);
          refresh();
        }} onStart={(startingLineup) => perform(async () => {
          await session.startNextQuarter(game.id, startingLineup);
          setMatchView({ kind: "game", gameId: game.id });
        })} />;
      })()}
      {session.matches().map((game) => matchView?.kind === "game" && matchView.gameId === game.id && <MatchCard
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
          abandon: (winner) => perform(() => session.abandonGame(game.id, winner)),
          terminate: () => perform(() => session.terminateGame(game.id)),
          finalise: (score) => perform(() => session.finaliseGame(game.id, score)),
          deleteHistoricalAction: (quarter, actionId) => perform(() => session.deleteCaptureAction(game.id, quarter, actionId)),
          correctHistoricalAction: (quarter, actionId, correction) => perform(() => session.correctPlayerStatistic(game.id, quarter, actionId, correction))
        }}
        onSetUpNextQuarter={() => setMatchView({ kind: "next-quarter-setup", gameId: game.id, startingLineup: session.nextQuarterCourt(game.id) })}
      />)}
      {!matchView && session.matches().length > 0 && <ul className="match-list" aria-label="Saved matches">
        {session.matches().map((game) => <li key={game.id}><span><strong>{game.date}</strong> · {setup.opposition.find((opposition) => opposition.id === game.oppositionId)?.name}</span><button className="text-button" onClick={() => setMatchView({ kind: "game", gameId: game.id })}>{game.status === "live" ? "View live match" : "View match record"}</button></li>)}
      </ul>}
    </section>
  </main>;
}

function SetupCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="setup-card"><div><h2>{title}</h2><p>{description}</p></div>{children}</section>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <li className="empty-state">{children}</li>;
}

function SeasonForm({ teams, defaultTeamName, onSubmit }: { teams: SetupSummary["teams"]; defaultTeamName: string; onSubmit: (input: { name: string; teamId?: string; teamName?: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [teamName, setTeamName] = useState(defaultTeamName);
  useEffect(() => setTeamName((current) => current || defaultTeamName), [defaultTeamName]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit(teamId ? { name, teamId } : { name, teamName });
    setName("");
  };
  return <form onSubmit={(event) => void submit(event)}>
    <label>Season name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. 2026 Winter" /></label>
    {teams.length > 0 && <label>Team<select value={teamId} onChange={(event) => setTeamId(event.target.value)}><option value="">Create a new team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
    {!teamId && <label>New team name<input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Your team" /></label>}
    <button type="submit">Create season</button>
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

function NewMatchForm({ setup, onAddPlayer, onAddOpposition, onProceed }: { setup: SetupSummary; onAddPlayer: (input: { name: string; nickname?: string }) => Promise<{ id: string }>; onAddOpposition: (input: { name: string }) => Promise<{ id: string }>; onProceed: (input: Omit<StartMatchInput, "startingLineup">) => void }) {
  const activeSeasons = setup.seasons.filter((season) => season.status === "active");
  const [seasonId, setSeasonId] = useState(activeSeasons.at(-1)?.id ?? "");
  const [oppositionId, setOppositionId] = useState(setup.selectedOpposition?.id ?? setup.activeOpposition.at(0)?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [squadPlayerIds, setSquadPlayerIds] = useState<string[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerNickname, setNewPlayerNickname] = useState("");
  const [newOppositionName, setNewOppositionName] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    onProceed({ seasonId, oppositionId, date, squadPlayerIds });
  };
  const togglePlayer = (id: string) => setSquadPlayerIds((current) => current.includes(id) ? current.filter((playerId) => playerId !== id) : [...current, id]);
  const addPlayerToSquad = async () => {
    const player = await onAddPlayer({ name: newPlayerName, nickname: newPlayerNickname });
    setSquadPlayerIds((current) => current.includes(player.id) ? current : [...current, player.id]);
    setNewPlayerName("");
    setNewPlayerNickname("");
  };
  const addOpposition = async () => {
    const opposition = await onAddOpposition({ name: newOppositionName });
    setOppositionId(opposition.id);
    setNewOppositionName("");
  };
  return <form className="match-form" onSubmit={(event) => void submit(event)}>
    <div className="field-grid">
      <label>Season<select value={seasonId} onChange={(event) => setSeasonId(event.target.value)}><option value="">Select season</option>{activeSeasons.map((season) => <option key={season.id} value={season.id}>{season.name} · {setup.teams.find((team) => team.id === season.teamId)?.name}</option>)}</select></label>
      <label>Opposition<select value={oppositionId} onChange={(event) => setOppositionId(event.target.value)}><option value="">Select opposition</option>{setup.activeOpposition.map((opposition) => <option key={opposition.id} value={opposition.id}>{opposition.name}</option>)}</select></label>
      <label>Match date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    </div>
    <div className="quick-player"><label>New opposition name<input value={newOppositionName} onChange={(event) => setNewOppositionName(event.target.value)} placeholder="Opposition team" /></label><button type="button" disabled={!newOppositionName.trim()} onClick={() => void addOpposition()}>Add opposition to match</button></div>
    <div className="quick-player" aria-label="Add a player to this squad"><label>New player name<input value={newPlayerName} onChange={(event) => setNewPlayerName(event.target.value)} placeholder="Player name" /></label><label>New player nickname <span className="optional">optional</span><input aria-label="New player nickname" value={newPlayerNickname} onChange={(event) => setNewPlayerNickname(event.target.value)} placeholder="Nickname" /></label><button type="button" disabled={!newPlayerName.trim() || squadPlayerIds.length === 12} onClick={() => void addPlayerToSquad()}>Add player to squad</button></div>
    <fieldset className="squad-picker"><legend>Match squad <span>{squadPlayerIds.length}/12 selected</span></legend><div className="player-checks">{setup.players.map((player) => <label key={player.id} className="player-check"><input type="checkbox" checked={squadPlayerIds.includes(player.id)} onChange={() => togglePlayer(player.id)} disabled={!squadPlayerIds.includes(player.id) && squadPlayerIds.length === 12} />{playerLabel(player)}</label>)}</div></fieldset>
    <button type="submit">Continue to Quarter Setup</button>
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

function MatchCard({ game, setup, capture, score, report, actions, onSetUpNextQuarter }: { game: Game; setup: SetupSummary; capture?: LiveQuarterCapture; score?: { own: number; opposition: number }; report?: TerminalMatchReport; actions: MatchActions; onSetUpNextQuarter: () => void }) {
  if (game.status === "live" && capture) return <LiveQuarterCard game={game} setup={setup} capture={capture} actions={actions} />;
  if (game.status === "live") return <section className="draft-card live-card"><p className="eyebrow">QUARTER COMPLETE</p><h2>Quarter {game.quarters?.at(-1)?.number} has ended</h2><p>Review the final Court, reposition players, and confirm before the next Quarter starts.</p>{game.quarters?.length === 4 ? <><p>Final score: {score?.own} — {score?.opposition}</p><button onClick={() => score && void actions.finalise(score)}>Confirm and finalise</button></> : <button onClick={onSetUpNextQuarter}>Set up Quarter {(game.quarters?.length ?? 0) + 1}</button>}<TerminalActions onAbandon={actions.abandon} onTerminate={actions.terminate} /></section>;
  if (report) return <TerminalMatchCard report={report} />;
  return null;
}

function TerminalMatchCard({ report }: { report: TerminalMatchReport }) {
  const outcome = report.outcome.kind === "abandoned" ? `Abandoned - ${report.outcome.winner === "team" ? report.teamName : report.oppositionName} won` : report.status === "finalised" ? "Finalised" : "Terminated - no winner";
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

function LiveQuarterCard({ game, setup, capture, actions }: { game: Game; setup: SetupSummary; capture: LiveQuarterCapture; actions: MatchActions }) {
  const [changingCourt, setChangingCourt] = useState(false);
  const teamName = setup.teams.find((team) => team.id === setup.seasons.find((season) => season.id === game.seasonId)?.teamId)?.name ?? "Our team";
  const oppositionName = setup.opposition.find((opposition) => opposition.id === game.oppositionId)?.name ?? "Opposition";
  const squad = setup.players.filter((player) => game.squadPlayerIds.includes(player.id));
  return <section className="live-capture" aria-labelledby="live-quarter-title"><div className="scoreboard"><div><p className="eyebrow">Quarter {capture.number} is live</p><h2 id="live-quarter-title">{teamName} {capture.ownScore} — {oppositionName} {capture.oppositionScore}</h2><p className="match-score">Match score: {teamName} {capture.ownGameScore} — {oppositionName} {capture.oppositionGameScore}</p></div><div className="score-actions"><button className="secondary-button" disabled={!capture.canUndo} onClick={() => void actions.undoCaptureAction()}>Undo last player event</button><button onClick={() => void actions.recordOppositionGoal()}>Opposition goal</button><button className="secondary-button" onClick={() => void actions.endQuarter()}>End quarter</button></div></div><div className="court-toolbar"><strong>Current court</strong><button className="text-button" onClick={() => setChangingCourt((current) => !current)}>{changingCourt ? "Cancel Substitution" : "Record Substitution"}</button></div>{changingCourt && <CourtChangeForm court={capture.lineup} squad={squad} onApply={async (input) => { await actions.substitutePlayer(input); setChangingCourt(false); }} />}<div className="live-card-grid">{POSITIONS.map((position) => <PlayerStatCard key={position} position={position} player={setup.players.find((candidate) => candidate.id === capture.lineup[position])} capture={capture} onRecord={actions.recordPlayerStatistic} />)}</div><QuarterReview quarters={game.quarters?.filter((quarter) => quarter.status === "ended") ?? []} players={squad} onDeleteAction={actions.deleteHistoricalAction} onCorrectAction={actions.correctHistoricalAction} /><TerminalActions onAbandon={actions.abandon} onTerminate={actions.terminate} teamName={teamName} oppositionName={oppositionName} /></section>;
}

function TerminalActions({ onAbandon, onTerminate, teamName = "team", oppositionName = "opposition" }: { onAbandon: (winner: "team" | "opposition") => Promise<void>; onTerminate: () => Promise<void>; teamName?: string; oppositionName?: string }) {
  return <div className="draft-actions"><button className="secondary-button" onClick={() => void onAbandon("team")}>Abandon — {teamName} wins</button><button className="secondary-button" onClick={() => void onAbandon("opposition")}>Abandon — {oppositionName} wins</button><button className="text-button" onClick={() => void onTerminate()}>Terminate game</button></div>;
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
  return <article className="player-stat-card"><p className="eyebrow">{position}</p><h3>{playerLabel(player)}</h3><div className="stat-buttons">{statistics.map((statistic) => { const count = capture.playerStatistics.find((total) => total.playerId === player.id && total.position === position && total.statistic === statistic)?.count ?? 0; return <button key={statistic} className="stat-button" onClick={() => void onRecord(position, statistic)} aria-label={`Record ${statistic} for ${player.name}`}>{statistic}<span>{count}</span></button>; })}</div></article>;
}

function CourtChangeForm({ court, squad, onApply }: { court: StartingLineup; squad: { id: string; name: string; nickname?: string }[]; onApply: (input: { position: Position; playerId: string }) => Promise<void> }) {
  const [position, setPosition] = useState<Position>("Goal Keeper");
  const [playerId, setPlayerId] = useState("");
  const availablePlayers = squad.filter((player) => !Object.entries(court).some(([occupiedPosition, occupiedPlayerId]) => occupiedPosition !== position && occupiedPlayerId === player.id));
  return <div className="court-change-form"><p>Record one Substitution for a Position. It takes effect for every later player event in this Quarter.</p><label>Position<select aria-label="Substitution Position" value={position} onChange={(event) => { setPosition(event.target.value as Position); setPlayerId(""); }}>{POSITIONS.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}</select></label><label>Player<select aria-label="Substitution Player" value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Choose player</option>{availablePlayers.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label><button disabled={!playerId} onClick={() => void onApply({ position, playerId })}>Record Substitution</button></div>;
}
