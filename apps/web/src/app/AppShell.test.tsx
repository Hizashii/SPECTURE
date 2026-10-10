import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockApi, renderApp, SCENARIO_SUMMARY as SUMMARY } from "../test/utils";

describe("AppShell", () => {
  it("renders the brand and every main navigation link", () => {
    mockApi();
    renderApp();
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const label of [
      "Overview",
      "Attack graph",
      "Findings",
      "Remediation lab",
      "Scenarios",
      "Analysis history",
      "Settings",
    ]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText("SPECTRE")).toBeInTheDocument();
  });

  it("navigates between routes", async () => {
    mockApi();
    renderApp();
    await userEvent.click(screen.getByRole("link", { name: "Findings" }));
    expect(
      await screen.findByRole("heading", {
        name: "No analysis has been run for this scenario",
      }),
    ).toBeInTheDocument();
  });

  it("shows a 404 page for unknown routes", () => {
    mockApi();
    renderApp("/nope");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("shows API version and engine state once loaded", async () => {
    mockApi();
    renderApp();
    expect(await screen.findByText("API: v9.9.9")).toBeInTheDocument();
    expect(await screen.findByText("Engine: not implemented")).toBeInTheDocument();
  });

  it("shows the API as unreachable when health fails", async () => {
    mockApi({ "/health": () => Promise.reject(new Error("down")) });
    renderApp();
    expect(await screen.findByText("API: unreachable")).toBeInTheDocument();
  });

  it("keeps Run analysis disabled while the engine does not exist", () => {
    mockApi();
    renderApp();
    expect(screen.getByRole("button", { name: "Run analysis" })).toBeDisabled();
  });

  it("lets the user switch the active scenario from the top bar", async () => {
    mockApi({
      "/scenarios": {
        body: {
          items: [
            { ...SUMMARY, id: "demo", name: "Demo Scenario" },
            { ...SUMMARY, id: "other", name: "Other Scenario" },
          ],
          invalid: [],
        },
      },
    });
    renderApp();
    await screen.findByRole("option", { name: "Other Scenario" });
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "other");
    expect(select).toHaveValue("other");
  });

  it("reports backend capabilities on the overview", async () => {
    mockApi();
    renderApp();
    expect(await screen.findByText("Attack-path discovery")).toBeInTheDocument();
    expect(screen.getAllByText("not implemented").length).toBeGreaterThan(0);
  });

  it("shows the scenario's objectives as not evaluated", async () => {
    mockApi();
    renderApp();
    expect(await screen.findByText("Alice must not reach the DB.")).toBeInTheDocument();
    expect(screen.getAllByText("Not evaluated").length).toBeGreaterThan(0);
  });
});
