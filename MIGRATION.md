# Investigación y migración de stack — Will Barbershop

**Fecha:** 14 de julio de 2026
**Método:** cada herramienta se evaluó contra lo que ESTE aplicativo necesita
(reservas multi-tenant en Colombia, La Fila en vivo, pagos locales, sin cron,
volumen de barbería — no contra checklists genéricos). Verificado contra la
documentación y precios vigentes a julio de 2026.

**Resultado en una línea:** no hay ninguna migración de plataforma que se
justifique — el backend FastAPI probado (83 tests) y Wompi se quedan. Lo que sí
entró: **Resend** (correos transaccionales, implementado), **PostHog**
(analíticas de producto, implementado), compatibilidad **Supabase Postgres**
(implementada, como alternativa de base de datos administrada más simple que
RDS), y **Cloudflare** como capa DNS+WAF/CDN recomendada (runbook listo).

---

## 1. Supabase como backend + base de datos

**Investigado.** Free: 500 MB, 50k MAU, pero **el proyecto se pausa tras 7 días
sin tráfico** → inviable para producción. Pro: 25 USD/mes con backups diarios y
compute Micro incluido. Su pooler (Supavisor) corre en modo transacción, lo que
exige cuidados con SQLAlchemy/psycopg (prepared statements).

**Decisión: NO migrar el backend; SÍ dejar lista su base de datos como opción.**

- **Auth de Supabase no encaja:** es auth de usuarios finales por email/OAuth.
  Aquí los clientes **no tienen cuenta a propósito** (el código de gestión en
  pantalla es el canal, decisión ADR-009 que al dueño le gusta), y el staff usa
  usuarios por tenant con lockout/backoff propio construido en la ronda de
  seguridad. Migrar eso a Supabase Auth sería rehacer lo que ya funciona, peor.
- **La lógica de negocio no cabe en PostgREST/RLS sin reescritura total:**
  disponibilidad calculada, constraint anti doble-reserva, walk-ins, parche
  grupal, fidelidad, regalos con hold/consumo, webhook Wompi endurecido…
  83 tests protegen ese código. Reescribirlo como políticas RLS + edge
  functions es meses de trabajo para quedar igual.
- **Storage:** S3+CloudFront ya está terraformado y probado; nada que ganar.
- **Su Postgres administrado SÍ es interesante:** ~igual de precio que RDS
  (25 vs ~23–25 USD/mes contando el endpoint de Secrets) pero sin VPC/NAT que
  mantener, con panel SQL y backups diarios incluidos. Como el backend habla
  SQLAlchemy estándar, se conecta **solo cambiando `DATABASE_URL`**.

**Implementado:** [backend/app/db.py](backend/app/db.py) detecta el pooler en
modo transacción (`pooler.supabase.com:6543` o `?pgbouncer=true`) y configura
`NullPool` + `prepare_threshold=None` (psycopg3) automáticamente — sin eso, las
Lambdas fallarían con "prepared statement does not exist". Conexión directa
(5432), RDS o SQLite siguen exactamente igual. Test: `tests/test_db.py`.
Comparación de costos y pasos de conexión: [infra/README.md](infra/README.md).

**Pendiente del dueño:** crear el proyecto en supabase.com si se elige esta vía
(cuenta externa). La decisión RDS vs Supabase puede tomarse en el checkpoint de
costos de la Fase 4 — el código sirve para ambas sin cambios.

## 2. GitHub como control de versiones y CI/CD

**Confirmado: bien aprovechado.** `ci.yml` corre los tests de backend contra
SQLite **y Postgres real** (valida el constraint anti doble-reserva), typecheck
+ tests + build del frontend y `terraform validate`; `security-audit.yml`
(ronda anterior) audita dependencias en cada push y cada lunes; `deploy.yml`
publica la imagen Lambda vía **OIDC (sin llaves estáticas)**, espera a que CI
pase, y corre las migraciones Alembic — con el `terraform apply` manual a
propósito (checkpoint de costos).

**Mejora aplicada:** `concurrency` en CI — un push nuevo cancela el run
anterior de la misma rama (ahorra minutos de Actions).

