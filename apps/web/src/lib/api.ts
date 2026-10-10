import type { z } from "zod";

import {
  analysisDetailSchema,
  analysisListSchema,
  analysisSummarySchema,
  capabilitiesSchema,
  errorSchema,
  findingListSchema,
  graphSchema,
  healthSchema,
  scenarioListSchema,
  scenarioSchema,
  simulationListSchema,
  simulationSchema,
  type AnalysisRequest,
  type SimulationRequest,
} from "./schemas";

// Relative on purpose: Vite proxies /api in development (see vite.config.ts).
const BASE = "/api/v1";
const TIMEOUT_MS = 15_000;

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  init: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {},
): Promise<z.infer<S>> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined && { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal,
    });
  } catch (e) {
    if (init.signal?.aborted) throw e; // the caller cancelled; not an API failure
    throw new ApiClientError("Cannot reach the SPECTRE API.", "network_error", 0);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = errorSchema.safeParse(body);
    if (parsed.success) {
      throw new ApiClientError(parsed.data.error.message, parsed.data.error.code, res.status);
    }
    throw new ApiClientError(`Request failed with status ${res.status}.`, "http_error", res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiClientError(
      "The API returned an unexpected response.",
      "invalid_response",
      res.status,
    );
  }
  return parsed.data;
}

const enc = encodeURIComponent;
const qs = (params: Record<string, string | number | undefined>) => {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${enc(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
};

export const api = {
  health: (signal?: AbortSignal) => request("/health", healthSchema, { signal }),
  capabilities: (signal?: AbortSignal) => request("/capabilities", capabilitiesSchema, { signal }),
  scenarios: (signal?: AbortSignal) => request("/scenarios", scenarioListSchema, { signal }),
  scenario: (id: string, signal?: AbortSignal) =>
    request(`/scenarios/${enc(id)}`, scenarioSchema, { signal }),

  analyses: (scenarioId?: string, signal?: AbortSignal) =>
    request(`/analyses${qs({ scenario_id: scenarioId })}`, analysisListSchema, { signal }),
  runAnalysis: (body: AnalysisRequest) =>
    request("/analyses", analysisSummarySchema, { method: "POST", body }),
  analysis: (id: string, signal?: AbortSignal) =>
    request(`/analyses/${enc(id)}`, analysisDetailSchema, { signal }),
  graph: (id: string, signal?: AbortSignal) =>
    request(`/analyses/${enc(id)}/graph`, graphSchema, { signal }),
  findings: (id: string, signal?: AbortSignal) =>
    request(`/analyses/${enc(id)}/findings`, findingListSchema, { signal }),

  simulations: (scenarioId?: string, signal?: AbortSignal) =>
    request(`/simulations${qs({ scenario_id: scenarioId })}`, simulationListSchema, { signal }),
  runSimulation: (body: SimulationRequest) =>
    request("/simulations", simulationSchema, { method: "POST", body }),
};
