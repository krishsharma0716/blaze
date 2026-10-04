# Phase review

What happened, in order. `ARCHITECTURE.md` is the map of how the pieces connect. This file is the log of what was actually built and what is still unproven. Later phases get a section here when they finish.

## Phase 0 — foundations

The goal was three proofs: a SpacetimeDB row shows up in the browser by itself, Spectrum answers one iMessage, and one Grok voice clip plays. Only the database half is proven.

### What a full-stack split means here

The laptop is not the database. Four programs have four jobs.

- **Next.js** (`app/`) is the website. `app/page.tsx` is a client component, which means that file runs in the judge's browser. It can draw the list. It must not hold the Grok key.
- **The server route** (`app/api/tts/route.ts`) runs on the machine that hosts Next.js, not in the browser. The browser sends it text. The route calls `POST https://api.x.ai/v1/tts` with `voice_id: "eve"` and streams the MP3 bytes back. Nothing is written to a file. `lib/core/speakBrief.ts` only turns tags into that text. A tag is `{ label, value, detail }`.
- **SpacetimeDB** is a database in Spacetime's cloud. The module in `spacetimedb/src/index.ts` declares tables and reducers. A reducer is the only way to insert or change a row. Clients can read a public table. They cannot write one by themselves.
- **The agent** (`agent/index.ts`) is a separate long-running Node process. Photon Spectrum delivers iMessages to it over a gRPC connection. It is not part of the website. During judging that process has to stay running on this Mac.

### What was built

Tables, all public so the browser may subscribe:

- `incident` — one row per fire click or text. Columns include `title`, `kind` (`fire` or `address`), `lat`, `lon`, `source`.
- `brief` — tags and the spoken script as text, not audio.
- `message` — inbound and outbound texts.
- `conversation` — which incident a chat is currently about.
- `crew_status` — `responding`, `on scene`, or `clear`.

Reducers written: `open_incident`, `save_brief`, `log_message`, `set_active_incident`, `set_crew_status`. Phase 0 only called `open_incident`.

The CLI is version 2.9.0 at `~/.local/bin/spacetime`. The first installer stopped because it wanted a yes/no in a terminal. The binary was downloaded from the v2.9.0 release instead. Login then succeeded, and the module was published:

`spacetime publish -s maincloud mhacks2026`

The hosted database name is `mhacks2026`. Dashboard: https://spacetimedb.com/mhacks2026

`spacetime generate` wrote `lib/module_bindings/`. Those files are the typed client. `app/page.tsx` builds a `DbConnection` to `https://maincloud.spacetimedb.com`, subscribes with `SELECT * FROM incident`, and copies the rows into React state. A subscription is a live query: when a reducer inserts a row, the cloud pushes it to every open page. The page does not poll and does not refresh.

`scripts/insert-incident.ts` calls that reducer from the terminal. The cloud now has one row: title `Phase 0 check`, kind `fire`, source `web`. Confirmed with `spacetime sql`, not by looking at the browser.

### What is not proven yet

- The page has not been opened in a browser, so the "shows up without refresh" proof is only half done. Run `npm run dev` and the row should appear.
- The voice route has not been called. It needs `XAI_API_KEY` in `.env.local`. There is no `.env.local` yet.
- The iMessage agent has not been started. It needs `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET`. On a text it replies with the same words and writes an incident. It does not ask Grok what the text means. That classification is Phase 4.
- The site is not deployed to Vercel. Judges do not have a public URL yet.
- No wildfire, weather, or address API is called. That is intentional. Those run when someone clicks a fire or searches an address.

### Not in this phase

Grok vision and house photos were removed. Solar will be a permit lookup in Phase 3, not a picture. The app does not answer searches from files in `fixtures/`.

## Phase 1 — fire map

Not started.

## Phase 2 — impact and recovery

Not started.

## Phase 3 — NYC address brief

Not started.

## Phase 4 — agent and live board

Not started. The Phase 0 agent is only an echo plus a database write.

## Phase 5 — Palisades CO2 check

Not started.

## Phase 6 — submission

Not started.
