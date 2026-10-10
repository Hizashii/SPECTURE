import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type Tone = "neutral" | "signal" | "critical" | "high" | "secure" | "info" | "unsupported";

const TONE: Record<Tone, string> = {
  neutral: "text-ink-2 bg-raised border-line",
  signal: "text-signal bg-signal/10 border-signal/30",
  critical: "text-critical bg-critical/10 border-critical/30",
  high: "text-high bg-high/10 border-high/30",
  secure: "text-secure bg-secure/10 border-secure/30",
  info: "text-info bg-info/10 border-info/30",
  unsupported: "text-unsupported bg-unsupported/10 border-unsupported/30",
};

export function Badge({
  tone = "neutral",
  icon: Icon,
  children,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-5 items-center gap-1 rounded border px-1.5 text-xs font-medium whitespace-nowrap ${TONE[tone]}`}
    >
      {Icon && <Icon size={12} aria-hidden />}
      {children}
    </span>
  );
}

export function IdTag({ children }: { children: ReactNode }) {
  return (
    <span className="border-hair bg-nav text-ink-2 inline-block max-w-full truncate rounded border px-1.5 py-px align-middle font-mono text-xs">
      {children}
    </span>
  );
}

type Variant = "primary" | "secondary" | "ghost";
const VARIANT: Record<Variant, string> = {
  primary: "bg-signal text-canvas enabled:hover:bg-signal-hover font-medium",
  secondary:
    "bg-panel text-ink border border-line enabled:hover:bg-raised enabled:hover:border-ink-3",
  ghost: "text-ink-2 enabled:hover:bg-raised enabled:hover:text-ink",
};

export function Button({
  variant = "secondary",
  icon: Icon,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex h-8 items-center justify-center gap-2 rounded px-3 text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${className}`}
    >
      {Icon && <Icon size={14} aria-hidden />}
      {children}
    </button>
  );
}

/** A titled region. Panels sit directly on the canvas; they are never nested inside each other. */
export function Panel({
  title,
  actions,
  children,
  className = "",
  bodyClassName = "",
  as: Tag = "section",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "aside" | "div";
}) {
  return (
    <Tag
      aria-label={typeof title === "string" ? title : undefined}
      className={`border-line bg-panel flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border ${className}`}
    >
      {title && (
        <header className="border-line bg-raised flex h-9 shrink-0 items-center justify-between gap-3 border-b px-3">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`min-h-0 flex-1 overflow-auto ${bodyClassName}`}>{children}</div>
    </Tag>
  );
}

export function KeyValue({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="divide-hair divide-y text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[7.5rem_1fr] items-baseline gap-3 px-3 py-2">
          <dt className="text-ink-3 text-xs">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <span className="border-line bg-raised text-ink-2 grid size-9 place-items-center rounded-md border">
        <Icon size={18} aria-hidden />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="text-ink-2 max-w-prose space-y-2 text-sm">{children}</div>
      {action}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`bg-raised animate-pulse rounded ${className}`} />;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-ink-2 mt-1 max-w-2xl text-sm">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Table({
  columns,
  children,
  label,
}: {
  columns: string[];
  children: ReactNode;
  label: string;
}) {
  return (
    <table className="w-full border-collapse text-left text-sm" aria-label={label}>
      <thead className="bg-raised text-ink-3 sticky top-0 text-xs">
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col" className="h-8 px-3 font-medium">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-hair divide-y">{children}</tbody>
    </table>
  );
}

export { CodeBlock } from "./CodeBlock";
