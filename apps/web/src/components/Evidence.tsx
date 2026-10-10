import type { Evidence, Scenario } from "../lib/schemas";
import { Badge, CodeBlock, IdTag } from "./ui";

/** Resolves the cited statement, trust entry or relationship against the scenario. */
export function EvidenceList({ scenario, evidence }: { scenario: Scenario; evidence: Evidence[] }) {
  if (evidence.length === 0) return <p className="text-ink-3 text-xs">No evidence recorded.</p>;
  return (
    <ul className="space-y-2">
      {evidence.map((e, i) => {
        if (e.kind === "statement") {
          const policy = scenario.policies.find((p) => p.id === e.policy_id);
          const stmt = policy?.statements.find((s) => s.sid === e.sid);
          return (
            <li key={i} className="border-hair overflow-hidden rounded border">
              <div className="bg-nav flex flex-wrap items-center gap-2 px-2 py-1.5 text-xs">
                <Badge tone={e.effect === "Deny" ? "critical" : "secure"}>{e.effect}</Badge>
                <span className="text-ink-2">Policy statement</span>
                <IdTag>
                  {e.policy_id} / {e.sid}
                </IdTag>
              </div>
              {stmt && <CodeBlock label={`Statement ${e.policy_id}/${e.sid}`} value={stmt} />}
            </li>
          );
        }
        if (e.kind === "trust") {
          return (
            <li key={i} className="border-hair bg-nav rounded border px-2 py-1.5 text-xs">
              <p className="text-ink-2">Trust entry</p>
              <p className="mt-1">
                <IdTag>{e.role_id}</IdTag> lists <IdTag>{e.identity_id}</IdTag> in{" "}
                <span className="font-mono">trusted_identities</span>
              </p>
            </li>
          );
        }
        const rel = scenario.relationships.find((r) => r.id === e.relationship_id);
        return (
          <li key={i} className="border-hair bg-nav rounded border px-2 py-1.5 text-xs">
            <p className="text-ink-2">Modeled relationship</p>
            <p className="mt-1">
              <IdTag>{e.relationship_id}</IdTag>
            </p>
            {rel && <p className="text-ink-2 mt-1">{rel.description}</p>}
          </li>
        );
      })}
    </ul>
  );
}