## 3. Pasarela de pagos — Wompi vs. Stripe

**Decisión: Wompi se queda. Stripe no se justifica.**

- Stripe no da cuentas de comerciante a negocios colombianos: exigiría
  **constituir una LLC en EE. UU./R.U. + cuenta bancaria allá** — trámite
  legal y tributario del dueño, con costos anuales propios, para un negocio
  que es una silla de barbería en Colombia.
- Lo decisivo no es solo el trámite: **los clientes pagan con Nequi, PSE y
  botón Bancolombia** — métodos que Wompi (Grupo Bancolombia) cubre nativo y
  Stripe no ofrece. Con Stripe se pagaría en dólares con conversión, perdiendo
  justo los medios de pago que la clientela local usa.
- Wompi agregador: 2.65% + $700 + IVA por transacción, sin mensualidad — para
  anticipos de $10.000 y regalos ocasionales es proporcional al negocio.
- El caso que justificaría Stripe (vender fuera de Colombia) no existe aquí.
- Bonus de la ronda de seguridad: el webhook de Wompi ya quedó endurecido
  (checksum en tiempo constante, verificación de monto, modo por ambiente).

## 4. PostHog como centro de analíticas — IMPLEMENTADO

**Encaja bien:** el free tier (1M eventos/mes) sobra por años a este volumen, y
responde preguntas de negocio reales: ¿en qué paso del wizard se abandona?,
¿cuántas reservas nacen del tablero /hoy?, ¿los anticipos espantan?

**Cómo se implementó** ([frontend/lib/analytics.ts](frontend/lib/analytics.ts)):
- **Cliente mínimo propio contra la API de captura** — sin `posthog-js`, sin
  autocapture ni session replay. Privacidad por diseño: solo eventos
  explícitos del funnel, **jamás nombres, teléfonos, correos ni códigos** (las
  URLs de tiquete se normalizan a `/turno/[codigo]` antes de enviarse). El
  `distinct_id` es un UUID anónimo local.
- **Opt-in por despliegue** (mismo patrón que Turnstile y Resend): sin
  `NEXT_PUBLIC_POSTHOG_KEY` no sale ni un byte. Cero costo hasta conectarlo.
- Eventos instrumentados: `wizard_iniciado`, `wizard_paso`,
  `reserva_completada` (con nº de servicios, parche, si dejó correo, si pide
  anticipo), `reserva_fallida` (código de error), `pago_checkout_abierto`,
  `pago_resultado`, `regalo_checkout`, `resena_enviada`, `fila_vista`.

**Pendiente del dueño:** crear el proyecto en posthog.com (gratis) y poner la
llave en `NEXT_PUBLIC_POSTHOG_KEY` (+ `NEXT_PUBLIC_POSTHOG_HOST` si elige UE).

## 5. Cloudflare como DNS + WAF/CDN — RECOMENDADO (runbook listo)

**Encaja triple, y gratis en plan Free:**
1. **DNS** del dominio (apuntando a Amplify y API Gateway).
2. **WAF + rate limiting en el borde** — cierra el riesgo R2 de
   [SECURITY.md](SECURITY.md) (los contadores en memoria se diluyen entre
   Lambdas; Cloudflare frena el grueso antes de llegar).
3. **Sinergia ya construida:** Turnstile (integrado en la ronda de seguridad)
   es de Cloudflare — misma cuenta, mismo panel.

**Runbook (cuando exista dominio):** registrar el sitio en Cloudflare Free →
cambiar los nameservers en el registrador → CNAME `www`/raíz a Amplify y
`api` a API Gateway (proxied ☁️) → activar "Bot fight mode" y una regla de
rate limiting sobre `/api/v1/auth/*` → en Amplify/API Gateway restringir
tráfico a IPs de Cloudflare (o header secreto) para no dejar el origen
expuesto. Nada de esto requiere cambios de código.

**Pendiente del dueño:** cuenta Cloudflare (gratis) + dominio (ver §7).

## 6. Resend como motor de correos — IMPLEMENTADO

