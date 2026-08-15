// Smoke: reserva completa CON correo (el caso que estaba bloqueado por el
// honeypot) y verificación del botón de WhatsApp en la confirmación.
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

await page.goto("http://localhost:3000/agendar", { waitUntil: "networkidle" });

await page.locator("button").filter({ hasText: /min/ }).first().click();
await page.getByRole("button", { name: /continuar/i }).click();
await page.waitForTimeout(700);
await page.locator("button:not([disabled])").filter({ hasText: /^\d{1,2}$/ }).last().click();
await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
await page.waitForTimeout(700);

await page.getByPlaceholder("Nombre y apellido").fill("Juan David Prueba");
await page.getByPlaceholder("300 123 4567").fill("3229131262");
// EL CASO DEL BUG: con correo lleno
await page.getByPlaceholder("tu@correo.com").fill("davidlowri@gmail.com");

await page.getByRole("button", { name: /reservar con will/i }).click();

const code = await page.getByTestId("manage-code").textContent({ timeout: 15_000 });
console.log(`CODIGO=${code?.trim()}`);

// El botón de WhatsApp debe estar visible sin scroll y llevar el mensaje armado
const wa = page.getByRole("link", { name: /confirmar por whatsapp/i });
await wa.waitFor({ timeout: 5_000 });
const href = await wa.getAttribute("href");
console.log(`WHATSAPP_OK=${href?.startsWith("https://wa.me/573112398873?text=")}`);
console.log(`MENSAJE=${decodeURIComponent(href?.split("text=")[1] ?? "").split("\n")[0]}`);

await page.screenshot({ path: "../docs/screenshots/v3/confirmacion-whatsapp.png" });
await browser.close();
