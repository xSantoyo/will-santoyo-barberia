/**
 * E2E: un cliente agenda un turno de principio a fin y luego lo cancela.
 * (Criterios de la sección 22 del spec.)
 */
import { expect, test } from "@playwright/test";

test("flujo completo: agendar → confirmar → gestionar → cancelar", async ({ page }) => {
  // 1. Home carga con la marca y el CTA
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /will barbershop/i })).toBeVisible();
  await page.getByRole("link", { name: /agendar mi turno/i }).click();

  // 2. Paso 1: elegir barbero
  await expect(page).toHaveURL(/\/agendar/);
  await page.getByRole("button", { name: /barbero 1/i }).first().click();
  await page.getByRole("button", { name: /continuar/i }).click();

  // 3. Paso 2: elegir servicio
  await page.getByRole("button", { name: /corte clásico/i }).click();
  await page.getByRole("button", { name: /continuar/i }).click();

  // 4. Paso 3: esperar a que el calendario termine su animación de entrada
  await expect(page.getByText(/elige un día/i)).toBeVisible();
  const enabledDays = page.locator(
    "button:not([disabled])[class*='aspect-square']",
  );
  await expect(enabledDays.first()).toBeVisible({ timeout: 10_000 });
  // Recorre días habilitados hasta encontrar uno con slots libres
  const dayCount = await enabledDays.count();
  let slotPicked = false;
  for (let i = 0; i < dayCount && !slotPicked; i++) {
    await enabledDays.nth(i).click();
    const slot = page
      .locator("div.grid button", { hasText: /^\d{2}:\d{2}$/ })
      .first();
    try {
      await slot.waitFor({ state: "visible", timeout: 4000 });
      await slot.click();
      slotPicked = true;
    } catch {
      /* día lleno: probar el siguiente */
    }
  }
  expect(slotPicked).toBe(true);
  await page.getByRole("button", { name: /continuar/i }).click();

  // 5. Paso 4: datos del cliente
  await page.getByPlaceholder("Nombre y apellido").fill("Cliente E2E");
  await page.getByPlaceholder("300 123 4567").fill("3001234567");
  await page.getByRole("button", { name: /continuar/i }).click();

  // 6. Paso 5: confirmar
  await expect(page.getByText(/resumen de tu turno/i)).toBeVisible();
  await page.getByRole("button", { name: /confirmar turno/i }).click();

  // 7. Confirmación: el código de gestión debe ser prominente en pantalla
  // (ADR-009: es el único canal del cliente para gestionar su turno)
  await expect(page.getByText(/turno (confirmado|apartado)/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/guarda este código/i)).toBeVisible();
  const code = (await page.getByTestId("manage-code").textContent())!.trim();
  // 8 caracteres desde la ronda de seguridad (antes 6); alfabeto sin ambiguos
  expect(code).toMatch(/^[A-Z2-9]{8}$/);

  // 7b. Si el negocio exige anticipo: pagar en el simulador (flujo Wompi mock)
  const payButton = page.getByRole("link", { name: /pagar anticipo/i });
  if ((await payButton.count()) > 0) {
    await payButton.click();
    await expect(page.getByText(/simulador · modo pruebas/i)).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: /aprobar/i }).click();
    await expect(page.getByText(/pago aprobado/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: /ver mi tiquete/i }).click();
  } else {
    // 8. Gestionar por enlace único (tiquete vivo)
    await page.getByRole("link", { name: /ver mi tiquete/i }).click();
  }
  await expect(page).toHaveURL(new RegExp(`/turno/${code}`));
  await expect(page.getByText("Confirmado")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /cancelar mi turno/i }).click();
  await page.getByRole("button", { name: /sí, cancelar/i }).click();
  await expect(page.getByText("Cancelado")).toBeVisible({ timeout: 10_000 });
});
