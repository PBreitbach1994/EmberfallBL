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
      {list.map((e, i) => <LogLine key={`${e.t}-${i}`} e={e} compact={compact} />)}
      {!list.length && <div className="muted small">Nothing has happened yet.</div>}
    </div>
  );
}

function LogLine({ e, compact }: { e: LogEntry; compact?: boolean }) {
  switch (e.kind) {
    case "narration": {
      if (e.text.startsWith("▶")) return <p className="log-narration log-choice">{e.text}</p>;
      const long = !compact && e.text.length > 140;
      return <p className={`log-narration ${long ? "dropcap" : ""}`}>{e.text}</p>;
    }
    case "dialogue": {
      const i = e.text.indexOf(":");
      const who = i > 0 && i < 40 ? e.text.slice(0, i) : "";
      const said = who ? e.text.slice(i + 1).trim() : e.text;
      return (
        <div className="log-dialogue bubble">
          {who && <span className="bubble-who">{who}</span>}
          <span className="bubble-text">{said}</span>
        </div>
      );
    }
    case "roll":
    case "check": {
      const d = e.data as { natural?: number } | undefined;
      const nat = d?.natural;
      const ok = /SUCCESS|CRITICAL|— hit|success\b/.test(e.text);
      const bad = /FAILURE|— miss|failure\b/.test(e.text);
      return (
        <div className={`log-roll rollchip ${ok ? "ok" : bad ? "fail" : ""} ${nat === 20 ? "crit" : nat === 1 ? "fumble" : ""}`}>
          {nat !== undefined && <span className="chip-d20">{nat}</span>}
          <span>{e.text.replace(/^🎲\s*/, "")}</span>
        </div>
      );
    }
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
      return <div className="log-system"><span>{e.text}</span></div>;
  }
}
