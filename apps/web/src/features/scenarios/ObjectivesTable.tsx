import { Badge, IdTag, Table } from "../../components/ui";
import type { ObjectiveResult, Scenario } from "../../lib/schemas";

/** Objectives are scenario-declared expectations; status comes from an analysis, if any. */
export function ObjectivesTable({
  scenario,
  results,
}: {
  scenario: Scenario;
  results?: ObjectiveResult[];
}) {
  if (scenario.objectives.length === 0) {
    return <p className="text-ink-2 p-3 text-sm">No objectives declared.</p>;
  }
  const byId = new Map(results?.map((r) => [r.objective_id, r]));
  return (
    <Table label="Security objectives" columns={["Objective", "Principal", "Target", "Status"]}>
      {scenario.objectives.map((o) => {
        const r = byId.get(o.id);
        return (
          <tr key={o.id} className="hover:bg-raised/50 align-top">
            <td className="max-w-xs px-3 py-2">{o.description}</td>
            <td className="px-3 py-2">
              <IdTag>{o.principal}</IdTag>
            </td>
            <td className="px-3 py-2">
              <IdTag>{o.target}</IdTag>
            </td>
            <td className="px-3 py-2">
              {!r ? (
                <Badge>Not evaluated</Badge>
              ) : r.status === "violated" ? (
                <Badge tone="critical">Violated</Badge>
              ) : (
                <Badge tone={r.search_truncated ? "high" : "secure"}>
                  {r.search_truncated ? "Held (search limited)" : "Holds"}
                </Badge>
              )}
            </td>
          </tr>
        );
      })}
    </Table>
  );
}
