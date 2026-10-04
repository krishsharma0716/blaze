/**
 * Side panel for the selected fire: tags, interval buttons, and assumptions.
 * Connected to app/page.tsx. It only renders data the page already fetched.
 * The line about ember spotting stays visible next to the cone.
 */
import type { HelpLink } from "../lib/core/recovery";
import type { Tag } from "../lib/core/tags";

type Props = {
  name: string | null;
  loading: boolean;
  error: string | null;
  tags: Tag[];
  assumptions: string[];
  species: { name: string; count: number }[];
  habitat: string[];
  links: HelpLink[];
  hours: number;
  onHours: (hours: number) => void;
  summary?: string | null;
  onSearch?: (address: string) => void;
  onPlay?: () => void;
  showRecovery?: boolean;
};

export default function FirePanel({ name, loading, error, tags, assumptions, species, habitat, links, hours, onHours, summary, onSearch, onPlay, showRecovery = true }: Props) {
  return (
    <aside className="flex h-full w-96 flex-col gap-3 overflow-y-auto border-l border-neutral-200 bg-white p-4">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSearch?.(String(data.get("address") ?? ""));
        }}
      >
        <input
          name="address"
          className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
          placeholder="New York City address only"
        />
        <button className="rounded border px-2 py-1 text-sm" type="submit">
          Search
        </button>
      </form>
      <h1 className="text-lg font-semibold">Fire overview</h1>
      <p className="text-sm text-neutral-600">{name ?? "Click a perimeter."}</p>
      <p className="text-sm text-neutral-600">This is not an evacuation order.</p>
      <div className="flex gap-2">
        {[1, 2, 3, 6].map((value) => (
          <button
            key={value}
            type="button"
            className={`rounded px-2 py-1 text-sm ${hours === value ? "bg-black text-white" : "border"}`}
            onClick={() => onHours(value)}
          >
            {value} h
          </button>
        ))}
      </div>
      {summary ? <p className="text-sm">{summary}</p> : null}
      {summary && onPlay ? (
        <button className="rounded border px-2 py-1 text-sm" type="button" onClick={onPlay}>
          Play brief
        </button>
      ) : null}
      {loading ? <p className="text-sm">Loading conditions…</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <ul className="space-y-2">
        {tags.map((item) => (
          <li key={item.label} className="text-sm">
            <span className="font-medium">{item.label}: </span>
            {item.value}
            <span className="mt-0.5 block text-xs text-neutral-500">{item.detail}</span>
          </li>
        ))}
      </ul>
      {showRecovery ? <>
      <section className="text-sm">
        <h2 className="font-medium">Animals displaced</h2>
        {species.length === 0 ? <p className="text-xs text-neutral-500">Species unavailable.</p> : null}
        <ul>
          {species.map((animal) => (
            <li key={animal.name}>
              {animal.name} · {animal.count} records
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-neutral-500">Animals displaced. Counts are records inside this perimeter.</p>
        <h2 className="mt-2 font-medium">Critical habitat overlap</h2>
        {habitat.length === 0 ? <p className="text-xs text-neutral-500">No overlap returned, or the service was unavailable.</p> : null}
        <ul>
          {habitat.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </section>
      <section className="text-sm">
        <h2 className="font-medium">Ways to help</h2>
        <p className="text-xs text-neutral-500">General links, not assigned to this fire. Hands-on planting only when that forest is taking volunteers.</p>
        {(["Forests", "People"] as const).map((group) => (
          <div key={group} className="mt-1">
            <p className="text-xs font-medium">{group}</p>
            <ul>
              {links.filter((link) => link.group === group).map((link) => (
                <li key={link.name}>
                  <a className="underline" href={link.url} target="_blank" rel="noreferrer">
                    {link.name}
                  </a>
                  <span className="block text-xs text-neutral-500">{link.note}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      {assumptions.length > 0 ? (
        <div className="text-xs text-neutral-600">
          {assumptions.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Ember spotting is not modeled.</p>
      )}
      </> : null}
    </aside>
  );
}
