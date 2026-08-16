// Replica exacta del template y comprueba el round-trip del encoding.
const msg = [
  "¡Hola Will! Soy Juan y acabo de reservar por la página.",
  "",
  "📋 Corte clásico",
  "📅 2026-08-31 a las 10:00",
  "🎫 Código: ABC12345",
  "",
  "¿Me confirmas que quedó bien?",
].join("\n");

const url = `https://wa.me/573112398873?text=${encodeURIComponent(msg)}`;
console.log("URL:", url.slice(0, 120), "...");
console.log("");
const vuelta = decodeURIComponent(url.split("text=")[1]);
console.log("round-trip idéntico:", vuelta === msg);
for (const l of msg.split("\n").filter(Boolean)) {
  const c = [...l][0];
  console.log(`  ${JSON.stringify(l.slice(0,30))} -> U+${c.codePointAt(0).toString(16).toUpperCase()}`);
}
