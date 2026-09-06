import { defineConfig } from "vitest/config";
import path from "node:path";

// Separate from vitest.config.ts on purpose: these tests need a real
// Postgres instance (DATABASE_URL, default postgres://postgres:postgres@127.0.0.1:5432/postgres)
// and each test file provisions/tears down its own database, so they're
// slower and run sequentially. Keeping them out of `npm test` means the fast
// unit suite never silently needs a database to pass.
export default defineConfig({
  test: {
    environment: "node",
    include: ["db-tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
