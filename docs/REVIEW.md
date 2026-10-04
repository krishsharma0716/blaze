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

The map is a MapLibre page. Opening it calls `GET /api/fires`, which asks the live WFIGS current-perimeter service for GeoJSON. Each polygon is thinned to about 80 points so the browser can draw it. A click sends that fire to `POST /api/fire-detail`. That route, in parallel, asks Open-Meteo for wind, humidity, temperature, and soil moisture at the forecast hour closest to 1, 2, 3, or 6 hours, asks Open-Meteo for elevation at the center and four nearby points to estimate slope, and asks the National Weather Service if a red flag warning is active. If `FIRMS_MAP_KEY` is set, it also counts VIIRS hotspots. The cone is drawn downwind from the perimeter edge. Distance is about 10 percent of the wind speed, times the interval, scaled by humidity and slope. The panel says ember spotting is not modeled.

The Satellite checkbox turns on yesterday's NASA GIBS true-color tiles. The Hotspots checkbox asks our server for FIRMS tiles so the key never reaches the browser. The Palisades button calls the WFIGS history service and keeps the California feature near 23,448 acres.

A successful click also calls the `openIncident` reducer, so the name shows up on the live board.

Follow-up fixes: each fire has a center dot on a street map with place names. Satellite tiles stop stretching past zoom 9. The red-flag tag ignores other weather alerts. No cone is drawn when the forecast fails. A fire is written to the board once, not on every hour button. The evacuation disclaimer stays on screen. The voice route accepts tags only, capped at 500 characters. Temperature is Fahrenheit and wind uses a compass direction. Homes in the cone use an OpenStreetMap building count. iMessage ids are stored as "crew member 1" and never as a phone number. `FIRMS_MAP_KEY` is in `.env.example`. NASA emails that key; it is not in the repo.

The notes folder is `docs/`.

## Phase 2 — impact and recovery

A click now also returns a carbon estimate, animals recorded inside the perimeter, critical-habitat names, a LANDFIRE vegetation name, and help links. CO2 uses hectares times a fuel load times a burned fraction times 1.6. Forest, shrub, and grass defaults are in the tag detail. If the vegetation sample fails, the estimate says it used shrub defaults. Projected CO2 uses the cone area and is unavailable when weather fails and no cone is drawn. Species come from GBIF animal occurrences. Habitat is USFWS designated habitat that overlaps the fire box. Help links are national, plus Penny Pines, Sugar Pine Foundation, or TreePeople only when the fire is in that region. They are labeled as general links, not assigned to this fire.

## Phase 3 — NYC address brief

The side panel search calls `GET /api/address` only after submit. GeoSearch resolves the lot. If the typed place is outside the five boroughs, the panel says the brief covers New York City only. PLUTO supplies year built, floors, building class, and alteration year. The alteration is its own tag and does not replace year built. Era hazards come from that year and from class A, B, or C. Solar is a live DOB NOW Build filing lookup: Yes, No record, or unavailable. The summary is three sentences from those tags, and Play brief speaks them.

Checked against PLUTO: 84-74 257 Street, Queens is 1945. 350 Fifth Avenue is 1931. 1 Centre Street is 1914. 20 Exchange Place is 1931. 11 Hoyt Street, Brooklyn is 2018. A Chicago address was rejected.

## Phase 4 — agent and live board

Not started. The Phase 0 agent is only an echo plus a database write.

## Phase 5 — Palisades CO2 check

Not started.

## Phase 6 — submission

Not started.
