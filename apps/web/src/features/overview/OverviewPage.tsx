import { Play } from "lucide-react";

import { ErrorState, LoadingRows } from "../../components/States";
import { Badge, Button, PageHeader, Panel, Table, type Tone } from "../../components/ui";
import { formatTime, plural } from "../../lib/format";
import { useAnalysis, useCapabilities, useRunAnalysis } from "../../lib/queries";
import { useActiveScenario } from "../scenarios/ScenarioProvider";
import { ObjectivesTable } from "../scenarios/ObjectivesTable";

const TONE: Record<string, Tone> = {
  implemented: "secure",
  not_implemented: "high",
  planned: "high",
  unsupported: "neutral",
};

function Status({ status }: { status: string }) {
  return <Badge tone={TONE[status] ?? "neutral"}>{status.replace("_", " ")}</Badge>;
}

export function OverviewPage() {
  const { detail, analysisId, selectedId } = useActiveScenario();
  const analysis = useAnalysis(analysisId);
  const caps = useCapabilities();
  const run = useRunAnalysis();
  const s = detail.data;
  const a = analysis.data;

  return (
    <>
      <PageHeader
        title={s ? s.metadata.name : "Overview"}
        description={s?.metadata.description ?? "Synthetic scenario and engine status."}
        actions={<Badge>Synthetic scenario</Badge>}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Panel title="Security objectives">
          {detail.isPending && <LoadingRows />}
          {detail.error && (
            <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
          )}
          {s && <ObjectivesTable scenario={s} results={a?.objectives} />}
        </Panel>

        <div className="space-y-4">
          <Panel title="Latest analysis">
            {analysisId && analysis.isPending && <LoadingRows rows={2} />}
            {analysis.error && <ErrorState error={analysis.error} />}
            {!analysisId && (
              <div className="space-y-3 p-3">
                <p className="text-ink-2 text-sm">This scenario has not been analyzed yet.</p>
                <Button
                  variant="primary"
                  icon={Play}
                  disabled={!selectedId || run.isPending}
                  onClick={() => selectedId && run.mutate(selectedId)}
                >
                  {run.isPending ? "Running…" : "Run analysis"}
                </Button>
              </div>
            )}
            {a && (
              <dl className="divide-hair divide-y text-sm">
                {(
                  [
                    ["Run", formatTime(a.created_at)],
                    ["Engine", `v${a.engine_version}`],
                    ["Findings", plural(a.finding_count, "finding", "findings")],
                    ["Objectives violated", String(a.objectives_violated)],
                    ["Search", a.truncated ? "Limit reached" : "Complete"],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-3 py-2">
                    <dt className="text-ink-3 text-xs">{k}</dt>
                    <dd className="tabular">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>
          {s && (
            <Panel title="Intended outcome" actions={<Badge>Scenario documentation</Badge>}>
              <p className="text-ink-2 p-3 text-sm">{s.metadata.intended_outcome}</p>
            </Panel>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Engine features">
          {caps.isPending && <LoadingRows />}
          {caps.error && <ErrorState error={caps.error} onRetry={() => void caps.refetch()} />}
          {caps.data && (
            <Table label="Engine features" columns={["Feature", "Status"]}>
              {caps.data.features.map((f) => (
                <tr key={f.id} className="align-top">
                  <td className="px-3 py-2">
                    <p className="font-medium">{f.name}</p>
                    <p className="text-ink-2 text-xs">{f.description}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Status status={f.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
        <Panel title="Policy semantics">
          {caps.data && (
            <Table label="Policy semantics" columns={["Semantic", "Status"]}>
              {caps.data.policy_semantics.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="px-3 py-2">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-ink-2 text-xs">{p.description}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Status status={p.status} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}
