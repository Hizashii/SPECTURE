import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockApi, posted, renderApp, SCENARIO, simulation } from "../../test/utils";

async function stageRemoval() {
  await userEvent.click(await screen.findByRole("button", { name: "Remove statement connect" }));
}

describe("RemediationPage", () => {
  it("lets small screens pick a policy without the side list", async () => {
    mockApi({
      "/scenarios/demo": {
        body: {
          ...SCENARIO,
          policies: [
            ...SCENARIO.policies,
            {
              id: "p2",
              name: "Second policy",
              attached_to: ["role-a"],
              statements: [
                { sid: "other", effect: "Allow", actions: ["s3:Get*"], resources: ["db"] },
              ],
            },
          ],
        },
      },
    });
    renderApp("/remediation");
    const picker = await screen.findByLabelText("Policy");
    await userEvent.selectOptions(picker, "p2");
    expect(
      await screen.findByRole("button", { name: "Remove statement other" }),
    ).toBeInTheDocument();
  });

  it("shows the scenario's real policy statements", async () => {
    mockApi();
    renderApp("/remediation");
    expect(await screen.findByText("rds:Connect")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run simulation" })).toBeDisabled();
    expect(screen.getByText("Stage at least one change to run a simulation.")).toBeInTheDocument();
  });

  it("stages a change, sends it to the API and shows the verdict with the before/after table", async () => {
    const fetchMock = mockApi({
      "POST /simulations": { status: 201, body: simulation("effective") },
    });
    renderApp("/remediation");
    await stageRemoval();
    expect(screen.getByText("Remove statement p1 / connect")).toBeInTheDocument();
    expect(screen.getByText("Change staged")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(posted(fetchMock, "/simulations")).toEqual([
      {
        scenario_id: "demo",
        changes: [{ kind: "remove_statement", policy_id: "p1", sid: "connect" }],
      },
    ]);
    const result = await screen.findByRole("region", { name: "Simulation result" });
    expect(within(result).getByText("Effective under the modeled rules")).toBeInTheDocument();
    const table = within(result).getByRole("table", { name: "Before and after" });
    expect(within(table).getByRole("row", { name: /Findings 1 0/ })).toBeInTheDocument();
    expect(within(result).getByText("Policy diff")).toBeInTheDocument();
  });

  it("does not present a path-removing change that breaks legitimate access as a success", async () => {
    mockApi({
      "POST /simulations": {
        status: 201,
        body: simulation("breaks_legitimate_access", {
          broken_legitimate_access: [
            {
              id: "la1",
              principal: "alice",
              action: "rds:Connect",
              resource: "db",
              passes: false,
              decision: { decision: "NOT_ALLOWED", reason: "no statement grants it", evidence: [] },
            },
          ],
        }),
      },
    });
    renderApp("/remediation");
    await stageRemoval();
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    const result = await screen.findByRole("region", { name: "Simulation result" });
    expect(within(result).getByText("Breaks legitimate access")).toBeInTheDocument();
    expect(within(result).getByText("Legitimate access now broken")).toBeInTheDocument();
    expect(within(result).queryByText(/Effective/)).not.toBeInTheDocument();
  });

  it("lists residual paths for a partial fix", async () => {
    mockApi({
      "POST /simulations": {
        status: 201,
        body: simulation("partial", {
          remaining_findings: ["finding:alice>db"],
          after: { ...simulation("x").before },
        }),
      },
    });
    renderApp("/remediation");
    await stageRemoval();
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    const result = await screen.findByRole("region", { name: "Simulation result" });
    const residual = within(result).getByText("Residual risk").closest("section")!;
    expect(within(residual).getByText("Alice → Role A → Main DB")).toBeInTheDocument();
  });

  it("edits a statement's scope and stages a replacement", async () => {
    const fetchMock = mockApi({
      "POST /simulations": { status: 201, body: simulation("effective") },
    });
    renderApp("/remediation");
    await userEvent.click(await screen.findByRole("button", { name: "Edit scope" }));
    const resources = screen.getByLabelText(/Resources/);
    await userEvent.clear(resources);
    await userEvent.type(resources, "db");
    await userEvent.click(screen.getByRole("button", { name: "Stage change" }));
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(posted(fetchMock, "/simulations")).toEqual([
      {
        scenario_id: "demo",
        changes: [
          {
            kind: "replace_statement",
            policy_id: "p1",
            sid: "connect",
            effect: "Allow",
            actions: ["rds:Connect"],
            resources: ["db"],
          },
        ],
      },
    ]);
  });

  it("stages trust removal and policy detachment, and can unstage and reset", async () => {
    mockApi();
    renderApp("/remediation");
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove alice from the trust of role-a" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Detach p1 from alice" }));
    expect(screen.getByText("Staged changes (2)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Unstage: Detach p1 from alice/ }));
    expect(screen.getByText("Staged changes (1)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("Staged changes (0)")).toBeInTheDocument();
  });

  it("clears a stale result when the staged changes change", async () => {
    mockApi({ "POST /simulations": { status: 201, body: simulation("effective") } });
    renderApp("/remediation");
    await stageRemoval();
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    await screen.findByRole("region", { name: "Simulation result" });
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.queryByRole("region", { name: "Simulation result" })).not.toBeInTheDocument();
  });

  it("notifies when the API rejects the change", async () => {
    mockApi({
      "POST /simulations": {
        status: 422,
        body: { error: { code: "invalid_change", message: "unknown policy 'p1'" } },
      },
    });
    renderApp("/remediation");
    await stageRemoval();
    await userEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(await screen.findByText("unknown policy 'p1'")).toBeInTheDocument();
  });
});
