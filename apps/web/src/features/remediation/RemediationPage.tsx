import { Play, Undo2, X } from "lucide-react";
import { useState } from "react";

import { ErrorState, LoadingRows } from "../../components/States";
import { useNotify } from "../../components/Notifications";
import { Badge, Button, CodeBlock, IdTag, Panel } from "../../components/ui";
import { ApiClientError } from "../../lib/api";
import { plural } from "../../lib/format";
import { useRunSimulation } from "../../lib/queries";
import type { Change, Policy, Scenario, Simulation } from "../../lib/schemas";
import { useActiveScenario } from "../scenarios/ScenarioProvider";
import { nameOf } from "../scenarios/lookup";
import { describeChange, targetKey, VERDICT } from "./verdict";

const csv = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function StatementEditor({
  policy,
  sid,
  initial,
  onStage,
  onCancel,
}: {
  policy: Policy;
  sid: string;
  initial: Policy["statements"][number];
  onStage: (c: Change) => void;
  onCancel: () => void;
}) {
  const [effect, setEffect] = useState(initial.effect);
  const [actions, setActions] = useState(initial.actions.join(", "));
  const [resources, setResources] = useState(initial.resources.join(", "));
  const field = "border-line bg-nav h-8 w-full rounded border px-2 font-mono text-xs";
  return (
    <form
      className="border-hair space-y-2 border-t p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onStage({
          kind: "replace_statement",
          policy_id: policy.id,
          sid,
          effect,
          actions: csv(actions),
          resources: csv(resources),
        });
      }}
    >
      <label className="block text-xs">
        <span className="text-ink-2">Effect</span>
        <select
          value={effect}
          onChange={(e) => setEffect(e.target.value as "Allow" | "Deny")}
          className={field}
        >
          <option>Allow</option>
          <option>Deny</option>
        </select>
      </label>
      <label className="block text-xs">
        <span className="text-ink-2">Actions (comma separated)</span>
        <input value={actions} onChange={(e) => setActions(e.target.value)} className={field} />
      </label>
      <label className="block text-xs">
        <span className="text-ink-2">Resources (ids, prefix*, or *)</span>
        <input value={resources} onChange={(e) => setResources(e.target.value)} className={field} />
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="primary">
          Stage change
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function PolicyEditor({
  scenario,
  policy,
  pending,
  stage,
}: {
  scenario: Scenario;
  policy: Policy;
  pending: Set<string>;
  stage: (c: Change) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div>
      <div className="border-hair flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
        <span className="text-ink-3">Attached to</span>
        {policy.attached_to.map((id) => {
          const key = `attach:${policy.id}/${id}`;
          return (
            <span key={id} className="flex items-center gap-1">
              <IdTag>{id}</IdTag>
              <Button
                variant="ghost"
                className="!h-6 !px-1.5 text-xs"
                disabled={pending.has(key)}
                onClick={() =>
                  stage({ kind: "detach_policy", policy_id: policy.id, identity_id: id })
                }
                aria-label={`Detach ${policy.id} from ${id}`}
              >
                Detach
              </Button>
            </span>
          );
        })}
      </div>
      <ul className="space-y-3 p-3">
        {policy.statements.map((st) => {
          const key = `stmt:${policy.id}/${st.sid}`;
          const isPending = pending.has(key);
          return (
            <li key={st.sid} className="border-line bg-nav overflow-hidden rounded-md border">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <Badge tone={st.effect === "Deny" ? "critical" : "secure"}>{st.effect}</Badge>
                <IdTag>{st.sid}</IdTag>
                {isPending && <Badge tone="high">Change staged</Badge>}
                <span className="flex-1" />
                <Button
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => setEditing(editing === st.sid ? null : st.sid)}
                >
                  Edit scope
                </Button>
                <Button
                  variant="secondary"
                  disabled={isPending}
                  onClick={() =>
                    stage({ kind: "remove_statement", policy_id: policy.id, sid: st.sid })
                  }
                  aria-label={`Remove statement ${st.sid}`}
                >
                  Remove
                </Button>
              </div>
              <div className="border-hair space-y-0.5 border-t px-3 py-2 font-mono text-xs">
                <p className="break-words">{st.actions.join(", ")}</p>
                <p className="text-ink-2 break-words">on {st.resources.join(", ")}</p>
              </div>
              {editing === st.sid && (
                <StatementEditor
                  policy={policy}
                  sid={st.sid}
                  initial={st}
                  onCancel={() => setEditing(null)}
                  onStage={(c) => {
                    stage(c);
                    setEditing(null);
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
      <section className="border-hair border-t p-3">
        <h3 className="text-sm font-semibold">Role trust</h3>
        <p className="text-ink-3 text-xs">
          Removing an entry stops that identity from assuming the role.
        </p>
        <ul className="mt-2 space-y-1.5">
          {scenario.roles.flatMap((r) =>
            r.trusted_identities.map((id) => {
              const key = `trust:${r.id}/${id}`;
              return (
                <li key={key} className="flex items-center gap-2 text-xs">
                  <IdTag>{r.id}</IdTag> trusts <IdTag>{id}</IdTag>
                  <span className="flex-1" />
                  <Button
                    variant="secondary"
                    className="!h-6"
                    disabled={pending.has(key)}
                    onClick={() => stage({ kind: "remove_trust", role_id: r.id, identity_id: id })}
                    aria-label={`Remove ${id} from the trust of ${r.id}`}
                  >
                    Remove
                  </Button>
                </li>
              );
            }),
          )}
        </ul>
      </section>
    </div>
  );
}

function Result({ scenario, sim }: { scenario: Scenario; sim: Simulation }) {
  const v = VERDICT[sim.verdict];
  const violated = (s: Simulation["before"]) =>
    s.objectives.filter((o) => o.status === "violated").length;
  const passing = (s: Simulation["before"]) => s.legitimate_access.filter((a) => a.passes).length;
  const total = sim.before.legitimate_access.length;
  const rows: [string, string, string][] = [
    ["Findings", String(sim.before.finding_count), String(sim.after.finding_count)],
    [
      "Objectives violated",
      `${violated(sim.before)} of ${sim.before.objectives.length}`,
      `${violated(sim.after)} of ${sim.after.objectives.length}`,
    ],
    [
      "Legitimate access passing",
      `${passing(sim.before)} of ${total}`,
      `${passing(sim.after)} of ${total}`,
    ],
  ];
  const chain = (nodes: string[]) => nodes.map((n) => nameOf(scenario, n)).join(" → ");
  return (
    <div className="space-y-4 p-3" aria-label="Simulation result" role="region">
      <div
        role="status"
        className={`rounded-md border p-3 ${
          v.tone === "secure"
            ? "border-secure/40 bg-secure/10"
            : v.tone === "high"
              ? "border-high/40 bg-high/10"
              : v.tone === "critical"
                ? "border-critical/40 bg-critical/10"
                : "border-line bg-raised"
        }`}
      >
        <p className="text-sm font-semibold">{v.title}</p>
        <p className="text-ink-2 mt-1 text-xs">{v.text}</p>
      </div>

      <table className="w-full text-left text-xs" aria-label="Before and after">
        <thead className="text-ink-3">
          <tr>
            <th scope="col" className="py-1 font-medium">
              &nbsp;
            </th>
            <th scope="col" className="py-1 font-medium">
              Before
            </th>
            <th scope="col" className="py-1 font-medium">
              After
            </th>
          </tr>
        </thead>
        <tbody className="divide-hair divide-y">
          {rows.map(([k, b, a]) => (
            <tr key={k}>
              <th scope="row" className="py-1.5 font-normal">
                {k}
              </th>
              <td className="tabular py-1.5 font-mono">{b}</td>
              <td className="tabular py-1.5 font-mono">{a}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {sim.broken_legitimate_access.length > 0 && (
        <section>
          <h3 className="text-critical text-sm font-semibold">Legitimate access now broken</h3>
          <ul className="mt-1 space-y-1 text-xs">
            {sim.broken_legitimate_access.map((a) => (
              <li key={a.id}>
                {nameOf(scenario, a.principal)} · <span className="font-mono">{a.action}</span> on{" "}
                {nameOf(scenario, a.resource)}
                <p className="text-ink-3">{a.decision.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sim.remaining_findings.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">Residual risk</h3>
          <ul className="mt-1 space-y-1 text-xs">
            {sim.after.findings.map((f) => (
              <li key={f.id}>
                <IdTag>{f.id}</IdTag>{" "}
                <span className="text-ink-2">
                  {plural(f.paths.length, "path remains", "paths remain")}
                </span>
                <ul className="text-ink-3 mt-0.5 space-y-0.5">
                  {f.paths.map((p, i) => (
                    <li key={i}>{chain([p.source, ...p.steps.map((s) => s.target)])}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sim.new_findings.length > 0 && (
        <section>
          <h3 className="text-critical text-sm font-semibold">New findings</h3>
          <ul className="mt-1 text-xs">
            {sim.new_findings.map((id) => (
              <li key={id}>
                <IdTag>{id}</IdTag>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sim.removed_paths.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">Paths removed ({sim.removed_paths.length})</h3>
          <ul className="text-ink-2 mt-1 space-y-0.5 text-xs">
            {sim.removed_paths.map((p, i) => (
              <li key={i}>{chain([p.source, ...p.steps.map((s) => s.target)])}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold">Policy diff</h3>
        <div className="mt-1 space-y-3">
          {sim.diffs.map((d, i) => (
            <div key={i} className="border-hair overflow-hidden rounded border">
              <p className="bg-raised px-2 py-1 text-xs">
                <IdTag>{d.target}</IdTag>{" "}
                <span className="text-ink-2">{d.change.kind.replace("_", " ")}</span>
              </p>
              {d.before && (
                <CodeBlock
                  label={`Before: ${d.target}`}
                  value={d.before}
                  marks={Object.fromEntries(
                    Array.from(
                      { length: JSON.stringify(d.before, null, 2).split("\n").length },
                      (_, n) => [n + 1, "critical" as const],
                    ),
                  )}
                />
              )}
              {d.after && (
                <CodeBlock
                  label={`After: ${d.target}`}
                  value={d.after}
                  marks={Object.fromEntries(
                    Array.from(
                      { length: JSON.stringify(d.after, null, 2).split("\n").length },
                      (_, n) => [n + 1, "secure" as const],
                    ),
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      <ul className="text-ink-3 list-disc space-y-1 pl-4 text-xs">
        {sim.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

export function RemediationPage() {
  const { detail, selectedId } = useActiveScenario();
  const sim = useRunSimulation();
  const notify = useNotify();
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [result, setResult] = useState<Simulation | null>(null);

  if (detail.isPending) return <LoadingRows />;
  if (detail.error || !detail.data) {
    return (
      <div className="p-6">
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      </div>
    );
  }
  const s = detail.data;
  const policy = s.policies.find((p) => p.id === policyId) ?? s.policies[0];
  const pending = new Set(changes.map(targetKey));

  const stage = (c: Change) => {
    setResult(null);
    setChanges((cs) => [...cs.filter((x) => targetKey(x) !== targetKey(c)), c]);
  };
  const unstage = (c: Change) => {
    setResult(null);
    setChanges((cs) => cs.filter((x) => x !== c));
  };
  const run = () => {
    if (!selectedId) return;
    sim.mutate(
      { scenario_id: selectedId, changes },
      {
        onSuccess: setResult,
        onError: (e) =>
          notify("error", e instanceof ApiClientError ? e.message : "The simulation failed."),
      },
    );
  };

  return (
    <div className="grid h-full min-h-0 gap-3 p-3 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_26rem]">
      <Panel title="Policies" className="max-lg:hidden">
        {s.policies.length === 0 && (
          <p className="text-ink-2 p-3 text-sm">This scenario has no policies.</p>
        )}
        <ul>
          {s.policies.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={p.id === policy?.id}
                onClick={() => setPolicyId(p.id)}
                className={`block w-full px-3 py-2 text-left transition-colors duration-150 ${
                  p.id === policy?.id ? "bg-active" : "hover:bg-raised"
                }`}
              >
                <span className="block truncate text-sm">{p.name}</span>
                <span className="text-ink-3 block truncate text-xs">
                  {p.attached_to.map((id) => nameOf(s, id)).join(", ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={policy ? policy.name : "Policy"} actions={policy && <IdTag>{policy.id}</IdTag>}>
        {s.policies.length > 1 && (
          <label className="border-hair flex items-center gap-2 border-b px-3 py-2 text-xs lg:hidden">
            <span className="text-ink-3">Policy</span>
            <select
              value={policy?.id ?? ""}
              onChange={(e) => setPolicyId(e.target.value)}
              className="border-line bg-nav h-8 min-w-0 flex-1 rounded border px-2 text-sm"
            >
              {s.policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {policy ? (
          <PolicyEditor scenario={s} policy={policy} pending={pending} stage={stage} />
        ) : (
          <p className="text-ink-2 p-4 text-sm">Nothing to edit.</p>
        )}
      </Panel>

      <Panel
        title="Simulation"
        actions={<Badge tone="signal">Runs on a copy</Badge>}
        className="max-xl:min-h-[18rem] lg:max-xl:col-span-2"
      >
        <div className="border-hair space-y-3 border-b p-3">
          <h3 className="text-sm font-semibold">Staged changes ({changes.length})</h3>
          {changes.length === 0 ? (
            <p className="text-ink-2 text-xs">
              Stage a change from the policy editor, then run the simulation. The scenario itself is
              never modified.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {changes.map((c) => (
                <li
                  key={targetKey(c)}
                  className="bg-nav border-hair flex items-start gap-2 rounded border px-2 py-1.5 text-xs"
                >
                  <span className="flex-1 break-words">{describeChange(c)}</span>
                  <button
                    type="button"
                    onClick={() => unstage(c)}
                    aria-label={`Unstage: ${describeChange(c)}`}
                    className="text-ink-3 hover:text-ink"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              icon={Play}
              disabled={changes.length === 0 || sim.isPending}
              aria-describedby="sim-hint"
              onClick={run}
            >
              {sim.isPending ? "Simulating…" : "Run simulation"}
            </Button>
            <Button
              variant="ghost"
              icon={Undo2}
              disabled={changes.length === 0}
              onClick={() => {
                setChanges([]);
                setResult(null);
              }}
            >
              Reset
            </Button>
          </div>
          <p id="sim-hint" className="text-ink-3 text-xs">
            {changes.length === 0
              ? "Stage at least one change to run a simulation."
              : "Compares against the baseline analysis."}
          </p>
        </div>
        {result && <Result scenario={s} sim={result} />}
      </Panel>
    </div>
  );
}
