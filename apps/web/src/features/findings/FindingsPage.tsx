import { Play, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { EvidenceList } from "../../components/Evidence";
import { ErrorState, LoadingRows } from "../../components/States";
import {
  Badge,
  Button,
  EmptyState,
  IdTag,
  PageHeader,
  Panel,
  type Tone,
} from "../../components/ui";
import { plural } from "../../lib/format";
import { useAnalysis, useFindings, useRunAnalysis } from "../../lib/queries";
import type { AttackPath, Finding, Scenario } from "../../lib/schemas";
import { useActiveScenario } from "../scenarios/ScenarioProvider";
import { nameOf } from "../scenarios/lookup";

const SEVERITY_TONE: Record<Finding["severity"], Tone> = {
  critical: "critical",
  high: "high",
  medium: "info",
  low: "neutral",
};

function PathView({
  scenario,
  path,
  index,
}: {
  scenario: Scenario;
  path: AttackPath;
  index: number;
}) {
  return (
    <section aria-label={`Path ${index + 1}`} className="border-hair border-t first:border-t-0">
      <h3 className="px-4 pt-3 text-sm font-semibold">
        Path {index + 1}{" "}
        <span className="text-ink-3 tabular font-normal">
          ({plural(path.steps.length, "step", "steps")})
        </span>
      </h3>
      <ol className="space-y-3 p-4">
        {path.steps.map((s, i) => (
          <li key={s.id} className="border-hair bg-nav rounded-md border">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="text-ink-3 tabular font-mono text-xs">{i + 1}</span>
              <span className="text-sm font-medium">
                {nameOf(scenario, s.source)} → {nameOf(scenario, s.target)}
              </span>
              <Badge tone={s.kind === "prerequisite" ? "high" : "signal"}>
                {s.kind === "prerequisite" ? "Modeled prerequisite" : "Allowed"}
              </Badge>
              {s.actions.map((a) => (
                <IdTag key={a}>{a}</IdTag>
              ))}
            </div>
            {s.reason && <p className="text-ink-2 px-3 pb-2 text-xs">{s.reason}</p>}
            <details className="border-hair border-t">
              <summary className="text-ink-2 hover:text-ink cursor-pointer px-3 py-1.5 text-xs select-none">
                Evidence ({s.evidence.length})
              </summary>
              <div className="px-3 pb-3">
                <EvidenceList scenario={scenario} evidence={s.evidence} />
              </div>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FindingDetail({ scenario, finding }: { scenario: Scenario; finding: Finding }) {
  return (
    <Panel
      title={`${nameOf(scenario, finding.source)} → ${nameOf(scenario, finding.target)}`}
      actions={<Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>}
    >
      <div className="space-y-2 px-4 py-3 text-sm">
        <p className="text-ink-2">
          Under the modeled rules, <IdTag>{finding.source}</IdTag> can reach{" "}
          <IdTag>{finding.target}</IdTag> through {plural(finding.paths.length, "path", "paths")}.
          Severity comes from the target&apos;s declared sensitivity only.
        </p>
        {finding.violated_objectives.length > 0 && (
          <p>
            Violates objective{finding.violated_objectives.length > 1 ? "s" : ""}{" "}
            {finding.violated_objectives.map((o) => (
              <IdTag key={o}>{o}</IdTag>
            ))}
          </p>
        )}
        {finding.truncated && (
          <p role="note" className="text-high text-xs">
            The per-pair path limit was reached; more paths may exist than are listed.
          </p>
        )}
      </div>
      {finding.paths.map((p, i) => (
        <PathView key={i} scenario={scenario} path={p} index={i} />
      ))}
    </Panel>
  );
}

export function FindingsPage() {
  const { detail, analysisId, selectedId } = useActiveScenario();
  const analysis = useAnalysis(analysisId);
  const findings = useFindings(analysisId);
  const run = useRunAnalysis();
  const [picked, setPicked] = useState<string | null>(null);

  const header = (
    <PageHeader
      title="Findings"
      description="Paths the engine can justify, step by step, from the scenario's own statements, trust entries and modeled relationships."
    />
  );

  if (!analysisId) {
    return (
      <>
        {header}
        <Panel title="Findings" className="max-w-3xl">
          <EmptyState
            icon={ShieldAlert}
            title="No analysis has been run for this scenario"
            action={
              <Button
                variant="primary"
                icon={Play}
                disabled={!selectedId || run.isPending}
                onClick={() => selectedId && run.mutate(selectedId)}
              >
                {run.isPending ? "Running…" : "Run analysis"}
              </Button>
            }
          >
            <p>
              Nothing has been evaluated, so nothing is reported. Absence of findings here does not
              mean the scenario is safe.
            </p>
          </EmptyState>
        </Panel>
      </>
    );
  }

  if (findings.isPending || detail.isPending || analysis.isPending) return <LoadingRows />;
  const err = findings.error ?? detail.error ?? analysis.error;
  if (err || !findings.data || !detail.data || !analysis.data) {
    return <ErrorState error={err} onRetry={() => void findings.refetch()} />;
  }

  const items = findings.data.items;
  const scenario = detail.data;
  const current = items.find((f) => f.id === picked) ?? items[0];

  return (
    <>
      {header}
      {items.length === 0 ? (
        <Panel title="Findings" className="max-w-3xl">
          <EmptyState icon={ShieldCheck} title="No paths found within the modeled rules">
            <p>
              The engine found no path from any identity to a sensitive resource
              {analysis.data.truncated
                ? ", but the search hit a limit, so this is not conclusive"
                : ""}
              . This reflects the modeled IAM subset, not a guarantee about real AWS.
            </p>
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <Panel title={`Findings (${items.length})`}>
            <ul className="divide-hair divide-y">
              {items.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed={f.id === current?.id}
                    onClick={() => setPicked(f.id)}
                    className={`block w-full px-3 py-2.5 text-left transition-colors duration-150 ${
                      f.id === current?.id
                        ? "bg-active shadow-[inset_2px_0_0_var(--color-signal)]"
                        : "hover:bg-raised"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <Badge tone={SEVERITY_TONE[f.severity]}>{f.severity}</Badge>
                      <span className="text-ink-3 tabular text-xs">
                        {plural(f.paths.length, "path", "paths")}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm">
                      {nameOf(scenario, f.source)} → {nameOf(scenario, f.target)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          {current && <FindingDetail scenario={scenario} finding={current} />}
        </div>
      )}
    </>
  );
}
