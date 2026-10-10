import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

import { AppRoutes } from "../app/routes";
import type { Scenario } from "../lib/schemas";
import { Providers } from "../app/providers";

type Reply = { status?: number; body: unknown };
type Req = { method: string; body: unknown };
type Route = Reply | ((req: Req) => Reply | Promise<never>);
type Routes = Record<string, Route>;

/**
 * Stubs fetch so every /api/v1 call is answered from the defaults below, with `overrides`
 * (keyed by "path?query", or "POST path", without the /api/v1 prefix) replacing routes.
 * Returns the mock so tests can inspect calls.
 */
export function mockApi(overrides: Routes = {}) {
  const routes: Routes = {
    "/health": { body: HEALTH },
    "/capabilities": { body: CAPABILITIES },
    "/scenarios": { body: { items: [SCENARIO_SUMMARY], invalid: [] } },
    "/scenarios/demo": { body: SCENARIO },
    "/analyses?scenario_id=demo": { body: { items: [] } },
    "/simulations?scenario_id=demo": { body: { items: [] } },
    ...overrides,
  };
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = input.replace("/api/v1", "");
    const route = routes[`${method} ${path}`] ?? routes[path];
    if (!route) return new Response("{}", { status: 404 });
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const { status = 200, body: out } =
      typeof route === "function" ? await route({ method, body }) : route;
    return new Response(JSON.stringify(out), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The JSON bodies of every POST to `path`. */
export const posted = (fetchMock: ReturnType<typeof mockApi>, path: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => url === `/api/v1${path}` && init?.method === "POST")
    .map(([, init]) => JSON.parse(init!.body as string) as unknown);

export function renderApp(route = "/") {
  return render(
    <Providers>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </Providers>,
  );
}

export const HEALTH = { status: "ok", version: "9.9.9" };

export const CAPABILITIES = {
  version: "9.9.9",
  engine_version: null,
  scenario_schema_versions: ["1"],
  features: [
    {
      id: "path-discovery",
      name: "Attack-path discovery",
      status: "not_implemented",
      description: "No paths.",
    },
    {
      id: "scenario-validation",
      name: "Scenario validation",
      status: "implemented",
      description: "Validated.",
    },
  ],
  policy_semantics: [
    { id: "conditions", name: "Condition blocks", status: "unsupported", description: "Rejected." },
  ],
};

export const SCENARIO_SUMMARY = {
  id: "demo",
  name: "Demo Scenario",
  description: "A demo.",
  intended_outcome: "Something expected.",
  schema_version: "1",
  principal_count: 1,
  role_count: 2,
  resource_count: 3,
  policy_count: 4,
  objective_count: 1,
};

export const SCENARIO: Scenario = {
  schema_version: "1",
  metadata: {
    id: "demo",
    name: "Demo Scenario",
    description: "A demo.",
    intended_outcome: "Something expected.",
  },
  principals: [{ id: "alice", name: "Alice", kind: "user" }],
  roles: [{ id: "role-a", name: "Role A", trusted_identities: ["alice"] }],
  resources: [{ id: "db", name: "Main DB", kind: "database", sensitivity: "restricted" }],
  policies: [
    {
      id: "p1",
      name: "Alice reads the DB",
      attached_to: ["alice"],
      statements: [
        { sid: "connect", effect: "Allow", actions: ["rds:Connect"], resources: ["db"] },
      ],
    },
  ],
  relationships: [
    {
      id: "rel1",
      kind: "credential_access",
      source: "role-a",
      target: "db",
      description: "Role A opens the DB.",
    },
  ],
  legitimate_access: [
    {
      id: "la1",
      principal: "alice",
      action: "rds:Connect",
      resource: "db",
      description: "Alice keeps DB access.",
    },
  ],
  objectives: [
    {
      id: "o1",
      description: "Alice must not reach the DB.",
      principal: "alice",
      target: "db",
      expectation: "must_be_unreachable",
    },
  ],
};

export const ANALYSIS_SUMMARY = {
  id: "a".repeat(32),
  scenario_id: "demo",
  engine_version: "0.1.0",
  created_at: "2026-10-10T12:00:00Z",
  finding_count: 1,
  objectives_violated: 1,
  truncated: false,
};

export const ANALYSES = { body: { items: [ANALYSIS_SUMMARY] } };

export const ANALYSIS_DETAIL = {
  ...ANALYSIS_SUMMARY,
  objectives: [
    {
      objective_id: "o1",
      principal: "alice",
      target: "db",
      status: "violated",
      finding_id: "finding:alice>db",
      search_truncated: false,
    },
  ],
  legitimate_access: [],
  limits: { max_depth: 8, max_paths_per_pair: 20, max_expansions: 20000 },
};

const trust = { kind: "trust", role_id: "role-a", identity_id: "alice" } as const;
const grant = { kind: "statement", policy_id: "p1", sid: "connect", effect: "Allow" } as const;

export const STEP_ASSUME = {
  id: "assume:alice>role-a",
  source: "alice",
  target: "role-a",
  kind: "authorized",
  label: "may assume",
  actions: ["sts:AssumeRole"],
  decision: "ALLOW",
  reason: "permitted by policy and listed in role trust",
  evidence: [trust],
} as const;

export const STEP_ACCESS = {
  id: "access:role-a>db",
  source: "role-a",
  target: "db",
  kind: "authorized",
  label: "may access",
  actions: ["rds:Connect"],
  decision: "ALLOW",
  reason: "granted by an Allow statement",
  evidence: [grant],
} as const;

export const FINDING = {
  id: "finding:alice>db",
  source: "alice",
  target: "db",
  severity: "critical",
  paths: [{ source: "alice", target: "db", steps: [STEP_ASSUME, STEP_ACCESS] }],
  truncated: false,
  violated_objectives: ["o1"],
};

export const GRAPH = {
  nodes: [
    { id: "alice", name: "Alice", kind: "user", group: "principal", sensitivity: null },
    { id: "role-a", name: "Role A", kind: "role", group: "role", sensitivity: null },
    { id: "db", name: "Main DB", kind: "database", group: "resource", sensitivity: "restricted" },
  ],
  edges: [
    STEP_ASSUME,
    STEP_ACCESS,
    {
      id: "access:alice>db",
      source: "alice",
      target: "db",
      kind: "rejected",
      label: "denied access",
      actions: ["rds:*"],
      decision: "DENY",
      reason: "explicitly denied by a Deny statement",
      evidence: [{ kind: "statement", policy_id: "p1", sid: "connect", effect: "Deny" }],
    },
  ],
};

/** Routes for a scenario with one stored analysis and one finding. */
export const WITH_ANALYSIS: Routes = {
  "/analyses?scenario_id=demo": ANALYSES,
  [`/analyses/${ANALYSIS_SUMMARY.id}`]: { body: ANALYSIS_DETAIL },
  [`/analyses/${ANALYSIS_SUMMARY.id}/graph`]: { body: GRAPH },
  [`/analyses/${ANALYSIS_SUMMARY.id}/findings`]: { body: { items: [FINDING] } },
};

const side = (findings: unknown[], violated: boolean, legit: boolean) => ({
  finding_count: findings.length,
  findings,
  objectives: [
    {
      objective_id: "o1",
      principal: "alice",
      target: "db",
      status: violated ? "violated" : "satisfied",
      finding_id: violated ? "finding:alice>db" : null,
      search_truncated: false,
    },
  ],
  legitimate_access: [
    {
      id: "la1",
      principal: "alice",
      action: "rds:Connect",
      resource: "db",
      passes: legit,
      decision: { decision: legit ? "ALLOW" : "NOT_ALLOWED", reason: "r", evidence: [] },
    },
  ],
  truncated: false,
});

export const simulation = (verdict: string, over: Record<string, unknown> = {}) => ({
  id: "b".repeat(32),
  scenario_id: "demo",
  engine_version: "0.1.0",
  created_at: "2026-10-10T12:05:00Z",
  diffs: [
    {
      target: "p1/connect",
      change: { kind: "remove_statement", policy_id: "p1", sid: "connect" },
      before: { sid: "connect", effect: "Allow", actions: ["rds:Connect"], resources: ["db"] },
      after: null,
    },
  ],
  before: side([FINDING], true, true),
  after: side([], false, true),
  resolved_findings: ["finding:alice>db"],
  remaining_findings: [],
  new_findings: [],
  removed_paths: [FINDING.paths[0]],
  new_paths: [],
  broken_legitimate_access: [],
  verdict,
  notes: ["Evaluated against the documented IAM-like subset only."],
  ...over,
});
