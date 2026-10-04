# Sources

Phase 0 only. Each later phase appends the APIs it calls, the real URL, and the fallback. The app calls these live on a map open, a fire click, an address search, or an inbound text. It does not serve answers from files on disk. A failed call shows "unavailable".

## Grok text-to-speech

- **URL:** `POST https://api.x.ai/v1/tts`
- **Auth:** `Authorization: Bearer $XAI_API_KEY` on the server route and in the agent. Never in the browser.
- **Body:** `{ "text", "voice_id": "eve", "language": "en" }`
- **Returns:** raw audio bytes. Default is MP3 at 24 kHz / 128 kbps. Docs: https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
- **Used by:** `app/api/tts/route.ts` streams those bytes to the browser. `agent/index.ts` keeps a copy in memory only long enough to send the iMessage voice note.
- **Stored:** the script string on `brief` in SpacetimeDB. No mp3 file.
- **Fallback:** if the call fails, the page shows "unavailable" and the script text remains. Phase 0 is not done until one clip plays.

## Grok language

- **URL:** `POST https://api.x.ai/v1/responses`
- **Auth:** `Authorization: Bearer $XAI_API_KEY` in the agent only.
- **Body:** `model` is `grok-4.7`. Text only. No image. Docs: https://docs.x.ai/developers/models/grok-4.7
- **Returns:** a classification of the inbound text (NYC address, fire name, status, or follow-up) and, for a follow-up, a short answer limited to stored tags.
- **When:** an iMessage arrives. Not on page load.
- **Fallback:** if the call fails, reply "unavailable" and do not invent a brief.

## Solar permit (Phase 3, not called yet)

- **URL:** `https://data.cityofnewyork.us/resource/w9ak-ipjd.json`
- **Dataset:** DOB NOW: Build – Job Application Filings. Queried live by BBL. No local copy.
- **Fields:** `solar_work_type_` (column name "Solar (Work Type)"), `bbl`, `house_no`, `street_name`, `borough`.
- **Returns:** job filings. A row with `solar_work_type_` set for that BBL is `Solar permit on file: Yes`. No row is `No record`.
- **When:** an address search, after GeoSearch returns a BBL. Not before.
- **Limit:** the city says this dataset omits electrical jobs. The tag detail says so. `No record` is not "no panels."
- **Fallback:** the search still returns the PLUTO tags, and this row reads "unavailable".

## SpacetimeDB Maincloud

- **URL:** `https://maincloud.spacetimedb.com`
- **Publish:** `spacetime publish -s maincloud`
- **Auth:** CLI login for publish. The browser connects with the public database name. Server secrets are not required for the subscription.
- **Returns:** a live subscription. Inserting a row through `open_incident` appears in `app/page.tsx` with no refresh.
- **Docs:** https://spacetimedb.com/docs/deploying/maincloud
- **Fallback:** none. If it is not live at 90 minutes, stop and ask. Do not swap in memory.

## Photon Spectrum

- **Messages:** no single REST URL. `agent/index.ts` uses `spectrum-ts` with `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET`. The SDK discovers the project's iMessage lines and connects over gRPC. Docs: https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing
- **Management API, not used for replies:** `https://spectrum.photon.codes` with HTTP Basic (`projectId` / `projectSecret`).
- **Returns:** inbound iMessage text. Phase 0 sends one text reply.
- **Fallback:** none for the Phase 0 proof. The process runs on this Mac and must stay awake during judging. Local Messages.app is not the path.
