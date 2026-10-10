import type { Graph, Scenario } from "../../lib/schemas";
import { SCENARIO } from "../../test/utils";
import { analysisModel, inventoryModel, layout, type EntityEdge, type EntityNode } from "./model";

const node = (id: string, group: EntityNode["group"], kind: EntityNode["kind"]): EntityNode => ({
  id,
  name: id,
  group,
  kind,
});
const edge = (
  source: string,
  target: string,
  kind: EntityEdge["kind"] = "authorized",
): EntityEdge => ({
  id: `${source}>${target}`,
  source,
  target,
  kind,
  label: "",
  actions: [],
  decision: null,
  reason: "",
  evidence: [],
});

describe("inventoryModel", () => {
  it("draws trust entries and modeled relationships as inventory edges only", () => {
    const s: Scenario = {
      ...SCENARIO,
      principals: [{ id: "a", name: "A", kind: "user" }],
      roles: [{ id: "r", name: "R", trusted_identities: ["a"] }],
      resources: [{ id: "db", name: "DB", kind: "database", sensitivity: "restricted" }],
      relationships: [
        { id: "rel", kind: "credential_access", source: "r", target: "db", description: "d" },
      ],
    };
    const { nodes, edges } = inventoryModel(s);
    expect(nodes.map((n) => n.id)).toEqual(["a", "r", "db"]);
    expect(edges.every((e) => e.kind === "inventory")).toBe(true);
    expect(edges.map((e) => `${e.source}>${e.target}`)).toEqual(["a>r", "r>db"]);
  });
});

describe("analysisModel", () => {
  it("passes engine nodes and typed edges through unchanged", () => {
    const g: Graph = {
      nodes: [
        { id: "a", name: "A", kind: "user", group: "principal", sensitivity: null },
        { id: "db", name: "DB", kind: "database", group: "resource", sensitivity: "restricted" },
      ],
      edges: [
        {
          id: "e",
          source: "a",
          target: "db",
          kind: "rejected",
          label: "denied access",
          actions: ["s3:*"],
          decision: "DENY",
          reason: "explicit",
          evidence: [],
        },
      ],
    };
    const m = analysisModel(g);
    expect(m.nodes.map((n) => n.group)).toEqual(["principal", "resource"]);
    expect(m.edges[0]).toMatchObject({ kind: "rejected", decision: "DENY" });
  });

  it("falls back to a generic kind for unknown node kinds instead of crashing later", () => {
    const g: Graph = {
      nodes: [{ id: "x", name: "X", kind: "quantum_vault", group: "resource", sensitivity: null }],
      edges: [],
    };
    expect(analysisModel(g).nodes[0]!.kind).toBe("unknown");
  });
});

describe("layout", () => {
  it("places principals above the roles they reach and resources last", () => {
    const nodes = [
      node("a", "principal", "user"),
      node("r1", "role", "role"),
      node("r2", "role", "role"),
      node("db", "resource", "database"),
    ];
    const pos = layout(nodes, [edge("a", "r1"), edge("r1", "r2")]);
    expect(pos.get("a")!.y).toBeLessThan(pos.get("r1")!.y);
    expect(pos.get("r1")!.y).toBeLessThan(pos.get("r2")!.y);
    expect(pos.get("db")!.y).toBeGreaterThan(pos.get("r2")!.y);
  });

  it("puts the target of a relationship below its source even when the source has no inbound edge", () => {
    const nodes = [
      node("a", "principal", "user"),
      node("secret", "resource", "secret"),
      node("db", "resource", "database"),
    ];
    const pos = layout(nodes, [edge("secret", "db", "prerequisite")]);
    expect(pos.get("db")!.y).toBeGreaterThan(pos.get("secret")!.y);
  });

  it("does not let a trust cycle push a directly reached role below a farther one", () => {
    const nodes = [
      node("a", "principal", "user"),
      node("r1", "role", "role"),
      node("r2", "role", "role"),
    ];
    const pos = layout(nodes, [edge("a", "r1"), edge("r1", "r2"), edge("r2", "r1")]);
    expect(pos.get("r1")!.y).toBeLessThan(pos.get("r2")!.y);
  });

  it("ignores rejected edges when layering", () => {
    const nodes = [node("a", "principal", "user"), node("r", "role", "role")];
    const withRejected = layout(nodes, [edge("a", "r", "rejected")]);
    const without = layout(nodes, []);
    expect(withRejected).toEqual(without);
  });

  it("centers each layer and wraps wide ones", () => {
    const nodes = ["r1", "r2", "r3", "r4", "r5"].map((id) =>
      node(id, "resource", "object_storage"),
    );
    const pos = layout(nodes, []);
    const xs = [...pos.values()].map((p) => Math.abs(p.x));
    expect(Math.max(...xs)).toBeLessThanOrEqual(125);
    const spots = [...pos.values()].map((p) => `${p.x},${p.y}`);
    expect(new Set(spots).size).toBe(spots.length);
  });
});
