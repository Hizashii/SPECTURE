import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// The first import of the lazy graph chunk (React Flow) can exceed the 1s default.
configure({ asyncUtilTimeout: 5000 });

// jsdom lacks the layout APIs React Flow relies on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
