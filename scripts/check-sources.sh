#!/usr/bin/env bash
# Tests every external data source in PLAN.md once and saves the real responses.
# Run from the repo root:  bash scripts/check-sources.sh
# Optional: export FIRMS_MAP_KEY=yourkey first to test NASA FIRMS.
OUT=fixtures/raw; mkdir -p "$OUT"; SUM=SOURCE_CHECK.txt; : > "$SUM"
UA="mhacks-wildfire-demo (student project)"
t(){ # name, file, url
  code=$(curl -sS -m 40 -A "$UA" -o "$OUT/$2" -w '%{http_code} %{size_download}B %{time_total}s' "$3" 2>>"$SUM")
  echo "$1 | $code | $OUT/$2" | tee -a "$SUM"
}
LAT=34.07; LON=-118.55
t "open-meteo forecast" openmeteo_forecast.json "https://api.open-meteo.com/v1/forecast?latitude=$LAT&longitude=$LON&hourly=wind_speed_10m,wind_direction_10m,relative_humidity_2m,temperature_2m,soil_moisture_0_to_1cm&forecast_days=1&wind_speed_unit=mph"
t "open-meteo elevation" openmeteo_elevation.json "https://api.open-meteo.com/v1/elevation?latitude=$LAT,34.08&longitude=$LON,-118.54"
t "nws alerts" nws_alerts.json "https://api.weather.gov/alerts/active?point=$LAT,$LON"
t "gibs tile" gibs_tile.jpg "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2026-10-02/GoogleMapsCompatible_Level9/6/25/11.jpg"
t "firms viirs" firms.csv "https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_MAP_KEY:-NOKEY}/VIIRS_SNPP_NRT/-119,33.9,-118,34.3/1"
t "wfigs current" wfigs_current.json "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?where=1%3D1&outFields=poly_IncidentName,poly_GISAcres,attr_PercentContained&returnGeometry=false&resultRecordCount=5&f=json"
t "wfigs history palisades" wfigs_palisades.json "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query?where=poly_IncidentName%20LIKE%20%27PALISADES%25%27&outFields=poly_IncidentName,poly_GISAcres,attr_FireDiscoveryDateTime,attr_POOState&returnGeometry=false&f=json"
t "usfs housing density info" usfs_hud_info.json "https://apps.fs.usda.gov/fsgisx01/rest/services/RDW_Wildfire/RMRS_WRC_HousingUnitDensity/ImageServer?f=json"
t "usfs housing density identify" usfs_hud_identify.json "https://apps.fs.usda.gov/fsgisx01/rest/services/RDW_Wildfire/RMRS_WRC_HousingUnitDensity/ImageServer/identify?geometry=$LON,$LAT&geometryType=esriGeometryPoint&sr=4326&returnGeometry=false&f=json"
t "usfs wildfire folder" usfs_folder.json "https://apps.fs.usda.gov/fsgisx01/rest/services/RDW_Wildfire?f=json"
t "landfire services" landfire_services.json "https://lfps.usgs.gov/arcgis/rest/services?f=json"
t "nlcd wms capabilities" nlcd_caps.xml "https://www.mrlc.gov/geoserver/mrlc_display/wms?service=WMS&version=1.3.0&request=GetCapabilities"
t "gbif ccw polygon" gbif_ccw.json "https://api.gbif.org/v1/occurrence/search?geometry=POLYGON((-118.70%2034.03,-118.50%2034.03,-118.50%2034.13,-118.70%2034.13,-118.70%2034.03))&kingdomKey=1&facet=speciesKey&facetLimit=10&limit=0"
t "gbif cw polygon" gbif_cw.json "https://api.gbif.org/v1/occurrence/search?geometry=POLYGON((-118.70%2034.03,-118.70%2034.13,-118.50%2034.13,-118.50%2034.03,-118.70%2034.03))&kingdomKey=1&limit=0"
t "critical habitat" crithab.json "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Critical_Habitat/FeatureServer/0/query?geometry=-118.70,34.03,-118.50,34.13&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&resultRecordCount=5&f=json"
t "nyc geosearch" geosearch.json "https://geosearch.planninglabs.nyc/v2/search?text=84-74%20257%20Street%20Queens&size=1"
t "nyc pluto by bbl" pluto.json "https://data.cityofnewyork.us/resource/64uk-42ks.json?\$where=bbl=4087860042"
t "nyc open data: solar datasets" nyc_solar_catalog.json "https://api.us.socrata.com/api/catalog/v1?domains=data.cityofnewyork.us&q=solar&limit=20"
t "overpass buildings" overpass.json "https://overpass-api.de/api/interpreter?data=%5Bout%3Ajson%5D%5Btimeout%3A25%5D%3Bway%5Bbuilding%5D(34.06%2C-118.56%2C34.08%2C-118.54)%3Bout%20count%3B"
echo; echo "Done. Summary in $SUM, responses in $OUT/"
