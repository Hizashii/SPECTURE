import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { mockApi, renderApp, WITH_ANALYSIS } from "../../test/utils";

describe("GraphPage", () => {
  it("without an analysis it says it shows declared structure only", async () => {
    mockApi();
    renderApp("/graph");
    expect(await screen.findByText("Inventory view · not evaluated")).toBeInTheDocument();
    expect(screen.getByText(/No analysis yet/)).toBeInTheDocument();
  });

  it("with an analysis it labels the view as engine output and lists findings", async () => {
    mockApi(WITH_ANALYSIS);
    renderApp("/graph");
    expect(await screen.findByText("Engine analysis")).toBeInTheDocument();
    const explorer = screen.getByRole("region", { name: "Explorer" });
    expect(await within(explorer).findByText("alice → db")).toBeInTheDocument();
  });

  it("selecting a node in the explorer opens its inspector", async () => {
    mockApi(WITH_ANALYSIS);
    renderApp("/graph");
    const explorer = await screen.findByRole("region", { name: "Explorer" });
    await userEvent.click(await within(explorer).findByRole("button", { name: "Role A" }));
    const inspector = await screen.findByRole("complementary", { name: "Role A" });
    expect(within(inspector).getByText("IAM role")).toBeInTheDocument();
    expect(within(inspector).getByText("Trust policy")).toBeInTheDocument();
  });

  it("lets small screens select a node without the side explorer", async () => {
    mockApi(WITH_ANALYSIS);
    renderApp("/graph");
    await userEvent.selectOptions(await screen.findByLabelText("Select a node"), "role-a");
    expect(await screen.findByRole("complementary", { name: "Role A" })).toBeInTheDocument();
  });

  it("filters the explorer", async () => {
    mockApi(WITH_ANALYSIS);
    renderApp("/graph");
    const explorer = await screen.findByRole("region", { name: "Explorer" });
    await userEvent.type(await within(explorer).findByLabelText("Filter nodes"), "main");
    expect(within(explorer).getByRole("button", { name: "Main DB" })).toBeInTheDocument();
    expect(within(explorer).queryByRole("button", { name: "Alice" })).not.toBeInTheDocument();
  });

  it("reports a failed analysis load instead of drawing a partial graph", async () => {
    mockApi({
      ...WITH_ANALYSIS,
      "/analyses/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/graph": {
        status: 500,
        body: { error: { code: "internal_error", message: "Boom." } },
      },
    });
    renderApp("/graph");
    expect(await screen.findByText("Boom.")).toBeInTheDocument();
  });
});
