"use client";

/**
 * Judge page: fire map, click panel, and the live incident list.
 * Connected to FireMap, /api/fire-detail, and the SpacetimeDB subscription.
 * Weather is requested only after a perimeter click.
 */
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import FirePanel from "../components/FirePanel";
import type { FireRecord } from "../lib/core/fires";
import type { LngLat } from "../lib/core/geo";
import type { HelpLink } from "../lib/core/recovery";
import { speakBrief } from "../lib/core/speakBrief";
import type { Tag } from "../lib/core/tags";
import { DbConnection } from "../lib/module_bindings";
import { SPACETIME_DB, SPACETIME_HOST, type IncidentRow } from "../lib/spacetime";

const FireMap = dynamic(() => import("../components/FireMap"), { ssr: false });

export default function HomePage() {
  const [fires, setFires] = useState<FireRecord[]>([]);
  const [selected, setSelected] = useState<FireRecord | null>(null);
  const [hours, setHours] = useState(1);
  const [tags, setTags] = useState<Tag[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [species, setSpecies] = useState<{ name: string; count: number }[]>([]);
  const [habitat, setHabitat] = useState<string[]>([]);
  const [links, setLinks] = useState<HelpLink[]>([]);
  const [cone, setCone] = useState<LngLat[]>([]);
  const [showSatellite, setShowSatellite] = useState(false);
  const [showHotspots, setShowHotspots] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [board, setBoard] = useState("Connecting to SpacetimeDB…");
  const [connection, setConnection] = useState<DbConnection | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [addressTitle, setAddressTitle] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(true);
  const recorded = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fires")
      .then(async (response) => {
        const body = (await response.json()) as { fires?: FireRecord[] };
        if (!cancelled) setFires(body.fires ?? []);
      })
      .catch(() => {
        if (!cancelled) setFires([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const readRows = (conn: DbConnection) => {
      const rows: IncidentRow[] = [];
      for (const row of conn.db.incident.iter()) {
        rows.push({ id: row.id, kind: row.kind, title: row.title, lat: row.lat, lon: row.lon, source: row.source });
      }
      if (!cancelled) setIncidents(rows);
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
        next.subscriptionBuilder().onApplied(() => readRows(next)).subscribe("SELECT * FROM incident");
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

  async function loadDetail(fire: FireRecord, nextHours: number) {
    setSelected(fire);
    setSummary(null);
    setAddressTitle(null);
    setShowRecovery(true);
    setHours(nextHours);
    setLoading(true);
    setError(null);
    const started = performance.now();
    try {
      const response = await fetch("/api/fire-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: fire.centroid[1],
          lon: fire.centroid[0],
          geometry: fire.geometry,
          acres: fire.acres,
          containment: fire.containment,
          hours: nextHours,
        }),
      });
      if (!response.ok) {
        setError("unavailable");
        setTags([]);
        setCone([]);
        setSpecies([]);
        setHabitat([]);
        setLinks([]);
        return;
      }
      const body = (await response.json()) as {
        tags: Tag[];
        cone: { polygon: { coordinates: LngLat[][] } } | null;
        assumptions: string[];
        recovery?: { species: { name: string; count: number }[]; habitat: string[]; links: HelpLink[] };
      };
      setTags(body.tags);
      setAssumptions(body.assumptions);
      setSpecies(body.recovery?.species ?? []);
      setHabitat(body.recovery?.habitat ?? []);
      setLinks(body.recovery?.links ?? []);
      setCone(body.cone?.polygon.coordinates[0] ?? []);
      if (performance.now() - started > 5000) setError("Conditions took longer than 5 seconds.");
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
      setError("unavailable");
    } finally {
      setLoading(false);
    }
  }

  async function searchAddress(address: string) {
    setLoading(true);
    setError(null);
    setShowRecovery(false);
    setSelected(null);
    setSpecies([]);
    setHabitat([]);
    setLinks([]);
    setCone([]);
    setAssumptions([]);
    try {
      const response = await fetch(`/api/address?q=${encodeURIComponent(address)}`);
      const body = (await response.json()) as {
        error?: string;
        title?: string;
        lat?: number;
        lon?: number;
        tags?: Tag[];
        summary?: string;
      };
      if (!response.ok || body.error || !body.tags || body.lat == null || body.lon == null) {
        setError(body.error ?? "This brief covers New York City only.");
        setTags([]);
        setSummary(null);
        setAddressTitle(null);
        return;
      }
      setTags(body.tags);
      setSummary(body.summary ?? null);
      setAddressTitle(body.title ?? address);
      void connection?.reducers.openIncident({
        title: body.title ?? address,
        kind: "address",
        lat: body.lat,
        lon: body.lon,
        source: "web",
      });
    } catch {
      setError("Address lookup unavailable.");
    } finally {
      setLoading(false);
    }
  }

  async function playBrief() {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: summary || speakBrief(tags) }),
    });
    if (!response.ok) {
      setError("Voice unavailable");
      return;
    }
    const audio = new Audio(URL.createObjectURL(await response.blob()));
    await audio.play();
  }

  return (
    <main className="flex h-screen">
      <div className="relative min-w-0 flex-1">
        <FireMap
          fires={fires}
          cone={cone}
          showSatellite={showSatellite}
          showHotspots={showHotspots}
          onSelect={(id) => {
            const fire = fires.find((item) => item.id === id);
            if (fire) void loadDetail(fire, hours);
          }}
        />
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-2 rounded bg-white/95 p-2 text-sm shadow">
          <label className="flex gap-2">
            <input type="checkbox" checked={showSatellite} onChange={(event) => setShowSatellite(event.target.checked)} />
            Satellite
          </label>
          <label className="flex gap-2">
            <input type="checkbox" checked={showHotspots} onChange={(event) => setShowHotspots(event.target.checked)} />
            Hotspots
          </label>
          <button
            type="button"
            className="rounded border px-2 py-1 text-left"
            onClick={() => {
              void fetch("/api/fires/palisades")
                .then(async (response) => {
                  if (!response.ok) {
                    setError("Palisades unavailable");
                    return;
                  }
                  const body = (await response.json()) as { fire: FireRecord };
                  setFires((current) => [body.fire, ...current.filter((item) => item.id !== body.fire.id)]);
                  void loadDetail(body.fire, hours);
                })
                .catch(() => setError("Palisades unavailable"));
            }}
          >
            Palisades, Jan 2025
          </button>
        </div>
        <div className="absolute bottom-3 left-3 z-10 max-h-28 max-w-sm overflow-auto rounded bg-white/95 p-2 text-xs shadow">
          <p>{board}</p>
          {incidents.slice(-3).map((row) => (
            <p key={String(row.id)}>
              {row.title} · {publicSource(row.source)}
            </p>
          ))}
        </div>
      </div>
      <FirePanel
        name={addressTitle ?? selected?.name ?? null}
        loading={loading}
        error={error}
        tags={tags}
        assumptions={assumptions}
        species={species}
        habitat={habitat}
        links={links}
        hours={hours}
        onHours={(value) => {
          if (selected) void loadDetail(selected, value);
          else setHours(value);
        }}
        summary={summary}
        showRecovery={showRecovery}
        onSearch={(address) => void searchAddress(address)}
        onPlay={() => void playBrief()}
      />
    </main>
  );
}

function publicSource(source: string): string {
  if (/\d{7,}/.test(source) || source.includes("+")) return "crew member";
  return source;
}
