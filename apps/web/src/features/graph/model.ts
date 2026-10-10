import type { EdgeKind, Evidence, Graph, Scenario } from "../../lib/schemas";

// Presentation model. The scenario-only builder draws *declared* structure; the analysis
// builder passes the engine's typed, evidenced graph through. Nothing here evaluates anything.

export type NodeKind =
  "user" | "service" | "role" | "database" | "object_storage" | "secret" | "compute" | "unknown";

const KNOWN: ReadonlySet<string> = new Set([
  "user",
  "service",
  "role",
  "database",
  "object_storage",
  "secret",
  "compute",
]);
const asKind = (k: string): NodeKind => (KNOWN.has(k) ? (k as NodeKind) : "unknown");

export interface EntityNode {
  id: string;
  name: string;
  kind: NodeKind;
  group: "principal" | "role" | "resource";
  sensitivity?: string | null;
}

export interface EntityEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: EdgeKind;
  actions: string[];
  decision: string | null;
  reason: string;
  evidence: Evidence[];
}

export interface GraphModel {
  nodes: EntityNode[];
  edges: EntityEdge[];
}

export function analysisModel(g: Graph): GraphModel {
  return {
    nodes: g.nodes.map((n) => ({ ...n, kind: asKind(n.kind) })),
    edges: g.edges.map((e) => ({ ...e })),
  };
}

export function inventoryModel(s: Scenario): GraphModel {
  const declared = (e: Pick<EntityEdge, "id" | "source" | "target" | "label">): EntityEdge => ({
    ...e,
    kind: "inventory",
    actions: [],
    decision: null,
    reason: "",
    evidence: [],
  });
  return {
    nodes: [
      ...s.principals.map((p) => ({ ...p, kind: asKind(p.kind), group: "principal" as const })),
      ...s.roles.map((r) => ({
        id: r.id,
        name: r.name,
        kind: "role" as const,
        group: "role" as const,
      })),
      ...s.resources.map((r) => ({ ...r, kind: asKind(r.kind), group: "resource" as const })),
    ],
    edges: [
      ...s.roles.flatMap((r) =>
        r.trusted_identities.map((from) =>
          declared({
            id: `trust:${from}>${r.id}`,
            source: from,
            target: r.id,
            label: "listed in trust",
          }),
        ),
      ),
      ...s.relationships.map((rel) =>
        declared({
          id: rel.id,
          source: rel.source,
          target: rel.target,
          label: "modeled credential access",
        }),
      ),
    ],
  };
}

const COL_W = 250;
const ROW_H = 120;
const MAX_PER_ROW = 2;

/**
 * Top-to-bottom layering: principals first, resources last. Back edges (cycles) are ignored so
 * a trust loop cannot push a directly reached node below a farther one; rejected edges do not
 * influence layering. Each layer is centered on x = 0 and wrapped so the drawing stays narrow.
 */
export function layout(
  nodes: EntityNode[],
  edges: EntityEdge[],
): Map<string, { x: number; y: number }> {
  const known = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (e.kind === "rejected" || e.source === e.target) continue;
    if (known.has(e.source) && known.has(e.target)) adj.get(e.source)!.push(e.target);
  }

  // DFS drops back edges and records a topological order of what remains.
  const state = new Map<string, 0 | 1 | 2>();
  const kept = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const post: string[] = [];
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of adj.get(u)!) {
      if (state.get(v) === 1) continue; // back edge
      kept.get(u)!.push(v);
      if (!state.get(v)) visit(v);
    }
    state.set(u, 2);
    post.push(u);
  };
  const roots = [...nodes.filter((n) => n.group === "principal"), ...nodes];
  for (const n of roots) if (!state.get(n.id)) visit(n.id);
  const topo = post.reverse();

  const depth = new Map<string, number>(nodes.map((n) => [n.id, n.group === "principal" ? 0 : -1]));
  const relax = () => {
    for (const u of topo) {
      const du = depth.get(u)!;
      if (du < 0) continue;
      for (const v of kept.get(u)!) if (du + 1 > depth.get(v)!) depth.set(v, du + 1);
    }
  };
  relax();
  const maxPlaced = Math.max(0, ...depth.values());
  for (const n of nodes) {
    // Nothing declared points at it: roles sit after principals, resources after everything.
    if (depth.get(n.id)! < 0) depth.set(n.id, n.group === "resource" ? maxPlaced + 1 : 1);
  }
  relax();

  const layers = new Map<number, string[]>();
  for (const n of nodes) {
    const d = depth.get(n.id)!;
    layers.set(d, [...(layers.get(d) ?? []), n.id]);
  }
  const out = new Map<string, { x: number; y: number }>();
  let row = 0;
  for (const d of [...layers.keys()].sort((a, b) => a - b)) {
    const ids = layers.get(d)!;
    for (let i = 0; i < ids.length; i += MAX_PER_ROW) {
      const chunk = ids.slice(i, i + MAX_PER_ROW);
      chunk.forEach((id, j) =>
        out.set(id, { x: (j - (chunk.length - 1) / 2) * COL_W, y: row * ROW_H }),
      );
      row++;
    }
  }
  return out;
}
