# Data sources checked live (Oct 3, ~9:30pm EDT)

Amends PLAN.md. "Confirmed" means a real response was inspected. Anything under "Not confirmed" still needs `bash scripts/check-sources.sh`.

## Confirmed

**Current fire perimeters (WFIGS)**
`https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query`
Fields: `poly_IncidentName`, `poly_GISAcres`, `attr_PercentContained`. Max 2,000 records per request.

**Past fire perimeters (WFIGS history), for the pinned Palisades Fire**
`.../WFIGS_Interagency_Perimeters/FeatureServer/0/query?where=poly_IncidentName='PALISADES'`
Returns six features named Palisades across CA, WA and NV. Use the one with `attr_POOState='US-CA'` and `poly_GISAcres=23448`. Filter on acres, not name alone.

**NYC address to lot (GeoSearch)**
`https://geosearch.planninglabs.nyc/v2/search?text=<address>&size=1`
BBL at `features[0].properties.addendum.pad.bbl` (string, e.g. "4087860042"). BIN at `...pad.bin`. Coordinates at `features[0].geometry.coordinates` as [lon, lat]. `properties.borough` gives the borough.

**NYC building data (PLUTO, dataset 64uk-42ks)**
`https://data.cityofnewyork.us/resource/64uk-42ks.json?$where=bbl=4087860042`
Query `bbl` as a number. All values come back as strings: `yearbuilt` "1945", `numfloors` "2.0000000", `yearalter1` "2006", `yearalter2` "0" (0 means none), `bldgclass` "A1".

**NYC solar permits (DOB NOW: Build – Job Application Filings, dataset w9ak-ipjd)**
`https://data.cityofnewyork.us/resource/w9ak-ipjd.json`
Has `bin`, `bbl`, `house_no`, `street_name`, `borough`, `filing_status`, `filing_date`, `job_description` and a `solar_work_type_` field. Look up by `bin` or `bbl` and check `solar_work_type_`. The value format of `solar_work_type_` was not inspected; fetch a few rows where it is not null before relying on it. Tag wording: "Solar permit on file: Yes" or "No record".

**Species (GBIF)**
`https://api.gbif.org/v1/occurrence/search?geometry=<WKT polygon>&kingdomKey=1&facet=speciesKey&facetLimit=10&limit=0`
Returns `count` and `facets[0].counts[]` with `name` = species key and `count`. Keys only: resolve each with `https://api.gbif.org/v1/species/<key>` (`vernacularName`, `canonicalName`, `class`). Clockwise and counter-clockwise test polygons returned the same count (528,252), so winding order did not matter in this test.

**Critical habitat (USFWS)**
`https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Critical_Habitat/FeatureServer/0/query` with `geometry`, `geometryType`, `inSR=4326`, `returnGeometry=false`.
Fields: `comname`, `sciname`, `status`, `listing_status`, `unitname`. Test box over the Palisades area returned western snowy plover, Braunton's milk-vetch and tidewater goby. One species can appear in several rows; de-duplicate on `sciname`.

**Vegetation (LANDFIRE)**
Service: `https://lfps.usgs.gov/arcgis/rest/services/Landfire_LF2024/LF2024_EVT_CONUS/ImageServer`. The service exists; `identify` was not tested. Fuel models are at `Landfire_LF2024/LF2024_FBFM40_CONUS` if needed.

**Voice (Grok)**
`POST https://api.x.ai/v1/tts`, body `{ text, language: "en", voice_id: "eve" }`, returns raw audio bytes.

## Not confirmed (blocked from the checker, not necessarily broken)

- Open-Meteo forecast and elevation
- National Weather Service alerts
- OpenStreetMap Overpass
- NASA GIBS tiles and NASA FIRMS (FIRMS needs the map key)
- USFS housing unit density (returned 403 twice to automated requests; test in a browser, and use Overpass building counts if it fails)

## CO2 reference for Phase 5

Copernicus (CAMS), as reported by Down To Earth: about 1 megatonne of carbon, or 3.67 million tonnes CO2, for all of California in the first 15 days of January 2025. That covers Palisades and Eaton together and includes burned structures.
The plan's formula with shrub defaults gives roughly 160,000 t for Palisades (23,448 acres). Do not tune the defaults to match. Label the estimate "vegetation only, structures excluded" and show the published figure beside it.
