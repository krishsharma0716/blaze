"use client";

/**
 * Draws perimeters, the satellite layer, hotspots, and the spread cone.
 * Connected to app/page.tsx. The page fetches fires and passes them in.
 * A click reports the fire id. This file does not call data APIs.
 */
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FireRecord } from "../lib/core/fires";
import type { LngLat } from "../lib/core/geo";

const GIBS_DATE = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

function polygon(ring: LngLat[]): GeoJSON.Polygon {
  return { type: "Polygon", coordinates: [ring] };
}

export default function FireMap({
  fires,
  cone,
  showSatellite,
  showHotspots,
  onSelect,
}: {
  fires: FireRecord[];
  cone: LngLat[];
  showSatellite: boolean;
  showHotspots: boolean;
  onSelect: (id: string) => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const firesRef = useRef(fires);
  const coneRef = useRef(cone);
  onSelectRef.current = onSelect;
  firesRef.current = fires;
  coneRef.current = cone;

  useEffect(() => {
    if (!holder.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: holder.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-98, 39],
      zoom: 3,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("load", () => {
      map.addSource("gibs", {
        type: "raster",
        tiles: [
          `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${GIBS_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
        ],
        tileSize: 256,
        maxzoom: 9,
      });
      map.addLayer({ id: "gibs", type: "raster", source: "gibs", layout: { visibility: "none" } });
      map.addSource("firms", { type: "raster", tiles: ["/api/firms/tile?bbox={bbox-epsg-3857}"], tileSize: 256 });
      map.addLayer({ id: "firms", type: "raster", source: "firms", layout: { visibility: "none" } });
      map.addSource("fires", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: firesRef.current.map((fire) => ({
            type: "Feature" as const,
            properties: { id: fire.id },
            geometry: polygon(
              fire.geometry.type === "Polygon" ? (fire.geometry.coordinates[0] as LngLat[]) : (fire.geometry.coordinates[0][0] as LngLat[]),
            ),
          })),
        },
      });
      map.addLayer({ id: "fires-fill", type: "fill", source: "fires", paint: { "fill-color": "#e85d04", "fill-opacity": 0.45 } });
      map.addLayer({ id: "fires-line", type: "line", source: "fires", paint: { "line-color": "#9a3412", "line-width": 1.5 } });
      map.addSource("centers", { type: "geojson", data: centerCollection(firesRef.current) });
      map.addLayer({
        id: "fire-dots",
        type: "circle",
        source: "centers",
        paint: { "circle-radius": 5, "circle-color": "#9a3412", "circle-stroke-width": 1, "circle-stroke-color": "#fff" },
      });
      map.addSource("cone", {
        type: "geojson",
        data:
          coneRef.current.length < 3
            ? { type: "FeatureCollection", features: [] }
            : { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: polygon(coneRef.current) }] },
      });
      map.addLayer({ id: "cone-fill", type: "fill", source: "cone", paint: { "fill-color": "#fbbf24", "fill-opacity": 0.35 } });
      const pick = (event: maplibregl.MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelectRef.current(id);
      };
      map.on("click", "fires-fill", pick);
      map.on("click", "fire-dots", pick);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current?.getLayer("gibs")) return;
    mapRef.current.setLayoutProperty("gibs", "visibility", showSatellite ? "visible" : "none");
  }, [showSatellite]);

  useEffect(() => {
    if (!mapRef.current?.getLayer("firms")) return;
    mapRef.current.setLayoutProperty("firms", "visibility", showHotspots ? "visible" : "none");
  }, [showHotspots]);

  useEffect(() => {
    const source = mapRef.current?.getSource("fires") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(featureCollection(fires));
    const centers = mapRef.current?.getSource("centers") as maplibregl.GeoJSONSource | undefined;
    centers?.setData(centerCollection(fires));
  }, [fires]);

  useEffect(() => {
    const source = mapRef.current?.getSource("cone") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
      cone.length < 3
        ? { type: "FeatureCollection", features: [] }
        : { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: polygon(cone) }] },
    );
  }, [cone]);

  return <div ref={holder} className="h-full w-full" />;
}

function featureCollection(fires: FireRecord[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fires.map((fire) => ({
      type: "Feature",
      properties: { id: fire.id },
      geometry: polygon(fire.geometry.type === "Polygon" ? (fire.geometry.coordinates[0] as LngLat[]) : (fire.geometry.coordinates[0][0] as LngLat[])),
    })),
  };
}

function centerCollection(fires: FireRecord[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fires.map((fire) => ({
      type: "Feature",
      properties: { id: fire.id },
      geometry: { type: "Point", coordinates: fire.centroid },
    })),
  };
}
