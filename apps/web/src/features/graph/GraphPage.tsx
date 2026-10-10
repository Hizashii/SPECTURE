import { Play, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { ErrorState, LoadingRows } from "../../components/States";
import { Badge, Button, Panel, type Tone } from "../../components/ui";
import type { EdgeKind, Scenario } from "../../lib/schemas";
import { useFindings, useGraph, useRunAnalysis } from "../../lib/queries";
import { plural } from "../../lib/format";
import { useActiveScenario } from "../scenarios/ScenarioProvider";
import { GraphCanvas } from "./GraphCanvas";
import { EdgeInspector, NodeInspector } from "./Inspector";
import { EDGE_META, KIND_META } from "./meta";
import { analysisModel, inventoryModel, layout } from "./model";

const SEVERITY_TONE: Record<string, Tone> = {
  critical: "critical",
  high: "high",
  medium: "info",
  low: "neutral",
};
const FILTERABLE: EdgeKind[] = ["rejected", "inventory"];

function Workbench({ scenario, analysisId }: { scenario: Scenario; analysisId: string | null }) {
  const graph = useGraph(analysisId);
  const findings = useFindings(analysisId);
  const run = useRunAnalysis();
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [findingId, setFindingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [hidden, setHidden] = useState<Set<EdgeKind>>(new Set(["inventory"]));

  const model = useMemo(
    () => (graph.data ? analysisModel(graph.data) : inventoryModel(scenario)),
    [graph.data, scenario],
  );
  const shownEdges = useMemo(() => model.edges.filter((e) => !hidden.has(e.kind)), [model, hidden]);
  const positions = useMemo(() => layout(model.nodes, model.edges), [model]);

  const finding = findings.data?.items.find((f) => f.id === findingId);
  const highlight = useMemo(
    () => (finding?.paths[0] ? new Set(finding.paths[0].steps.map((s) => s.id)) : null),
    [finding],
  );

  if (analysisId && graph.isPending) return <LoadingRows label="Loading analysis…" />;
  if (graph.error) {
    return (
      <div className="p-6">
        <ErrorState error={graph.error} onRetry={() => void graph.refetch()} />
      </div>
    );
  }

  const q = filter.trim().toLowerCase();
  const visible = model.nodes.filter(
    (n) => !q || n.name.toLowerCase().includes(q) || n.id.includes(q),
  );
  const groups = [
    ["Identities", visible.filter((n) => n.group === "principal")],
    ["Roles", visible.filter((n) => n.group === "role")],
    ["Resources", visible.filter((n) => n.group === "resource")],
  ] as const;
  const node = model.nodes.find((n) => n.id === nodeId);
  const edge = model.edges.find((e) => e.id === edgeId);
  const inspecting = Boolean(node || edge);
  const clear = () => {
    setNodeId(null);
    setEdgeId(null);
  };
  const counts = (k: EdgeKind) => model.edges.filter((e) => e.kind === k).length;

  return (
    <div className="relative grid h-full min-h-0 gap-3 p-3 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_23rem]">
      <Panel title="Explorer" className="max-lg:hidden">
        {analysisId && (
          <section aria-labelledby="gf" className="border-hair border-b py-1">
            <h3 id="gf" className="text-ink-3 px-3 py-1 text-xs font-medium">
              Findings <span className="tabular">({findings.data?.items.length ?? 0})</span>
            </h3>
            {findings.data?.items.length === 0 && (
              <p className="text-ink-2 px-3 pb-2 text-xs">
                No paths found within the modeled rules.
              </p>
            )}
            <ul>
              {findings.data?.items.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed={f.id === findingId}
                    onClick={() => setFindingId(f.id === findingId ? null : f.id)}
                    className={`block w-full px-3 py-2 text-left transition-colors duration-150 ${
                      f.id === findingId ? "bg-active" : "hover:bg-raised"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <Badge tone={SEVERITY_TONE[f.severity]}>{f.severity}</Badge>
                      <span className="text-ink-3 tabular text-xs">
                        {plural(f.paths.length, "path", "paths")}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-sm">
                      {f.source} → {f.target}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="border-hair border-b p-2">
          <label className="relative block">
            <span className="sr-only">Filter nodes</span>
            <Search size={13} aria-hidden className="text-ink-3 absolute top-2.5 left-2" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter nodes"
              className="border-line bg-nav placeholder:text-ink-3 h-8 w-full rounded border pr-2 pl-7 text-sm"
            />
          </label>
        </div>
        {groups.map(([title, nodes]) => (
          <section key={title} className="py-1">
            <h3 className="text-ink-3 px-3 py-1 text-xs font-medium">
              {title} <span className="tabular">({nodes.length})</span>
            </h3>
            <ul>
              {nodes.map((n) => {
                const Icon = KIND_META[n.kind].icon;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      aria-pressed={n.id === nodeId}
                      onClick={() => {
                        setEdgeId(null);
                        setNodeId(n.id);
                      }}
                      className={`flex h-8 w-full items-center gap-2 px-3 text-left text-sm transition-colors duration-150 ${
                        n.id === nodeId ? "bg-active" : "hover:bg-raised"
                      }`}
                    >
                      <Icon size={14} aria-hidden className="text-ink-2 shrink-0" />
                      <span className="truncate">{n.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </Panel>

      <Panel
        title="Transition graph"
        actions={
          <>
            <fieldset className="hidden items-center gap-3 sm:flex">
              <legend className="sr-only">Edge types shown</legend>
              {FILTERABLE.filter((k) => counts(k) > 0).map((k) => (
                <label key={k} className="text-ink-2 flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={!hidden.has(k)}
                    onChange={() =>
                      setHidden((h) => {
                        const next = new Set(h);
                        if (next.has(k)) next.delete(k);
                        else next.add(k);
                        return next;
                      })
                    }
                  />
                  {EDGE_META[k].label} <span className="tabular">({counts(k)})</span>
                </label>
              ))}
            </fieldset>
            {analysisId ? (
              <Badge tone="signal">Engine analysis</Badge>
            ) : (
              <Badge tone="high">Inventory view · not evaluated</Badge>
            )}
          </>
        }
        bodyClassName="overflow-hidden"
        className="min-h-[20rem]"
      >
        {!analysisId && (
          <div className="border-line bg-panel absolute top-12 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-md border px-3 py-2 text-xs">
            <span className="text-ink-2">No analysis yet. Showing declared structure only.</span>
            <Button
              variant="primary"
              icon={Play}
              disabled={run.isPending}
              onClick={() => run.mutate(scenario.metadata.id)}
            >
              Run analysis
            </Button>
          </div>
        )}
        <label className="absolute top-3 right-3 z-10 lg:hidden">
          <span className="sr-only">Select a node</span>
          <select
            value={nodeId ?? ""}
            onChange={(e) => {
              setEdgeId(null);
              setNodeId(e.target.value || null);
            }}
            className="border-line bg-panel h-8 max-w-44 rounded border px-2 text-sm"
          >
            <option value="">Select a node…</option>
            {model.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </label>
        <GraphCanvas
          nodes={model.nodes}
          edges={shownEdges}
          positions={positions}
          selectedNodeId={nodeId}
          selectedEdgeId={edgeId}
          highlight={highlight}
          onSelectNode={(id) => {
            setEdgeId(null);
            setNodeId(id);
          }}
          onSelectEdge={(id) => {
            setNodeId(null);
            setEdgeId(id);
          }}
          onClear={clear}
        />
      </Panel>

      <div
        className={`${
          inspecting ? "" : "max-xl:hidden"
        } max-xl:animate-drawer-in max-xl:absolute max-xl:top-3 max-xl:right-3 max-xl:bottom-3 max-xl:z-20 max-xl:w-[22rem] max-xl:max-w-[calc(100%-1.5rem)] max-xl:shadow-[0_8px_24px_rgb(0_0_0/0.5)]`}
        onKeyDown={(e) => e.key === "Escape" && clear()}
      >
        {edge ? (
          <EdgeInspector scenario={scenario} edge={edge} onClose={clear} />
        ) : node ? (
          <NodeInspector
            scenario={scenario}
            node={node}
            analyzed={Boolean(analysisId)}
            onClose={clear}
          />
        ) : (
          <Panel title="Inspector" as="aside" className="h-full">
            <p className="text-ink-2 p-4 text-sm">
              Select a node or an edge. Edges show the decision and the exact statement, trust entry
              or relationship behind it.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

export function GraphPage() {
  const { detail, analysisId, selectedId } = useActiveScenario();
  if (detail.isPending) return <LoadingRows label="Loading scenario…" />;
  if (detail.error || !detail.data) {
    return (
      <div className="p-6">
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      </div>
    );
  }
  // Keyed so selection never carries over to another scenario or analysis.
  return (
    <Workbench key={`${selectedId}:${analysisId}`} scenario={detail.data} analysisId={analysisId} />
  );
}
