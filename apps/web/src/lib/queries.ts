import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";
import type { SimulationRequest } from "./schemas";

export const keys = {
  health: ["health"] as const,
  capabilities: ["capabilities"] as const,
  scenarios: ["scenarios"] as const,
  scenario: (id: string | null) => ["scenario", id] as const,
  analyses: (scenarioId: string | null) => ["analyses", scenarioId] as const,
  analysis: (id: string | null) => ["analysis", id] as const,
  graph: (id: string | null) => ["analysis", id, "graph"] as const,
  findings: (id: string | null) => ["analysis", id, "findings"] as const,
  simulations: (scenarioId: string | null) => ["simulations", scenarioId] as const,
};

export const useHealth = () =>
  useQuery({ queryKey: keys.health, queryFn: ({ signal }) => api.health(signal) });
export const useCapabilities = () =>
  useQuery({ queryKey: keys.capabilities, queryFn: ({ signal }) => api.capabilities(signal) });
export const useScenarios = () =>
  useQuery({ queryKey: keys.scenarios, queryFn: ({ signal }) => api.scenarios(signal) });
export const useScenario = (id: string | null) =>
  useQuery({
    queryKey: keys.scenario(id),
    queryFn: ({ signal }) => api.scenario(id!, signal),
    enabled: id !== null,
  });

export const useAnalyses = (scenarioId: string | null) =>
  useQuery({
    queryKey: keys.analyses(scenarioId),
    queryFn: ({ signal }) => api.analyses(scenarioId!, signal),
    enabled: scenarioId !== null,
  });
export const useAnalysis = (id: string | null) =>
  useQuery({
    queryKey: keys.analysis(id),
    queryFn: ({ signal }) => api.analysis(id!, signal),
    enabled: id !== null,
  });
export const useGraph = (id: string | null) =>
  useQuery({
    queryKey: keys.graph(id),
    queryFn: ({ signal }) => api.graph(id!, signal),
    enabled: id !== null,
  });
export const useFindings = (id: string | null) =>
  useQuery({
    queryKey: keys.findings(id),
    queryFn: ({ signal }) => api.findings(id!, signal),
    enabled: id !== null,
  });
export const useSimulations = (scenarioId: string | null) =>
  useQuery({
    queryKey: keys.simulations(scenarioId),
    queryFn: ({ signal }) => api.simulations(scenarioId!, signal),
    enabled: scenarioId !== null,
  });

export function useRunAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scenarioId: string) => api.runAnalysis({ scenario_id: scenarioId }),
    onSuccess: (run) => qc.invalidateQueries({ queryKey: keys.analyses(run.scenario_id) }),
  });
}

export function useRunSimulation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SimulationRequest) => api.runSimulation(body),
    onSuccess: (sim) => qc.invalidateQueries({ queryKey: keys.simulations(sim.scenario_id) }),
  });
}