**Reabre las notificaciones automáticas sin lo que mató a WhatsApp/Meta
(ADR-009):** sin aprobación de terceros, sin costo por conversación (free tier:
3.000 correos/mes, 100/día — sobra), sin plantillas revisadas. El principio de
ADR-009 se mantiene: **el código en pantalla sigue siendo el canal oficial; el
correo es una copia de cortesía y siempre opcional.**

**Qué se construyó:**
- **Backend** ([app/services/notifications.py](backend/app/services/notifications.py),
  migración `0008`): 3 correos con la identidad de la marca (tinta/oro/mono):
  1. **Confirmación de reserva** — datos del turno + código + botón al tiquete
     vivo. Sale al confirmar; con anticipo activo, sale **al aprobarse el pago**.
  2. **Recordatorio de confirmación de asistencia** — "¿sigues en pie?", con la
     hora límite antes de que el cupo se libere. **Sin cron**, fiel a la
     arquitectura: un sweep perezoso disparado por el tráfico normal
     (disponibilidad/fila/dashboard), idempotente por turno.
  3. **Código de regalo** — al aprobarse la compra en línea, el código G-XXXXXX
     llega al correo del comprador.
- **Modo desarrollo sin cuenta:** sin `RESEND_API_KEY`, cada correo queda como
  `.html` en `backend/outbox/` (gitignored) — demostrable y testeable hoy,
  cero costo. Con la key, envía por `POST api.resend.com/emails`.
- **Nunca estorba:** un fallo de envío se registra y jamás rompe una reserva.
- **Frontend:** campo "Correo (opcional)" en el paso Tus datos del wizard y en
  /regalos; la confirmación menciona la copia enviada.
- **Tests:** 6 nuevos en `tests/test_notifications.py` (confirmación, opcional,
  inválido → 422, recordatorio idempotente, regalo, flujo con anticipo).

**Pendiente del dueño:** cuenta en resend.com (gratis), verificar el dominio
propio y setear `RESEND_API_KEY` + `EMAIL_FROM` (ej.
`Will Barbershop <turnos@dominio.com>`). Sin dominio propio los correos solo pueden
salir de `onboarding@resend.dev` (pruebas).

## 7. Spaceship como registrador de dominio — RECOMENDADO

Precios verificados (jul-2026): **.com ≈ 9–10 USD/año** (registro y
renovación casi iguales — sin sorpresa al renovar), permite nameservers
externos (necesario para delegar a Cloudflare, cosa que Cloudflare Registrar
por ejemplo no permite al revés). Sugerencias a revisar con el dueño:
`willbarbershop.com` / `.com.co` / `willbarbershop.com.co`.

**Cadena completa cuando se compre:** Spaceship (dominio) → Cloudflare (DNS +
WAF) → Amplify/API Gateway (app) → Resend (dominio verificado para correos:
registros SPF/DKIM que Resend genera se agregan en Cloudflare).

---

## Qué quedó pendiente por requerir dinero real o cuentas del dueño

| Paso | Dónde | Costo |
|---|---|---|
| Comprar el dominio | spaceship.com | ~10 USD/año |
| Cuenta Cloudflare + delegar DNS + WAF | cloudflare.com | Gratis (plan Free) |
| Cuenta Resend + verificar dominio + `RESEND_API_KEY` | resend.com | Gratis (3k correos/mes) |
| Proyecto PostHog + `NEXT_PUBLIC_POSTHOG_KEY` | posthog.com | Gratis (1M eventos/mes) |
| Elegir RDS o Supabase para el Postgres de producción | checkpoint Fase 4 | ~23–25 USD/mes cualquiera |
| (Solo si algún día se vende al exterior) LLC para Stripe | trámite legal | No recomendado hoy |

Todo lo técnico de cada fila ya está listo del lado del código: son llaves y
cuentas, no desarrollo.

## Verificación

- Backend: **83 tests en verde** (incluye 6 nuevos de correos + 1 de pooler);
  `ruff` limpio; migración `0008` aplicada.
- Frontend: typecheck + 12 tests unitarios + build de producción en verde.
- Capturas actualizadas en `docs/screenshots/` (07 con campo de correo, 09/10
  con la nota de copia enviada, 45 regalos con correo y **52: el correo de
  confirmación real** renderizado desde el outbox).
