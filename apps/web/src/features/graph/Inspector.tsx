import { X } from "lucide-react";
import type { ReactNode } from "react";

import { EvidenceList } from "../../components/Evidence";
import { Badge, Button, IdTag, KeyValue, Panel, type Tone } from "../../components/ui";
import type { Scenario } from "../../lib/schemas";
import { nameOf } from "../scenarios/lookup";
import { EDGE_META, KIND_META } from "./meta";
import type { EntityEdge, EntityNode } from "./model";

const DECISION_TONE: Record<string, Tone> = {
  ALLOW: "secure",
  DENY: "critical",
  NOT_ALLOWED: "high",
  UNSUPPORTED: "unsupported",
};

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Button
      variant="ghost"
      className="!h-6 !px-1.5 xl:hidden"
      onClick={onClose}
      aria-label="Close inspector"
    >
      <X size={14} aria-hidden />
    </Button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-hair border-t">
      <h3 className="px-3 pt-3 text-sm font-semibold">{title}</h3>
      {hint && <p className="text-ink-3 px-3 text-xs">{hint}</p>}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function NodeInspector({
  scenario,
  node,
  analyzed,
  onClose,
}: {
  scenario: Scenario;
  node: EntityNode;
  analyzed: boolean;
  onClose: () => void;
}) {
  const meta = KIND_META[node.kind];
  const role = scenario.roles.find((r) => r.id === node.id);
  const trustedBy = scenario.roles.filter((r) => r.trusted_identities.includes(node.id));
  const rels = scenario.relationships.filter((r) => r.source === node.id || r.target === node.id);
  const statements = scenario.policies
    .filter((p) => p.attached_to.includes(node.id))
    .flatMap((p) => p.statements.map((st) => ({ policy: p, st })));

  return (
    <Panel
      title={node.name}
      as="aside"
      className="h-full"
      actions={<CloseButton onClose={onClose} />}
    >
      <KeyValue
        items={[
          ["Type", meta.label],
          ["Id", <IdTag key="id">{node.id}</IdTag>],
          ...(node.sensitivity
            ? ([["Sensitivity", <Badge key="s">{node.sensitivity}</Badge>]] as [
                string,
                ReactNode,
              ][])
            : []),
        ]}
      />
      {role && (
        <Section title="Trust policy" hint="Identities listed as allowed to assume this role.">
          <ul className="space-y-1">
            {role.trusted_identities.length === 0 && (
              <li className="text-ink-2 text-sm">None listed</li>
            )}
            {role.trusted_identities.map((id) => (
              <li key={id} className="flex items-center justify-between gap-2 text-sm">
                {nameOf(scenario, id)} <IdTag>{id}</IdTag>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {trustedBy.length > 0 && (
        <Section title="Listed in trust of">
          <ul className="space-y-1">
            {trustedBy.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                {r.name} <IdTag>{r.id}</IdTag>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {rels.length > 0 && (
        <Section title="Modeled relationships">
          <ul className="space-y-2 text-sm">
            {rels.map((r) => (
              <li key={r.id}>
                {nameOf(scenario, r.source)} → {nameOf(scenario, r.target)}
                <p className="text-ink-2 text-xs">{r.description}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {statements.length > 0 && (
        <Section title="Attached policy statements">
          <ul className="space-y-2">
            {statements.map(({ policy, st }) => (
              <li
                key={`${policy.id}/${st.sid}`}
                className="bg-nav border-hair rounded border p-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={st.effect === "Deny" ? "critical" : "secure"}>{st.effect}</Badge>
                  <span className="text-ink-3 truncate">
                    {policy.name} / {st.sid}
                  </span>
                </div>
                <p className="mt-1.5 font-mono break-words">{st.actions.join(", ")}</p>
                <p className="text-ink-2 font-mono break-words">on {st.resources.join(", ")}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {!analyzed && (
        <Section title="Authorization evidence">
          <p className="text-ink-2 text-xs">
            Run an analysis to see which transitions the engine allows or rejects, with the evidence
            behind each.
          </p>
        </Section>
      )}
    </Panel>
  );
}

export function EdgeInspector({
  scenario,
  edge,
  onClose,
}: {
  scenario: Scenario;
  edge: EntityEdge;
  onClose: () => void;
}) {
  const meta = EDGE_META[edge.kind];
  return (
    <Panel
      title="Transition"
      as="aside"
      className="h-full"
      actions={
        <>
          <Badge
            tone={
              edge.kind === "rejected"
                ? "critical"
                : edge.kind === "authorized"
                  ? "signal"
                  : "neutral"
            }
          >
            {meta.label}
          </Badge>
          <CloseButton onClose={onClose} />
        </>
      }
    >
      <KeyValue
        items={[
          ["From", `${nameOf(scenario, edge.source)}`],
          ["To", `${nameOf(scenario, edge.target)}`],
          ...(edge.actions.length
            ? ([
                [
                  "Actions",
                  <span key="a" className="font-mono text-xs break-words">
                    {edge.actions.join(", ")}
                  </span>,
                ],
              ] as [string, ReactNode][])
            : []),
          ...(edge.decision
            ? ([
                [
                  "Decision",
                  <Badge key="d" tone={DECISION_TONE[edge.decision] ?? "neutral"}>
                    {edge.decision}
                  </Badge>,
                ],
              ] as [string, ReactNode][])
            : []),
        ]}
      />
      {edge.reason && (
        <Section title="Why">
          <p className="text-sm">{edge.reason}</p>
        </Section>
      )}
      <Section
        title="Evidence"
        hint="The scenario entries this decision rests on, resolved from the scenario."
      >
        <EvidenceList scenario={scenario} evidence={edge.evidence} />
      </Section>
      <section className="border-hair border-t p-3">
        <p className="text-ink-3 text-xs">
          Evaluated against the modeled IAM subset only. This is not proof of real-world
          exploitability.
        </p>
      </section>
    </Panel>
  );
}
