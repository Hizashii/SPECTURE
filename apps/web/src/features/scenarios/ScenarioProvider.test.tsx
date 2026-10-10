import { screen, waitFor } from "@testing-library/react";

import { mockApi, renderApp, SCENARIO_SUMMARY } from "../../test/utils";

const two = {
  "/scenarios": {
    body: {
      items: [
        SCENARIO_SUMMARY,
        { ...SCENARIO_SUMMARY, id: "northstar-financial", name: "Northstar" },
      ],
      invalid: [],
    },
  },
};

describe("ScenarioProvider", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to the flagship scenario when present", async () => {
    mockApi(two);
    renderApp("/");
    await screen.findByRole("option", { name: "Northstar" });
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("northstar-financial"));
  });

  it("restores the remembered scenario", async () => {
    localStorage.setItem("spectre.scenario", "demo");
    mockApi(two);
    renderApp("/");
    await screen.findByRole("option", { name: "Northstar" });
    expect(screen.getByRole("combobox")).toHaveValue("demo");
  });

  it("falls back when the remembered scenario no longer exists", async () => {
    localStorage.setItem("spectre.scenario", "deleted-long-ago");
    mockApi(two);
    renderApp("/");
    await screen.findByRole("option", { name: "Northstar" });
    expect(screen.getByRole("combobox")).toHaveValue("northstar-financial");
  });

  it("still works when localStorage throws", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mockApi();
    renderApp("/");
    await screen.findByRole("option", { name: "Demo Scenario" });
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("demo"));
    spy.mockRestore();
  });
});
