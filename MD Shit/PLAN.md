# Final build plan: US wildfire map + NYC call brief

Single source of truth. Replaces every earlier plan. Save as `PLAN.md` in the repo root (`/Users/ksharma/MHacks2026`) and give it to Cursor.

Hackathon demo, not a product. Solo. **Deadline Sunday Oct 4, 12:15pm EDT. Feature freeze 9:15am EDT.** Work the phases in order. Do not start a phase until the previous one meets its "done when" line.

Pitch line: what a crew does not know on the way to a call.

## What ships

One Next.js app with one MapLibre map, one side panel of tags, one live incident board, and one iMessage agent.

1. **US wildfires.** All current perimeters. Click a fire: acres, containment, conditions, a spread projection at 1, 2, 3, and 6 hours, homes inside the projection, CO2 now and projected, then a recovery block (species recorded, critical habitat, vegetation mapped, ways to help).
2. **NYC address brief.** Search locked to New York City. Tags: year built, floors, building class, era hazards, `Altered: <year>` when `yearalter1` is set, and `Solar permit on file: Yes` or `No record`.
3. **iMessage agent (Photon Spectrum).** A firefighter or a crew group chat texts a call. The agent replies with the brief as short text plus a Grok voice note, remembers the call, answers follow-ups, and logs crew status.
4. **Live incident board (SpacetimeDB).** Every call, brief, message and crew status appears instantly on every open screen.

## Sponsor eligibility (hard requirements)

| Track | Must have | How this build meets it |
|---|---|---|
| Photon | Agent connected to iMessage **through Spectrum** | The agent runs on Spectrum. Chat is the main interface for the address brief. It keeps context per conversation and works in a group chat. |
| SpaceXAI | Built with **Cursor**; uses **Grok Imagine or Voice API**; real space data | Build everything in Cursor. Voice note uses Grok text-to-speech. Space data is NASA FIRMS thermal hotspots and NASA GIBS satellite imagery. Planning was done with Grok Bot; say so in the Devpost. **Confirm at the SpaceXAI table that the text-to-speech endpoint counts as the Voice API.** |
| Spacetime | Spacetime is the **core real-time backend** | All shared state lives in SpacetimeDB. The website and the agent both read and write through it. No other database. |
| Sustainability | Energy, climate, resource systems | CO2 now and projected, species and habitat, vegetation, recovery. Lead the pitch here. |

## How the build maps to the rubric

- **Innovation:** a firefighter texts a call and gets a hazard brief by voice before arrival; fire impact shown as carbon and habitat, not only acres.
- **Technical complexity:** live satellite layers, a stated-assumption spread model, a permit lookup for solar, an agent with memory, real-time sync across clients, and one checked number (Phase 5).
- **Usability:** no app to install for crews (iMessage plus voice), one tag format everywhere, every estimate shows its assumptions.
- **Theme:** the fire panel's lower half is the sustainability case.

## Rules for the coding agent

- TypeScript only. Next.js App Router, Tailwind, MapLibre GL JS.
- **One library, two front ends.** The page and the agent both call `/lib/core`. Core returns tags: `{ label, value, detail }`. Nothing else renders or speaks hazards.
- Verify each endpoint against its docs before coding. Do not invent response shapes.
- Never fabricate data. A failed source shows "unavailable".
- The running app does not read saved API responses, fixtures, or a local database to answer a search. An address search or a fire click calls the live API at that moment. A failed call shows "unavailable".
- After that call, the brief is written to SpacetimeDB in the cloud so the board and a follow-up can reuse it. That copy is not a file on the laptop.
- Grok is used for text-to-speech and for reading the inbound iMessage. No vision. No overhead image.
- Grok may phrase tags. Grok may not add a hazard, species, material or organization that is not in the data.
- Official JSON and GeoJSON only. No HTML scraping. No Watch Duty. No Zillow.
- Call an external API only when a judge opens the map, clicks a fire, searches an address, or texts the agent. Do not prefetch, poll, or call APIs while coding. Page load subscribes to SpacetimeDB and nothing else.

### Words on screen

- "Projection", never "prediction". "Estimate". "Homes inside the projection". "This is not an evacuation order."
- "Occurrences recorded inside this perimeter." "Vegetation mapped here." Never "species killed" or "trees lost".
- Solar tag is `Solar permit on file: Yes` or `No record`. `No record` means no DOB NOW Build filing with a solar work type for that lot. It does not mean the roof has no panels. If the tag is Yes, add "check for battery storage". Never assert a battery.
- FIRMS and GIBS are the satellite layers. There is no house photo.
- Always show "Ember spotting is not modeled."

## Environment

`XAI_API_KEY`, `FIRMS_MAP_KEY`, Photon Spectrum credentials (`SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`), `SPACETIMEDB_*`. No imagery key. No demo-mode flag.

## SpacetimeDB design (the backend)

