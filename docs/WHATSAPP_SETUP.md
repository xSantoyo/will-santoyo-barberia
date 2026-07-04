# Configuración de WhatsApp Business Cloud API (Meta)

Guía para conectar la plataforma con la API **oficial** de Meta. Los pasos marcados
con 🖐️ son manuales y los debe hacer el dueño del proyecto en Meta Business Manager
(no se pueden automatizar).

## 1. Requisitos previos

- Cuenta de **Meta Business Manager** verificada (business.facebook.com).
- Un número de teléfono para el negocio **que no esté registrado en la app normal
  de WhatsApp** (o dispuesto a migrarlo a la API).
- Tarjeta de crédito asociada para el cobro por conversación (Meta factura aparte).

## 2. 🖐️ Crear la app y obtener credenciales

1. En [developers.facebook.com](https://developers.facebook.com) → **Create App** →
   tipo **Business**.
2. Añadir el producto **WhatsApp** a la app.
3. En *WhatsApp → API Setup* anotar:
   - **Phone Number ID** → variable `META_PHONE_NUMBER_ID`
   - **WhatsApp Business Account ID (WABA)**
4. Generar un **token permanente**: en Business Settings → System Users → crear
   usuario de sistema con rol admin → *Generate token* con permisos
   `whatsapp_business_messaging` y `whatsapp_business_management`
   → variable `META_ACCESS_TOKEN`.
5. En *App Settings → Basic* anotar **App Secret** → variable `META_APP_SECRET`.
6. Registrar el número real del negocio y verificarlo por SMS/llamada.

> **Dónde van las credenciales:** en producción, AWS Secrets Manager (las crea
> Terraform desde `terraform.tfvars`, ver `infra/`); en local, variables de entorno
> del servicio n8n en `docker-compose.yml`. **Nunca** en el código ni en git.

## 3. 🖐️ Plantillas de mensaje (message templates)

Meta exige plantillas pre-aprobadas para todo mensaje que el negocio inicia fuera
de la ventana de 24 horas — exactamente nuestro caso (confirmaciones, recordatorios,
alertas). Crear estas 4 plantillas en
**Business Manager → WhatsApp Manager → Message templates**, categoría **Utility**,
idioma **es_CO** (español, Colombia):

### 3.1 `confirmacion_turno` (al cliente al reservar)

- **Cuerpo:**
  ```
  Hola {{1}} 👋 Tu turno en Bad Boys Barbershop quedó confirmado:

  📅 {{2}} a las {{3}}
  💈 Barbero: {{4}}
  ✂️ Servicios: {{5}}
  🎟️ Turno del día: #{{6}}

  Código de gestión: {{7}}
  ```
- **Botón:** tipo *URL dinámica* → `https://TU-DOMINIO.com/turno/{{1}}`
  (el workflow envía el código de gestión como parámetro del botón).

### 3.2 `recordatorio_24h` (al cliente, un día antes)

- **Cuerpo:**
  ```
  Hola {{1}}, te recordamos tu turno en Bad Boys Barbershop mañana {{2}} a las {{3}} con {{4}}. Si no puedes asistir, cancélalo desde el enlace para liberar el horario. ¡Te esperamos!
  ```
- **Botón:** URL dinámica → `https://TU-DOMINIO.com/turno/{{1}}`.

### 3.3 `cancelacion_turno` (al cliente cuando se cancela)

- **Cuerpo:**
  ```
  Hola {{1}}, tu turno del {{2}} a las {{3}} en Bad Boys Barbershop fue cancelado. Puedes agendar uno nuevo cuando quieras en nuestra página.
  ```

### 3.4 `notificacion_interna` (al número del dueño/admin)

- **Cuerpo:**
  ```
  🔔 Bad Boys: {{1}}
  ```
- Usada por: alerta de turno nuevo, alerta de cancelación, resumen diario 7:00 a.m.
  y alerta de no-show. El parámetro único lleva el texto completo.

> La aprobación tarda de minutos a 48 h. Si Meta rechaza una plantilla por el
> texto, simplificarlo (evitar mayúsculas excesivas y promesas promocionales:
> son plantillas *Utility*, no *Marketing*).

## 4. Dónde se usan (mapa de flujos)

| Plantilla | Workflow n8n | Disparador |
|---|---|---|
| `confirmacion_turno` | `01-confirmacion-turno` | Webhook `appointment.created` |
| `notificacion_interna` | `01`, `02`, `04`, `05` | Turno nuevo / cancelación / resumen diario / no-show |
| `cancelacion_turno` | `02-cancelacion-turno` | Webhook `appointment.cancelled` |
| `recordatorio_24h` | `03-recordatorio-24h` | Cron horario |

## 5. Variables de entorno que consumen los workflows

| Variable | Descripción |
|---|---|
| `META_ACCESS_TOKEN` | Token permanente del usuario de sistema |
| `META_PHONE_NUMBER_ID` | ID del número emisor |
| `BACKEND_BASE_URL` | URL del backend (para los crons) |
| `BACKEND_SERVICE_KEY` | API key de los endpoints `/internal` |
| `WEBHOOK_SECRET` | Secreto HMAC compartido con el backend |

## 6. Costos

Meta cobra **por conversación de 24 h** iniciada por el negocio (categoría
*Utility*). En Colombia el orden de magnitud es de centavos de USD por
conversación; verificar la tarifa vigente en la
[página de precios de WhatsApp Business](https://developers.facebook.com/docs/whatsapp/pricing/).
Esto es independiente del costo de infraestructura AWS.

## 7. Prueba de punta a punta (sandbox)

Antes de aprobar plantillas se puede probar con el **número de prueba** que Meta
da a cada app (permite enviar a hasta 5 números verificados):

1. En *API Setup*, usar el `Phone Number ID` del número de prueba.
2. Agregar tu número personal como destinatario de prueba.
3. Crear una reserva en el sitio → n8n debe ejecutar `01-confirmacion-turno` y
   el WhatsApp debe llegar.
4. Revisar en el panel admin → sección notificaciones (`notification_log`) que el
   evento quedó `enviado`; si falló, el detalle del error queda registrado ahí.
