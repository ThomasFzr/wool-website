import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    globalSetup: ["tests/globalSetup.ts"],
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
    unstubEnvs: true,
    testTimeout: 20000,
    hookTimeout: 60000,
    coverage: {
      provider: "v8",
      // La logique (lib, modèles, routes API, contexts, hooks) doit être couverte à 100 %.
      // Les pages et composants sont couverts par les tests e2e Playwright (tests/e2e).
      include: [
        "lib/**/*.ts",
        "models/**/*.ts",
        "app/**/route.ts",
        "app/api/**/*.ts",
        "contexts/**/*.tsx",
        "hooks/**/*.ts",
        "proxy.ts",
      ],
      reporter: ["text", "html", "json-summary"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
