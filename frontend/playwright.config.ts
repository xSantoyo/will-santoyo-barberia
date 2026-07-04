import { defineConfig } from "@playwright/test";

/**
 * E2E del flujo completo de agendamiento.
 *
 * Requiere el stack corriendo (docker compose up, o backend en :8000 con seed
 * y frontend en :3000). Ver README para el paso a paso.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    screenshot: "only-on-failure",
  },
});
