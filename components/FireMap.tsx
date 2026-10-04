"use client";

/**
 * Dark vector map with flame icons for active fires, the selected perimeter, and the projection band.
 * Connected to app/page.tsx, which fetches fires and passes them in. A click reports the fire id.
 * Base map tiles: CARTO dark, Esri World Imagery, NASA GIBS VIIRS. Overlays: GIBS NOAA-20 band I5 day/night,
 * GIBS M11-I2-I1 fire false color, heat-detection squares, AQI dots, wind lines, and RainViewer radar from app/page.tsx.
 */
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { FireRecord } from "../lib/core/fires";
import { partsOf, type LngLat } from "../lib/core/geo";
import { FRP_RAMP } from "../lib/core/thermal";

export type Basemap = "dark" | "satellite" | "viirs";
export type Overlay = "none" | "thermal" | "i5day" | "i5night" | "falsecolor" | "aqi" | "wind" | "radar";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const GIBS_DATE = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const gibsTiles = (layer: string, ext: "png" | "jpg") =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${GIBS_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.${ext}`;
const RASTER_OVERLAYS: { id: Exclude<Overlay, "none" | "thermal">; layer: string; ext: "png" | "jpg"; opacity: number }[] = [
  { id: "i5day", layer: "VIIRS_NOAA20_Brightness_Temp_BandI5_Day", ext: "png", opacity: 0.8 },
  { id: "i5night", layer: "VIIRS_NOAA20_Brightness_Temp_BandI5_Night", ext: "png", opacity: 0.8 },
  { id: "falsecolor", layer: "VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1", ext: "jpg", opacity: 1 },
];
const HOME: LngLat = [-98, 39];
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export default function FireMap({
  fires,
  selected,
  cone,
  hull,
  basemap,
  overlay,
  thermal,
  aqi,
  wind,
  radarTiles,
  pin,
  panelOpen,
  onSelect,
}: {
  fires: FireRecord[];
  selected: FireRecord | null;
  cone: LngLat[];
  hull: LngLat[];
  basemap: Basemap;
  overlay: Overlay;
  thermal: GeoJSON.FeatureCollection;
  aqi: GeoJSON.FeatureCollection;
  wind: GeoJSON.FeatureCollection;
  radarTiles: string[];
  pin: LngLat | null;
  panelOpen: boolean;
  onSelect: (id: string) => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const loaded = useRef(false);
  const onSelectRef = useRef(onSelect);
  const latest = useRef({ fires, selected, cone, hull, basemap, overlay, thermal, aqi, wind, radarTiles });
  const panelRef = useRef(panelOpen);
  const hadSelection = useRef(false);
  onSelectRef.current = onSelect;
  latest.current = { fires, selected, cone, hull, basemap, overlay, thermal, aqi, wind, radarTiles };
  panelRef.current = panelOpen;

  useEffect(() => {
    if (!holder.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: holder.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: HOME,
      zoom: 3.6,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-right");
    map.on("load", () => {
      const firstLabel = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
      map.addSource("esri", {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
      });
      map.addLayer({ id: "esri", type: "raster", source: "esri", layout: { visibility: "none" } }, firstLabel);
      map.addSource("gibs", {
        type: "raster",
        tiles: [
          `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${GIBS_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
        ],
        tileSize: 256,
        maxzoom: 9,
        attribution: `NASA GIBS VIIRS ${GIBS_DATE}`,
      });
      map.addLayer({ id: "gibs", type: "raster", source: "gibs", layout: { visibility: "none" } }, firstLabel);
      for (const item of RASTER_OVERLAYS) {
        map.addSource(item.id, {
          type: "raster",
          tiles: [gibsTiles(item.layer, item.ext)],
          tileSize: 256,
          maxzoom: 9,
          attribution: `NASA GIBS ${item.layer} ${GIBS_DATE}`,
        });
        map.addLayer(
          { id: item.id, type: "raster", source: item.id, paint: { "raster-opacity": item.opacity }, layout: { visibility: "none" } },
          firstLabel,
        );
      }
      map.addSource("radar", {
        type: "raster",
        tiles: latest.current.radarTiles.length ? latest.current.radarTiles : ["https://tilecache.rainviewer.com/v2/radar/0/256/{z}/{x}/{y}/2/1_1.png"],
        tileSize: 256,
        maxzoom: 7,
        attribution: "RainViewer",
      });
      map.addLayer({ id: "radar", type: "raster", source: "radar", paint: { "raster-opacity": 0.65 }, layout: { visibility: "none" } }, firstLabel);

      map.addSource("perimeters", { type: "geojson", data: perimeterCollection(latest.current.fires) });
      map.addLayer({
        id: "perimeters-line",
        type: "line",
        source: "perimeters",
        minzoom: 7,
        paint: { "line-color": "#fb923c", "line-width": 1, "line-opacity": 0.6 },
      });
      map.addSource("selected", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "selected-fill", type: "fill", source: "selected", paint: { "fill-color": "#ef4444", "fill-opacity": 0.35 } });
      map.addLayer({ id: "selected-line", type: "line", source: "selected", paint: { "line-color": "#f87171", "line-width": 2 } });
      map.addSource("thermal", { type: "geojson", data: latest.current.thermal, attribution: "NASA FIRMS VIIRS 375 m" });
      map.addLayer({
        id: "thermal-fill",
        type: "fill",
        source: "thermal",
        layout: { visibility: "none" },
        paint: {
          "fill-color": ["interpolate", ["linear"], ["get", "frp"], ...FRP_RAMP.flat()] as unknown as maplibregl.ExpressionSpecification,
          "fill-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "thermal-line",
        type: "line",
        source: "thermal",
        layout: { visibility: "none" },
        paint: { "line-color": "#fbbf24", "line-width": 0.75, "line-opacity": 0.8 },
      });
      map.addSource("aqi", { type: "geojson", data: latest.current.aqi });
      map.addLayer({
        id: "aqi-dots",
        type: "circle",
        source: "aqi",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": 8,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#0a0a0a",
          "circle-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "aqi"], 0],
            0,
            "#22c55e",
            50,
            "#22c55e",
            100,
            "#eab308",
            150,
            "#f97316",
            200,
            "#ef4444",
            300,
            "#7e22ce",
          ],
        },
      });
      map.addSource("wind", { type: "geojson", data: latest.current.wind });
      map.addLayer({
        id: "wind-lines-case",
        type: "line",
        source: "wind",
        layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0a0a0a", "line-width": 4.2, "line-opacity": 0.55 },
      });
      map.addLayer({
        id: "wind-lines",
        type: "line",
        source: "wind",
        layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "windMph"], 0],
            0,
            "#93c5fd",
            8,
            "#38bdf8",
            15,
            "#f8fafc",
            25,
            "#fde047",
          ],
          "line-width": ["interpolate", ["linear"], ["coalesce", ["get", "windMph"], 0], 0, 2, 10, 2.8, 25, 4],
          "line-opacity": 0.95,
        },
      });
      map.addSource("cone", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "cone-fill", type: "fill", source: "cone", paint: { "fill-color": "#facc15", "fill-opacity": 0.3 } });
      map.addLayer({
        id: "cone-line",
        type: "line",
        source: "cone",
        paint: { "line-color": "#facc15", "line-width": 2, "line-dasharray": [2, 1.5] },
      });

      map.addImage("flame", flameImage(), { pixelRatio: 2 });
      map.addSource("centers", { type: "geojson", data: centerCollection(latest.current.fires) });
      map.addLayer({
        id: "fire-icons",
        type: "symbol",
        source: "centers",
        layout: {
          "icon-image": "flame",
          "icon-size": ["interpolate", ["linear"], ["get", "acres"], 0, 0.55, 10000, 0.8, 100000, 1.1],
          "icon-allow-overlap": true,
          "icon-anchor": "bottom",
          "symbol-sort-key": ["-", 0, ["get", "acres"]],
          "text-field": ["step", ["zoom"], "", 5, ["get", "name"]],
          "text-font": ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 0.3],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: { "text-color": "#fde68a", "text-halo-color": "#0a0a0a", "text-halo-width": 1.2 },
      });

      const pick = (event: maplibregl.MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelectRef.current(id);
      };
      map.on("click", "fire-icons", pick);
      map.on("mouseenter", "fire-icons", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "fire-icons", () => (map.getCanvas().style.cursor = ""));
      loaded.current = true;
      sync(map, latest.current);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      loaded.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    showLayers(map, basemap, overlay);
  }, [basemap, overlay]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    (map.getSource("thermal") as maplibregl.GeoJSONSource).setData(thermal);
  }, [thermal]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    (map.getSource("aqi") as maplibregl.GeoJSONSource).setData(aqi);
    (map.getSource("wind") as maplibregl.GeoJSONSource).setData(wind);
  }, [aqi, wind]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current || radarTiles.length === 0) return;
    const source = map.getSource("radar") as maplibregl.RasterTileSource;
    source.setTiles(radarTiles);
  }, [radarTiles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    (map.getSource("centers") as maplibregl.GeoJSONSource).setData(centerCollection(fires));
    (map.getSource("perimeters") as maplibregl.GeoJSONSource).setData(perimeterCollection(fires));
  }, [fires]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    (map.getSource("selected") as maplibregl.GeoJSONSource).setData(selected ? perimeterCollection([selected]) : EMPTY);
    if (selected) fitTo(map, partsOf(selected.geometry).flat(), panelRef.current);
    else if (hadSelection.current) map.flyTo({ center: HOME, zoom: 3.6, duration: 900 });
    hadSelection.current = Boolean(selected);
  }, [selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    (map.getSource("cone") as maplibregl.GeoJSONSource).setData(cone.length < 3 ? EMPTY : bandCollection(cone, hull));
    if (cone.length >= 3 && latest.current.selected) fitTo(map, [...partsOf(latest.current.selected.geometry).flat(), ...cone], panelRef.current);
  }, [cone, hull]);

  useEffect(() => {
    const map = mapRef.current;
    markerRef.current?.remove();
    markerRef.current = null;
    if (!map || !pin) return;
    markerRef.current = new maplibregl.Marker({ color: "#38bdf8" }).setLngLat(pin).addTo(map);
    map.flyTo({ center: pin, zoom: 16, duration: 1200 });
  }, [pin]);

  return <div ref={holder} className="h-full w-full" />;
}

