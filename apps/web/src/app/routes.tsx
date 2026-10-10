import { SearchX } from "lucide-react";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

import { LoadingRows } from "../components/States";
import { EmptyState } from "../components/ui";
import { AnalysisHistoryPage } from "../features/analysis-history/AnalysisHistoryPage";
import { FindingsPage } from "../features/findings/FindingsPage";
import { OverviewPage } from "../features/overview/OverviewPage";
import { RemediationPage } from "../features/remediation/RemediationPage";
import { ScenariosPage } from "../features/scenarios/ScenariosPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { AppShell } from "./AppShell";
import { RequireScenario } from "./RequireScenario";

// React Flow is large; load it only when the graph route is opened.
const GraphPage = lazy(() =>
  import("../features/graph/GraphPage").then((m) => ({ default: m.GraphPage })),
);

function NotFound() {
  return (
    <EmptyState icon={SearchX} title="Page not found">
      <p>That route does not exist.</p>
    </EmptyState>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route element={<RequireScenario />}>
          <Route index element={<OverviewPage />} />
          <Route
            path="graph"
            element={
              <Suspense fallback={<LoadingRows />}>
                <GraphPage />
              </Suspense>
            }
          />
          <Route path="findings" element={<FindingsPage />} />
          <Route path="remediation" element={<RemediationPage />} />
          <Route path="history" element={<AnalysisHistoryPage />} />
        </Route>
        <Route path="scenarios" element={<ScenariosPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
