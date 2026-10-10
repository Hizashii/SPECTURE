import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockApi, renderApp, SCENARIO_SUMMARY } from "../../test/utils";

describe("ScenariosPage", () => {
  it("shows scenario metadata from the API", async () => {
    mockApi();
    renderApp("/scenarios");
    const row = await screen.findByRole("button", { name: /Demo Scenario/ });
    expect(row).toHaveTextContent("1 principal · 2 roles · 3 resources · 4 policies");
  });

  it("shows the selected scenario's contents and marks the outcome as not evaluated", async () => {
    mockApi();
    renderApp("/scenarios");
    expect(await screen.findByText("Main DB")).toBeInTheDocument();
    expect(
      screen.getByText(/Intended outcome \(documentation, not evaluated\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("Role A opens the DB.")).toBeInTheDocument();
  });

  it("selecting a scenario loads its detail", async () => {
    mockApi({
      "/scenarios": {
        body: {
          items: [SCENARIO_SUMMARY, { ...SCENARIO_SUMMARY, id: "second", name: "Second" }],
          invalid: [],
        },
      },
      "/scenarios/second": {
        status: 404,
        body: { error: { code: "scenario_not_found", message: "Gone." } },
      },
    });
    renderApp("/scenarios");
    await userEvent.click(await screen.findByRole("button", { name: /Second/ }));
    expect(await screen.findByText("Gone.")).toBeInTheDocument();
  });

  it("shows the API's structured error message", async () => {
    mockApi({
      "/scenarios": {
        status: 500,
        body: { error: { code: "scenario_invalid", message: "Broken." } },
      },
    });
    renderApp("/scenarios");
    expect(await screen.findByText("Broken.")).toBeInTheDocument();
    expect(screen.getByText("scenario_invalid")).toBeInTheDocument();
  });

  it("surfaces invalid scenarios instead of hiding them", async () => {
    mockApi({
      "/scenarios": {
        body: { items: [], invalid: [{ id: "bad", error: "schema_version: invalid" }] },
      },
    });
    renderApp("/scenarios");
    expect(await screen.findByText("Invalid scenarios")).toBeInTheDocument();
    expect(screen.getByText("No scenarios found.")).toBeInTheDocument();
  });

  it("rejects responses that do not match the contract", async () => {
    mockApi({ "/scenarios": { body: { unexpected: true } } });
    renderApp("/scenarios");
    expect(await screen.findByText("The API returned an unexpected response.")).toBeInTheDocument();
  });

  it("reports an unreachable API", async () => {
    mockApi({ "/scenarios": () => Promise.reject(new Error("down")) });
    renderApp("/scenarios");
    expect(await screen.findByText("Cannot reach the SPECTRE API.")).toBeInTheDocument();
  });
});