function sync(
  map: maplibregl.Map,
  state: {
    fires: FireRecord[];
    selected: FireRecord | null;
    cone: LngLat[];
    hull: LngLat[];
    basemap: Basemap;
    overlay: Overlay;
    thermal: GeoJSON.FeatureCollection;
    aqi: GeoJSON.FeatureCollection;
    wind: GeoJSON.FeatureCollection;
    radarTiles: string[];
  },
) {
  showLayers(map, state.basemap, state.overlay);
  (map.getSource("thermal") as maplibregl.GeoJSONSource).setData(state.thermal);
  (map.getSource("aqi") as maplibregl.GeoJSONSource).setData(state.aqi);
  (map.getSource("wind") as maplibregl.GeoJSONSource).setData(state.wind);
  if (state.radarTiles.length) (map.getSource("radar") as maplibregl.RasterTileSource).setTiles(state.radarTiles);
  (map.getSource("selected") as maplibregl.GeoJSONSource).setData(state.selected ? perimeterCollection([state.selected]) : EMPTY);
  (map.getSource("cone") as maplibregl.GeoJSONSource).setData(state.cone.length < 3 ? EMPTY : bandCollection(state.cone, state.hull));
}

function showLayers(map: maplibregl.Map, basemap: Basemap, overlay: Overlay) {
  const show = (id: string, on: boolean) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  show("esri", basemap === "satellite");
  show("gibs", basemap === "viirs");
  for (const item of RASTER_OVERLAYS) show(item.id, overlay === item.id);
  show("thermal-fill", overlay === "thermal");
  show("thermal-line", overlay === "thermal");
  show("radar", overlay === "radar");
  show("aqi-dots", overlay === "aqi");
  show("wind-lines-case", overlay === "wind");
  show("wind-lines", overlay === "wind");
  map.setPaintProperty("selected-fill", "fill-opacity", overlay === "thermal" || overlay === "aqi" || overlay === "wind" ? 0.12 : 0.35);
}

