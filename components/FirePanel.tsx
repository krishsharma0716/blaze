/**
 * Floating right panel: Photon text signup, NYC building check, crew brief, ways to help, and one collapsible card for the selected fire or address.
 * Connected to app/page.tsx (all data), /api/photon-signup, lib/core/help.ts (links), and components/Compare.tsx.
 * Row explanations stay hidden until a row is clicked. Ember spotting is always called out as not modeled.
 */
import { useState, type ReactNode } from "react";
import { AREA_COMPARISONS, CO2_COMPARISONS } from "../lib/core/compare";
import type { LngLat } from "../lib/core/geo";
import { helpLinks } from "../lib/core/help";
import type { Species } from "../lib/core/recovery";
import type { Tag } from "../lib/core/tags";
import Compare from "./Compare";

export type RiskTag = Tag & { level: "high" | "moderate" | "low" | "unknown" };

export type Environment = {
  fuel: "forest" | "shrub" | "grass";
  vegetation: string;
  fuelMoisture: number | null;
  extinction: number;
  soil: number | null;
  slopePct: number | null;
  humidity: number | null;
  tempF: number | null;
  windMph: number | null;
  windFrom: string;
  elevation: number | null;
};

export type FireView = {
  name: string;
  subtitle: string;
  centroid: LngLat;
  overview: Tag[];
  conditions: Tag[];
  risks: RiskTag[];
  environment: Environment;
  scale: { acres: number | null; co2: number | null };
  species: Species[];
  speciesTotal: number;
  habitat: string[];
};

export type ProjectionView = {
  hours: number | null;
  loading: boolean;
  error: string | null;
  tags: Tag[];
  assumptions: string[];
};

export type AddressView = {
  title: string;
  summary: string | null;
  tags: Tag[];
  details: { title: string; tags: Tag[] }[];
  point: LngLat;
};

type Props = {
  open: boolean;
  loading: boolean;
  error: string | null;
  fire: FireView | null;
  projection: ProjectionView;
  address: AddressView | null;
  onToggle: () => void;
  onClear: () => void;
  onProjection: (hours: number | null) => void;
  onSearch: (address: string) => void;
  onBrief: (text: string) => void;
  brief: { text: string; kind: string; voiceScript?: string } | null;
  briefPending: boolean;
};

const INTERVALS = [1, 2, 3, 6];
const CARD = "rounded-lg border border-white/10 bg-neutral-900/50";

export default function FirePanel({
  open,
  loading,
  error,
  fire,
  projection,
  address,
  onToggle,
  onClear,
  onProjection,
  onSearch,
  onBrief,
  brief,
  briefPending,
}: Props) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-3 z-20 rounded-lg border border-white/10 bg-neutral-950/75 px-3 py-2 text-sm font-medium text-neutral-100 shadow-xl backdrop-blur hover:bg-neutral-900/80"
      >
        ‹ Show panel
      </button>
    );
  }
  return (
    <aside className="absolute bottom-3 right-3 top-3 z-20 flex w-[400px] flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-950/75 text-neutral-100 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Details</p>
        <button type="button" onClick={onToggle} className="rounded px-2 py-0.5 text-xs text-neutral-400 hover:bg-white/10 hover:text-neutral-100">
          Hide ›
        </button>
      </div>
      <div className="flex flex-col gap-2.5 overflow-y-auto p-3">
        <PhotonSignupCard />
        <SearchCard onSearch={onSearch} />
        <CrewBriefCard onAsk={onBrief} reply={brief} pending={briefPending} />
        <HelpCard key={fire ? `help-${fire.name}` : address ? "help-address" : "help-none"} point={fire?.centroid ?? null} startOpen={!fire && !address} />

        {loading ? <p className="px-1 text-sm text-neutral-400">Loading…</p> : null}
        {error ? <p className="rounded-md bg-red-950/70 px-3 py-2 text-sm text-red-300">{error}</p> : null}

        {address ? (
          <Card key={`address-${address.title}`} eyebrow="NYC building check" title={address.title} tone="sky" onClose={onClear}>
            <AddressBody address={address} />
          </Card>
        ) : fire ? (
          <Card key={`fire-${fire.name}`} eyebrow={fire.subtitle} title={fire.name} tone="orange" onClose={onClear}>
            <FireBody fire={fire} projection={projection} onProjection={onProjection} />
          </Card>
        ) : !loading ? (
          <p className="px-1 text-sm text-neutral-400">Pick a fire on the map or from the Fire list.</p>
        ) : null}
      </div>
    </aside>
  );
}

