/**
 * Captura de pantallas clave → docs/screenshots/ (verificación visual).
 *
 * No es un test funcional: solo corre con CAPTURE=1 para no interferir con la
 * suite E2E normal.
 *
 *   CAPTURE=1 npx playwright test screenshots.capture
 *   (PowerShell:  $env:CAPTURE="1"; npx playwright test screenshots.capture)
 */
import { readFileSync } from "node:fs";
import { devices, expect, test, type Page } from "@playwright/test";

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

  // Paso 4: datos (con correo opcional — ronda Resend)
  await page.getByPlaceholder("Nombre y apellido").fill("Cliente Captura");
  await page.getByPlaceholder("300 123 4567").fill("3009876543");
  await page.getByPlaceholder("tu@correo.com").fill("cliente@ejemplo.com");
  await shot(page, "07-wizard-4-datos");
  await page.getByRole("button", { name: /continuar/i }).click();

  // Paso 5: resumen
  await expect(page.getByText(/resumen de tu turno/i)).toBeVisible();
  await shot(page, "08-wizard-5-resumen");
  await page.getByRole("button", { name: /confirmar turno/i }).click();

  // Confirmación: el código debe ser protagonista
  await expect(page.getByText(/turno (confirmado|apartado)/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("manage-code")).toBeVisible();
  await page.waitForTimeout(1900); // deja terminar la pasada de navaja + troquelado
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

test("wizard en celular emulado (iPhone 13, táctil real)", async ({ browser }) => {
  // Emulación de dispositivo completa: viewport, DPR, touch y user agent —
  // no solo achicar la ventana (feedback R1 #4).
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();

  await page.goto("/agendar");
  await expect(page.getByRole("button", { name: /barbero 1/i }).first()).toBeVisible();
  await shot(page, "19-mobile-wizard-1-barbero");
  await page.getByRole("button", { name: /barbero 1/i }).first().tap();
  await page.getByRole("button", { name: /continuar/i }).tap();

  await page.getByRole("button", { name: /corte clásico/i }).tap();
  await shot(page, "20-mobile-wizard-2-servicios");
  await page.getByRole("button", { name: /continuar/i }).tap();

  await expect(page.getByText(/elige un día/i)).toBeVisible();
  const days = page.locator("button:not([disabled])[class*='aspect-square']");
  await expect(days.first()).toBeVisible({ timeout: 10_000 });
  const count = await days.count();
  let picked = false;
  for (let i = 0; i < count && !picked; i++) {
    await days.nth(i).tap();
    const slot = page.locator("div.grid button", { hasText: /^\d{2}:\d{2}$/ }).first();
    try {
      await slot.waitFor({ state: "visible", timeout: 4000 });
      await shot(page, "21-mobile-wizard-3-fecha-hora", true);
      await slot.tap();
      picked = true;
    } catch {
      /* día lleno */
    }
  }
  expect(picked).toBe(true);
  await page.getByRole("button", { name: /continuar/i }).tap();

  await page.getByPlaceholder("Nombre y apellido").fill("Cliente Móvil");
  await page.getByPlaceholder("300 123 4567").fill("3015551234");
  await shot(page, "22-mobile-wizard-4-datos");
  await page.getByRole("button", { name: /continuar/i }).tap();

  await expect(page.getByText(/resumen de tu turno/i)).toBeVisible();
  await page.getByRole("button", { name: /confirmar turno/i }).tap();
  await expect(page.getByText(/turno (confirmado|apartado)/i)).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForTimeout(1900); // deja terminar la pasada de navaja + troquelado
  await shot(page, "23-mobile-confirmacion", true);

  await context.close();
});

test("la fila en vivo: tablero y tiquete (desktop + móvil)", async ({ page }) => {
  // Requiere la fila de demostración: python scratchpad/demo_queue.py
  let ticketCode: string | null = null;
  try {
    ticketCode = JSON.parse(readFileSync("e2e/.demo-queue.json", "utf-8")).ticket_code;
  } catch {
    /* sin demo: se capturan tablero vacío y sin tiquete */
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/hoy");
  await expect(page.getByRole("heading", { name: /la fila/i })).toBeVisible();
  await expect(page.getByText(/en el sillón/i).first()).toBeVisible({ timeout: 10_000 });
  await shot(page, "24-fila-tablero");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/hoy");
  await expect(page.getByText(/en el sillón/i).first()).toBeVisible({ timeout: 10_000 });
  await shot(page, "25-fila-tablero-mobile", true);

  if (ticketCode) {
    await page.goto(`/turno/${ticketCode}`);
    await expect(page.getByText(/del día/i).first()).toBeVisible({ timeout: 10_000 });
    // El bloque en vivo solo aplica si el turno sigue siendo HOY (cerca de
    // medianoche la demo "+55 min" puede caer mañana: no es un fallo)
    await page.waitForTimeout(1200);
    if ((await page.getByText(/la fila hoy/i).count()) > 0) {
      await shot(page, "26-tiquete-vivo-mobile", true);
    }
  }

  // Tanda 2: confirmación de asistencia pendiente en el tiquete
  let confirmCode: string | null = null;
  try {
    confirmCode = JSON.parse(readFileSync("e2e/.demo-queue.json", "utf-8")).confirm_code;
  } catch {
    /* sin demo */
  }
  if (confirmCode) {
    await page.goto(`/turno/${confirmCode}`);
    await expect(page.getByText(/confirma tu asistencia/i)).toBeVisible({ timeout: 10_000 });
    await shot(page, "30-confirmar-asistencia-mobile", true);
  }
});

test("tanda 3: portal, reseñas y widget de reseña", async ({ page }) => {
  let demo: { portal_phone?: string; portal_code?: string; review_code?: string } = {};
  try {
    demo = JSON.parse(readFileSync("e2e/.demo-queue.json", "utf-8"));
  } catch {
    /* sin demo */
  }
  test.skip(!demo.portal_code, "Requiere la fila de demostración");

  // Portal del cliente (móvil)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mi-historial");
  await page.getByPlaceholder("300 123 4567").fill(demo.portal_phone!);
  await page.getByPlaceholder("A1B2C3").fill(demo.portal_code!);
  await page.getByRole("button", { name: /ver mi historial/i }).click();
  await expect(page.getByText(/tarjeta de fidelidad/i)).toBeVisible({ timeout: 10_000 });
  await shot(page, "33-mi-historial-mobile", true);

  // Widget de reseña en el tiquete (cita completada sin reseñar)
  await page.goto(`/turno/${demo.review_code}`);
  await expect(page.getByText(/cómo quedó el corte/i)).toBeVisible({ timeout: 10_000 });
  await shot(page, "35-resena-en-tiquete", true);

  // Sección de reseñas verificadas en el home (desktop)
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const section = page.locator("#resenas");
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByText(/palabra de cliente/i)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(900);
  await section.screenshot({ path: `${OUT}/34-resenas-home.png` });
});

test("tanda 4: portafolio, vitrina y regalos", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  // Portafolio del barbero 1 (mini-sitio)
  await page.goto("/barbero/1");
  await expect(page.getByRole("heading", { name: /barbero 1/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForTimeout(900);
  await shot(page, "37-portafolio-barbero", true);

  // La vitrina en el home
  await page.goto("/");
  const vitrina = page.locator("#vitrina");
  if ((await vitrina.count()) > 0) {
    await vitrina.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await vitrina.screenshot({ path: `${OUT}/38-vitrina-home.png` });
  }

  // Widget embebible
  await page.setViewportSize({ width: 340, height: 210 });
  await page.goto("/embed");
  await expect(page.getByRole("link", { name: /agendar mi turno/i })).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, "39-embed-widget");

  // Admin: regalos
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await page.getByLabel(/usuario/i).fill("admin");
  await page.getByLabel(/contraseña/i).fill("BadBoys2026!");
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: /regalos/i }).click();
  await expect(page.getByRole("heading", { name: "Regalos" })).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, "40-admin-regalos");
  await page.getByRole("link", { name: /vitrina/i }).click();
  await expect(page.getByRole("heading", { name: "Vitrina" })).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, "41-admin-vitrina");
});

