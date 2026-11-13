import { useEffect, useRef } from "react";
import type { LogEntry } from "@tavern/engine";

export function Log({ entries, compact, filter }: { entries: LogEntry[]; compact?: boolean; filter?: (e: LogEntry) => boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const list = filter ? entries.filter(filter) : entries;
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [list.length]);
  return (
    <div
      className={`log ${compact ? "compact" : ""}`}
      ref={ref}
      onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
    >
      {list.map((e, i) => <LogLine key={`${e.t}-${i}`} e={e} />)}
      {!list.length && <div className="muted small">Nothing has happened yet.</div>}
    </div>
  );
}

function LogLine({ e }: { e: LogEntry }) {
  switch (e.kind) {
    case "narration":
      return <p className={`log-narration ${e.text.startsWith("▶") ? "log-choice" : ""}`}>{e.text}</p>;
    case "dialogue":
      return <p className="log-dialogue">{e.text}</p>;
    case "roll":
    case "check":
      return <div className="log-roll">{e.text}</div>;
    case "combat":
      return <div className="log-combat">{e.text}</div>;
    case "loot":
      return <div className="log-loot">{e.text}</div>;
    case "death":
      return <div className="log-death">{e.text}</div>;
    case "level":
      return <div className="log-level">{e.text}</div>;
    case "system":
    default:
      return <div className="log-system">{e.text}</div>;
  }
}
