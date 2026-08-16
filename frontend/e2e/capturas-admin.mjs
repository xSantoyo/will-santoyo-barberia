// Diagnóstico del panel en móvil: captura cada sección a 375px y mide
// desbordamiento horizontal, que es el sintoma tipico de tabla sin adaptar.
import { chromium } from "@playwright/test";

const OUT = "../docs/screenshots/admin-movil";
const BASE = "http://localhost:3000";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";

const RUTAS = [
  ["", "dashboard"],
  ["/agenda", "agenda"],
  ["/turnos", "turnos"],
  ["/servicios", "servicios"],
  ["/resenas", "resenas"],
  ["/mi-desempeno", "desempeno"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
await page.getByLabel(/usuario/i).fill("will");
await page.getByLabel(/contrase/i).fill(ADMIN_PASSWORD);
await page.getByRole("button", { name: /entrar/i }).click();
await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20_000 });
await page.waitForTimeout(1500);

for (const [ruta, nombre] of RUTAS) {
  await page.goto(`${BASE}/admin${ruta}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const m = await page.evaluate(() => {
    const r = document.documentElement;
    // Elementos que se salen del ancho de la pantalla
    const culpables = [...document.querySelectorAll("*")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 2)
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 45)}`);
    return { scrollW: r.scrollWidth, clientW: r.clientWidth, culpables };
  });
  const desborda = m.scrollW > m.clientW + 2;
  console.log(
    `${desborda ? "DESBORDA" : "ok      "} /admin${ruta.padEnd(14)} ${m.scrollW}px vs ${m.clientW}px` +
      (m.culpables.length ? `\n         culpables: ${m.culpables.join(" | ")}` : ""),
  );
  await page.screenshot({ path: `${OUT}/${nombre}.png` });
}

await browser.close();
