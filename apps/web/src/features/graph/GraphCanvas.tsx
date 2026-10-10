import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";

import { Badge, IdTag } from "../../components/ui";
import { EDGE_META, EDGE_ORDER, KIND_META } from "./meta";
import type { EntityEdge, EntityNode } from "./model";
import { SENSITIVITY_TONE } from "../scenarios/lookup";

type NodeData = { entity: EntityNode };

function EntityNodeView({ data, selected }: NodeProps<Node<NodeData>>) {
  const { entity } = data;
  const meta = KIND_META[entity.kind];
  const Icon = meta.icon;
  const tone = entity.sensitivity
    ? (SENSITIVITY_TONE[entity.sensitivity as keyof typeof SENSITIVITY_TONE] ?? "neutral")
    : null;
  return (
    <div
      className={`bg-panel w-56 overflow-hidden rounded-md border transition-colors duration-150 ${
        selected ? "border-signal" : "border-line hover:border-ink-3"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-line !size-1.5 !border-0" />
      <div className="bg-raised border-line text-ink-2 flex h-7 items-center gap-2 border-b px-2.5 text-xs">
        <Icon size={13} aria-hidden />
        {meta.label}
      </div>
      <div className="space-y-1.5 px-2.5 py-2">
        <p className="truncate text-sm font-medium">{entity.name}</p>
        <div className="flex items-center justify-between gap-2">
          <IdTag>{entity.id}</IdTag>
          {tone && entity.sensitivity && <Badge tone={tone}>{entity.sensitivity}</Badge>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-line !size-1.5 !border-0" />
    </div>
  );
}

const nodeTypes = { entity: EntityNodeView };

function Legend({ present }: { present: Set<string> }) {
  return (
    <details aria-label="Legend" className="border-line bg-panel/95 w-64 rounded-md border text-xs">
      <summary className="text-ink-2 hover:text-ink flex h-8 cursor-pointer items-center px-3 text-xs font-semibold select-none">
        Legend: edge types
      </summary>
      <div className="border-hair border-t p-3">
        <ul className="space-y-1.5">
          {EDGE_ORDER.map((k) => {
            const m = EDGE_META[k];
            return (
              <li
                key={k}
                className={`flex items-center gap-2 ${present.has(k) ? "" : "text-ink-3"}`}
              >
                <svg width="28" height="6" aria-hidden className="shrink-0">
                  <line
                    x1="0"
                    y1="3"
                    x2="28"
                    y2="3"
                    stroke={m.color}
                    strokeWidth="2"
                    strokeDasharray={m.dash}
                  />
                </svg>
                {m.label}
              </li>
            );
          })}
        </ul>
        <p className="text-ink-3 border-hair mt-2 border-t pt-2">
          Dimmed types are not present in this view. Only allowed and prerequisite transitions form
          a path.
        </p>
      </div>
    </details>
  );
}

export function GraphCanvas({
  nodes,
  edges,
  positions,
  selectedNodeId,
  selectedEdgeId,
  highlight,
  onSelectNode,
  onSelectEdge,
  onClear,
}: {
  nodes: EntityNode[];
  edges: EntityEdge[];
  positions: Map<string, { x: number; y: number }>;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  /** Edge ids of the path being inspected; everything else is dimmed. */
  highlight: ReadonlySet<string> | null;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onClear: () => void;
}) {
  const flowNodes = useMemo<Node<NodeData>[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "entity",
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        data: { entity: n },
        selected: n.id === selectedNodeId,
      })),
    [nodes, positions, selectedNodeId],
  );
  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
        const m = EDGE_META[e.kind];
        const dim = highlight !== null && !highlight.has(e.id);
        const selected = e.id === selectedEdgeId;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.kind === "inventory" ? undefined : e.label,
          labelStyle: { fontSize: 11 },
          labelBgPadding: [6, 3] as [number, number],
          markerEnd:
            e.kind === "inventory"
              ? undefined
              : { type: MarkerType.ArrowClosed, color: m.color, width: 12, height: 12 },
          selected,
          interactionWidth: 18,
          style: {
            stroke: m.color,
            strokeWidth: selected || (highlight?.has(e.id) ?? false) ? 3 : 1.5,
            strokeDasharray: m.dash,
            opacity: dim ? 0.2 : 1,
          },
        };
      }),
    [edges, highlight, selectedEdgeId],
  );
  const present = useMemo(() => new Set(edges.map((e) => e.kind)), [edges]);

  return (
    <div className="relative h-full min-h-0">
      <ReactFlowProvider>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => onSelectNode(n.id)}
          onEdgeClick={(_, e) => onSelectEdge(e.id)}
          onPaneClick={onClear}
          nodesDraggable={false}
          nodesConnectable={false}
          fitView
          fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
          minZoom={0.3}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} />
          <Controls showInteractive={false} position="top-left" />
        </ReactFlow>
      </ReactFlowProvider>
      <div className="absolute bottom-3 left-3 z-10 max-lg:hidden">
        <Legend present={present} />
      </div>
    </div>
  );
}
