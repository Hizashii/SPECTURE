import type { Change, Verdict } from "../../lib/schemas";
import type { Tone } from "../../components/ui";

export const VERDICT: Record<Verdict, { title: string; tone: Tone; text: string }> = {
  effective: {
    title: "Effective under the modeled rules",
    tone: "secure",
    text: "No findings remain, every security objective holds, and no legitimate access was lost.",
  },
  partial: {
    title: "Partially effective",
    tone: "high",
    text: "Some paths were removed, but findings remain. The remaining paths are listed below.",
  },
  ineffective: {
    title: "No effect on the findings",
    tone: "critical",
    text: "The change did not remove any path to a sensitive resource.",
  },
  breaks_legitimate_access: {
    title: "Breaks legitimate access",
    tone: "critical",
    text: "Access that worked before no longer works. Removing a path is not a fix if it breaks what must keep working.",
  },
  introduces_findings: {
    title: "Introduces new findings",
    tone: "critical",
    text: "The change opens a path that did not exist before.",
  },
  inconclusive: {
    title: "Inconclusive",
    tone: "high",
    text: "A search limit was reached, so the engine cannot certify the result. Treat it as unproven.",
  },
  nothing_to_remediate: {
    title: "Nothing to remediate",
    tone: "neutral",
    text: "The baseline has no findings or violated objectives, so there is nothing for this change to fix.",
  },
};

export function describeChange(c: Change): string {
  switch (c.kind) {
    case "remove_statement":
      return `Remove statement ${c.policy_id} / ${c.sid}`;
    case "replace_statement":
      return `Replace ${c.policy_id} / ${c.sid}: ${c.effect} ${c.actions.join(", ")} on ${c.resources.join(", ")}`;
    case "remove_trust":
      return `Remove ${c.identity_id} from the trust of ${c.role_id}`;
    case "detach_policy":
      return `Detach ${c.policy_id} from ${c.identity_id}`;
  }
}

/** Key of the thing a change touches, so the UI can mark it as pending. */
export function targetKey(c: Change): string {
  switch (c.kind) {
    case "remove_statement":
    case "replace_statement":
      return `stmt:${c.policy_id}/${c.sid}`;
    case "remove_trust":
      return `trust:${c.role_id}/${c.identity_id}`;
    case "detach_policy":
      return `attach:${c.policy_id}/${c.identity_id}`;
  }
}
