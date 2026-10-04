"use client";

/**
 * Judge page: full-screen fire map with floating, see-through cards and a hideable right panel.
 * Connected to FireMap, FirePanel, /api/fires, /api/fire-detail, /api/summary, /api/address, and SpacetimeDB.
 * Weather and the projection are requested only after a judge picks a fire.
 */
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Compare from "../components/Compare";
import type { Basemap, Overlay } from "../components/FireMap";
import FirePanel, { type AddressView, type Environment, type FireView, type ProjectionView, type RiskTag } from "../components/FirePanel";
import { AREA_COMPARISONS, CO2_COMPARISONS } from "../lib/core/compare";
import type { FireRecord } from "../lib/core/fires";
import { partsOf, type LngLat } from "../lib/core/geo";
import { FRP_RAMP, type ThermalResult } from "../lib/core/thermal";
import { fireBox, type WeatherGrid } from "../lib/core/weatherGrid";
import type { Species } from "../lib/core/recovery";
import type { Tag } from "../lib/core/tags";
import { DbConnection } from "../lib/module_bindings";
import { SPACETIME_DB, SPACETIME_HOST, type IncidentRow } from "../lib/spacetime";

const FireMap = dynamic(() => import("../components/FireMap"), { ssr: false });

const NO_PROJECTION: ProjectionView = { hours: null, loading: false, error: null, tags: [], assumptions: [] };
const PALISADES = "palisades";
const NO_THERMAL: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

type OverviewBody = {
  overview: Tag[];
  conditions: Tag[];
  risks: RiskTag[];
  environment: Environment;
  scale: { acres: number | null; co2: number | null };
  recovery: { species: Species[]; speciesTotal: number; habitat: string[] };
};

type ProjectionBody = { hours: number; cone: LngLat[] | null; hull: LngLat[] | null; tags: Tag[]; assumptions: string[] };

type Summary = { fires: number; acres: number; co2Tonnes: number };
type SpeciesTotal = { species: number; speciesFailed: number };