test("pagos: anticipo en simulador, retorno y regalos", async ({ page }) => {
  // Reserva rápida hasta la confirmación con anticipo (deposits ON en demo)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/agendar");
  await page.getByRole("button", { name: /barbero 1/i }).first().click();
  await page.getByRole("button", { name: /corte clásico/i }).click();
  await page.getByRole("button", { name: /continuar/i }).click();
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
      await slot.click();
      picked = true;
    } catch {
      /* día lleno */
    }
  }
  expect(picked).toBe(true);
  await page.getByPlaceholder("Nombre y apellido").fill("Cliente Pago");
  await page.getByPlaceholder("300 123 4567").fill("3182220001");
  // Correo opcional (ronda Resend): con anticipo activo la confirmación
  // por correo sale AL PAGAR — se captura más abajo desde el outbox local.
  await page.getByPlaceholder("tu@correo.com").fill("cliente@ejemplo.com");
  await page.getByRole("button", { name: /continuar/i }).click();
  await page.getByRole("button", { name: /confirmar turno/i }).click();
  await expect(page.getByText(/turno (confirmado|apartado)/i)).toBeVisible({
    timeout: 15_000,
  });

  const payButton = page.getByRole("link", { name: /pagar anticipo/i });
  test.skip((await payButton.count()) === 0, "Anticipos apagados en esta demo");
  await page.waitForTimeout(1900);
  await shot(page, "42-confirmacion-con-anticipo", true);

  await payButton.click();
  await expect(page.getByText(/simulador · modo pruebas/i)).toBeVisible({
    timeout: 10_000,
  });
  await shot(page, "43-pago-simulador");
  await page.getByRole("button", { name: /aprobar/i }).click();
  await expect(page.getByText(/pago aprobado/i)).toBeVisible({ timeout: 15_000 });
  await shot(page, "44-pago-retorno-aprobado");

  // Ronda Resend: al aprobarse el anticipo, la confirmación quedó en el
  // outbox local del backend (sin API key) — se captura el HTML del correo
  // tal cual lo vería el cliente.
  const { readdirSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const outbox = resolve("../backend/outbox");
  try {
    const latest = readdirSync(outbox)
      .filter((f) => f.includes("-confirmacion-") && f.endsWith(".html"))
      .sort()
      .at(-1);
    if (latest) {
      await page.setViewportSize({ width: 640, height: 1000 });
      await page.goto(`file://${resolve(outbox, latest)}`);
      await page.waitForTimeout(400);
      await shot(page, "52-correo-confirmacion", true);
      await page.goBack();
      await page.setViewportSize({ width: 390, height: 844 });
    }
  } catch {
    /* outbox vacío (backend con RESEND_API_KEY real): nada que capturar */
  }

  // Regalos: comprar un corte de regalo y ver el código revelado
  await page.goto("/regalos");
  await expect(page.getByRole("heading", { name: /regala un/i })).toBeVisible();
  await page.getByPlaceholder("Nombre y apellido").fill("María Regaladora");
  await page.getByPlaceholder("tu@correo.com").fill("maria@ejemplo.com");
  await shot(page, "45-regalos-tienda", true);
  await page.getByRole("button", { name: /pagar .* y recibir el código/i }).click();
  await expect(page.getByText(/simulador · modo pruebas/i)).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: /aprobar/i }).click();
  await expect(page.getByText(/pago aprobado/i)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1900); // navaja revelando el código del regalo
  await shot(page, "46-regalo-codigo-revelado", true);

  // Admin: página de Pagos con el registro
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await page.getByLabel(/usuario/i).fill("admin");
  await page.getByLabel(/contraseña/i).fill("BadBoys2026!");
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: /pagos/i }).click();
  await expect(page.getByRole("heading", { name: "Pagos" })).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, "47-admin-pagos");
});

