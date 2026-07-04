/** E2E del panel: login del admin y verificación de las vistas principales. */
import { expect, test } from "@playwright/test";

test("admin: login → dashboard → barberos → servicios", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);

  await page.getByLabel(/usuario/i).fill("admin");
  await page.getByLabel(/contraseña/i).fill("BadBoys2026!");
  await page.getByRole("button", { name: /entrar/i }).click();

  // Dashboard: los 3 barberos del seed con su agenda de hoy
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Barbero 1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Barbero 2" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Barbero 3" })).toBeVisible();

  // Barberos: horarios y días de descanso visibles
  await page.getByRole("link", { name: /barberos/i }).click();
  await expect(page.getByRole("heading", { name: "Barberos" })).toBeVisible();
  await expect(page.getByText("Descansa").first()).toBeVisible();

  // Servicios: precios del seed, editables desde el panel
  await page.getByRole("link", { name: /servicios/i }).click();
  await expect(page.getByRole("heading", { name: "Servicios" })).toBeVisible();
  await expect(page.getByText("Corte clásico")).toBeVisible();
  await expect(page.getByText(/30\.000/).first()).toBeVisible();

  // Galería: subir una imagen sin tocar código (Fase 3) y eliminarla
  const TINY_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+nHgAGAIIBPyoreQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.getByRole("link", { name: /galería/i }).click();
  await expect(page.getByRole("heading", { name: "Galería" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e-corte.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  const uploaded = page.locator("figure img");
  await expect(uploaded.first()).toBeVisible({ timeout: 15_000 });

  page.once("dialog", (dialog) => dialog.accept());
  await uploaded.first().hover();
  await page.getByRole("button", { name: /eliminar imagen/i }).first().click();
  await expect(page.getByText(/aún no hay fotos/i)).toBeVisible({ timeout: 10_000 });

  // El rol barbero NO ve las secciones exclusivas del admin
  await page.getByRole("button", { name: /salir/i }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel(/usuario/i).fill("barbero1");
  await page.getByLabel(/contraseña/i).fill("BadBoys2026!");
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: /servicios/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /galería/i })).toHaveCount(0);
});
