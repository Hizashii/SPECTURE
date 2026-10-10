import { expect, test, type Page } from "@playwright/test";

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

async function useScenario(page: Page, name: RegExp) {
  await page.goto("/scenarios");
  await page.getByRole("button", { name }).click();
}

async function runAnalysis(page: Page) {
  await page.getByRole("button", { name: "Run analysis" }).click();
  await expect(page.getByText(/Analysis complete/)).toBeVisible();
}

test("app loads, shows API and engine state, and navigates", async ({ page }) => {
  await page.goto("/");
  await expect(nav(page)).toBeVisible();
  await expect(page.getByText(/API: v/)).toBeVisible();
  await expect(page.getByText(/Engine v/)).toBeVisible();

  await nav(page).getByRole("link", { name: "Findings" }).click();
  await expect(page).toHaveURL(/\/findings$/);
  await expect(page).toHaveTitle(/Findings/);
});

test("scenario explorer shows metadata returned by the backend", async ({ page }) => {
  await page.goto("/scenarios");
  await expect(page.getByRole("button", { name: /Northstar Financial/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Harbor Commerce/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Helios Platform/ })).toBeVisible();

  await page.getByRole("button", { name: /Northstar Financial/ }).click();
  await expect(page.getByText(/Intended outcome \(documentation, not evaluated\)/)).toBeVisible();
  await expect(page.getByRole("cell", { name: /Customer database/ })).toBeVisible();
});

test("analysis finds the documented Northstar chain, with evidence on every step", async ({
  page,
}) => {
  await useScenario(page, /Northstar Financial/);
  await runAnalysis(page);
  await nav(page).getByRole("link", { name: "Findings" }).click();

  await expect(
    page.getByRole("heading", { name: /Alice \(developer\) → Customer database/ }),
  ).toBeVisible();
  const path = page.getByRole("region", { name: "Path 1" });
  await expect(path.getByText("(4 steps)")).toBeVisible();
  await expect(path.getByText("Modeled prerequisite")).toBeVisible();
  await path
    .getByText(/Evidence \(\d\)/)
    .first()
    .click();
  await expect(path.getByText(/Trust entry|Policy statement/).first()).toBeVisible();
});

test("graph draws the engine's typed edges", async ({ page }) => {
  await useScenario(page, /Helios Platform/);
  await runAnalysis(page);
  await nav(page).getByRole("link", { name: "Attack graph" }).click();
  await expect(page.getByText("Engine analysis")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
  await expect(page.getByLabel(/Rejected \(\d+\)/)).toBeVisible();
});

test("a fix is judged on more than one path disappearing", async ({ page }) => {
  await useScenario(page, /Northstar Financial/);
  await runAnalysis(page);
  await nav(page).getByRole("link", { name: "Remediation lab" }).click();

  // Cutting the chain resolves the findings and keeps legitimate access.
  await page.getByRole("button", { name: /CI deployer permissions/ }).click();
  await page.getByRole("button", { name: "Remove statement assume-runtime" }).click();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByText("Effective under the modeled rules")).toBeVisible();

  // Removing the developer's legitimate permission also removes the path, but is not a fix.
  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("button", { name: /Developer may assume the CI deployer/ }).click();
  await page.getByRole("button", { name: "Remove statement assume-ci" }).click();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByText("Breaks legitimate access", { exact: true })).toBeVisible();
});

test("history lists the runs", async ({ page }) => {
  await useScenario(page, /Northstar Financial/);
  await runAnalysis(page);
  await nav(page).getByRole("link", { name: "Analysis history" }).click();
  await expect(page.getByRole("table", { name: "Analyses" })).toBeVisible();
});
