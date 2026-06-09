import { defineConfig } from "vitest/config";

// The core logic under test (filtering, parsing, error helpers) is pure and
// runtime-agnostic, so the default node environment is sufficient. The GitHub
// client and MCP wiring are exercised by the MCP Inspector smoke test.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
