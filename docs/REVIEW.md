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

## Map redesign — dark mode, satellite, active fires, projection dropdown

**Why the old map looked wrong.** MapLibre 6 draws vector tiles (streets, coastlines, place names) in a background worker. It finds that worker file next to its own script. Next.js bundles the library, so the lookup came back empty and no worker started. The style loaded but no tiles were ever drawn. That is why Long Island was missing and zooming added nothing. The fix copies the worker into `public/maplibre/` during `npm install` and points MapLibre at it with `setWorkerUrl`.

**What the judge sees now.** A dark CARTO vector map with roads, coastlines, and labels that load as you zoom. One flame icon marks each active wildfire: wildfire type, not 100% contained, 79 on Oct 4. Bigger fires get bigger flames. The top-left card has three dropdowns. Fire lists every active fire, largest first, plus Palisades as a past fire. Base map switches between dark streets, Esri satellite, and NASA VIIRS. Overlay turns on FIRMS hotspots. Clicking a flame, or picking it from the list, zooms to the fire and shades its perimeter red. The panel shows acres burned, containment, CO2 now, and vegetation. Conditions, animals displaced, critical habitat, and ways to help are collapsible sections.

**Projection.** The Spread projection dropdown starts at Off. Picking 1, 2, 3, or 6 hours sends a second request. The map draws the projected area in dashed yellow next to the red perimeter. The panel adds projected land burned in acres, homes in the projection, CO2 projected, and that hour's wind, humidity, and temperature. The assumptions follow, ending with "Ember spotting is not modeled." Overview and projection are separate requests, so changing the interval does not refetch animals and habitat.

**Data bugs found while testing.**
- Big fires come back as several polygons. The code kept only the first, which for Little Giant was a sliver. That put the icon in the wrong place and broke the species and habitat lookups. Now the largest part sets the center, and up to eight parts are drawn.
- LANDFIRE read longitude and latitude as its own projection and always said NoData, so CO2 always used shrub defaults. With the coordinate system stated, Little Giant reads as mixed-conifer forest. Palisades reads as chaparral. Palisades' centroid lands on a road, so five points inside the perimeter are sampled and the most common natural type wins.
- GBIF needs the polygon counter-clockwise. English names are now the most common English name GBIF lists. The first listed one was sometimes slang ("Butterbutt").
- Overpass refuses Node's default request (HTTP 406), so homes were always "unavailable". A User-Agent fixes it. The count is now inside the projected polygon, not its box. Palisades at 3 h: 9,716 buildings, not 18,036.

**Checked live:** Little Giant, Aspen Acres, and Palisades overview and projection. Palisades overview took about 1 to 4 seconds. Its projection took about 3 to 16 seconds, depending on Overpass.

## Projection model, species photos, totals, help, PLUTO details

**Spread is no longer wind only.** The old model was a downwind cone sized by about 10% of wind speed. The new one grows the fire's whole open edge every hour:
- Each fuel type (grass, shrub, forest litter) has a slow no-wind spread rate, simplified from the Rothermel fuel models fire agencies use.
- Dead fuel moisture comes from that hour's temperature and humidity, using the Simard equation from the National Fire Danger Rating System. Wetter fuel slows spread, and at the fuel's extinction moisture it stops.
- Soil moisture nudges the rate a little, as a stand-in for live fuel moisture.
- Slope multiplies it.
- Wind is cut to flame height and makes spread faster downwind. Anderson's 1983 ratio sets how long and narrow the fire grows.

Every forecast hour up to the interval is used, so a wind shift bends the shape. Contained edges do not grow: only the uncontained share of the edge grows, centered downwind. Palisades is a past, fully contained fire, so its projection is a scenario that treats it as uncontained under today's weather.

The map shows only the new ground, as a yellow band outside the current outer edge. Buildings and CO2 are counted in that band. Water and roads are not subtracted, so the band can run into the ocean at Palisades.

The weather lookup also had a time bug. Open-Meteo returns GMT times without a "Z", and they were parsed as local time, which was 4 hours off. The "Z" is now added.

