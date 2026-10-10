import { z } from "zod";

import type { components } from "./api-types";

// Runtime validation of every response. The compile-time checks at the bottom make
// `tsc` fail if these schemas drift from the backend's OpenAPI contract (openapi.json).

export const healthSchema = z.object({ status: z.literal("ok"), version: z.string() });

export const scenarioSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  intended_outcome: z.string(),
  schema_version: z.string(),
  principal_count: z.number(),
  role_count: z.number(),
  resource_count: z.number(),
  policy_count: z.number(),
  objective_count: z.number(),
});

export const scenarioListSchema = z.object({
  items: z.array(scenarioSummarySchema),
  invalid: z.array(z.object({ id: z.string(), error: z.string() })),
});

const named = { id: z.string(), name: z.string() };
export const sensitivitySchema = z.enum(["public", "internal", "confidential", "restricted"]);
export const resourceKindSchema = z.enum(["database", "object_storage", "secret", "compute"]);

export const scenarioSchema = z.object({
  schema_version: z.literal("1"),
  metadata: z.object({ ...named, description: z.string(), intended_outcome: z.string() }),
  principals: z.array(z.object({ ...named, kind: z.enum(["user", "service"]) })),
  roles: z
    .array(z.object({ ...named, trusted_identities: z.array(z.string()).default([]) }))
    .default([]),
  resources: z.array(
    z.object({ ...named, kind: resourceKindSchema, sensitivity: sensitivitySchema }),
  ),
  policies: z
    .array(
      z.object({
        ...named,
        attached_to: z.array(z.string()),
        statements: z.array(
          z.object({
            sid: z.string(),
            effect: z.enum(["Allow", "Deny"]),
            actions: z.array(z.string()),
            resources: z.array(z.string()),
          }),
        ),
      }),
    )
    .default([]),
  relationships: z
    .array(
      z.object({
        id: z.string(),
        kind: z.literal("credential_access"),
        source: z.string(),
        target: z.string(),
        description: z.string(),
      }),
    )
    .default([]),
  legitimate_access: z
    .array(
      z.object({
        id: z.string(),
        principal: z.string(),
        action: z.string(),
        resource: z.string(),
        description: z.string(),
      }),
    )
    .default([]),
  objectives: z
    .array(
      z.object({
        id: z.string(),
        description: z.string(),
        principal: z.string(),
        target: z.string(),
        expectation: z.literal("must_be_unreachable"),
      }),
    )
    .default([]),
});

export const capabilitiesSchema = z.object({
  version: z.string(),
  engine_version: z.string().nullable(),
  scenario_schema_versions: z.array(z.string()),
  features: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(["implemented", "not_implemented"]),
      description: z.string(),
    }),
  ),
  policy_semantics: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(["implemented", "planned", "unsupported"]),
      description: z.string(),
    }),
  ),
});

export const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});

// --- analyses and simulations -------------------------------------------------------------

export const decisionSchema = z.enum(["ALLOW", "DENY", "NOT_ALLOWED", "UNSUPPORTED"]);

export const evidenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("statement"),
    policy_id: z.string(),
    sid: z.string(),
    effect: z.enum(["Allow", "Deny"]),
  }),
  z.object({ kind: z.literal("trust"), role_id: z.string(), identity_id: z.string() }),
  z.object({ kind: z.literal("relationship"), relationship_id: z.string() }),
]);

export const edgeKindSchema = z.enum([
  "inventory",
  "authorized",
  "prerequisite",
  "rejected",
  "unsupported",
]);

export const graphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: edgeKindSchema,
  label: z.string(),
  actions: z.array(z.string()),
  decision: decisionSchema.nullable(),
  reason: z.string(),
  evidence: z.array(evidenceSchema),
});

export const graphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      group: z.enum(["principal", "role", "resource"]),
      sensitivity: z.string().nullable(),
    }),
  ),
  edges: z.array(graphEdgeSchema),
});

export const attackPathSchema = z.object({
  source: z.string(),
  target: z.string(),
  steps: z.array(graphEdgeSchema),
});

export const findingSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  paths: z.array(attackPathSchema),
  truncated: z.boolean(),
  violated_objectives: z.array(z.string()),
});

export const findingListSchema = z.object({ items: z.array(findingSchema) });

export const objectiveResultSchema = z.object({
  objective_id: z.string(),
  principal: z.string(),
  target: z.string(),
  status: z.enum(["violated", "satisfied"]),
  finding_id: z.string().nullable(),
  search_truncated: z.boolean(),
});

export const accessCheckSchema = z.object({
  id: z.string(),
  principal: z.string(),
  action: z.string(),
  resource: z.string(),
  passes: z.boolean(),
  decision: z.object({
    decision: decisionSchema,
    reason: z.string(),
    evidence: z.array(evidenceSchema),
  }),
});

