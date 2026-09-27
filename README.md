# Natball Insights

Natball Insights is an offline-first progressive web app for netball coaches. It guides coaches from Season Setup through just-in-time Match and Quarter Setup into live, quarter-by-quarter statistics capture, then preserves completed and Abandoned Match records for review and export, alongside readable legacy records.

It is for coaches who want to record match statistics quickly at court side and retain a useful history without relying on a network connection.

## Run locally for development

Install a current Node.js LTS release and pnpm. Then, from the repository root:

```sh
pnpm install
pnpm dev
```

Vite prints the local URL, normally `http://localhost:5173`. Changes to the source reload in the browser. Run the checks with:

```sh
pnpm test
pnpm run build
```

## Run the production build locally

Build the production bundle, then serve it with Vite's preview server:

```sh
pnpm install
pnpm run build
pnpm exec vite preview
```

Open the URL printed by the preview server. This exercises the production bundle, including the PWA service worker. The build output is written to `dist/`; deploy that directory to any static web host.

## Coach guide

See [the coach guide](docs/coach-guide.md) for the guided match-day workflow, Match Centre controls, outcomes, reports, and recovery controls.

## Data and privacy

The app stores its data in the browser on the device where it is used. Download a backup regularly, especially before changing devices or clearing browser data. A backup includes setup data, matches, quarter history, results, and statistics.