function Card({
  eyebrow,
  title,
  tone,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  tone: "orange" | "sky";
  onClose: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const border = tone === "orange" ? "border-orange-500/40" : "border-sky-500/40";
  const eyebrowColor = tone === "orange" ? "text-orange-400" : "text-sky-400";
  return (
    <section className={`rounded-lg border bg-neutral-900/40 ${border}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-w-0 flex-1 items-center justify-between text-left">
          <span className="min-w-0">
            <span className={`block text-[11px] uppercase tracking-wide ${eyebrowColor}`}>{eyebrow}</span>
            <span className="block truncate text-base font-semibold text-neutral-100">{title}</span>
          </span>
          <span className={`ml-2 text-neutral-400 transition ${open ? "rotate-180" : ""}`}>▾</span>
        </button>
        <button type="button" onClick={onClose} title="Deselect" className="rounded px-1.5 text-lg leading-none text-neutral-500 hover:bg-white/10 hover:text-neutral-100">
          ×
        </button>
      </div>
      {open ? <div className="flex flex-col gap-2.5 border-t border-white/10 p-3">{children}</div> : null}
    </section>
  );
}

function PhotonSignupCard() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signup, setSignup] = useState<{ textNumber: string; openUrl: string; starter: string } | null>(null);

  return (
    <section className={`${CARD} p-3`}>
      <p className="text-sm font-semibold text-emerald-300">Text the agent</p>
      <p className="text-xs text-neutral-400">On your iPhone, add your number. Messages opens a draft to the Photon line. Send it, then ask about a building or a fire.</p>
      {signup ? (
        <div className="mt-2 space-y-2 text-sm">
          <p>
            From that phone, text <span className="font-medium text-neutral-100">{signup.textNumber}</span>
          </p>
          <a href={signup.openUrl} className="inline-block rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium hover:bg-emerald-600">
            Open Messages
          </a>
          <p className="text-xs text-neutral-500">Draft: {signup.starter}</p>
        </div>
      ) : (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(new FormData(event.currentTarget).get("phone") ?? "").trim();
            if (!value || pending) return;
            setPending(true);
            setError(null);
            void fetch("/api/photon-signup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phone: value }),
            })
              .then(async (response) => {
                const body = (await response.json()) as { error?: string; textNumber?: string; openUrl?: string; starter?: string };
                if (!response.ok || !body.textNumber || !body.openUrl || !body.starter) {
                  setError(body.error ?? "Text signup is unavailable.");
                  return;
                }
                setSignup({ textNumber: body.textNumber, openUrl: body.openUrl, starter: body.starter });
              })
              .catch(() => setError("Text signup is unavailable."))
              .finally(() => setPending(false));
          }}
        >
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            aria-label="Mobile number"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-950/60 px-3 py-1.5 text-sm placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none"
            placeholder="(555) 555-0100"
          />
          <button className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50" type="submit" disabled={pending}>
            {pending ? "…" : "Sign up"}
          </button>
        </form>
      )}
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </section>
  );
}

function VoiceButton({ script }: { script: string }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={state === "loading"}
        className="rounded-md bg-amber-800 px-3 py-1 text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
        onClick={() => {
          setState("loading");
          void fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: script }),
          })
            .then(async (response) => {
              if (!response.ok) {
                setState("error");
                return;
              }
              const url = URL.createObjectURL(await response.blob());
              const audio = new Audio(url);
              audio.onended = () => URL.revokeObjectURL(url);
              await audio.play();
              setState("idle");
            })
            .catch(() => setState("error"));
        }}
      >
        {state === "loading" ? "Speaking…" : "Play voice"}
      </button>
      {state === "error" ? <p className="text-xs text-red-300">Voice unavailable. Check the xAI key and credits.</p> : null}
    </div>
  );
}

function CrewBriefCard({
  onAsk,
  reply,
  pending,
}: {
  onAsk: (text: string) => void;
  reply: { text: string; kind: string; voiceScript?: string } | null;
  pending: boolean;
}) {
  return (
    <section className={`${CARD} p-3`}>
      <p className="text-sm font-semibold text-amber-200">Crew brief</p>
      <p className="text-xs text-neutral-400">Same Photon agent as iMessage. NYC address for a building brief, or a fire name for the dashboard numbers.</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const value = String(data.get("brief") ?? "").trim();
          if (value) onAsk(value);
        }}
      >
        <input
          name="brief"
          aria-label="Crew brief"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-950/60 px-3 py-1.5 text-sm placeholder:text-neutral-500 focus:border-amber-500 focus:outline-none"
          placeholder="350 Fifth Avenue or Palisades"
        />
        <button className="rounded-md bg-amber-800 px-3 py-1.5 text-sm font-medium hover:bg-amber-700 disabled:opacity-50" type="submit" disabled={pending}>
          {pending ? "…" : "Ask"}
        </button>
      </form>
      {reply ? (
        <div className="mt-2 space-y-2">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-5 text-neutral-200">{reply.text}</pre>
          {reply.voiceScript ? <VoiceButton script={reply.voiceScript} /> : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-neutral-500">Building brief is floors, era hazards, solar, and first-due. Fire brief is acres, wind, AQI, fuel moisture, and CO2 from the dashboard.</p>
      )}
    </section>
  );
}

function SearchCard({ onSearch }: { onSearch: (address: string) => void }) {
  return (
    <section className={`${CARD} p-3`}>
      <p className="text-sm font-semibold text-sky-300">Check a New York City building</p>
      <p className="text-xs text-neutral-400">Build year, fire-risk era, renovations, solar, and FDNY company.</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const value = String(data.get("address") ?? "").trim();
          if (value) onSearch(value);
        }}
      >
        <input
          name="address"
          aria-label="New York City address"
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-950/60 px-3 py-1.5 text-sm placeholder:text-neutral-500 focus:border-sky-500 focus:outline-none"
          placeholder="e.g. 350 Fifth Avenue"
        />
        <button className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-medium hover:bg-sky-600" type="submit">
          Check
        </button>
      </form>
    </section>
  );
}

function HelpCard({ point, startOpen }: { point: LngLat | null; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const links = helpLinks(point);
  return (
    <section className="rounded-lg border border-emerald-600/40 bg-emerald-950/30">
      <button type="button" className="flex w-full items-center justify-between px-3 py-2.5 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>
          <span className="block text-sm font-semibold text-emerald-300">Ways to help wildfire recovery</span>
          {links.some((link) => link.regional) ? <span className="block text-xs text-emerald-200/60">Includes groups near this fire</span> : null}
        </span>
        <span className={`text-emerald-300 transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open ? (
        <ul className="divide-y divide-white/5 border-t border-emerald-800/40 px-3 py-1">
          {links.map((link) => (
            <li key={link.name}>
              <a href={link.url} target="_blank" rel="noreferrer" title={link.note} className="group flex items-center justify-between gap-2 py-1.5">
                <span className="text-sm text-emerald-100 group-hover:underline">
                  {link.name}
                  {link.regional ? <span className="ml-2 rounded bg-emerald-800/70 px-1.5 py-0.5 text-[10px] uppercase text-emerald-100">Nearby</span> : null}
                </span>
                <span className="shrink-0 text-[11px] text-neutral-500">{link.group}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AddressBody({ address }: { address: AddressView }) {
  return (
    <>
      {address.summary ? <p className="text-sm text-neutral-300">{address.summary}</p> : null}
      <TagList tags={address.tags} />
      {address.details.map((group) => (
        <Section key={group.title} title={group.title}>
          <TagList tags={group.tags} />
        </Section>
      ))}
    </>
  );
}

function FireBody({
  fire,
  projection,
  onProjection,
}: {
  fire: FireView;
  projection: ProjectionView;
  onProjection: (hours: number | null) => void;
}) {
  const [acres, containment, ...others] = fire.overview;
  const co2 = others.find((tag) => tag.label === "CO2 now");
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {acres ? <Stat label="Acres burned" value={acres.value} hint={acres.detail} /> : null}
        {containment ? <Stat label="Contained" value={containment.value} hint={containment.detail} /> : null}
        {co2 ? (
          <Stat label="CO2 released" value={fire.scale.co2 == null ? co2.value : shortTonnes(fire.scale.co2)} hint={`${co2.value}. Estimate. ${co2.detail}`} tone="red" />
        ) : null}
      </div>
      {fire.scale.acres ? <Compare amount={fire.scale.acres} options={AREA_COMPARISONS} /> : null}
      {fire.scale.co2 ? <Compare amount={fire.scale.co2} options={CO2_COMPARISONS} tone="red" /> : null}

      <section className="rounded-lg border border-yellow-600/30 bg-yellow-950/10 p-2.5">
        <label className="flex items-center justify-between gap-2 text-sm font-medium">
          Spread projection
          <select
            className="rounded-md border border-white/10 bg-neutral-950/70 px-2 py-1 text-sm"
            value={projection.hours ?? ""}
            onChange={(event) => onProjection(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">Off</option>
            {INTERVALS.map((value) => (
              <option key={value} value={value}>
                {value} hour{value > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
        {projection.hours != null ? (
          <div className="mt-2 space-y-2">
            {projection.loading ? <p className="text-sm text-neutral-400">Running projection…</p> : null}
            {projection.error ? <p className="text-sm text-red-300">{projection.error}</p> : null}
            <TagList tags={projection.tags} />
          </div>
        ) : null}
        <details className="mt-1.5 text-xs text-neutral-500">
          <summary className="cursor-pointer text-neutral-400">How it works · Ember spotting is not modeled.</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {(projection.assumptions.length > 0
              ? projection.assumptions
              : ["Wind plus natural growth from fuel type, fuel moisture, soil moisture, and slope, hour by hour. The yellow band is new ground."]
            ).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      </section>

      <Section title="Risks in this area" badge={riskBadge(fire.risks)} open>
        <RiskList risks={fire.risks} />
      </Section>

      <Section title="Animals recorded here" badge={`${fire.speciesTotal.toLocaleString()} species`} open>
        {fire.species.length === 0 ? <p className="text-xs text-neutral-500">Species unavailable.</p> : null}
        <ul className="grid grid-cols-2 gap-2">
          {fire.species.map((animal) => (
            <li key={animal.key} className="overflow-hidden rounded-md border border-white/10 bg-neutral-950/50">
              <a href={animal.link ?? undefined} target="_blank" rel="noreferrer" className="block" title={animal.credit ?? undefined}>
                {animal.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={animal.photo} alt={animal.name} loading="lazy" className="h-20 w-full object-cover" />
                ) : (
                  <div className="flex h-20 items-center justify-center bg-neutral-900 text-xs text-neutral-500">No photo</div>
                )}
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium leading-tight">{animal.name}</p>
                  <p className="text-[11px] text-neutral-500">{animal.count.toLocaleString()} records</p>
                </div>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-neutral-500">GBIF records inside the perimeter. Photos from iNaturalist.</p>
      </Section>

      <Section title="Critical habitat" badge={String(fire.habitat.length)}>
        {fire.habitat.length === 0 ? (
          <p className="text-xs text-neutral-500">No overlap returned, or the service was unavailable.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {fire.habitat.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Fire environment">
        <EnvironmentDashboard env={fire.environment} />
      </Section>
    </>
  );
}

function shortTonnes(tonnes: number): string {
  if (tonnes >= 1_000_000) return `${(tonnes / 1_000_000).toFixed(2)}M t`;
  if (tonnes >= 10_000) return `${Math.round(tonnes / 1000)}k t`;
  return `${Math.round(tonnes).toLocaleString()} t`;
}

function riskBadge(risks: RiskTag[]): string | undefined {
  const high = risks.filter((risk) => risk.level === "high").length;
  return high > 0 ? `${high} high` : undefined;
}

const LEVEL_STYLE: Record<RiskTag["level"], { dot: string; text: string; name: string }> = {
  high: { dot: "bg-red-500", text: "text-red-300", name: "High" },
  moderate: { dot: "bg-amber-400", text: "text-amber-200", name: "Moderate" },
  low: { dot: "bg-emerald-500", text: "text-emerald-200", name: "Low" },
  unknown: { dot: "bg-neutral-600", text: "text-neutral-400", name: "Unknown" },
};

function RiskList({ risks }: { risks: RiskTag[] }) {
  if (risks.length === 0) return <p className="text-xs text-neutral-500">Risks unavailable.</p>;
  return (
    <ul className="-mx-1">
      {risks.map((risk) => (
        <Row
          key={risk.label}
          label={
            <span className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${LEVEL_STYLE[risk.level].dot}`} title={LEVEL_STYLE[risk.level].name} />
              {risk.label}
            </span>
          }
          value={risk.value}
          valueClass={LEVEL_STYLE[risk.level].text}
          detail={risk.detail}
        />
      ))}
    </ul>
  );
}

const FUEL_LOOK: Record<Environment["fuel"], { name: string; note: string }> = {
  grass: { name: "Grass", note: "Burns fast and dries out within hours." },
  shrub: { name: "Shrub", note: "Dense brush. Fast, hot fire." },
  forest: { name: "Forest", note: "Slower on the ground, but heavy fuel that burns long." },
};

function EnvironmentDashboard({ env }: { env: Environment }) {
  const fuel = FUEL_LOOK[env.fuel];
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const gauges: { label: string; value: string; push: number | null; hint: string }[] = [
    {
      label: "Dead fuel moisture",
      value: env.fuelMoisture == null ? "unavailable" : `${env.fuelMoisture.toFixed(0)}%`,
      push: env.fuelMoisture == null ? null : clamp(1 - env.fuelMoisture / env.extinction),
      hint: `From temperature and humidity. ${fuel.name} stops spreading at about ${env.extinction}%.`,
    },
    {
      label: "Soil moisture",
      value: env.soil == null ? "unavailable" : `${(env.soil * 100).toFixed(0)}% water`,
      push: env.soil == null ? null : clamp(1 - env.soil / 0.4),
      hint: "Top 1 cm. Dry soil means drier living plants.",
    },
    {
      label: "Slope",
      value: env.slopePct == null ? "unavailable" : `${env.slopePct.toFixed(0)}%`,
      push: env.slopePct == null ? null : clamp(env.slopePct / 60),
      hint: "Median of 10 spots in the fire. Fire runs faster uphill.",
    },
    {
      label: "Humidity",
      value: env.humidity == null ? "unavailable" : `${Math.round(env.humidity)}%`,
      push: env.humidity == null ? null : clamp(1 - env.humidity / 80),
      hint: "Dry air pulls water out of fuel.",
    },
    {
      label: "Wind",
      value: env.windMph == null ? "unavailable" : `${env.windMph.toFixed(0)} mph from ${env.windFrom}`,
      push: env.windMph == null ? null : clamp(env.windMph / 30),
      hint: "Pushes flames downwind.",
    },
    {
      label: "Temperature",
      value: env.tempF == null ? "unavailable" : `${env.tempF.toFixed(0)} °F`,
      push: env.tempF == null ? null : clamp((env.tempF - 40) / 60),
      hint: "Heat dries fuel faster.",
    },
  ];
  return (
    <div className="space-y-3">
      <div title={fuel.note}>
        <p className="text-sm font-medium">{fuel.name} fuel</p>
        <p className="truncate text-xs text-neutral-400" title={env.vegetation}>
          {env.vegetation}
        </p>
      </div>
      <ul className="space-y-2">
        {gauges.map((gauge) => (
          <li key={gauge.label} title={gauge.hint}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-neutral-300">{gauge.label}</span>
              <span className="font-medium tabular-nums">{gauge.value}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
              {gauge.push == null ? null : (
                <div
                  className={`h-full rounded-full ${gauge.push >= 0.66 ? "bg-red-500" : gauge.push >= 0.33 ? "bg-amber-400" : "bg-emerald-500"}`}
                  style={{ width: `${Math.max(4, gauge.push * 100)}%` }}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-neutral-500">Longer, redder bars push spread harder. Hover a bar for what it means.</p>
    </div>
  );
}

function Section({ title, badge, open, children }: { title: string; badge?: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-lg border border-white/10 bg-neutral-950/30">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium">
        <span>
          {title}
          {badge ? <span className="ml-2 text-xs font-normal text-neutral-400">{badge}</span> : null}
        </span>
        <span className="text-neutral-500 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-white/10 px-3 py-2">{children}</div>
    </details>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "red" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-950/40 px-2.5 py-2" title={hint}>
      <p className="text-[11px] text-neutral-400">{label}</p>
      <p className={`truncate text-lg font-semibold tabular-nums ${tone === "red" ? "text-red-300" : ""}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, valueClass, detail }: { label: ReactNode; value: string; valueClass?: string; detail: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={open ? undefined : detail}
        className="flex w-full items-start justify-between gap-3 rounded px-1 py-1 text-left text-sm hover:bg-white/5"
      >
        <span className="text-neutral-400">{label}</span>
        <span className={`text-right font-medium ${valueClass ?? ""}`}>{value}</span>
      </button>
      {open ? <p className="px-1 pb-1 text-xs text-neutral-500">{detail}</p> : null}
    </li>
  );
}

function TagList({ tags }: { tags: Tag[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="-mx-1">
      {tags.map((item) => (
        <Row key={item.label} label={item.label} value={item.value} detail={item.detail} />
      ))}
    </ul>
  );
}
