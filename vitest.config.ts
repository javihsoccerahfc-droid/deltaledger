import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "db/**/*.test.ts"],
    env: {
      DELTALEDGER_DB_PATH: ":memory:",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/core/**/*.ts", "src/domains/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
