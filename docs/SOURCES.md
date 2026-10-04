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

## Current fire perimeters

- **URL:** `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query`
- **When:** the map opens. `GET /api/fires`.
- **Filter:** `attr_IncidentTypeCategory='WF' AND (attr_PercentContained IS NULL OR attr_PercentContained < 100)`. Prescribed burns (`RX`) and fully contained fires are left out. On Oct 4 that was 79 fires.
- **Returns:** GeoJSON features with `poly_IncidentName`, `poly_GISAcres`, `attr_PercentContained`, `attr_POOState`, and a polygon or multipolygon. We keep the eight largest parts.
- **Fallback:** the map card reads "Active fires unavailable".

## Base maps

- **Dark streets:** `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` (CARTO vector tiles from OpenStreetMap). No key. Detail keeps loading as you zoom in.
- **Satellite:** `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` (Esri World Imagery, zoom up to 19). No key. Attribution "Esri, Maxar, Earthstar Geographics".
- **When:** the Base map dropdown. Tiles load only for the area on screen.
- **Fallback:** if a tile set fails, the dark vector map underneath still shows.

## Palisades history perimeter

- **URL:** `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query`
- **When:** the Palisades button. Filter `attr_POOState='US-CA'` and about 23,448 acres.
- **Returns:** one past perimeter.
- **Fallback:** the panel says "Palisades unavailable".

## Open-Meteo forecast and elevation

- **URL:** `https://api.open-meteo.com/v1/forecast` and `https://api.open-meteo.com/v1/elevation`
- **When:** a fire click, for the selected 1, 2, 3, or 6 hour lead.
- **Returns:** wind, humidity, temperature, soil moisture, elevation. Slope is computed from nearby elevation points.
- **Fallback:** that tag reads "unavailable". The cone still draws using 0 mph if the forecast fails, and the wind tag says so.

## Red flag alerts

- **URL:** `https://api.weather.gov/alerts/active?point=lat,lon`
- **Header:** `User-Agent: mhacks2026 wildfire brief (hackathon demo)`
- **When:** a fire click.
- **Returns:** active alert events. A match on "Red Flag" is the tag.
- **Fallback:** "unavailable".

## NASA GIBS true color

- **URL:** `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
- **When:** Base map dropdown, "NASA VIIRS, yesterday". Date is yesterday UTC. No key. Tiles stop at zoom 9.
- **Returns:** JPEG tiles.
- **Fallback:** the base map stays. The layer can be turned off.

## OpenStreetMap buildings

- **URL:** `POST https://overpass-api.de/api/interpreter`
- **When:** a projection interval is picked.
- **Header:** `User-Agent: mhacks2026 wildfire brief (hackathon demo)`. Without it, Node's fetch gets HTTP 406.
- **Query:** ways tagged `building` inside the projected outline, minus those inside the current fire's outer edge: `(.a; - .b;)` with two `poly:` filters, `out count`. 15 second timeout. On Palisades at 3 h this was 3,270 buildings in the new growth band.
- **Returns:** a way count, shown as "Homes in the projection".
- **Fallback:** "unavailable", including when Overpass rate-limits with 429. The Forest Service housing raster is not used.

## LANDFIRE vegetation

- **Identify:** `https://lfps.usgs.gov/arcgis/rest/services/Landfire_LF2024/LF2024_EVT_CONUS/ImageServer/identify` with `geometry={"x":lon,"y":lat,"spatialReference":{"wkid":4326}}`. A bare `lon,lat` is read as the service's own projection and returns NoData.
- **Names:** `.../ImageServer/rasterAttributeTable?renderingRule={"rasterFunction":"LF2024_EVT_CONUS"}` maps the code to `EVT_NAME` and `EVT_LF` (Tree, Shrub, Herb). Without the rendering rule the table is empty.
- **When:** a fire click and a projection. Five points inside the perimeter. The most common natural type wins.
- **Fallback:** shrub defaults for CO2, and the tag reads "unavailable".

## GBIF animals

- **Search:** `https://api.gbif.org/v1/occurrence/search?geometry=WKT&kingdomKey=1&facet=speciesKey&limit=0`. The polygon is sent counter-clockwise. GBIF reads a clockwise ring as everything outside it.
- **Names:** `https://api.gbif.org/v1/species/{key}` for the scientific name and `.../vernacularNames` for the most common English name.
- **Fallback:** "Species unavailable".

## Satellite heat detections, 375 m pixels

