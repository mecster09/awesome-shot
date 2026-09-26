import { FormEvent, useEffect, useState } from "react";
import { GameSession } from "./game-session/game-session";
import { IndexedDbGameSessionStore } from "./game-session/indexed-db-game-session-store";
import type { GameSessionStore, SetupSummary } from "./game-session/types";
import "./styles.css";

type AppProps = { store?: GameSessionStore };

const playerLabel = (player: { name: string; nickname?: string }) =>
  player.nickname ? `${player.name} (${player.nickname})` : player.name;
const browserStore = new IndexedDbGameSessionStore();

export function App({ store }: AppProps) {
  const gameSessionStore = store ?? browserStore;
  const [session, setSession] = useState<GameSession>();
  const [setup, setSetup] = useState<SetupSummary>();
  const [message, setMessage] = useState("Preparing your offline workspace…");
  const [error, setError] = useState<string>();

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
      <div><strong>Foundation ready</strong><p>Match setup and live game capture are the next Natball Insights steps.</p></div>
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
