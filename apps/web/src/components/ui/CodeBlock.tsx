const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;

function highlight(line: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(line.slice(last, at));
    const [full, str, colon] = m;
    const cls = str ? (colon ? "text-info" : "text-secure") : "text-high";
    parts.push(
      <span key={at} className={cls}>
        {str ? str : full}
      </span>,
      colon ?? "",
    );
    last = at + full.length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

/** Read-only JSON viewer. `marks` flags 1-based line numbers (e.g. a statement under review). */
export function CodeBlock({
  value,
  label,
  marks = {},
}: {
  value: unknown;
  label: string;
  marks?: Record<number, "critical" | "secure">;
}) {
  const lines = JSON.stringify(value, null, 2).split("\n");
  return (
    <pre
      role="region"
      aria-label={label}
      tabIndex={0}
      className="bg-nav text-ink m-0 overflow-auto py-2 font-mono text-xs leading-5"
    >
      {lines.map((line, i) => {
        const mark = marks[i + 1];
        return (
          <div
            key={i}
            className={`flex px-3 ${mark === "critical" ? "bg-critical/10" : mark === "secure" ? "bg-secure/10" : ""}`}
          >
            <span
              aria-hidden
              className="text-ink-3 w-8 shrink-0 text-right select-none pr-3 tabular"
            >
              {i + 1}
            </span>
            <code className="whitespace-pre">{highlight(line)}</code>
          </div>
        );
      })}
    </pre>
  );
}
