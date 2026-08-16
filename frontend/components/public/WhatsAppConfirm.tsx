"use client";

/**
 * «Confirmar por WhatsApp» — un deep link `wa.me`, no un envío automático.
 *
 * Importante para no vender lo que no es: esto NO manda el mensaje solo. Abre
 * WhatsApp con el texto ya escrito y el cliente pulsa enviar. El envío
 * automático en segundo plano solo existe con la WhatsApp Business API, que
 * este proyecto no usa.
 *
 * Un solo componente para los dos sitios donde aparece (confirmación y
 * tiquete): mismo mensaje, mismo botón, misma animación de press del sistema.
 */
import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { NEGOCIO } from "@/lib/negocio";

export function mensajeConfirmacion({
  nombre,
  servicios,
  fecha,
  hora,
  codigo,
}: {
  nombre: string;
  servicios: string[];
  fecha: string;
  hora: string;
  codigo: string;
}): string {
  const lista = servicios.length > 0 ? servicios.join(", ") : "Corte";
  // SIN EMOJI, a propósito. El mensaje llevaba 📋 📅 🎫 y en el teléfono del
  // dueño llegaban como "?". El código estaba bien —archivo UTF-8 sin BOM,
  // codepoints U+1F4CB/U+1F4C5/U+1F3AB correctos, encodeURIComponent con
  // round-trip exacto—, así que la corrupción ocurre después de salir de aquí:
  // en el traspaso del deep link al cliente de WhatsApp, que depende del SO,
  // la versión de la app y el navegador que abre el enlace. Como no es
  // verificable desde este entorno y el emoji no aporta información, se retira:
  // un mensaje que siempre llega bien vale más que uno bonito que a veces no.
  return [
    `Hola Will! Soy ${nombre} y acabo de reservar por la página.`,
    "",
    `Servicio: ${lista}`,
    `Fecha: ${fecha} a las ${hora}`,
    `Código: ${codigo}`,
    "",
    "¿Me confirmas que quedó bien?",
  ].join("\n");
}

export default function WhatsAppConfirm({
  nombre,
  servicios,
  fecha,
  hora,
  codigo,
  variant = "primary",
  full = true,
  label = "Confirmar por WhatsApp",
}: {
  nombre: string;
  servicios: string[];
  fecha: string;
  hora: string;
  codigo: string;
  variant?: "primary" | "secondary";
  full?: boolean;
  label?: string;
}) {
  const texto = mensajeConfirmacion({ nombre, servicios, fecha, hora, codigo });
  const href = `https://wa.me/${NEGOCIO.whatsapp}?text=${encodeURIComponent(texto)}`;

  // El enlace reutiliza las variantes del Button del sistema: mismo press
  // feedback y mismo timing que el resto de lo pulsable, sin duplicar estilos.
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("whatsapp_confirmacion_abierta")}
      className={buttonVariants({ variant, size: "lg", full })}
    >
      <MessageCircle size={20} aria-hidden />
      {label}
    </a>
  );
}