- **With `FIRMS_MAP_KEY`:** the FIRMS area CSV, once per satellite: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{KEY}/{VIIRS_SNPP_NRT|VIIRS_NOAA20_NRT|VIIRS_NOAA21_NRT}/{west,south,east,north}/1`
- **Without a key (now):** the keyless FIRMS 24 h US files, which have the same columns. `data/active_fire/{suomi-npp-viirs-c2|noaa-20-viirs-c2|noaa-21-viirs-c2}/csv/{SUOMI|J1|J2}_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv`, about 90 KB each, filtered on the server to the fire's box. The legend names which source answered.
- **Route:** `GET /api/thermal?bbox=w,s,e,n`, max 6° per side. Called only when the overlay is "Satellite heat detections, 375 m pixels" and a fire is selected.
- **Drawing:** each row becomes a polygon `scan` km wide and `track` km tall, centered on its latitude and longitude, so it scales with zoom. It is colored by `frp` (fire radiative power, MW) on a ramp: 0 `#450a0a`, 3, 10, 30, 80, 200+ `#fefce8`. The legend shows the detection count and the latest `acq_date` + `acq_time` (UTC).
- **Tested Oct 4:** McConnell had 13 detections (latest Oct 3 10:26 UTC, max 3.3 MW), Sinlahekin 2, and the other large fires 0.
- **Fallback:** "Detections unavailable."

## NASA GIBS thermal and fire false color

Layer names were checked in `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml` on Oct 4, 2026.

| Overlay | Layer | Format | Zoom levels | Dates |
|---|---|---|---|---|
| Thermal infrared, night (I5) | `VIIRS_NOAA20_Brightness_Temp_BandI5_Night` | png | `GoogleMapsCompatible_Level9` | from 2022-01-14 |
| Thermal infrared, day (I5) | `VIIRS_NOAA20_Brightness_Temp_BandI5_Day` | png | Level9 | from 2022-01-14 |
| Fire false color | `VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1` | jpg | Level9 | from 2025-09-02 |

- SNPP and NOAA-21 versions also exist. SNPP's dates only go back to Aug and Jul 2026, so NOAA-20 is used.
- **Tile URL:** `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{yesterday UTC}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.{png|jpg}`. All three returned 200 for tile 6/22/10 on Oct 3.
- The old GIBS WMS thermal-anomaly dots were removed.

## /api/summary cache

- Each part (totals, species) is kept in server memory for 10 minutes. The response sends `Cache-Control: public, max-age=0, s-maxage=600` for Vercel's edge.
- A species result with more than 10 failed fires is not kept, so a rate-limited run is retried on the next request.
- A repeat call returned in 0.005 s.

## Open-Meteo air quality

- **URL:** `https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&current=us_aqi,pm2_5&hourly=us_aqi&forecast_days=2&timezone=GMT`
- **When:** a fire click. Gives current US AQI, PM2.5, and the highest AQI in the next 24 hours.
- **Note:** modeled (CAMS, about 40 km cells) at the fire's center. Smoke right next to a fire is usually worse than this shows. Little Giant read AQI 33 while 93% contained.
- **Fallback:** "unavailable".

## USFS Wildfire Risk to Communities

- **Base:** `https://imagery.geoplatform.gov/iipp/rest/services/Fire_Aviation/{service}/ImageServer/computeStatisticsHistograms`, with the fire's outline pushed out 5 miles as the polygon. The old `apps.fs.usda.gov/fsgisx01` folder now returns 403 "migrated to IIPP".
- **Services:**
  - `USFS_EDW_RMRS_WildfireHazardPotentialClassified` (2023): histogram classes 1 to 5 are very low to very high, 6 non-burnable, 7 water. Shown as the high or very high share of burnable land.
  - `USFS_EDW_RMRS_WRC_PopulationCount`: the sum gives people nearby.
  - `USFS_EDW_RMRS_WRC_HousingUnitCount`: the sum gives homes nearby.
  - Sums are multiplied by `skipX × skipY` when the server samples.
- **Tested:**
  | Fire | High or very high hazard | People | Homes |
  |---|---|---|---|
  | Palisades | 59% | 893,424 | 323,897 |
  | Little Giant | 73% | 1,025 | 1,891 |

  Each call takes about 3 s.
- **Fallback:** "unavailable".

## Terrain slope

- **URL:** Open-Meteo elevation with 50 points in one call: 10 spots in the fire, each with 4 neighbors 0.003° away.
- **Use:** the median slope goes to the dashboard and the projection. The share of spots at 30% slope or steeper sets the flash flood risk. That is a rough guide based on USGS post-fire debris-flow guidance, not a USGS assessment.