function fitTo(map: maplibregl.Map, points: LngLat[], panelOpen: boolean) {
  if (points.length === 0) return;
  const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
  for (const point of points) bounds.extend(point);
  map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 320, right: panelOpen ? 440 : 60 }, maxZoom: 12, duration: 900 });
}

function bandCollection(outer: LngLat[], inner: LngLat[]): GeoJSON.FeatureCollection {
  const rings = inner.length >= 4 ? [outer, [...inner].reverse()] : [outer];
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: rings } }] };
}

function perimeterCollection(fires: FireRecord[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fires.map((fire) => ({
      type: "Feature",
      properties: { id: fire.id },
      geometry: fire.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
    })),
  };
}

function centerCollection(fires: FireRecord[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fires.map((fire) => ({
      type: "Feature",
      properties: { id: fire.id, name: fire.name, acres: fire.acres ?? 0 },
      geometry: { type: "Point", coordinates: fire.centroid },
    })),
  };
}

function flameImage(): ImageData {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const flame = (scale: number, color: string | CanvasGradient) => {
    ctx.save();
    ctx.translate(size / 2, size - 3);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-13, 0, -17, -12, -11, -22);
    ctx.bezierCurveTo(-8, -27, -9, -33, -7, -38);
    ctx.bezierCurveTo(-3, -32, -1, -30, 1, -29);
    ctx.bezierCurveTo(2, -36, 6, -40, 9, -43);
    ctx.bezierCurveTo(9, -34, 17, -26, 15, -14);
    ctx.bezierCurveTo(14, -5, 8, 0, 0, 0);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  };
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 3;
  const outer = ctx.createLinearGradient(0, 0, 0, size);
  outer.addColorStop(0, "#f97316");
  outer.addColorStop(1, "#dc2626");
  flame(1, outer);
  ctx.shadowBlur = 0;
  flame(0.55, "#fde047");
  return ctx.getImageData(0, 0, size, size);
}
