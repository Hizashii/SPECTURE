import {
  Clock,
  FlaskConical,
  FolderOpen,
  GitBranch,
  LayoutDashboard,
  Play,
  Settings,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router";

import { useNotify } from "../components/Notifications";
import { Badge, Button } from "../components/ui";
import { useActiveScenario } from "../features/scenarios/ScenarioProvider";
import { ApiClientError } from "../lib/api";
import { plural } from "../lib/format";
import { useCapabilities, useHealth, useRunAnalysis } from "../lib/queries";
import { ErrorBoundary } from "./ErrorBoundary";

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/graph", label: "Attack graph", icon: GitBranch },
  { to: "/findings", label: "Findings", icon: ShieldAlert },
  { to: "/remediation", label: "Remediation lab", icon: FlaskConical },
  { to: "/scenarios", label: "Scenarios", icon: FolderOpen },
  { to: "/history", label: "Analysis history", icon: Clock },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
      <path
        d="M7 24 L16 7 L25 24"
        fill="none"
        stroke="var(--color-signal)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="16 5"
      />
      <circle cx="16" cy="7" r="2.5" fill="var(--color-signal)" />
    </svg>
  );
}

function ScenarioSwitcher() {
  const { list, selectedId, select } = useActiveScenario();
  const items = list.data?.items ?? [];
  return (
    <label className="flex items-center gap-2">
      <span className="text-ink-3 hidden text-xs md:inline">Scenario</span>
      <select
        value={selectedId ?? ""}
        disabled={items.length === 0}
        onChange={(e) => select(e.target.value)}
        className="border-line bg-panel hover:border-ink-3 h-8 max-w-40 rounded border px-2 text-sm sm:max-w-56"
      >
        {items.length === 0 && <option value="">No scenarios</option>}
        {items.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function EngineStatus() {
  const health = useHealth();
  const caps = useCapabilities();
  if (health.isError || caps.isError) {
    return (
      <Badge tone="critical">
        <span role="status">API: unreachable</span>
      </Badge>
    );
  }
  if (!health.data || !caps.data) return <Badge>API: checking</Badge>;
  return (
    <div className="flex items-center gap-2" role="status">
      <span className="max-md:hidden">
        <Badge tone="secure">API: v{health.data.version}</Badge>
      </span>
      {caps.data.engine_version ? (
        <Badge tone="signal">Engine v{caps.data.engine_version}</Badge>
      ) : (
        <Badge tone="high">Engine: not implemented</Badge>
      )}
    </div>
  );
}

function RunAnalysisButton() {
  const { selectedId, viewAnalysis } = useActiveScenario();
  const run = useRunAnalysis();
  const notify = useNotify();
  return (
    <Button
      variant="primary"
      icon={Play}
      disabled={!selectedId || run.isPending}
      onClick={() => {
        if (!selectedId) return;
        run.mutate(selectedId, {
          onSuccess: (r) => {
            viewAnalysis(null);
            notify("info", `Analysis complete: ${plural(r.finding_count, "finding", "findings")}`);
          },
          onError: (e) =>
            notify("error", e instanceof ApiClientError ? e.message : "The analysis failed."),
        });
      }}
      className="max-md:px-2"
    >
      <span className="max-md:sr-only">{run.isPending ? "Running…" : "Run analysis"}</span>
    </Button>
  );
}

function ViewingOlder() {
  const { analysisId, latestAnalysisId, viewAnalysis } = useActiveScenario();
  if (!analysisId || analysisId === latestAnalysisId) return null;
  return (
    <Button variant="secondary" onClick={() => viewAnalysis(null)} className="max-md:hidden">
      Viewing an older analysis · Show latest
    </Button>
  );
}

function TargetSpace() {
  const { list, selectedId } = useActiveScenario();
  const s = list.data?.items.find((i) => i.id === selectedId);
  if (!s) return null;
  return (
    <div className="border-line bg-panel mx-2 mb-2 hidden rounded-md border p-3 xl:block">
      <p className="text-ink-3 text-xs">Active scenario</p>
      <p className="mt-0.5 truncate text-sm font-medium">{s.name}</p>
      <p className="text-ink-2 tabular mt-1 text-xs">
        {plural(s.principal_count + s.role_count, "identity", "identities")} ·{" "}
        {plural(s.resource_count, "resource", "resources")} ·{" "}
        {plural(s.policy_count, "policy", "policies")}
      </p>
      <p className="text-ink-3 mt-2 text-xs">Synthetic data</p>
    </div>
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  const current = NAV.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));
  useEffect(() => {
    document.title = current ? `${current.label} · SPECTRE` : "SPECTRE";
  }, [current]);
  // Workbench routes manage their own scrolling inside a fixed-height grid.
  const workbench = pathname.startsWith("/graph") || pathname.startsWith("/remediation");

  return (
    <>
      <a
        href="#main"
        className="bg-signal text-canvas sr-only z-50 rounded px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[3rem_minmax(0,1fr)]">
        <header className="border-line bg-nav relative flex min-w-0 items-center gap-3 overflow-hidden border-b px-3 md:gap-4">
          <div className="flex w-14 items-center gap-2 xl:w-52">
            <Logo />
            <span className="hidden text-sm font-semibold tracking-wide xl:inline">SPECTRE</span>
          </div>
          <ScenarioSwitcher />
          <div className="min-w-0 flex-1" />
          <p className="text-ink-3 hidden text-xs lg:block">Synthetic scenarios · analysis only</p>
          <div className="max-sm:hidden">
            <EngineStatus />
          </div>
          <ViewingOlder />
          <RunAnalysisButton />
        </header>
        <div className="grid min-h-0 grid-cols-[3.5rem_minmax(0,1fr)] xl:grid-cols-[14.5rem_minmax(0,1fr)]">
          <nav aria-label="Main" className="border-line bg-nav flex min-h-0 flex-col border-r">
            <ul className="flex-1 space-y-0.5 overflow-auto p-2">
              {NAV.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === "/"}
                    title={label}
                    className={({ isActive }) =>
                      `flex h-8 items-center gap-3 rounded px-2.5 text-sm transition-colors duration-150 ${
                        isActive
                          ? "bg-active text-ink shadow-[inset_2px_0_0_var(--color-signal)]"
                          : "text-ink-2 hover:bg-raised hover:text-ink"
                      }`
                    }
                  >
                    <Icon size={16} aria-hidden className="shrink-0" />
                    <span className="sr-only xl:not-sr-only">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
            <TargetSpace />
          </nav>
          <main className={`min-h-0 min-w-0 ${workbench ? "overflow-hidden" : "overflow-auto"}`}>
            <ErrorBoundary key={pathname}>
              {workbench ? (
                <Outlet />
              ) : (
                <div className="mx-auto max-w-[75rem] px-6 py-6">
                  <Outlet />
                </div>
              )}
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  );
}
