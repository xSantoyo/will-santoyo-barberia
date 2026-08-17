// Verifica dos cosas de una sola pasada:
//  1. que "Santoyo" no quedó visible en ningún lado del sitio público,
//  2. que el carrusel de video arranca solo, mudo, y sirve el archivo del peso
//     correcto según el ancho de pantalla (720p al celular, 1080p al escritorio).
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const RUTAS = ["/", "/agendar", "/hoy", "/turno"];

const browser = await chromium.launch();
let fallos = 0;

function chequear(ok, etiqueta, detalle = "") {
  console.log(`${ok ? "ok      " : "FALLA   "} ${etiqueta}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos++;
}

for (const [ancho, alto, etiqueta, esperado] of [
  [375, 812, "movil", "720"],
  [1280, 900, "escritorio", "1080"],
]) {
  console.log(`\n=== ${etiqueta} (${ancho}px) ===`);
  const page = await browser.newPage({ viewport: { width: ancho, height: alto } });

  // --- 1. rastro de la marca vieja
  for (const ruta of RUTAS) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
    const texto = await page.evaluate(() => document.body.innerText);
    chequear(!/santoyo/i.test(texto), `sin "Santoyo" en ${ruta}`);
  }

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

  // --- 2. el nombre nuevo en el encabezado
  const h1 = (await page.locator("h1").first().innerText()).replace(/\s+/g, " ").trim();
  chequear(/will/i.test(h1) && /barber shop/i.test(h1), "h1 dice Will Barber Shop", h1);

  // --- 3. el video
  await page.locator("#en-movimiento").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);

  const v = await page.evaluate(() => {
    const el = document.querySelector("#en-movimiento video");
    if (!el) return null;
    return {
      pausado: el.paused,
      mudo: el.muted,
      fuente: el.currentSrc.split("/").pop(),
      ancho: el.videoWidth,
      enLinea: el.hasAttribute("playsinline"),
    };
  });

  chequear(v !== null, "existe el carrusel de video");
  if (v) {
    chequear(!v.pausado, "arranca solo al entrar en pantalla");
    chequear(v.mudo, "va mudo");
    chequear(v.enLinea, "playsInline puesto (iOS no lo abre a pantalla completa)");
    chequear(v.fuente.includes(esperado), `sirve la versión ${esperado}p`, v.fuente);
  }

  // --- 4. nada se sale de la pantalla
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    cliente: document.documentElement.clientWidth,
  }));
  chequear(m.scroll <= m.cliente + 2, "sin desborde horizontal", `${m.scroll} vs ${m.cliente}`);

  await page.screenshot({ path: `../docs/screenshots/marca-${etiqueta}.png` });
  await page.locator("#en-movimiento").screenshot({
    path: `../docs/screenshots/video-${etiqueta}.png`,
  });
  await page.close();
}

await browser.close();
console.log(`\n${fallos === 0 ? "TODO VERDE" : `${fallos} FALLAS`}`);
process.exit(fallos === 0 ? 0 : 1);
