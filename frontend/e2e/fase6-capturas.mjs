// Capturas de la Fase 6 (Bloque 1.4): home, Wizard (3 pasos) y panel,
// en desktop (1280) y móvil (375). Uso: node e2e/fase6-capturas.mjs
import { chromium } from "@playwright/test";

const OUT = "../docs/screenshots/fase6";
const BASE = "http://localhost:3000";

const browser = await chromium.launch();

async function capturarFlujo(ancho, alto, sufijo) {
  const page = await browser.newPage({ viewport: { width: ancho, height: alto } });

  // Home
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/home-${sufijo}.png`, fullPage: false });

  // Wizard paso 1
  await page.goto(`${BASE}/agendar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/wizard-1-servicio-${sufijo}.png` });

  // Paso 2: elegir servicio → continuar → elegir día hábil
  await page.getByText("Corte clásico").first().click();
  await page.getByRole("button", { name: /continuar/i }).click();
  await page.waitForTimeout(600);
  const dias = page.locator("button:not([disabled])").filter({ hasText: /^\d{1,2}$/ });
  await dias.last().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/wizard-2-fecha-hora-${sufijo}.png` });

  // Paso 3: elegir hora → continuar
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
  await page.waitForTimeout(400);
  const continuar = page.getByRole("button", { name: /continuar/i });
  if (await continuar.isVisible().catch(() => false)) await continuar.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/wizard-3-datos-${sufijo}.png` });

  await page.close();
}

async function capturarPanel(ancho, alto, sufijo) {
  const page = await browser.newPage({ viewport: { width: ancho, height: alto } });
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/usuario/i).fill("will");
  await page.getByLabel(/contraseña/i).fill("WillSantoyo2026!");
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
console.log("capturas listas en docs/screenshots/fase6/");
