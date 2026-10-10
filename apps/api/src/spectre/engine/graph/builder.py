"""Turns a scenario into typed transitions (see README, "Graph and paths").

Edges are *candidates* that the policy evaluator has judged. Nothing here claims real-world
exploitability: only that the modeled rules permit or reject each transition.
"""

from spectre.domain.models import Scenario
from spectre.engine.graph.model import EdgeKind, GraphEdge, GraphNode, TransitionGraph
from spectre.engine.policy import (
    ASSUME_ROLE,
    AuthorizationDecision,
    Decision,
    Evidence,
    PolicyEvaluator,
    RelationshipEvidence,
    TrustEvidence,
    covers,
)

CREDENTIAL_READ = "secretsmanager:GetSecretValue"


def _edge(
    prefix: str, d: AuthorizationDecision, kind: EdgeKind, label: str, actions: tuple[str, ...]
) -> GraphEdge:
    return GraphEdge(
        id=f"{prefix}:{d.principal_id}>{d.resource_id}",
        source=d.principal_id,
        target=d.resource_id,
        kind=kind,
        label=label,
        actions=actions,
        decision=d.decision,
        reason=d.reason,
        evidence=d.evidence,
    )


def build_graph(scenario: Scenario, evaluator: PolicyEvaluator | None = None) -> TransitionGraph:
    ev = evaluator or PolicyEvaluator(scenario)
    nodes = (
        *(GraphNode(p.id, p.name, p.kind, "principal") for p in scenario.principals),
        *(GraphNode(r.id, r.name, "role", "role") for r in scenario.roles),
        *(GraphNode(r.id, r.name, r.kind, "resource", r.sensitivity) for r in scenario.resources),
    )
    identities = [p.id for p in scenario.principals] + [r.id for r in scenario.roles]
    credential_sources = {rel.source for rel in scenario.relationships}
    edges: list[GraphEdge] = []

    # 1. Inventory: who each role's trust policy lists.
    for role in scenario.roles:
        for ident in role.trusted_identities:
            edges.append(
                GraphEdge(
                    id=f"trust:{ident}>{role.id}",
                    source=ident,
                    target=role.id,
                    kind=EdgeKind.INVENTORY,
                    label="listed in trust",
                    evidence=(TrustEvidence(role.id, ident),),
                )
            )

    # 2. Role assumption. A rejected edge is only drawn when something relevant matched
    #    (a trust entry or a statement), so unrelated identity/role pairs stay silent.
    for ident in identities:
        for role in scenario.roles:
            if ident == role.id:
                continue
            d = ev.evaluate(ident, ASSUME_ROLE, role.id)
            if d.decision is Decision.ALLOW:
                edges.append(_edge("assume", d, EdgeKind.AUTHORIZED, "may assume", (ASSUME_ROLE,)))
            elif d.evidence:
                edges.append(_edge("assume", d, EdgeKind.REJECTED, "cannot assume", (ASSUME_ROLE,)))

    # 3. Resource access, judged per action pattern ("probe") named by the identity's Allows.
    for ident in identities:
        for res in scenario.resources:
            if res.id in credential_sources:
                continue  # judged by the concrete credential-read check below
            probes = _probes(ev, ident, res.id)
            decisions = [ev.evaluate(ident, probe, res.id) for probe in probes]
            allowed = [
                (p, d)
                for p, d in zip(probes, decisions, strict=True)
                if d.decision is Decision.ALLOW
            ]
            denied = [
                (p, d)
                for p, d in zip(probes, decisions, strict=True)
                if d.decision is Decision.DENY
            ]
            if allowed:
                edges.append(_combined(ident, res.id, EdgeKind.AUTHORIZED, "may access", allowed))
            elif denied:
                edges.append(_combined(ident, res.id, EdgeKind.REJECTED, "denied access", denied))

    # 4. Modeled credential access: reading the secret value, then the declared relationship.
    for rel in scenario.relationships:
        for ident in identities:
            d = ev.evaluate(ident, CREDENTIAL_READ, rel.source)
            if d.decision is Decision.ALLOW:
                edges.append(
                    _edge(
                        "credential", d, EdgeKind.AUTHORIZED, "may read secret", (CREDENTIAL_READ,)
                    )
                )
            elif d.evidence:
                edges.append(
                    _edge(
                        "credential", d, EdgeKind.REJECTED, "cannot read secret", (CREDENTIAL_READ,)
                    )
                )
        edges.append(
            GraphEdge(
                id=f"rel:{rel.id}",
                source=rel.source,
                target=rel.target,
                kind=EdgeKind.PREREQUISITE,
                label="modeled credential access",
                evidence=(RelationshipEvidence(rel.id),),
            )
        )

    return TransitionGraph(nodes, tuple(edges))


def _probes(ev: PolicyEvaluator, ident: str, resource_id: str) -> list[str]:
    """Action patterns from the identity's Allow statements that cover the resource, in order."""
    seen: dict[str, None] = {}
    for st in ev.statements_for(ident):
        if st.effect != "Allow" or not any(covers(r, resource_id) for r in st.resources):
            continue
        for action in st.actions:
            if action != ASSUME_ROLE:  # role assumption has its own edges
                seen.setdefault(action)
    return list(seen)


def _combined(
    ident: str,
    resource_id: str,
    kind: EdgeKind,
    label: str,
    judged: list[tuple[str, AuthorizationDecision]],
) -> GraphEdge:
    evidence: dict[Evidence, None] = {}
    for _, d in judged:
        for e in d.evidence:
            evidence.setdefault(e)
    first = judged[0][1]
    return GraphEdge(
        id=f"access:{ident}>{resource_id}",
        source=ident,
        target=resource_id,
        kind=kind,
        label=label,
        actions=tuple(p for p, _ in judged),
        decision=first.decision,
        reason=first.reason,
        evidence=tuple(evidence),
    )
