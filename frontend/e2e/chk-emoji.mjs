// Diagnóstico: qué href llega REALMENTE al navegador y con qué codepoints.
import { chromium } from "@playwright/test";

const code = process.argv[2] ?? "TUT2FQHV";
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(`http://localhost:3000/turno/${code}`, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);

const href = await p.getByRole("link", { name: /whatsapp/i }).first().getAttribute("href");
console.log("HREF (fragmento):", href.slice(0, 150));
console.log("---");

const texto = decodeURIComponent(href.split("text=")[1]);
for (const linea of texto.split("\n").filter(Boolean)) {
  const cps = [...linea].slice(0, 2).map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase());
  console.log(`${JSON.stringify(linea.slice(0, 44))}  -> ${cps.join(" ")}`);
}
await b.close();
