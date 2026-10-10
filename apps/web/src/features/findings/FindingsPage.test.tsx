import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ANALYSES,
  ANALYSIS_DETAIL,
  ANALYSIS_SUMMARY,
  FINDING,
  mockApi,
  posted,
  renderApp,
  WITH_ANALYSIS,
} from "../../test/utils";

describe("FindingsPage", () => {
  it("offers to run an analysis when none exists and says absence is not safety", async () => {
    mockApi();
    renderApp("/findings");
    expect(
      await screen.findByRole("heading", { name: "No analysis has been run for this scenario" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not mean\s+the scenario is safe/)).toBeInTheDocument();
  });

  it("runs an analysis from the empty state", async () => {
    const fetchMock = mockApi({
      "POST /analyses": { status: 201, body: ANALYSIS_SUMMARY },
    });
    renderApp("/findings");
    const buttons = await screen.findAllByRole("button", { name: "Run analysis" });
    await userEvent.click(buttons[buttons.length - 1]!);
    expect(posted(fetchMock, "/analyses")).toEqual([{ scenario_id: "demo" }]);
  });

  it("lists findings with severity and shows each path step with its evidence", async () => {
    mockApi(WITH_ANALYSIS);
    renderApp("/findings");
    expect(await screen.findByRole("heading", { name: "Alice → Main DB" })).toBeInTheDocument();
    expect(screen.getAllByText("critical").length).toBeGreaterThan(0);

    const path = screen.getByRole("region", { name: "Path 1" });
    expect(within(path).getByText("Alice → Role A")).toBeInTheDocument();
    expect(within(path).getByText("Role A → Main DB")).toBeInTheDocument();
    expect(within(path).getAllByText("Allowed")).toHaveLength(2);

    // evidence is resolved against the scenario, not just named
    await userEvent.click(within(path).getAllByText(/Evidence \(1\)/)[1]!);
    expect(within(path).getByRole("region", { name: "Statement p1/connect" })).toHaveTextContent(
      "rds:Connect",
    );
  });

  it("states that no paths were found without claiming safety", async () => {
    mockApi({
      ...WITH_ANALYSIS,
      [`/analyses/${ANALYSIS_SUMMARY.id}/findings`]: { body: { items: [] } },
    });
    renderApp("/findings");
    expect(
      await screen.findByRole("heading", { name: "No paths found within the modeled rules" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not a guarantee about real AWS/)).toBeInTheDocument();
  });

  it("flags an inconclusive search when no paths were found but a limit was hit", async () => {
    mockApi({
      "/analyses?scenario_id=demo": {
        body: { items: [{ ...ANALYSIS_SUMMARY, truncated: true, finding_count: 0 }] },
      },
      [`/analyses/${ANALYSIS_SUMMARY.id}`]: { body: { ...ANALYSIS_DETAIL, truncated: true } },
      [`/analyses/${ANALYSIS_SUMMARY.id}/findings`]: { body: { items: [] } },
    });
    renderApp("/findings");
    expect(
      await screen.findByText(/the search hit a limit, so this is not conclusive/),
    ).toBeInTheDocument();
  });

  it("warns when the per-pair path limit truncated a finding", async () => {
    mockApi({
      ...WITH_ANALYSIS,
      [`/analyses/${ANALYSIS_SUMMARY.id}/findings`]: {
        body: { items: [{ ...FINDING, truncated: true }] },
      },
    });
    renderApp("/findings");
    expect(await screen.findByRole("note")).toHaveTextContent("more paths may exist");
  });

  it("shows an error with retry when findings fail to load", async () => {
    mockApi({
      "/analyses?scenario_id=demo": ANALYSES,
      [`/analyses/${ANALYSIS_SUMMARY.id}`]: { body: ANALYSIS_DETAIL },
      [`/analyses/${ANALYSIS_SUMMARY.id}/findings`]: {
        status: 404,
        body: { error: { code: "analysis_not_found", message: "Gone." } },
      },
    });
    renderApp("/findings");
    expect(await screen.findByText("Gone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
