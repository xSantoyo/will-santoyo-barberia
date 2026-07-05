/**
 * Captura de pantallas clave → docs/screenshots/ (verificación visual).
 *
 * No es un test funcional: solo corre con CAPTURE=1 para no interferir con la
 * suite E2E normal.
 *
 *   CAPTURE=1 npx playwright test screenshots.capture
 *   (PowerShell:  $env:CAPTURE="1"; npx playwright test screenshots.capture)
 */
import { expect, test, type Page } from "@playwright/test";

const OUT = "../docs/screenshots";
const capture = process.env.CAPTURE === "1";

test.describe.configure({ mode: "serial" });
test.skip(!capture, "Solo corre con CAPTURE=1");

async function shot(page: Page, name: string, fullPage = false) {
  if (fullPage) {
    // Recorre la página para disparar las animaciones whileInView (once: true)
    // y que el contenido quede visible en la captura completa.
    await page.evaluate(async () => {
      const step = Math.max(300, window.innerHeight / 2);
      for (let y = 0; y <= document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      window.scrollTo(0, 0);
    });
  }
  await page.waitForTimeout(700); // deja asentar animaciones de entrada
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}

test("sitio público: home desktop y mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /bad boys/i })).toBeVisible();
  await shot(page, "01-home-hero");
  await shot(page, "02-home-completo", true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await shot(page, "03-home-mobile", true);
});

test("wizard de agendamiento paso a paso + confirmación con código", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/agendar");

  // Paso 1: barbero
  await expect(page.getByRole("button", { name: /barbero 1/i }).first()).toBeVisible();
  await shot(page, "04-wizard-1-barbero");
  await page.getByRole("button", { name: /barbero 1/i }).first().click();
  await page.getByRole("button", { name: /continuar/i }).click();

  // Paso 2: servicios
  await page.getByRole("button", { name: /corte clásico/i }).click();
  await shot(page, "05-wizard-2-servicios");
  await page.getByRole("button", { name: /continuar/i }).click();

  // Paso 3: fecha y hora
  await expect(page.getByText(/elige un día/i)).toBeVisible();
  const days = page.locator("button:not([disabled])[class*='aspect-square']");
  await expect(days.first()).toBeVisible({ timeout: 10_000 });
  const count = await days.count();
  let picked = false;
  for (let i = 0; i < count && !picked; i++) {
    await days.nth(i).click();
    const slot = page.locator("div.grid button", { hasText: /^\d{2}:\d{2}$/ }).first();
    try {
      await slot.waitFor({ state: "visible", timeout: 4000 });
      await shot(page, "06-wizard-3-fecha-hora");
      await slot.click();
      picked = true;
    } catch {
      /* día lleno */
    }
  }
  expect(picked).toBe(true);
  await page.getByRole("button", { name: /continuar/i }).click();

  // Paso 4: datos
  await page.getByPlaceholder("Nombre y apellido").fill("Cliente Captura");
  await page.getByPlaceholder("300 123 4567").fill("3009876543");
  await shot(page, "07-wizard-4-datos");
  await page.getByRole("button", { name: /continuar/i }).click();

  // Paso 5: resumen
  await expect(page.getByText(/resumen de tu turno/i)).toBeVisible();
  await shot(page, "08-wizard-5-resumen");
  await page.getByRole("button", { name: /confirmar turno/i }).click();

  // Confirmación: el código debe ser protagonista
  await expect(page.getByText(/turno confirmado/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("manage-code")).toBeVisible();
  await shot(page, "09-confirmacion-codigo-en-pantalla");

  // Mobile de la confirmación (la pantalla más crítica del nuevo flujo)
  const code = (await page.getByTestId("manage-code").textContent())!.trim();
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "10-confirmacion-mobile", true);

  // Gestión del turno por enlace único
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/turno/${code}`);
  await expect(page.getByText("Confirmado")).toBeVisible();
  await shot(page, "11-gestion-turno");
});

test("panel admin: dashboard, agenda, turnos, barberos, servicios, galería", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await page.getByLabel(/usuario/i).fill("admin");
  await page.getByLabel(/contraseña/i).fill("BadBoys2026!");
  await shot(page, "12-admin-login");
  await page.getByRole("button", { name: /entrar/i }).click();

  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible({ timeout: 15_000 });
  await shot(page, "13-admin-dashboard");

  await page.getByRole("link", { name: /agenda/i }).click();
  await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  await page.waitForTimeout(1200); // carga de la semana
  await shot(page, "14-admin-agenda");

  await page.getByRole("link", { name: /turnos/i }).click();
  await expect(page.getByRole("heading", { name: "Turnos" })).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "15-admin-turnos");

  await page.getByRole("link", { name: /barberos/i }).click();
  await expect(page.getByRole("heading", { name: "Barberos" })).toBeVisible();
  await shot(page, "16-admin-barberos");

  await page.getByRole("link", { name: /servicios/i }).click();
  await expect(page.getByRole("heading", { name: "Servicios" })).toBeVisible();
  await shot(page, "17-admin-servicios");

  await page.getByRole("link", { name: /galería/i }).click();
  await expect(page.getByRole("heading", { name: "Galería" })).toBeVisible();
  await shot(page, "18-admin-galeria");
});