Tables:

- `incident`: id, kind (`fire` | `address`), title, lat, lon, created_at, source (`web` | `imessage`)
- `brief`: incident_id, tags (JSON), summary, script (spoken text, not an audio file)
- `message`: conversation_id, incident_id, sender, text, direction, created_at
- `conversation`: id, active_incident_id (this is the agent's memory)
- `crew_status`: incident_id, sender, status (`responding` | `on scene` | `clear`), updated_at

Reducers: `open_incident`, `save_brief`, `log_message`, `set_active_incident`, `set_crew_status`.

Every browser subscribes to all five tables. The agent process writes through reducers. Two browser windows and one phone must stay in sync with no refresh.

## Photon agent behavior

- Runs as its own long-lived process using Spectrum; it is not a Next.js route. Follow Photon's Spectrum docs for setup and for sending audio.
- Inbound text → Grok (`grok-4.7`, text only) classifies: new call with an NYC address, a fire name, a status word, or a follow-up. This call happens when a message arrives.
- **New call:** run `getAddressBrief`, reply with a short text (five lines at most), then a voice note. Store it as the conversation's active incident.
- **Fire name:** reply with that fire's acres, containment, wind, and CO2 estimate from the same core functions.
- **Follow-up** ("what about the roof?", "how old again?"): answer only from the stored tags of the active incident.
- **Status** ("responding", "on scene", "clear"): write `crew_status`, react or reply briefly.
- **Group chat:** reply when the message contains an NYC address or starts with "Photon". Log status words from any member. Stay quiet otherwise.
- Non-NYC address: say the brief covers New York City only.

## Core library (`/lib/core`)

- `listActiveFires()` → id, name, acres, containment, centroid, simplified perimeter, from the live WFIGS service when the map is opened. The Palisades Fire is loaded from the WFIGS history service when a judge selects it, not from a file.
- `getFireConditions(fireId)` → wind, humidity, temperature, soil moisture, red flag, elevation, slope, hotspot count, fuel class
- `projectSpread(fireId, hours)` → cone polygon plus assumptions; `hours` is 1, 2, 3, or 6
- `estimateImpact(fireId, hours)` → CO2 now, CO2 for the cone, homes inside the cone
- `getRecovery(fireId)` → species recorded, critical habitat overlaps, vegetation names, help links
- `getAddressBrief(address)` → tags plus a three-line summary; rejects non-NYC. Solar comes from `solarPermitOnFile(bbl)`.
- `solarPermitOnFile(bbl)` → `Solar permit on file: Yes` or `No record`
- `speakBrief(tags)` → about 20 seconds of radio-style copy from the tags only. The server route streams Grok speech. The script text is what gets stored.

## Data sources

Checked live on Oct 3:

- **Fire perimeters:** `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query` with `f=geojson`. Fields: `poly_IncidentName`, `poly_GISAcres`, `attr_PercentContained`. Max 2,000 records per request. Simplify geometry before sending to the client.
- **NYC building data:** PLUTO, `https://data.cityofnewyork.us/resource/64uk-42ks.json`. Fields `yearbuilt`, `bldgclass`, `numfloors`, `yearalter1`. **`bbl` comes back like `4087860042.00000000`; query it as a number (`$where=bbl=4087860042`), not as a text match.**
- **Critical habitat:** `https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Critical_Habitat/FeatureServer/0/query`, `spatialRel=esriSpatialRelIntersects`, `returnGeometry=false`. Layer 0 is final habitat.
- **Voice:** `POST https://api.x.ai/v1/tts`, body `{ text, language: "en", voice_id: "eve" }`, returns raw audio bytes. Called only when a judge hits play or a text reply needs a voice note.
- **Agent language:** `POST https://api.x.ai/v1/responses` with model `grok-4.7` and text only. Called only when an iMessage arrives.

Not yet checked; verify first, use the fallback if it fails:

- **Hotspots:** NASA FIRMS VIIRS. Map layer for the view, plus a count for the clicked fire's bounding box. Do not plot a national CSV.
- **Satellite picture:** NASA GIBS WMTS true-color, one recent date.
- **Weather:** Open-Meteo hourly forecast (wind, humidity, temperature, soil moisture). Each interval uses the forecast hour closest to that lead time.
- **Red flag:** `api.weather.gov/alerts/active?point=lat,lon` with a `User-Agent` header.
- **Elevation and slope:** Open-Meteo elevation at a few points around the perimeter.
- **Homes in the cone:** USFS Wildfire Risk to Communities housing unit density image service, sampled at about nine points. *Fallback:* count OpenStreetMap buildings in the cone with Overpass.
- **Vegetation and fuel class:** LANDFIRE Existing Vegetation Type, about nine samples; show names and derive forest / shrub / grass for CO2. *Fallback:* NLCD, then a fuel-type dropdown.
- **Species:** GBIF `occurrence/search` with the perimeter as WKT, animals only, species facet, `limit=0`. **GBIF expects counter-clockwise polygons; a clockwise one can match everything outside the area. Rewind the polygon and sanity-check the count.**
- **NYC lot lookup:** NYC Planning GeoSearch (`geosearch.planninglabs.nyc`) for BBL and coordinates. Called only when an address is searched.
- **Solar permit:** DOB NOW Build Job Application Filings, `https://data.cityofnewyork.us/resource/w9ak-ipjd.json`. Field `solar_work_type_` ("Solar (Work Type)"), matched on `bbl`. Called live when an address is searched. A non-null `solar_work_type_` is `Solar permit on file: Yes`. No matching row is `No record`. This dataset does not include electrical jobs. Say that in the tag detail. The app does not ship a copy of this table.
- **Help links:** a short static list (forest restoration groups, wildfire relief). Label them as general links, not tied to this fire. No request until the recovery block is opened.

Cut from earlier drafts, do not build: burn severity (MTBS), hospital travel class, long-term housing risk, iNaturalist, 15/30/45-minute intervals.

## Spread and CO2

**Spread.** Direction is downwind from the perimeter edge. Distance is about 10% of open wind speed in dry air, scaled down as humidity rises and up on upslope, times the interval. Half-angle about 30° in light wind, about 15° in strong wind. Cap at 6 hours. Assumptions sit beside the cone.

**CO2** = hectares × fuel load × fraction burned × 1.6. Defaults, shown in the UI: forest 50 t/ha and 0.4; shrub 15 and 0.7; grass 3 and 0.9. "CO2 now" uses current acres; "CO2 projected" uses the selected cone. Both are estimates; the defaults are rough and get checked in Phase 5.

## Era hazards (NYC)

| Year built | Tag |
|---|---|
| Before 1940 | Balloon framing and voids, knob-and-tube wiring, lead paint |
| 1930–1980 | Possible asbestos |
| Before 1978 | Lead paint |
| 1965–1973 | Possible aluminum branch wiring |
| After about 1990 | Lightweight trusses and I-joists, early collapse |
| Row houses and older multi-family | Shared cocklofts and party walls |

## Phases

**Phase 0 (1.5 h): foundations.** Scaffold in Cursor. Prove three things: a SpacetimeDB row inserted by a script appears in the browser live; Spectrum receives and answers one iMessage; one Grok text-to-speech clip plays from the server route. No vision call.
*Done when:* all three work. If SpacetimeDB is not live at 90 minutes, stop and ask. Do not switch to in-memory state.

**Phase 1 (4 h): fire map.** US perimeters from a live request when the map opens. GIBS and FIRMS layers with toggles. Clicking a fire calls weather, terrain, and the other detail APIs then. Cone at 1, 2, 3, and 6 hours. Palisades Fire (Los Angeles, January 2025) is a history-service request when selected. Clicking a fire opens an `incident` so it shows on the board.
*Done when:* any active fire fills the panel in under 5 seconds from the live APIs.

**Phase 2 (2.5 h): impact and recovery.** CO2 pair, homes in the cone, species, critical habitat, vegetation, help links.
*Done when:* every number shows its assumptions and every failed source reads "unavailable".

**Phase 3 (2.5 h): NYC address brief.** Search box, tag panel, solar check, three-line summary, play button for the voice note.
*Done when:* five NYC addresses return the correct year built against the city record.

**Phase 4 (2.5 h): agent and live board.** Full agent behavior above. Board shows incidents, briefs, messages and crew status live.
*Done when:* a text from a real phone returns text plus a voice note, a follow-up is answered from memory, and "responding" appears on two open browser windows at once.

**Phase 5 (1 h): one checked number.** CO2 estimate for the Palisades Fire against one published figure. Show both numbers and cite the source in the UI and the pitch.

**Phase 6 (3 h, starts 9:15am): submission.** Devpost write-up, 2-minute video, pitch practice, a list of each sponsor technology and where it is used, and a note that the build used Cursor and Grok Bot.

Total: 17 hours. If you have less, apply the cut order now, not at 8am.

## Cut order

1. Help links and vegetation names
2. Critical habitat
3. Group-chat behavior (keep one-to-one chat)
4. CO2 projected (keep CO2 now)
5. Crew status

Never cut: the map, CO2 now and species, the address brief, the Spectrum reply with voice, SpacetimeDB sync, submission time.

## Demo script (3 minutes)

1. One line: volunteer firefighter, what crews do not know on the way to a call.
2. Click a live fire: satellite view, hotspots, projection, homes inside it.
3. Scroll the panel: CO2 now and projected, species and habitat, recovery. This is the sustainability case.
4. Text an NYC address from a phone. The text and voice note arrive; the board updates on two screens. Ask one follow-up. Send "responding".
5. State the checked number and what the model does not do.
