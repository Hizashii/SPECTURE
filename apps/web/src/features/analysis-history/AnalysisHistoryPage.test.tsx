import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ANALYSES, mockApi, renderApp, WITH_ANALYSIS } from "../../test/utils";

describe("AnalysisHistoryPage", () => {
  it("explains the empty state", async () => {
    mockApi();
    renderApp("/history");
    expect(await screen.findByRole("heading", { name: "No analyses yet" })).toBeInTheDocument();
    expect(screen.getByText(/No simulations yet/)).toBeInTheDocument();
  });

  it("lists stored analyses and simulations", async () => {
    mockApi({
      ...WITH_ANALYSIS,
      "/analyses?scenario_id=demo": ANALYSES,
      "/simulations?scenario_id=demo": {
        body: {
          items: [
            {
              id: "s",
              scenario_id: "demo",
              created_at: "2026-10-10T12:05:00Z",
              verdict: "breaks_legitimate_access",
              change_count: 2,
            },
          ],
        },
      },
    });
    renderApp("/history");
    const analyses = await screen.findByRole("table", { name: "Analyses" });
    expect(within(analyses).getByText("v0.1.0")).toBeInTheDocument();
    const sims = await screen.findByRole("table", { name: "Simulations" });
    expect(within(sims).getByText("Breaks legitimate access")).toBeInTheDocument();
  });

  it("opens a stored analysis in the findings view", async () => {
    mockApi(WITH_ANALYSIS);
    renderApp("/history");
    await userEvent.click(await screen.findByRole("button", { name: /Viewing|Open/ }));
    expect(await screen.findByRole("heading", { name: "Alice → Main DB" })).toBeInTheDocument();
  });
});
