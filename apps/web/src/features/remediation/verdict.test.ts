import type { Verdict } from "../../lib/schemas";
import { describeChange, targetKey, VERDICT } from "./verdict";

describe("verdict copy", () => {
  it("only the 'effective' verdict is presented as success", () => {
    const all = Object.keys(VERDICT) as Verdict[];
    expect(all.filter((v) => VERDICT[v].tone === "secure")).toEqual(["effective"]);
  });

  it("never claims more than the modeled rules support", () => {
    expect(VERDICT.effective.title).toMatch(/modeled rules/);
    for (const v of Object.values(VERDICT)) {
      expect(`${v.title} ${v.text}`).not.toMatch(/\b(proven|verified|exploitable)\b|100%/i);
    }
  });
});

describe("change helpers", () => {
  it("describes every change kind", () => {
    expect(describeChange({ kind: "remove_statement", policy_id: "p", sid: "s" })).toContain(
      "p / s",
    );
    expect(
      describeChange({
        kind: "replace_statement",
        policy_id: "p",
        sid: "s",
        effect: "Allow",
        actions: ["s3:*"],
        resources: ["b"],
      }),
    ).toContain("Allow s3:* on b");
    expect(describeChange({ kind: "remove_trust", role_id: "r", identity_id: "i" })).toContain(
      "trust of r",
    );
    expect(describeChange({ kind: "detach_policy", policy_id: "p", identity_id: "i" })).toContain(
      "Detach p from i",
    );
  });

  it("removing and replacing the same statement target the same key", () => {
    expect(targetKey({ kind: "remove_statement", policy_id: "p", sid: "s" })).toBe(
      targetKey({
        kind: "replace_statement",
        policy_id: "p",
        sid: "s",
        effect: "Deny",
        actions: ["*"],
        resources: ["*"],
      }),
    );
  });
});
