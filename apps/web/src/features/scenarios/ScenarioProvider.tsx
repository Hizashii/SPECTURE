import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAnalyses, useScenario, useScenarios } from "../../lib/queries";

const KEY = "spectre.scenario";
// The flagship demo scenario is shown first when the user has not chosen one.
const DEFAULT_ID = "northstar-financial";

function readStored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

type Ctx = {
  selectedId: string | null;
  select: (id: string) => void;
  list: ReturnType<typeof useScenarios>;
  detail: ReturnType<typeof useScenario>;
  /** The analysis every page shows: the one the user opened from History, else the newest. */
  analysisId: string | null;
  latestAnalysisId: string | null;
  viewAnalysis: (id: string | null) => void;
  analyses: ReturnType<typeof useAnalyses>;
};

const ScenarioContext = createContext<Ctx | null>(null);

/** The scenario and analysis every page works on. Chosen in the top bar; remembered per browser. */
export function ScenarioProvider({ children }: { children: ReactNode }) {
  const list = useScenarios();
  const [stored, setStored] = useState<string | null>(readStored);
  const [viewed, setViewed] = useState<{ scenarioId: string; analysisId: string } | null>(null);

  const ids = list.data?.items.map((s) => s.id) ?? [];
  const fallback = ids.includes(DEFAULT_ID) ? DEFAULT_ID : (ids[0] ?? null);
  const selectedId = stored && ids.includes(stored) ? stored : fallback;
  const detail = useScenario(selectedId);
  const analyses = useAnalyses(selectedId);

  useEffect(() => {
    if (!stored) return;
    try {
      localStorage.setItem(KEY, stored);
    } catch {
      // Storage can be unavailable (private mode); the selection just won't persist.
    }
  }, [stored]);

  const latestAnalysisId = analyses.data?.items[0]?.id ?? null;
  const viewedId = viewed && viewed.scenarioId === selectedId ? viewed.analysisId : null;

  const value = useMemo<Ctx>(
    () => ({
      selectedId,
      select: setStored,
      list,
      detail,
      analyses,
      latestAnalysisId,
      analysisId: viewedId ?? latestAnalysisId,
      viewAnalysis: (id) =>
        setViewed(id && selectedId ? { scenarioId: selectedId, analysisId: id } : null),
    }),
    [selectedId, list, detail, analyses, latestAnalysisId, viewedId],
  );
  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useActiveScenario() {
  const ctx = useContext(ScenarioContext);
  if (!ctx) throw new Error("useActiveScenario must be used inside ScenarioProvider");
  return ctx;
}
