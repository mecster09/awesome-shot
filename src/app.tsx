import { FormEvent, useEffect, useState } from "react";
import { GameSession } from "./game-session/game-session";
import { IndexedDbGameSessionStore } from "./game-session/indexed-db-game-session-store";
import { POSITIONS, type CreateDraftInput, type Game, type GameSessionStore, type Position, type SetupSummary, type StartingLineup } from "./game-session/types";
import "./styles.css";

type AppProps = { store?: GameSessionStore };
type MatchView = { kind: "new" } | { kind: "game"; gameId: string };

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
      <SetupCard title="Seasons" description="Your team name is saved with every season.">
        <SeasonForm
          defaultTeamName={session.newSeasonDefaults().teamName}
          onSubmit={(input) => perform(async () => { await session.createSeason(input); })}
        />
        <ul className="record-list" aria-label="Saved seasons">
          {setup.seasons.map((season) => <li key={season.id}><strong>{season.name}</strong><span>{season.teamName}</span></li>)}
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

    <section className="next-step" aria-label="Next step">
      <span className="step-number">1</span>
      <div><strong>Match setup ready</strong><p>Choose your squad and starting seven before Quarter 1.</p></div>
    </section>

    <section className="match-area" aria-labelledby="match-title">
      <div className="section-heading"><div><p className="eyebrow">MATCH CENTRE</p><h2 id="match-title">Prepare your next game</h2></div><button onClick={() => setMatchView({ kind: "new" })}>Create match</button></div>
      {matchView?.kind === "new" && <NewMatchForm
        setup={setup}
        onAddPlayer={async (input) => {
          const player = await session.addPlayer(input);
          refresh();
          return player;
        }}
        onCreate={(input) => perform(async () => {
          const game = await session.createDraft(input);
          setMatchView({ kind: "game", gameId: game.id });
        })}
      />}
      {session.matches().map((game) => matchView?.kind === "game" && matchView.gameId === game.id && <DraftMatchCard
        key={game.id}
        game={game}
        setup={setup}
        onSaveLineup={(lineup) => perform(() => session.setStartingLineup(game.id, lineup))}
        onStart={(lineup) => perform(async () => { await session.setStartingLineup(game.id, lineup); await session.startQuarterOne(game.id); })}
        onDelete={() => perform(async () => { await session.deleteDraft(game.id); setMatchView(undefined); })}
      />)}
      {!matchView && session.matches().length > 0 && <ul className="match-list" aria-label="Saved match drafts">
        {session.matches().map((game) => <li key={game.id}><span><strong>{game.date}</strong> · {setup.opposition.find((opposition) => opposition.id === game.oppositionId)?.name}</span><button className="text-button" onClick={() => setMatchView({ kind: "game", gameId: game.id })}>{game.status === "draft" ? "Open draft" : "View live match"}</button></li>)}
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

function SeasonForm({ defaultTeamName, onSubmit }: { defaultTeamName: string; onSubmit: (input: { name: string; teamName: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState(defaultTeamName);
  useEffect(() => setTeamName((current) => current || defaultTeamName), [defaultTeamName]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ name, teamName });
    setName("");
  };
  return <form onSubmit={(event) => void submit(event)}>
    <label>Season name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. 2026 Winter" /></label>
    <label>Team name<input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Your team" /></label>
    <button type="submit">Save season</button>
  </form>;
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

function NewMatchForm({ setup, onAddPlayer, onCreate }: { setup: SetupSummary; onAddPlayer: (input: { name: string; nickname?: string }) => Promise<{ id: string }>; onCreate: (input: CreateDraftInput) => Promise<void> }) {
  const [seasonId, setSeasonId] = useState(setup.seasons.at(-1)?.id ?? "");
  const [oppositionId, setOppositionId] = useState(setup.selectedOpposition?.id ?? setup.activeOpposition.at(0)?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [squadPlayerIds, setSquadPlayerIds] = useState<string[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerNickname, setNewPlayerNickname] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onCreate({ seasonId, oppositionId, date, squadPlayerIds });
  };
  const togglePlayer = (id: string) => setSquadPlayerIds((current) => current.includes(id) ? current.filter((playerId) => playerId !== id) : [...current, id]);
  const addPlayerToSquad = async () => {
    const player = await onAddPlayer({ name: newPlayerName, nickname: newPlayerNickname });
    setSquadPlayerIds((current) => [...current, player.id]);
    setNewPlayerName("");
    setNewPlayerNickname("");
  };
  return <form className="match-form" onSubmit={(event) => void submit(event)}>
    <div className="field-grid">
      <label>Season<select value={seasonId} onChange={(event) => setSeasonId(event.target.value)}><option value="">Select season</option>{setup.seasons.map((season) => <option key={season.id} value={season.id}>{season.name} · {season.teamName}</option>)}</select></label>
      <label>Opposition<select value={oppositionId} onChange={(event) => setOppositionId(event.target.value)}><option value="">Select opposition</option>{setup.activeOpposition.map((opposition) => <option key={opposition.id} value={opposition.id}>{opposition.name}</option>)}</select></label>
      <label>Match date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    </div>
    <div className="quick-player" aria-label="Add a player to this squad"><label>New player name<input value={newPlayerName} onChange={(event) => setNewPlayerName(event.target.value)} placeholder="Player name" /></label><label>New player nickname <span className="optional">optional</span><input aria-label="New player nickname" value={newPlayerNickname} onChange={(event) => setNewPlayerNickname(event.target.value)} placeholder="Nickname" /></label><button type="button" disabled={!newPlayerName.trim() || squadPlayerIds.length === 12} onClick={() => void addPlayerToSquad()}>Add player to squad</button></div>
    <fieldset className="squad-picker"><legend>Match squad <span>{squadPlayerIds.length}/12 selected</span></legend><div className="player-checks">{setup.players.map((player) => <label key={player.id} className="player-check"><input type="checkbox" checked={squadPlayerIds.includes(player.id)} onChange={() => togglePlayer(player.id)} disabled={!squadPlayerIds.includes(player.id) && squadPlayerIds.length === 12} />{playerLabel(player)}</label>)}</div></fieldset>
    <button type="submit">Create draft</button>
  </form>;
}

function DraftMatchCard({ game, setup, onSaveLineup, onStart, onDelete }: { game: Game; setup: SetupSummary; onSaveLineup: (lineup: StartingLineup) => Promise<void>; onStart: (lineup: StartingLineup) => Promise<void>; onDelete: () => Promise<void> }) {
  const [lineup, setLineup] = useState<Partial<StartingLineup>>(game.startingLineup ?? {});
  const squad = setup.players.filter((player) => game.squadPlayerIds.includes(player.id));
  const updatePosition = (position: Position, playerId: string) => setLineup((current) => ({ ...current, [position]: playerId }));
  const savedLineup = lineup as StartingLineup;
  if (game.status === "live") return <section className="draft-card live-card"><p className="eyebrow">LIVE MATCH</p><h2>Quarter 1 is live</h2><p>Your squad is locked. Live statistics are coming next.</p></section>;
  return <section className="draft-card" aria-labelledby="starting-seven-title"><div className="draft-heading"><div><p className="eyebrow">MATCH DRAFT</p><h2 id="starting-seven-title">Set your starting seven</h2><p>{game.date} · {setup.opposition.find((opposition) => opposition.id === game.oppositionId)?.name}</p></div><button className="text-button" onClick={() => void onDelete()}>Delete draft</button></div><div className="lineup-grid">{POSITIONS.map((position) => <label key={position}>{position}<select aria-label={position} value={lineup[position] ?? ""} onChange={(event) => updatePosition(position, event.target.value)}><option value="">Choose player</option>{squad.map((player) => <option key={player.id} value={player.id}>{playerLabel(player)}</option>)}</select></label>)}</div><div className="draft-actions"><button className="secondary-button" onClick={() => void onSaveLineup(savedLineup)}>Save starting court</button><button onClick={() => void onStart(savedLineup)}>Start Quarter 1</button></div></section>;
}
