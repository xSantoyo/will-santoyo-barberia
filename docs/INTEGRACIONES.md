# Integraciones externas — estado y requisitos

Funcionalidades del backlog competitivo que dependen de cuentas, aprobaciones o
APIs de terceros. Documentadas para activarse cuando el negocio esté listo;
ninguna bloquea lo ya construido.

## Widget embebible ✅ (ya disponible)

`/embed` es una tarjeta compacta lista para iframe en cualquier página o
bio-link:

```html
<iframe src="https://TU-DOMINIO/embed" width="340" height="210"
        style="border:0;border-radius:8px" loading="lazy"></iframe>
```

Muestra disponibilidad en vivo (sillas libres) y el botón de agendar.

## Botón "Reservar" en Google (Maps/Búsqueda)

- **Qué es:** *Reserve with Google* — el botón de reservar directo en la ficha
  de Google Business Profile.
- **Requisitos:** perfil de Google Business verificado del negocio + integrarse
  vía un partner autorizado de Reserve with Google (la integración directa exige
  ser partner aprobado, proceso de meses). **Camino corto disponible hoy:** en
  Google Business Profile → editar → "Enlace para citas" → pegar
  `https://TU-DOMINIO/agendar`. Eso pone el botón de cita en Maps sin partners.
- **Acción del dueño:** reclamar/verificar el perfil de Google Business.

## Botón de agendar en Instagram

- **Camino disponible hoy:** botón de acción "Reservar" del perfil de Instagram
  Business apuntando a `https://TU-DOMINIO/agendar`, o el enlace en bio.
  El `/embed` sirve para link-in-bio tipo Linktree.
- **Integración nativa** (botón dentro de la app): requiere partner de citas
  aprobado por Meta — mismo tipo de proceso que se descartó en ADR-009.

## Recuperación de llamadas perdidas

- **Qué es:** si el negocio no contesta, el que llamó recibe un SMS/WhatsApp
  con el enlace de agendamiento.
- **Requisitos:** un número virtual con desvío y webhooks de llamada perdida
  (Twilio Voice, o el operador local si lo ofrece) + un endpoint nuestro que
  reciba el evento y dispare el mensaje. Enviar SMS tiene costo por mensaje;
  enviar WhatsApp reabre la decisión de ADR-009.
- **Estado:** pendiente de decisión de canal y presupuesto por mensaje.

## Vista previa de corte con IA (spike aparte)

- **Qué es:** el cliente sube una selfie y ve cómo le quedarían distintos
  cortes/barbas antes de agendar. Diferenciador real: ni Booksy lo ofrece.
- **Requisitos:** API externa de edición de imagen (p. ej. modelos de imagen
  con inpainting facial), con **costo por imagen generada** y manejo cuidadoso
  de fotos de clientes (consentimiento, retención, borrado).
- **Estado:** requiere checkpoint del dueño (elegir proveedor y presupuesto)
  antes de escribir una línea. El diseño previsto: paso opcional en el wizard
  ("pruébate el corte") con galería de estilos predefinidos.

## Tendencias de corte (contenido)

- Sin dependencia técnica: es contenido curado. Camino simple: usar la galería
  (`kind=cut`) + reseñas como "lo que se está cortando la gente"; una sección
  editorial real requeriría fuente de contenido que hoy no existe.
