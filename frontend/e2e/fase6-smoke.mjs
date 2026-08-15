// Smoke de la Fase 6: reserva completa de punta a punta por los 3 pasos,
// en viewport móvil (375px), y verificación del código resultante.
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

await page.goto("http://localhost:3000/agendar", { waitUntil: "networkidle" });

// Paso 1: servicio
await page.getByText("Corte clásico").first().click();
await page.getByRole("button", { name: /continuar/i }).click();

// Paso 2: día hábil + hora (en móvil, elegir hora auto-avanza)
await page.waitForTimeout(600);
const dias = page.locator("button:not([disabled])").filter({ hasText: /^\d{1,2}$/ });
await dias.last().click();
await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
await page.waitForTimeout(700);

// Paso 3: datos
await page.getByPlaceholder("Nombre y apellido").fill("Prueba FaseSeis");
await page.getByPlaceholder("300 123 4567").fill("3120001122");
await page.getByRole("button", { name: /reservar con will/i }).click();

// Confirmación: el tiquete con el código
const code = await page.getByTestId("manage-code").textContent({ timeout: 15_000 });
console.log(`CODIGO=${code?.trim()}`);
await page.screenshot({ path: "../docs/screenshots/fase6/confirmacion-movil.png" });

await browser.close();
