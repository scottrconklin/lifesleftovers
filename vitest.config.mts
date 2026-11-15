import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["**/*.db.test.ts"],
        },
      },
      {
        // Needs the local stack: `pnpm db:start && pnpm db:migrate`.
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["src/**/*.db.test.ts"],
          setupFiles: ["./vitest.db-setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
