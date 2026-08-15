// Verificación de que la piel realmente PINTA en un navegador real.
// Comprueba estilos computados, no la presencia del <link>.
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const fallos = [];
page.on("console", (m) => {
  if (m.type() === "error") fallos.push(`console: ${m.text().slice(0, 120)}`);
});
page.on("response", (r) => {
  if (!r.ok() && r.status() !== 304) fallos.push(`${r.status()} ${r.url().slice(0, 90)}`);
});

for (const ruta of ["/", "/agendar", "/hoy", "/admin/login"]) {
  await page.goto(`http://localhost:3000${ruta}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const estilos = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const root = getComputedStyle(document.documentElement);
    return {
      bg: cs.backgroundColor,
      color: cs.color,
      paper: root.getPropertyValue("--color-paper").trim(),
      hojas: document.styleSheets.length,
      reglas: [...document.styleSheets].reduce((n, s) => {
        try { return n + s.cssRules.length; } catch { return n; }
      }, 0),
    };
  });
  const pintado = estilos.bg === "rgb(241, 238, 230)" && estilos.reglas > 100;
  console.log(
    `${pintado ? "OK " : "MAL"} ${ruta.padEnd(14)} bg=${estilos.bg} reglas=${estilos.reglas} paper=${estilos.paper || "(vacio)"}`,
  );
  if (!pintado) fallos.push(`${ruta}: sin estilos aplicados`);
}

await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.screenshot({ path: "../docs/screenshots/fase6/home-desktop.png" });

await browser.close();
console.log(fallos.length ? `\nFALLOS:\n- ${fallos.join("\n- ")}` : "\nSin errores de consola ni respuestas fallidas.");
process.exit(fallos.length ? 1 : 0);
