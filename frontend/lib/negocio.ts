/** Datos del negocio en un solo sitio: los usan el sitio, los metadatos y el
 * JSON-LD. Si cambia la dirección o el teléfono, se cambia aquí y en ningún
 * otro lado. */

export const NEGOCIO = {
  nombre: "Will Barbershop",
  oficio: "Barbero profesional",
  ciudad: "Soacha",
  region: "Cundinamarca",
  pais: "CO",
  calle: "Calle 35 Sur & Cra 15B",
  telefono: "+57 311 239 8873",
  telefonoE164: "+573112398873",
  whatsapp: "573112398873",
  instagram: "https://instagram.com/_barber_wil_",
  tiktok: "https://tiktok.com/@willsantoyo",
  facebook: "https://facebook.com/willsantoyo.0",
} as const;

export const DIRECCION_COMPLETA = `${NEGOCIO.calle}, ${NEGOCIO.ciudad}, ${NEGOCIO.region}`;

export const MAPS_URL = `https://maps.google.com/?q=${encodeURIComponent(
  `${NEGOCIO.calle}, ${NEGOCIO.ciudad}, ${NEGOCIO.region}, Colombia`,
)}`;

/** Deep link de WhatsApp con el mensaje ya escrito: el usuario solo pulsa enviar. */
export function whatsappUrl(mensaje = "Hola Will, quiero agendar un turno."): string {
  return `https://wa.me/${NEGOCIO.whatsapp}?text=${encodeURIComponent(mensaje)}`;
}
