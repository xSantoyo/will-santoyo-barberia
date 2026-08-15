// Verifica que la piel vigente REALMENTE pinta en un navegador real.
// Lee los tokens del sistema desde :root en vez de hardcodearlos, así no
// vuelve a quedar desactualizado cuando cambie la paleta.
// Uso: node e2e/verificar-piel.mjs
import { chromium } from "@playwright/test";

const RUTAS = ["/", "/agendar", "/hoy", "/turno", "/mi-historial", "/admin/login"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const fallos = [];
page.on("console", (m) => {
  if (m.type() === "error") fallos.push(`console ${m.text().slice(0, 110)}`);
});
page.on("response", (r) => {
  if (!r.ok() && r.status() !== 304) fallos.push(`${r.status()} ${r.url().slice(0, 80)}`);
});

for (const ruta of RUTAS) {
  await page.goto(`http://localhost:3000${ruta}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const r = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const token = (n) => root.getPropertyValue(n).trim();
    // Convierte el token declarado a rgb() para compararlo con lo computado
    const probe = document.createElement("div");
    probe.style.color = token("--color-night");
    document.body.appendChild(probe);
    const esperado = getComputedStyle(probe).color;
    probe.remove();
    return {
      bg: body.backgroundColor,
      esperado,
      fuente: body.fontFamily.split(",")[0],
      reglas: [...document.styleSheets].reduce((n, s) => {
        try { return n + s.cssRules.length; } catch { return n; }
      }, 0),
      tokens: {
        night: token("--color-night"),
        copper: token("--color-copper"),
        onCopper: token("--color-on-copper"),
      },
    };
  });

  const pinta = r.bg === r.esperado && r.reglas > 100;
  console.log(
    `${pinta ? "OK " : "MAL"} ${ruta.padEnd(14)} bg=${r.bg} reglas=${r.reglas} copper=${r.tokens.copper || "(vacio)"}`,
  );
  if (!pinta) fallos.push(`${ruta}: bg=${r.bg} esperado=${r.esperado} reglas=${r.reglas}`);
}

await browser.close();
console.log(fallos.length ? `\nFALLOS:\n- ${fallos.join("\n- ")}` : "\nSin errores de consola ni respuestas fallidas.");
process.exit(fallos.length ? 1 : 0);
