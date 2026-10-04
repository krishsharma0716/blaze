"use client";

/**
 * Phase 0 board: lists incidents as SpacetimeDB pushes them, and plays one clip.
 * Connected to lib/spacetime.ts and app/api/tts/route.ts.
 * Opening this page does not call wildfire, weather, or address APIs.
 */
import { useEffect, useState } from "react";
import { speakBrief } from "../lib/core/speakBrief";
import { DbConnection } from "../lib/module_bindings";
import { SPACETIME_DB, SPACETIME_HOST, type IncidentRow } from "../lib/spacetime";

const PHASE_0_TAGS = [
  {
    label: "Status",
    value: "Phase 0 voice check",
    detail: "Hard-coded script. No fire data is loaded on this page.",
  },
];

export default function HomePage() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [status, setStatus] = useState("Connecting to SpacetimeDB…");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const readRows = (conn: DbConnection) => {
      const rows: IncidentRow[] = [];
      for (const row of conn.db.incident.iter()) {
        rows.push({
          id: row.id,
          kind: row.kind,
          title: row.title,
          lat: row.lat,
          lon: row.lon,
          source: row.source,
        });
      }
      if (!cancelled) setIncidents(rows);
    };

    const connection = DbConnection.builder()
      .withUri(SPACETIME_HOST)
      .withDatabaseName(SPACETIME_DB)
      .onConnect((conn) => {
        if (!cancelled) setStatus(`Live on ${SPACETIME_DB}`);
        const refresh = () => readRows(conn);
        conn.db.incident.onInsert(refresh);
        conn.subscriptionBuilder().onApplied(refresh).subscribe("SELECT * FROM incident");
      })
      .onConnectError((_ctx, error) => {
        if (!cancelled) setStatus(`SpacetimeDB unavailable: ${error.message}`);
      })
      .build();

    return () => {
      cancelled = true;
      connection.disconnect();
    };
  }, []);

  async function play() {
    setPlaying(true);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: speakBrief(PHASE_0_TAGS) }),
      });
      if (!response.ok) {
        setStatus("Voice unavailable");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      setStatus("Voice unavailable");
    } finally {
      setPlaying(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Incident board</h1>
      <p className="mt-2 text-sm text-neutral-600">{status}</p>
      <button
        className="mt-4 rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
        onClick={() => void play()}
        disabled={playing}
        type="button"
      >
        {playing ? "Playing…" : "Play voice check"}
      </button>
      <ul className="mt-6 space-y-2">
        {incidents.length === 0 ? (
          <li className="text-sm text-neutral-500">No incidents yet.</li>
        ) : (
          incidents.map((row) => (
            <li key={String(row.id)} className="rounded border border-neutral-200 p-3 text-sm">
              {row.title} · {row.kind} · {row.source}
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