## CO2 and area comparisons

- **CO2, from the EPA Greenhouse Gas Equivalencies Calculator references (checked Oct 4, 2026):**
  | Comparison | Factor |
  |---|---|
  | Typical car, per year | 4.29 t CO2e |
  | Home energy, per year | 7.45 t |
  | Gasoline, per gallon | 8.89 kg |
  | Tanker truck, 8,500 gallons | 75.54 t |
  | One acre of average US forest takes up, per year | 1.00 t |
- **Areas, Census land area:**
  | Place | Square miles | Acres |
  |---|---|---|
  | Manhattan | 22.66 | 14,502 |
  | Washington, DC | 61.13 | 39,123 |
  | New York City | 300.46 | 192,294 |
  | Rhode Island | 1,033.81 | 661,638 |
  | Football field, 360 × 160 ft | | 1.32 |

## iNaturalist species photos

- **URL:** `https://api.inaturalist.org/v1/taxa?q={scientific name}&rank=species&per_page=1`
- **When:** a fire click, once for each of the top eight species.
- **Returns:** `preferred_common_name`, `default_photo.medium_url`, and `default_photo.attribution`. A result is used only if its `name` matches the GBIF scientific name.
- **Fallback:** a paw placeholder and the GBIF name. Photo credit shows on hover.

## US totals

- **Route:** `GET /api/summary` and `GET /api/summary?part=species`
- **Calls:** WFIGS current, then one LANDFIRE identify per fire plus the attribute table. The species part makes one GBIF facet query per fire, three at a time.
- **GBIF limits:** HTTP 429 is retried with a backoff. HTTP 400, from a polygon that crosses itself after thinning, is retried with the convex outline. Failed fires are counted and shown.
- **Fallback:** "Totals unavailable", or "unavailable" for species.

## PLUTO building details

- **Fields added:** `landuse, unitsres, unitstotal, bldgarea, lotarea, numbldgs, bldgfront, bldgdepth, proxcode, bsmtcode, ext, yearalter2, landmark, histdist, zonedist1, firecomp, policeprct` on dataset `64uk-42ks`.
- **Decoded:** land use 1 to 11, proxcode (detached, semi-attached, attached), bsmtcode, and firecomp (`L024` becomes Ladder 24).

## Photon Spectrum

- **Messages:** no single REST URL. `agent/index.ts` uses `spectrum-ts` with `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET`. The SDK discovers the project's iMessage lines and connects over gRPC. Docs: https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing
- **Management API, not used for replies:** `https://spectrum.photon.codes` with HTTP Basic (`projectId` / `projectSecret`).
- **Returns:** inbound iMessage text. Phase 0 sends one text reply.
- **Fallback:** none for the Phase 0 proof. The process runs on this Mac and must stay awake during judging. Local Messages.app is not the path.

## Open-Meteo air and wind grid

- **Wind:** `https://api.open-meteo.com/v1/forecast?latitude={lats}&longitude={lons}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=mph`
- **AQI:** `https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lats}&longitude={lons}&current=us_aqi,pm2_5`
- **When:** overlay "Air quality and wind" with a fire selected. 16 points (4×4) in the fire's box.
- **Note:** adding `us_aqi` to the forecast URL returns `null` and unit `undefined` (checked Oct 4). The two endpoints share the same coordinates.
- **Fallback:** "Air and wind unavailable."

## RainViewer radar

- **Catalog:** `https://api.rainviewer.com/public/weather-maps.json`
- **Tiles:** `{host}{path}/256/{z}/{x}/{y}/2/1_1.png` from the last `radar.past` frame. No key.
- **Zoom:** RainViewer rejects z above 7 ("Zoom Level Not Supported"). The map source uses `maxzoom: 7`.
- **Checked:** catalog 200; a z=5 tile 200 PNG.

## Sensitive sites (AQI over 100)

- **When:** a fire click, only if US AQI at the center is over 100.
- **Query:** Overpass `nwr` for `amenity=school|hospital|nursing_home` in the 5-mile box.
- **Guidance:** one EPA AQI line for sensitive groups from the center AQI, even when the count is skipped.

## Demo fixtures

- **Flag:** `DEMO_MODE=1`
- **Files:** `fixtures/demo/palisades.json` (Palisades FireRecord) and `fixtures/demo/address.json` (350 Fifth Avenue brief).
- **Used by:** `getPalisadesFire` and `getAddressBrief` only. Other calls stay live.
