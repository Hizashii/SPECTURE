import { plural } from "../../lib/format";
import { ErrorState, LoadingRows } from "../../components/States";
import { Badge, IdTag, PageHeader, Panel, Table } from "../../components/ui";
import { useActiveScenario } from "./ScenarioProvider";
import { nameOf, SENSITIVITY_TONE } from "./lookup";

function Detail() {
  const { detail } = useActiveScenario();
  const s = detail.data;
  if (detail.isPending) return <LoadingRows label="Loading scenario…" />;
  if (detail.error || !s)
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;

  return (
    <div className="space-y-4">
      <Panel title={s.metadata.name} actions={<Badge>schema v{s.schema_version}</Badge>}>
        <p className="px-3 pt-3 text-sm">{s.metadata.description}</p>
        <div className="p-3">
          <div className="border-high/30 bg-high/10 rounded border p-3 text-sm">
            <p className="text-high text-xs font-medium">
              Intended outcome (documentation, not evaluated)
            </p>
            <p className="text-ink-2 mt-1">{s.metadata.intended_outcome}</p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Identities">
          <Table label="Identities" columns={["Name", "Type", "Id"]}>
            {[
              ...s.principals.map((p) => ({ ...p, type: p.kind })),
              ...s.roles.map((r) => ({ ...r, type: "role" })),
            ].map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-1.5">{e.name}</td>
                <td className="text-ink-2 px-3 py-1.5">{e.type}</td>
                <td className="px-3 py-1.5">
                  <IdTag>{e.id}</IdTag>
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel title="Resources">
          <Table label="Resources" columns={["Name", "Sensitivity", "Id"]}>
            {s.resources.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5">
                  {r.name}
                  <span className="text-ink-3 block text-xs">{r.kind.replace("_", " ")}</span>
                </td>
                <td className="px-3 py-1.5">
                  <Badge
                    tone={
                      SENSITIVITY_TONE[r.sensitivity as keyof typeof SENSITIVITY_TONE] ?? "neutral"
                    }
                  >
                    {r.sensitivity}
                  </Badge>
                </td>
                <td className="px-3 py-1.5">
                  <IdTag>{r.id}</IdTag>
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel title="Policies">
          <Table label="Policies" columns={["Policy", "Attached to", "Statements"]}>
            {s.policies.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="px-3 py-1.5">{p.name}</td>
                <td className="text-ink-2 px-3 py-1.5">
                  {p.attached_to.map((id) => nameOf(s, id)).join(", ")}
                </td>
                <td className="tabular px-3 py-1.5 font-mono">{p.statements.length}</td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel title="Modeled relationships">
          {s.relationships.length === 0 ? (
            <p className="text-ink-2 p-3 text-sm">None declared.</p>
          ) : (
            <ul className="divide-hair divide-y">
              {s.relationships.map((r) => (
                <li key={r.id} className="px-3 py-2 text-sm">
                  {nameOf(s, r.source)} → {nameOf(s, r.target)}
                  <p className="text-ink-2 text-xs">{r.description}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

export function ScenariosPage() {
  const { list, selectedId, select } = useActiveScenario();

  return (
    <>
      <PageHeader
        title="Scenarios"
        description="Synthetic infrastructure loaded from the API. The selected scenario is used on every page."
      />
      <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Available">
            {list.isPending && <LoadingRows rows={3} />}
            {list.error && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
            {list.data && list.data.items.length === 0 && (
              <p className="text-ink-2 p-3 text-sm">No scenarios found.</p>
            )}
            <ul className="divide-hair divide-y">
              {list.data?.items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={s.id === selectedId}
                    onClick={() => select(s.id)}
                    className={`block w-full px-3 py-2.5 text-left transition-colors duration-150 ${
                      s.id === selectedId
                        ? "bg-active shadow-[inset_2px_0_0_var(--color-signal)]"
                        : "hover:bg-raised"
                    }`}
                  >
                    <span className="block text-sm font-medium">{s.name}</span>
                    <span className="text-ink-2 tabular mt-0.5 block text-xs">
                      {plural(s.principal_count, "principal", "principals")} ·{" "}
                      {plural(s.role_count, "role", "roles")} ·{" "}
                      {plural(s.resource_count, "resource", "resources")} ·{" "}
                      {plural(s.policy_count, "policy", "policies")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          {list.data && list.data.invalid.length > 0 && (
            <div
              role="alert"
              className="border-critical/40 bg-critical/10 rounded-md border p-3 text-xs"
            >
              <p className="text-critical font-medium">Invalid scenarios</p>
              <ul className="mt-1 space-y-1">
                {list.data.invalid.map((i) => (
                  <li key={i.id}>
                    <span className="font-mono">{i.id}</span>: {i.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {selectedId ? <Detail /> : <p className="text-ink-2 text-sm">Select a scenario.</p>}
      </div>
    </>
  );
}
