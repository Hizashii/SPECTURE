import { screen } from "@testing-library/react";

import { mockApi, renderApp } from "../test/utils";

describe("RequireScenario", () => {
  it("shows an empty state, not a skeleton forever, when no scenario exists", async () => {
    mockApi({ "/scenarios": { body: { items: [], invalid: [] } } });
    renderApp("/");
    expect(
      await screen.findByRole("heading", { name: "No scenarios available" }),
    ).toBeInTheDocument();
  });

  it("surfaces a scenario-list error with retry on every scenario page", async () => {
    mockApi({
      "/scenarios": { status: 500, body: { error: { code: "internal_error", message: "Down." } } },
    });
    for (const path of ["/", "/graph", "/findings", "/remediation", "/history"]) {
      renderApp(path);
      expect(await screen.findByText("Down.")).toBeInTheDocument();
      screen.getByRole("button", { name: "Retry" });
      document.body.innerHTML = "";
    }
  });

  it("keeps Settings reachable when scenarios fail", async () => {
    mockApi({
      "/scenarios": { status: 500, body: { error: { code: "internal_error", message: "Down." } } },
    });
    renderApp("/settings");
    expect(await screen.findByText("API version")).toBeInTheDocument();
  });
});
