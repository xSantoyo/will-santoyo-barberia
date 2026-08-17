// Comprueba que el logo quedó bien integrado: proporción intacta, sin
// desbordes en móvil, y que favicon y tarjeta al compartir apuntan a algo real.
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const browser = await chromium.launch();
let fallos = 0;

const chequear = (ok, etiqueta, detalle = "") => {
  console.log(`${ok ? "ok      " : "FALLA   "} ${etiqueta}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos++;
};

for (const [ancho, alto, etiqueta] of [
  [320, 700, "movil estrecho"],
  [375, 812, "movil"],
  [1280, 900, "escritorio"],
]) {
  console.log(`\n=== ${etiqueta} (${ancho}px) ===`);
  const page = await browser.newPage({ viewport: { width: ancho, height: alto } });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

  const logo = page.locator("header a[aria-label] svg").first();
  chequear(await logo.count() > 0, "el logo está en la barra superior");

  const caja = await logo.boundingBox();
  if (caja) {
    // El vector mide 488x600: la relación debe mantenerse o está deformado.
    const proporcion = caja.width / caja.height;
    const esperada = 488 / 600;
    chequear(
      Math.abs(proporcion - esperada) < 0.03,
      "no está deformado",
      `${caja.width.toFixed(1)}x${caja.height.toFixed(1)} (relación ${proporcion.toFixed(3)} vs ${esperada.toFixed(3)})`,
    );
    chequear(caja.height >= 24, "alto suficiente para verse", `${caja.height.toFixed(0)}px`);

    // El color debe venir del tema, no quemado.
    const color = await logo.evaluate((el) => getComputedStyle(el).color);
    chequear(color === "rgb(244, 239, 233)", "toma el color chalk del tema", color);
  }

  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    cliente: document.documentElement.clientWidth,
  }));
  chequear(m.scroll <= m.cliente + 2, "sin desborde horizontal", `${m.scroll} vs ${m.cliente}`);

  await page.locator("header").screenshot({
    path: `../docs/screenshots/logo-navbar-${ancho}.png`,
  });
  await page.close();
}

// --- metadatos: favicon y tarjeta al compartir
console.log("\n=== metadatos ===");
const page = await browser.newPage();
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const meta = await page.evaluate(() => ({
  iconos: [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')]
    .map((l) => `${l.getAttribute("rel")}=${l.getAttribute("href")}`),
  og: document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null,
  tw: document.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ?? null,
}));
chequear(meta.iconos.length > 0, "hay favicon declarado", meta.iconos.join(" | "));
chequear(meta.og !== null, "og:image declarado", meta.og ?? "");
chequear(meta.tw !== null, "twitter:image declarado", meta.tw ?? "");

// Que las URLs no den 404
for (const [nombre, url] of [["og:image", meta.og], ["twitter:image", meta.tw]]) {
  if (!url) continue;
  const r = await page.request.get(url.replace(/^https?:\/\/[^/]+/, BASE));
  chequear(r.ok(), `${nombre} responde`, `${r.status()} ${r.headers()["content-type"] ?? ""}`);
}
// icon-192/512 los pide el manifiesto de la PWA; apple-icon lo declara Next.
for (const ruta of ["/logo-marca.svg", "/logo-completo.svg", "/icon-192.png", "/icon-512.png", "/apple-icon.png"]) {
  const r = await page.request.get(`${BASE}${ruta}`);
  chequear(r.ok(), `${ruta} responde`, `${r.status()}`);
}

await browser.close();
console.log(`\n${fallos === 0 ? "TODO VERDE" : `${fallos} FALLAS`}`);
process.exit(fallos === 0 ? 0 : 1);