export default function HomePage() {
  const [fires, setFires] = useState<FireRecord[]>([]);
  const [firesStatus, setFiresStatus] = useState("Loading active fires…");
  const [selected, setSelected] = useState<FireRecord | null>(null);
  const [fireView, setFireView] = useState<FireView | null>(null);
  const [projection, setProjection] = useState<ProjectionView>(NO_PROJECTION);
  const [cone, setCone] = useState<LngLat[]>([]);
  const [hull, setHull] = useState<LngLat[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryStatus, setSummaryStatus] = useState("Adding up every active fire…");
  const [speciesTotal, setSpeciesTotal] = useState<SpeciesTotal | null>(null);
  const [speciesStatus, setSpeciesStatus] = useState("counting…");
  const [showTotals, setShowTotals] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [address, setAddress] = useState<AddressView | null>(null);
  const [brief, setBrief] = useState<{ text: string; kind: string; voiceScript?: string } | null>(null);
  const [briefPending, setBriefPending] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>("dark");
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [thermal, setThermal] = useState<ThermalResult | null>(null);
  const [thermalStatus, setThermalStatus] = useState("Pick a fire to load detections.");
  const [weather, setWeather] = useState<WeatherGrid | null>(null);
  const [weatherStatus, setWeatherStatus] = useState("Pick a fire to load this overlay.");
  const weatherFor = useRef<string | null>(null);
  const [radarTiles, setRadarTiles] = useState<string[]>([]);
  const [radarNote, setRadarNote] = useState("Rain radar");
  const [crew, setCrew] = useState<{ sender: string; status: string; title: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [board, setBoard] = useState("Connecting to SpacetimeDB…");
  const [connection, setConnection] = useState<DbConnection | null>(null);
  const recorded = useRef(new Set<string>());
  const request = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fires")
      .then(async (response) => {
        const body = (await response.json()) as { fires?: FireRecord[] };
        if (cancelled) return;
        setFires(body.fires ?? []);
        setFiresStatus(response.ok ? `${body.fires?.length ?? 0} active wildfires` : "Active fires unavailable");
      })
      .catch(() => {
        if (!cancelled) setFiresStatus("Active fires unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/summary")
      .then(async (response) => {
        const body = (await response.json()) as Summary & { error?: string };
        if (cancelled) return;
        if (!response.ok || body.error) setSummaryStatus("Totals unavailable");
        else setSummary(body);
      })
      .catch(() => {
        if (!cancelled) setSummaryStatus("Totals unavailable");
      });
    fetch("/api/summary?part=species")
      .then(async (response) => {
        const body = (await response.json()) as SpeciesTotal & { error?: string };
        if (cancelled) return;
        if (!response.ok || body.error) setSpeciesStatus("unavailable");
        else setSpeciesTotal(body);
      })
      .catch(() => {
        if (!cancelled) setSpeciesStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setThermal(null);
    if (overlay !== "thermal" || !selected) {
      setThermalStatus("Pick a fire to load detections.");
      return;
    }
    let cancelled = false;
    const points = partsOf(selected.geometry).flat();
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const pad = 0.05;
    const box = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
    setThermalStatus("Loading detections…");
    fetch(`/api/thermal?bbox=${box.map((n) => n.toFixed(4)).join(",")}`)
      .then(async (response) => {
        const body = (await response.json()) as ThermalResult & { error?: string };
        if (cancelled) return;
        if (!response.ok || body.error) setThermalStatus("Detections unavailable.");
        else setThermal(body);
      })
      .catch(() => {
        if (!cancelled) setThermalStatus("Detections unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [overlay, selected]);

  useEffect(() => {
    if (overlay !== "aqi" && overlay !== "wind") return;
    if (!selected) {
      setWeather(null);
      weatherFor.current = null;
      setWeatherStatus("Pick a fire to load this overlay.");
      return;
    }
    if (weatherFor.current === selected.id) return;
    let cancelled = false;
    const box = fireBox(selected);
    const fireId = selected.id;
    setWeather(null);
    setWeatherStatus(overlay === "aqi" ? "Loading air quality…" : "Loading wind…");
    fetch(`/api/weather-grid?bbox=${box.map((n) => n.toFixed(4)).join(",")}`)
      .then(async (response) => {
        const body = (await response.json()) as WeatherGrid & { error?: string };
        if (cancelled) return;
        if (!response.ok || body.error) {
          setWeatherStatus(overlay === "aqi" ? "Air quality unavailable." : "Wind unavailable.");
        } else {
          weatherFor.current = fireId;
          setWeather(body);
        }
      })
      .catch(() => {
        if (!cancelled) setWeatherStatus(overlay === "aqi" ? "Air quality unavailable." : "Wind unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [overlay, selected]);

  useEffect(() => {
    if (overlay !== "radar") return;
    let cancelled = false;
    fetch("/api/radar")
      .then(async (response) => {
        const body = (await response.json()) as { tiles?: string[]; time?: string; source?: string; error?: string };
        if (cancelled) return;
        if (!response.ok || !body.tiles) setRadarNote("Rain radar unavailable.");
        else {
          setRadarTiles(body.tiles);
          setRadarNote(`${body.source ?? "RainViewer"}${body.time ? ` · ${new Date(body.time).toUTCString()}` : ""}`);
        }
      })
      .catch(() => {
        if (!cancelled) setRadarNote("Rain radar unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [overlay]);

  useEffect(() => {
    let cancelled = false;
    const readRows = (conn: DbConnection) => {
      const rows: IncidentRow[] = [];
      const titles = new Map<string, string>();
      for (const row of conn.db.incident.iter()) {
        rows.push({ id: row.id, kind: row.kind, title: row.title, lat: row.lat, lon: row.lon, source: row.source });
        titles.set(String(row.id), row.title);
      }
      const status: { sender: string; status: string; title: string }[] = [];
      for (const row of conn.db.crewStatus.iter()) {
        status.push({ sender: row.sender, status: row.status, title: titles.get(String(row.incidentId)) ?? "incident" });
      }
      if (!cancelled) {
        setIncidents(rows);
        setCrew(status.slice(-3));
      }
    };
    const conn = DbConnection.builder()
      .withUri(SPACETIME_HOST)
      .withDatabaseName(SPACETIME_DB)
      .onConnect((next) => {
        if (!cancelled) {
          setBoard(`Live on ${SPACETIME_DB}`);
          setConnection(next);
        }
        next.db.incident.onInsert(() => readRows(next));
        next.db.crewStatus.onInsert(() => readRows(next));
        next.subscriptionBuilder()
          .onApplied(() => readRows(next))
          .subscribe(["SELECT * FROM incident", "SELECT * FROM crew_status", "SELECT * FROM brief", "SELECT * FROM message"]);
      })
      .onConnectError((_ctx, err) => {
        if (!cancelled) setBoard(`SpacetimeDB unavailable: ${err.message}`);
      })
      .build();
    return () => {
      cancelled = true;
      conn.disconnect();
    };
  }, []);

  function postDetail(fire: FireRecord, hours: number | null) {
    return fetch("/api/fire-detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: fire.centroid[1],
        lon: fire.centroid[0],
        geometry: fire.geometry,
        acres: fire.acres,
        containment: hours != null && fire.id === PALISADES ? null : fire.containment,
        hours,
      }),
    });
  }

  async function openFire(fire: FireRecord) {
    const id = ++request.current;
    setSelected(fire);
    setAddress(null);
    setFireView(null);
    setProjection(NO_PROJECTION);
    setCone([]);
    setHull([]);
    setLoading(true);
    setError(null);
    try {
      const response = await postDetail(fire, null);
      if (id !== request.current) return;
      if (!response.ok) {
        setError("Fire details unavailable.");
        return;
      }
      const body = (await response.json()) as OverviewBody;
      if (id !== request.current) return;
      const past = fire.id === PALISADES;
      setFireView({
        name: fire.name === "PALISADES" ? "Palisades Fire" : fire.name,
        subtitle: past ? "Past fire · January 2025 · CA" : `Active wildfire${fire.state ? ` · ${fire.state}` : ""}`,
        centroid: fire.centroid,
        overview: body.overview,
        conditions: body.conditions,
        risks: body.risks,
        environment: body.environment,
        scale: body.scale,
        species: body.recovery.species,
        speciesTotal: body.recovery.speciesTotal,
        habitat: body.recovery.habitat,
      });
      if (!recorded.current.has(fire.id)) {
        recorded.current.add(fire.id);
        void connection?.reducers.openIncident({
          title: fire.name,
          kind: "fire",
          lat: fire.centroid[1],
          lon: fire.centroid[0],
          source: "web",
        });
      }
    } catch {
      if (id === request.current) setError("Fire details unavailable.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  async function runProjection(hours: number | null) {
    const fire = selected;
    const id = ++request.current;
    setCone([]);
    setHull([]);
    if (!fire || hours == null) {
      setProjection(NO_PROJECTION);
      return;
    }
    setProjection({ hours, loading: true, error: null, tags: [], assumptions: [] });
    try {
      const response = await postDetail(fire, hours);
      if (id !== request.current) return;
      if (!response.ok) {
        setProjection({ hours, loading: false, error: "Projection unavailable.", tags: [], assumptions: ["Ember spotting is not modeled."] });
        return;
      }
      const body = (await response.json()) as ProjectionBody;
      if (id !== request.current) return;
      setCone(body.cone ?? []);
      setHull(body.hull ?? []);
      setProjection({
        hours,
        loading: false,
        error: body.cone ? null : "Projection unavailable.",
        tags: body.tags,
        assumptions: body.assumptions,
      });
    } catch {
      if (id === request.current) {
        setProjection({ hours, loading: false, error: "Projection unavailable.", tags: [], assumptions: ["Ember spotting is not modeled."] });
      }
    }
  }

  async function openPalisades() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/fires/palisades");
      if (!response.ok) throw new Error("unavailable");
      const body = (await response.json()) as { fire: FireRecord };
      await openFire(body.fire);
    } catch {
      setLoading(false);
      setError("Palisades unavailable.");
    }
  }

  async function searchAddress(text: string) {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    setSelected(null);
    setFireView(null);
    setProjection(NO_PROJECTION);
    setCone([]);
    setHull([]);
    setAddress(null);
    try {
      const response = await fetch(`/api/address?q=${encodeURIComponent(text)}`);
      const body = (await response.json()) as {
        error?: string;
        title?: string;
        lat?: number;
        lon?: number;
        tags?: Tag[];
        details?: { title: string; tags: Tag[] }[];
        summary?: string;
      };
      if (id !== request.current) return;
      if (!response.ok || body.error || !body.tags || body.lat == null || body.lon == null) {
        setError(body.error ?? "This brief covers New York City only.");
        return;
      }
      setAddress({
        title: body.title ?? text,
        summary: body.summary ?? null,
        tags: body.tags,
        details: body.details ?? [],
        point: [body.lon, body.lat],
      });
      void connection?.reducers.openIncident({
        title: body.title ?? text,
        kind: "address",
        lat: body.lat,
        lon: body.lon,
        source: "web",
      });
    } catch {
      if (id === request.current) setError("Address lookup unavailable.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  async function askBrief(text: string) {
    setBriefPending(true);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, conversationId: "web" }),
      });
      const body = (await response.json()) as { text?: string; kind?: string; voiceScript?: string; error?: string };
      if (!response.ok || !body.text) {
        setBrief({ kind: "error", text: body.error ?? "Brief unavailable." });
        return;
      }
      setBrief({ kind: body.kind ?? "brief", text: body.text, voiceScript: body.voiceScript });
      const title = body.text.split("\n")[0] ?? text;
      if ((body.kind === "address" || body.kind === "fire") && connection) {
        void connection.reducers.openIncident({
          title,
          kind: body.kind,
          lat: body.kind === "fire" ? (selected?.centroid[1] ?? 0) : (address?.point[1] ?? 0),
          lon: body.kind === "fire" ? (selected?.centroid[0] ?? 0) : (address?.point[0] ?? 0),
          source: "agent",
        });
      }
    } catch {
      setBrief({ kind: "error", text: "Brief unavailable." });
    } finally {
      setBriefPending(false);
    }
  }

  function clearSelection() {
    request.current += 1;
    setSelected(null);
    setFireView(null);
    setAddress(null);
    setProjection(NO_PROJECTION);
    setCone([]);
    setHull([]);
    setLoading(false);
    setError(null);
  }

  const selectValue = selected?.id ?? "";

  return (
    <main className="relative h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <div className={`absolute inset-0 ${panelOpen ? "panel-open" : ""}`}>
        <FireMap
          fires={fires}
          selected={selected}
          cone={cone}
          hull={hull}
          basemap={basemap}
          overlay={overlay}
          thermal={thermal?.collection ?? NO_THERMAL}
          aqi={weather?.aqi ?? NO_THERMAL}
          wind={weather?.wind ?? NO_THERMAL}
          radarTiles={radarTiles}
          pin={address?.point ?? null}
          panelOpen={panelOpen}
          onSelect={(id) => {
            const fire = fires.find((item) => item.id === id);
            if (fire) void openFire(fire);
          }}
        />

        <div className="absolute left-3 top-3 z-10 flex w-72 flex-col gap-2">
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-neutral-950/75 p-3 text-sm shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Wildfire map</p>
            <p className="text-xs text-neutral-400">{firesStatus}</p>
          </div>
          <Dropdown
            label="Fire"
            value={selectValue}
            onChange={(value) => {
              if (value === "") clearSelection();
              else if (value === PALISADES) void openPalisades();
              else {
                const fire = fires.find((item) => item.id === value);
                if (fire) void openFire(fire);
              }
            }}
          >
            <option value="">{selected ? "None (deselect)" : "Pick a fire"}</option>
            <optgroup label="Active wildfires, largest first">
              {fires.map((fire) => (
                <option key={fire.id} value={fire.id}>
                  {fire.name}
                  {fire.state ? `, ${fire.state}` : ""} · {fire.acres == null ? "?" : Math.round(fire.acres).toLocaleString()} ac
                </option>
              ))}
            </optgroup>
            <optgroup label="Past fire">
              <option value={PALISADES}>Palisades, Jan 2025</option>
            </optgroup>
          </Dropdown>
          <Dropdown label="Base map" value={basemap} onChange={(value) => setBasemap(value as Basemap)}>
            <option value="dark">Dark streets</option>
            <option value="satellite">Satellite (high resolution)</option>
            <option value="viirs">NASA VIIRS, yesterday</option>
          </Dropdown>
          <Dropdown label="Overlay" value={overlay} onChange={(value) => setOverlay(value as Overlay)}>
            <option value="none">None</option>
            <option value="thermal">Satellite heat detections, 375 m pixels</option>
            <option value="i5night">Thermal infrared, night (I5)</option>
            <option value="i5day">Thermal infrared, day (I5)</option>
            <option value="falsecolor">Fire false color (M11-I2-I1)</option>
            <option value="aqi">Air quality (AQI)</option>
            <option value="wind">Wind</option>
            <option value="radar">Rain radar</option>
          </Dropdown>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-400">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500 ring-1 ring-yellow-300" /> Active fire
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-3.5 rounded-sm bg-red-500/60 ring-1 ring-red-400" /> Perimeter
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-3.5 rounded-sm border border-dashed border-yellow-400 bg-yellow-400/30" /> Projection
            </span>
          </div>
          <OverlayLegend
            overlay={overlay}
            thermal={thermal}
            status={thermalStatus}
            weather={weather}
            weatherStatus={weatherStatus}
            radarNote={radarNote}
          />
        </div>
        <Totals
          summary={summary}
          status={summaryStatus}
          species={speciesTotal}
          speciesStatus={speciesStatus}
          open={showTotals}
          onToggle={() => setShowTotals((value) => !value)}
        />
        </div>

        <div className="absolute bottom-3 left-3 z-10 max-h-32 max-w-xs overflow-auto rounded-lg border border-white/10 bg-neutral-950/75 p-2 text-xs text-neutral-300 shadow-xl backdrop-blur-md">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-neutral-100">
            <span className={`inline-block h-2 w-2 rounded-full ${connection ? "bg-emerald-400" : "bg-neutral-500"}`} />
            {board}
          </p>
          {incidents.slice(-3).map((row) => (
            <p key={String(row.id)}>
              {row.title} · {publicSource(row.source)}
            </p>
          ))}
          {crew.map((row, index) => (
            <p key={`${row.sender}-${row.status}-${index}`} className="text-amber-200">
              {publicSource(row.sender)}: {row.status} · {row.title}
            </p>
          ))}
        </div>
      </div>
      <FirePanel
        open={panelOpen}
        onToggle={() => setPanelOpen((value) => !value)}
        onClear={clearSelection}
        loading={loading}
        error={error}
        fire={fireView}
        projection={projection}
        address={address}
        onProjection={(hours) => void runProjection(hours)}
        onSearch={(text) => {
          setPanelOpen(true);
          void searchAddress(text);
        }}
        onBrief={(text) => {
          setPanelOpen(true);
          void askBrief(text);
        }}
        brief={brief}
        briefPending={briefPending}
      />
    </main>
  );
}

function Totals({
  summary,
  status,
  species,
  speciesStatus,
  open,
  onToggle,
}: {
  summary: Summary | null;
  status: string;
  species: SpeciesTotal | null;
  speciesStatus: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="max-h-[calc(100vh-300px)] overflow-y-auto rounded-lg border border-white/10 bg-neutral-950/75 text-sm shadow-xl backdrop-blur-md">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between px-3 py-2 text-left">
        <span>
          <span className="block font-semibold text-red-300">Burning right now in the US</span>
          <span className="block text-[11px] text-neutral-400">{summary ? `${summary.fires} active wildfires` : status}</span>
        </span>
        <span className={`text-neutral-400 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && summary ? (
        <div className="space-y-2.5 border-t border-white/10 px-3 py-2.5">
          <div title="WFIGS perimeters of active wildfires.">
            <p className="text-[11px] text-neutral-400">Land burned</p>
            <p className="text-xl font-bold tabular-nums text-orange-300">
              {Math.round(summary.acres).toLocaleString()} <span className="text-xs font-medium text-neutral-400">acres</span>
            </p>
            <Compare amount={summary.acres} options={AREA_COMPARISONS} />
          </div>
          <div title="Estimate from burned area and mapped vegetation. Vegetation only, structures excluded.">
            <p className="text-[11px] text-neutral-400">CO2 emitted</p>
            <p className="text-xl font-bold tabular-nums text-red-300">
              {formatTonnes(summary.co2Tonnes)} <span className="text-xs font-medium text-neutral-400">tonnes</span>
            </p>
            <Compare amount={summary.co2Tonnes} options={CO2_COMPARISONS} tone="red" />
          </div>
          <div
            title={`Distinct animal species with GBIF records inside the perimeters${species?.speciesFailed ? `. ${species.speciesFailed} fires unavailable` : ""}.`}
          >
            <p className="text-[11px] text-neutral-400">Species recorded in these areas</p>
            <p className="text-xl font-bold tabular-nums text-amber-200">{species ? species.species.toLocaleString() : speciesStatus}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function OverlayLegend({
  overlay,
  thermal,
  status,
  weather,
  weatherStatus,
  radarNote,
}: {
  overlay: Overlay;
  thermal: ThermalResult | null;
  status: string;
  weather: WeatherGrid | null;
  weatherStatus: string;
  radarNote: string;
}) {
  if (overlay === "none") return null;
  if (overlay === "radar") {
    return <p className="border-t border-white/10 pt-2 text-[11px] text-neutral-400">{radarNote}</p>;
  }
  if (overlay === "aqi") {
    return (
      <div className="space-y-1 border-t border-white/10 pt-2 text-[11px] text-neutral-400">
        <p className="font-medium text-neutral-200">US Air Quality Index</p>
        <p>Green good · yellow moderate · orange/red unhealthy · purple very unhealthy.</p>
        <p className="text-neutral-300">
          {weather
            ? `${weather.aqi.features.length} points${weather.maxAqi != null ? ` · max AQI ${Math.round(weather.maxAqi)}` : ""}`
            : weatherStatus}
        </p>
      </div>
    );
  }
  if (overlay === "wind") {
    return (
      <div className="space-y-1 border-t border-white/10 pt-2 text-[11px] text-neutral-400">
        <p className="font-medium text-neutral-200">Wind</p>
        <p>Each line points downwind. Longer and brighter lines are stronger wind. One Open-Meteo grid over this fire.</p>
        <p className="text-neutral-300">{weather ? `${weather.wind.features.length} wind lines` : weatherStatus}</p>
      </div>
    );
  }
  if (overlay !== "thermal") {
    const text = {
      i5night: "NOAA-20 band I5 thermal infrared, night pass, yesterday (UTC). Warm ground and fire stand out from cool surroundings.",
      i5day: "NOAA-20 band I5 thermal infrared, day pass, yesterday (UTC).",
      falsecolor: "NOAA-20 bands M11-I2-I1, yesterday (UTC). Vegetation green, burn scars red-brown, active fire bright orange.",
    }[overlay];
    return <p className="border-t border-white/10 pt-2 text-[11px] text-neutral-400">{text} Sharpest up to zoom 9.</p>;
  }
  const gradient = `linear-gradient(to right, ${FRP_RAMP.map(([, color]) => color).join(", ")})`;
  return (
    <div className="space-y-1 border-t border-white/10 pt-2 text-[11px] text-neutral-400">
      <p className="font-medium text-neutral-200">Satellite heat detections, 375 m pixels</p>
      <div className="h-2 rounded-sm" style={{ background: gradient }} />
      <div className="flex justify-between tabular-nums">
        {FRP_RAMP.map(([value]) => (
          <span key={value}>{value === 200 ? "200+" : value}</span>
        ))}
      </div>
      <p>Fire radiative power, MW. Each square is one VIIRS pixel at its true ground size.</p>
      {thermal ? (
        <p className="text-neutral-300">
          {thermal.count === 0
            ? "No detections in the last 24 h."
            : `${thermal.count} detections · latest pass ${formatPass(thermal.latest)}`}
        </p>
      ) : (
        <p className="text-neutral-300">{status}</p>
      )}
      {thermal ? <p className="text-neutral-500">{thermal.source}</p> : null}
    </div>
  );
}

function formatPass(iso: string | null): string {
  if (!iso) return "unknown";
  const date = new Date(iso);
  return `${date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
}

function formatTonnes(tonnes: number): string {
  if (tonnes >= 1_000_000) return `${(tonnes / 1_000_000).toFixed(2)} million`;
  return Math.round(tonnes).toLocaleString();
}

function Dropdown({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs text-neutral-400">{label}</span>
      <select
        className="w-48 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm focus:border-orange-500 focus:outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function publicSource(source: string): string {
  if (/\d{7,}/.test(source) || source.includes("+")) return "crew member";
  return source;
}
