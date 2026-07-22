import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// This project doesn't enable Vitest's `globals: true` (every test file explicitly imports
// `describe`/`it`/`expect` from "vitest" rather than relying on injected globals) --
// React Testing Library's automatic per-test cleanup specifically detects a GLOBAL
// `afterEach` to hook into, and finds none here, so it silently does nothing. Without this,
// each `render()` within a test file accumulates in the jsdom document rather than being
// unmounted between tests, causing queries like `getByText` to match multiple stale elements
// from earlier tests in the same file. Registering cleanup explicitly closes that gap.
afterEach(() => {
  cleanup();
});