**Species photos.** The top eight species show photo cards: common name, Latin name, and GBIF record count. Photos and common names come from iNaturalist. The header shows the full species count, for example 662 for Palisades.

**US totals card.** Acres burned (1,248,320 across 79 fires), estimated CO2 (13.38 million t), and species impacted (about 2,070 distinct animal species). It opens and closes. GBIF rate-limited the first version (67 of 79 fires failed). It now retries, falls back to the fire's convex outline on bad polygons, and runs three fires at a time. Only 2 to 5 fires now fail.

**Removed** the "This is not an evacuation order" line at your request.

**Ways to help** moved out of every fire and into one green card at the top of the panel. Regional groups are tagged "Near this fire".

**NYC buildings** now include land use, units, floor area, footprint, attachment, basement, landmark, zoning, FDNY fire company, and police precinct. For example, 350 Fifth Avenue is attached, is a landmark, and is in Ladder 24's area.

## Hotspots fix, scale comparisons, risks, fire environment dashboard

**Hotspots were broken.** The overlay asked NASA FIRMS for tiles through our server, and FIRMS needs a personal key (`FIRMS_MAP_KEY`) we never set, so every tile failed. NASA's GIBS imagery service publishes the same satellite heat detections (VIIRS, about 375 m pixels, from two satellites) without a key, so the map now loads those for yesterday and today. Hotspots include farm burns and industrial heat, not only wildfires.

**Putting the numbers in scale.** Under acres burned and CO2, a dropdown converts the number into something familiar. Land is shown as football fields, Manhattan, Washington DC, New York City, or Rhode Island. CO2 is shown as cars driven for a year, homes powered for a year, gallons of gasoline, gasoline tanker trucks, or acres of forest needed to absorb it. All 79 active fires together are 1.9 times the land of Rhode Island, and their 13.38 million t of CO2 equals about 3.1 million cars driven for a year. The CO2 factors are the EPA's own equivalency numbers. The totals card is now titled "Burning right now in the US", in red and orange.

**NYC search has its own card.** "Check a New York City building" says what you get: build year, code-era fire risks, renovations, solar permits, and the FDNY company. The geocoder also picked Brooklyn's 350 Fifth Avenue over the Empire State Building. It now prefers the borough you type, then Manhattan.

**Risks in this area.** Each row has a colored dot: red high, amber moderate, green low.
- **Air quality:** modeled AQI and PM2.5 now, plus the worst hour in the next day.
- **Smoke drift:** which way the wind carries smoke.
- **Fire weather alert:** National Weather Service red flag warnings.
- **Wildfire hazard nearby:** how much land within 5 miles the Forest Service rates high or very high wildfire hazard, meaning hard to control if it ignites.
- **People and homes within 5 miles:** Forest Service population and housing grids.
- **Flash floods after rain:** burned steep slopes are where post-fire debris flows start.

Palisades shows 893,424 people and 323,897 homes within 5 miles. That is why a fire there is so dangerous even at 23,448 acres.

**Fire environment dashboard**, at the end of the panel. It shows the fuel type with an icon, then bars for dead fuel moisture, soil moisture, slope, humidity, wind, and temperature. A bar is longer and redder when that factor pushes fire spread harder. These are the same numbers the spread projection uses.

**Slope got better.** Slope was measured once, at the center, across 2 km, which read 10% for Palisades. It is now the median of 10 spots across the fire at 330 m spacing, which reads 26% there. Projections for steep fires will grow a bit more than before.

## Layout cleanup

- **The map is full screen.** All cards float over it at 75% opacity with a blur, so the map shows through.
- **The right panel can be hidden** with "Hide ›" and brought back with "‹ Show panel". The zoom buttons move with it.
- **Deselect a fire** with "None (deselect)" in the Fire list, or the × on the fire's card. The map flies back to the whole US.
- **The selected fire or address is one collapsible card**, like Ways to help, with its name in the header.
- **Less text on screen.**
  - Rows show only a label and a value. Click a row to read its explanation, or hover for a tooltip.
  - Comparisons are one line with a short dropdown, with the EPA or Census source on hover.
  - Critical habitat, Fire environment, and NYC building detail groups start closed.
