import { Clock } from "lucide-react";
import { useNavigate } from "react-router";

import { ErrorState, LoadingRows } from "../../components/States";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Panel,
  Table,
  type Tone,
} from "../../components/ui";
import { formatTime } from "../../lib/format";
import { useSimulations } from "../../lib/queries";
import { useActiveScenario } from "../scenarios/ScenarioProvider";
import { VERDICT } from "../remediation/verdict";
import type { Verdict } from "../../lib/schemas";

export function AnalysisHistoryPage() {
  const { analyses, analysisId, selectedId, viewAnalysis } = useActiveScenario();
  const sims = useSimulations(selectedId);
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title="Analysis history"
        description="Every analysis and simulation run for this scenario, stored locally. Open a run to inspect it in the graph and findings."
      />
      <div className="space-y-4">
        <Panel title="Analyses">
          {analyses.isPending && <LoadingRows />}
          {analyses.error && (
            <ErrorState error={analyses.error} onRetry={() => void analyses.refetch()} />
          )}
          {analyses.data?.items.length === 0 && (
            <EmptyState icon={Clock} title="No analyses yet">
              <p>Use Run analysis in the top bar to create the first one for this scenario.</p>
            </EmptyState>
          )}
          {analyses.data && analyses.data.items.length > 0 && (
            <Table
              label="Analyses"
              columns={["Run", "Engine", "Findings", "Objectives violated", "Search", ""]}
            >
              {analyses.data.items.map((a) => (
                <tr key={a.id} className={a.id === analysisId ? "bg-active/50" : ""}>
                  <td className="px-3 py-2">{formatTime(a.created_at)}</td>
                  <td className="px-3 py-2 font-mono text-xs">v{a.engine_version}</td>
                  <td className="tabular px-3 py-2 font-mono">{a.finding_count}</td>
                  <td className="tabular px-3 py-2 font-mono">{a.objectives_violated}</td>
                  <td className="px-3 py-2">
                    <Badge tone={a.truncated ? "high" : "neutral"}>
                      {a.truncated ? "Limit reached" : "Complete"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      onClick={() => {
                        viewAnalysis(a.id);
                        void navigate("/findings");
                      }}
                    >
                      {a.id === analysisId ? "Viewing" : "Open"}
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Simulations">
          {sims.isPending && <LoadingRows rows={2} />}
          {sims.error && <ErrorState error={sims.error} onRetry={() => void sims.refetch()} />}
          {sims.data?.items.length === 0 && (
            <p className="text-ink-2 p-3 text-sm">
              No simulations yet. Stage a change in the Remediation lab to create one.
            </p>
          )}
          {sims.data && sims.data.items.length > 0 && (
            <Table label="Simulations" columns={["Run", "Changes", "Verdict"]}>
              {sims.data.items.map((r) => {
                const v = VERDICT[r.verdict as Verdict] as (typeof VERDICT)[Verdict] | undefined;
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{formatTime(r.created_at)}</td>
                    <td className="tabular px-3 py-2 font-mono">{r.change_count}</td>
                    <td className="px-3 py-2">
                      <Badge tone={(v?.tone ?? "neutral") as Tone}>{v?.title ?? r.verdict}</Badge>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}