const limitsSchema = z.object({
  max_depth: z.number(),
  max_paths_per_pair: z.number(),
  max_expansions: z.number(),
});

export const analysisSummarySchema = z.object({
  id: z.string(),
  scenario_id: z.string(),
  engine_version: z.string(),
  created_at: z.string(),
  finding_count: z.number(),
  objectives_violated: z.number(),
  truncated: z.boolean(),
});

export const analysisDetailSchema = analysisSummarySchema.extend({
  objectives: z.array(objectiveResultSchema),
  legitimate_access: z.array(accessCheckSchema),
  limits: limitsSchema,
});

export const analysisListSchema = z.object({ items: z.array(analysisSummarySchema) });

const changeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("remove_statement"), policy_id: z.string(), sid: z.string() }),
  z.object({
    kind: z.literal("replace_statement"),
    policy_id: z.string(),
    sid: z.string(),
    effect: z.enum(["Allow", "Deny"]),
    actions: z.array(z.string()),
    resources: z.array(z.string()),
  }),
  z.object({ kind: z.literal("remove_trust"), role_id: z.string(), identity_id: z.string() }),
  z.object({ kind: z.literal("detach_policy"), policy_id: z.string(), identity_id: z.string() }),
]);

const simulationSideSchema = z.object({
  finding_count: z.number(),
  findings: z.array(findingSchema),
  objectives: z.array(objectiveResultSchema),
  legitimate_access: z.array(accessCheckSchema),
  truncated: z.boolean(),
});

export const verdictSchema = z.enum([
  "effective",
  "partial",
  "ineffective",
  "breaks_legitimate_access",
  "introduces_findings",
  "inconclusive",
  "nothing_to_remediate",
]);

export const simulationSchema = z.object({
  id: z.string(),
  scenario_id: z.string(),
  engine_version: z.string(),
  created_at: z.string(),
  diffs: z.array(
    z.object({
      target: z.string(),
      change: changeSchema,
      before: z.record(z.string(), z.unknown()).nullable(),
      after: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
  before: simulationSideSchema,
  after: simulationSideSchema,
  resolved_findings: z.array(z.string()),
  remaining_findings: z.array(z.string()),
  new_findings: z.array(z.string()),
  removed_paths: z.array(attackPathSchema),
  new_paths: z.array(attackPathSchema),
  broken_legitimate_access: z.array(accessCheckSchema),
  verdict: verdictSchema,
  notes: z.array(z.string()),
});

export const simulationListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      scenario_id: z.string(),
      created_at: z.string(),
      verdict: z.string(),
      change_count: z.number(),
    }),
  ),
});

// --- types ---------------------------------------------------------------------------------

export type ScenarioSummary = z.infer<typeof scenarioSummarySchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Capabilities = z.infer<typeof capabilitiesSchema>;
export type Policy = Scenario["policies"][number];
export type Graph = z.infer<typeof graphSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphNode = Graph["nodes"][number];
export type EdgeKind = z.infer<typeof edgeKindSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type AttackPath = z.infer<typeof attackPathSchema>;
export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;
export type AnalysisDetail = z.infer<typeof analysisDetailSchema>;
export type Simulation = z.infer<typeof simulationSchema>;
export type Change = z.infer<typeof changeSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type AccessCheck = z.infer<typeof accessCheckSchema>;
export type ObjectiveResult = z.infer<typeof objectiveResultSchema>;

// --- drift guard: a mismatch with the backend contract is a compile error --------------------

type S = components["schemas"];
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type ContractChecks = [
  Assert<Same<z.input<typeof healthSchema>, S["HealthResponse"]>>,
  Assert<Same<z.input<typeof scenarioListSchema>, S["ScenarioListResponse"]>>,
  Assert<Same<z.input<typeof scenarioSchema>, S["Scenario"]>>,
  Assert<Same<z.input<typeof capabilitiesSchema>, S["CapabilitiesResponse"]>>,
  Assert<Same<z.input<typeof graphSchema>, S["Graph"]>>,
  Assert<Same<z.input<typeof findingListSchema>, S["FindingList"]>>,
  Assert<Same<z.input<typeof analysisSummarySchema>, S["AnalysisSummary"]>>,
  Assert<Same<z.input<typeof analysisDetailSchema>, S["AnalysisDetail"]>>,
  Assert<Same<z.input<typeof analysisListSchema>, S["AnalysisList"]>>,
  Assert<Same<z.input<typeof simulationSchema>, S["SimulationOut"]>>,
  Assert<Same<z.input<typeof simulationListSchema>, S["SimulationList"]>>,
];

export type AnalysisRequest = S["AnalysisRequest"];
export type SimulationRequest = S["SimulationRequest"];