- **The voice brief button is gone from the website.** Grok voice stays for the Photon iMessage agent for crews (`/api/tts` is unchanged).
- **All emojis are removed** from the interface. Fire markers are a drawn flame shape, and the legend uses colored dots.

## Wording, summary cache, thermal layers

- **Wording.** "Animals displaced" is now "Animals recorded here", and the totals say "Species recorded in these areas". The counts are GBIF sightings, not proof that an animal was harmed.
- **Totals load instantly after the first visit.** The server keeps the totals for 10 minutes instead of re-adding 79 fires on every page load.
- **Heat detections are real-size squares.** The old overlay drew NASA's dots, which stay the same size on screen at every zoom. Now, with a fire selected, the server downloads that day's satellite detections and draws each one as a square the true size of the satellite pixel (about 375 m, wider near the edge of the satellite's view). Color shows how much heat it gave off, its fire radiative power in megawatts: dark red is faint, yellow-white is intense. The legend gives the count and the time of the latest satellite pass.
  - The FIRMS area download needs a personal key, which we don't have. Until `FIRMS_MAP_KEY` is set, the server uses FIRMS's public 24-hour US files, which have the same columns, and keeps only the fire's area. Once the key is set, it switches to the area download automatically.
- **New NASA overlays,** with names checked against NASA's published layer list:
  - Thermal infrared at night and by day (band I5, around 11 µm, which senses heat)
  - Fire false color (bands M11-I2-I1), where burn scars look red-brown and vegetation green

  They are sharp up to about county scale and blurry when zoomed close.

## Phase 4 — agent and live board

The iMessage agent no longer echoes. `agent/index.ts` opens one SpacetimeDB SDK connection (`agent/store.ts`) and writes incidents, briefs, messages, the active incident, and crew status through reducers. Phone numbers are hashed or shown as "crew member N".

- **NYC address:** `getAddressBrief`, five practical lines (floors, class, year, attachment, era hazards, basement, solar, first-due company), then a Grok voice note (`eve`). Stored as that chat's active incident.
- **Follow-up:** Grok answers only from stored tags, or "Not in the stored brief."
- **responding / on scene / clear:** writes `crew_status`. The map board shows the last three statuses live.
- **Fire name:** the same dashboard numbers as the map panel — acres, containment, fuel, wind, AQI, fire weather, fuel moisture, humidity, temperature, slope, and CO2 (vegetation only, structures excluded). Stored as the chat's active incident so follow-ups work. The Details panel has a Crew brief box that calls the same agent.
- **tools:** only rows from `lib/core/tools.ts`. Three placeholder rows are marked TODO and are never sent. Every tools reply ends with "Reference only. Follow your officer and your department's training."
- **Group chat:** replies to an address or a line that starts with Photon. Logs status from anyone. Stays quiet otherwise.
- **Non-NYC:** "This brief covers New York City only."
- **No tactics.**

Checked with `scripts/agent-sim.ts` (in-memory store). A real phone plus two browser windows still needs Spectrum credentials on this Mac.

## Air, wind, radar, facilities, demo

- **Air quality overlay:** 16 Open-Meteo AQI dots over the selected fire. Forecast `us_aqi` is null, so AQI comes from the air-quality API on the same coordinates.
- **Wind overlay:** downwind LineStrings (not dots). Length scales with speed; a short arrowhead is drawn at the tip.
- **Rain radar:** RainViewer public catalog, latest frame. Tiles only go to zoom 7; closer zooms stretch that frame.
- **Schools, hospitals, nursing homes:** counted in the 5-mile box only when US AQI at the fire is over 100. One EPA-style line for sensitive groups is always shown.
- **Cocklofts** only when PLUTO `proxcode` is 2 (semi-attached) or 3 (attached).
- **DEMO_MODE=1** serves saved Palisades and 350 Fifth Avenue from `fixtures/demo/`.

## Phase 5 — Palisades CO2 check

Not started.

## Phase 6 — submission

Not started.