test("anchos móviles reales: 375px y 428px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); // iPhone SE/Mini
  await page.goto("/agendar");
  await expect(page.getByRole("button", { name: /barbero 1/i }).first()).toBeVisible();
  await shot(page, "27-wizard-375");

  await page.setViewportSize({ width: 428, height: 926 }); // iPhone Plus/Max
  await page.goto("/agendar");
  await expect(page.getByRole("button", { name: /barbero 1/i }).first()).toBeVisible();
  await shot(page, "28-wizard-428");

  await page.goto("/");
  await shot(page, "29-home-428", true);
});

test("ronda de seguridad: vista del barbero y panel de seguridad", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Un par de intentos fallidos (menos de 5: no dispara el bloqueo) para que
  // el panel de seguridad tenga eventos reales que mostrar en la captura.
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  for (let i = 0; i < 2; i++) {
    await page.request.post(`${api}/api/v1/auth/login`, {
      data: { username: "admin", password: "clave-incorrecta" },
      failOnStatusCode: false,
    });
  }
  await page.request.post(`${api}/api/v1/auth/login`, {
    data: { username: "admin", password: "x", website: "http://bot.example" },
    failOnStatusCode: false,
  });

  // ---- El barbero solo ve SU mundo: dashboard propio, desempeño y cuenta
  await page.goto("/admin");
  await page.getByLabel(/usuario/i).fill("barbero1");
  await page.getByLabel(/contraseña/i).fill("BadBoys2026!");
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible({ timeout: 15_000 });
  await shot(page, "48-barbero-dashboard");

  await page.getByRole("link", { name: /mi desempeño/i }).click();
  await expect(page.getByRole("heading", { name: /mi desempeño/i })).toBeVisible();
  await page.waitForTimeout(1000);
  await shot(page, "49-barbero-mi-desempeno");

  await page.getByRole("link", { name: /mi cuenta/i }).click();
  await expect(page.getByRole("heading", { name: /mi cuenta/i })).toBeVisible();
  await shot(page, "50-barbero-mi-cuenta");

  // ---- El admin ve el registro de seguridad
  await page.getByRole("button", { name: /salir/i }).click();
  await expect(page.getByRole("button", { name: /entrar/i })).toBeVisible();
  await page.getByLabel(/usuario/i).fill("admin");
  await page.getByLabel(/contraseña/i).fill("BadBoys2026!");
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: /seguridad/i }).click();
  await expect(page.getByRole("heading", { name: "Seguridad" })).toBeVisible();
  await page.waitForTimeout(900);
  await shot(page, "51-admin-seguridad");
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

  // Tanda 2: walk-in (visible si algún barbero atiende hoy)
  const walkInButton = page.getByRole("button", { name: /walk-in/i }).first();
  if ((await walkInButton.count()) > 0) {
    await walkInButton.click();
    await expect(page.getByText(/próximo hueco de hoy/i)).toBeVisible();
    await page.getByPlaceholder(/nombre del cliente/i).fill("Cliente Mostrador");
    await shot(page, "31-walkin-modal");
    await page.getByRole("button", { name: /dar turno ahora/i }).click();
    // Cerca de medianoche puede no quedar hueco HOY (409 legítimo): tolerante
    try {
      await page
        .getByText(/en la fila de hoy/i)
        .waitFor({ state: "visible", timeout: 8000 });
      await shot(page, "32-walkin-tiquete");
      await page.getByRole("button", { name: /^listo$/i }).click();
    } catch {
      await page.getByRole("button", { name: /cerrar/i }).click();
    }
  }

  // Tanda 3: perfil del cliente (clic en el nombre → historial + notas)
  const clientName = page
    .locator("button[title*='perfil del cliente']")
    .first();
  if ((await clientName.count()) > 0) {
    await clientName.click();
    await expect(page.getByText(/notas de estilo/i)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await shot(page, "36-perfil-cliente-admin");
    await page.getByRole("button", { name: /cerrar/i }).click();
  }

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
