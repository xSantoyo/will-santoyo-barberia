// Capturas del sistema vigente: home, los 3 pasos del wizard y el panel,
// en desktop (1280) y móvil (375).
// Uso: node e2e/capturas.mjs
import { chromium } from "@playwright/test";

const OUT = "../docs/screenshots/v3";
const BASE = "http://localhost:3000";

const browser = await chromium.launch();

async function capturarFlujo(ancho, alto, sufijo) {
  const page = await browser.newPage({ viewport: { width: ancho, height: alto } });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // deja asentar la entrada del hero
  await page.screenshot({ path: `${OUT}/home-${sufijo}.png` });

  await page.goto(`${BASE}/agendar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/wizard-1-servicio-${sufijo}.png` });

  // Paso 2: primer servicio → continuar → último día habilitado
  await page.locator("button").filter({ hasText: /min/ }).first().click();
  await page.getByRole("button", { name: /continuar/i }).click();
  await page.waitForTimeout(700);
  await page.locator("button:not([disabled])").filter({ hasText: /^\d{1,2}$/ }).last().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/wizard-2-fecha-hora-${sufijo}.png` });

  // Paso 3
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
  await page.waitForTimeout(500);
  const continuar = page.getByRole("button", { name: /continuar/i });
  if (await continuar.isVisible().catch(() => false)) await continuar.click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/wizard-3-datos-${sufijo}.png` });

  await page.close();
}

async function capturarPanel(ancho, alto, sufijo) {
  const page = await browser.newPage({ viewport: { width: ancho, height: alto } });
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/usuario/i).fill("will");
  await page.getByLabel(/contrase/i).fill("WillSantoyo2026!");
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/panel-${sufijo}.png` });
  await page.close();
}

await capturarFlujo(1280, 800, "desktop");
await capturarFlujo(375, 812, "movil");
await capturarPanel(1280, 800, "desktop");
await capturarPanel(375, 812, "movil");

await browser.close();
console.log(`capturas listas en ${OUT}/`);
