# Auditoría de seguridad — Bad Boys Barbershop

**Fecha:** 8 de julio de 2026
**Alcance:** backend FastAPI (`backend/`), frontend Next.js (`frontend/`) e
infraestructura Terraform (`infra/`). Multi-tenant desde el modelo de datos.
**Método:** revisión manual endpoint por endpoint + pruebas automatizadas.
Modelo de amenaza principal: la API es pública, cualquiera puede llamarla sin
pasar por la interfaz; por eso toda autorización se verifica **en el backend**,
no escondiendo botones en la UI.

Estado general tras esta ronda: **verde.** 76 pruebas backend + 12 unitarias y
4 E2E de frontend en verde; `pip-audit` y `npm audit` sin vulnerabilidades.
Quedan riesgos conocidos y aceptados (§10), ninguno de severidad alta.

---

## 1. Fuerza bruta en el login — CORREGIDO

**Hallazgo.** El login solo tenía un rate limit por IP en memoria (5/min). Un
atacante con IPs rotativas podía seguir probando; no había registro de intentos
ni bloqueo por usuario.

**Corrección** (`app/services/security.py`, `app/routers/auth.py`,
`app/models.py::LoginThrottle`, migración `0007`):
- Bloqueo **temporal** de 15 min tras 5 fallos, con **backoff exponencial**
  (15 → 30 → 60 … hasta 24 h de tope) si el patrón se repite. El nivel de
  backoff decae solo tras 24 h sin fallos.
- **Nunca permanente**, a propósito: un bloqueo definitivo permitiría a
  cualquiera dejar fuera al admin real con 5 intentos deliberados. El bloqueo
  siempre expira y un login correcto limpia contadores y nivel.
- Throttle combinado **por usuario Y por IP** — solo por usuario no frena un
  ataque distribuido; solo por IP no frena uno concentrado en una cuenta.
- Cada intento fallido se registra con **IP, usuario y timestamp**
  (`security_events` + log JSON).
- El throttle vive en la base de datos: sobrevive reinicios y funciona con
  varias instancias Lambda (a diferencia del contador en memoria).

**Pruebas.** `tests/test_security.py::test_login_lockout_after_failures`,
`::test_lockout_is_temporary_not_permanent`, `::test_failed_logins_are_recorded`.

## 2. Bots y uso malintencionado — CORREGIDO

**Corrección:**
- **Honeypot** (`website`) en el login y en el formulario de agendamiento
  (individual y grupal). Un bot lo rellena; un humano nunca lo ve. La respuesta
  es idéntica a un error normal para no revelar la detección
  (`app/routers/auth.py`, `app/routers/public.py::_reject_bots`,
  `components/security/BotShield.tsx`).
- **Cloudflare Turnstile** integrado y **opt-in por despliegue**: se activa solo
  si hay `TURNSTILE_SECRET_KEY` (backend) y `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  (frontend). En desarrollo queda apagado y no estorba. La verificación
  **falla cerrada** ante error de red (`verify_turnstile`).
- **Detección de ráfagas de reservas** (misma IP o mismo teléfono en poco
  tiempo): registra un evento `booking_burst` sin bloquear la venta legítima
  (`note_public_booking`).

**Pruebas.** `::test_login_honeypot`, `::test_booking_honeypot`,
`::test_booking_burst_is_logged`.

## 3. Análisis de dependencias — CORREGIDO + CI recurrente

- **Backend (`pip-audit`):** sin vulnerabilidades conocidas.
- **Frontend (`npm audit`):** se encontró `postcss < 8.5.10` (moderada, XSS en
  el stringify de CSS) arrastrada por Next.js. **Corregido** con un `overrides`
  a `postcss ^8.5.10` en `package.json` sin romper el build. `npm audit`
  ahora reporta **0 vulnerabilidades**.
- **Recurrente, no una sola vez:** nuevo workflow
  `.github/workflows/security-audit.yml` corre `pip-audit` y `npm audit` en cada
  push/PR **y cada lunes** (las vulnerabilidades nuevas aparecen con el tiempo).

## 4. Roles y permisos / acceso indebido a datos — CORREGIDO

Auditados todos los endpoints (`admin.py`, `public.py`, `auth.py`).

- **`tenant_id` en todas las consultas:** verificado. Cada `select` de tabla de
  negocio filtra por `tenant_id`; los endpoints públicos resuelven el tenant por
  slug y filtran por él. No se encontró ninguna consulta sin el filtro.
- **Barbero solo sus turnos:** `dashboard`, `agenda` y `appointments` fuerzan
  `barber_id = user.barber_id` para el rol barbero; `update_status` rechaza
  turnos de otro barbero (403).
- **Endurecido:** un barbero antes podía consultar el perfil (historial + notas)
  de **cualquier** teléfono. Ahora `_ensure_client_scope` limita al barbero a
  clientes que él ha atendido (el admin ve todos). Cierra la extracción de la
  cartera completa recorriendo teléfonos.
- **Guard central de barbero sin silla:** un `AdminUser` rol barbero con
  `barber_id = NULL` habría pasado los filtros `barber_id == None` y visto todo
  el tenant. Ahora `get_current_user` corta con 403 para todos los endpoints.
- **Acciones de admin bloqueadas en backend:** barberos, servicios, precios,
  productos, regalos, pagos, media, auditoría y eventos de seguridad exigen
  `require_admin` (403 para barbero), no solo se ocultan en la UI.
- **Códigos de gestión:** subidos de **6 a 8 caracteres** (alfabeto de 31 sin
  ambiguos ≈ 8.5×10¹¹ combinaciones). Sumado al rate limit de consulta por
  código (30/min/IP), enumerarlos es inviable. Los códigos viejos de 6 siguen
  siendo válidos.

**Pruebas.** `::test_barbero_client_scope`, `::test_barber_stats_scope`,
`::test_barbero_cannot_touch_admin_areas`,
`::test_barbero_status_only_own_appointments`,
`::test_manage_code_is_long_and_random`, y `test_auth.py` existentes.

## 5. Registro de actividad sospechosa y monitoreo — CORREGIDO

- Nueva tabla `security_events` + logger `badboys.security` que emite cada
  evento como **línea JSON a stdout** (→ CloudWatch Logs). Se registran:
  logins fallidos y correctos, bloqueos, cambios de contraseña, activaciones de
  rate limit, honeypots, CAPTCHA fallido, **fallos de firma del webhook de
  pagos**, webhooks rechazados y ráfagas de reservas.
- Panel **`/admin/seguridad`** (solo admin) para revisar los eventos con filtros.
- **CloudWatch → SNS** (`infra/modules/monitoring/`): metric filters + alarmas
  que notifican por **correo** cuando se dispara un patrón (p. ej. >10 logins
  fallidos en 5 min, cualquier firma de webhook inválida, cualquier ráfaga), sin
  que nadie tenga que mirar logs a mano. Conectado en `environments/prod`.
  **No aprovisionado todavía** (ver §9, checkpoint de costos).

## 6. Vista completa del rol de barbero — CONSTRUIDA

El rol existía pero no gestionaba nada. Ahora un barbero puede, **sin salirse de
su alcance** (verificado en backend, §4):
- **Su agenda del día** (dashboard filtrado) — marcar en curso / completado solo
  en sus turnos.
- **Sus estadísticas** — `/admin/mi-desempeno`: cortes, ingresos generados,
  clientes distintos, calificación, no-shows y sus servicios más pedidos.
  `GET /admin/barber-stats` **ignora cualquier `barber_id` ajeno** cuando el
  token es de un barbero.
- **Notas privadas de sus propios clientes** (perfil limitado a clientes suyos).
- **NO** ve agenda de otros barberos, ni precios, ni barberos, ni analíticas del
  negocio: 403 en el backend, no solo oculto.
- **Cambio de contraseña propia** en `/admin/cuenta` (todos los roles).

## 7. Rate limiting por tipo de endpoint — CORREGIDO

Antes había un único limitador parejo. Ahora, ajustado al tipo
(`app/deps.py`, `app/config.py`):

| Tipo | Límite | Endpoints |
|------|--------|-----------|
| Sensible | **5 / 15 min** | login, cambio de contraseña, inicio de pago (regalos/checkout) |
| Escritura pública | 10 / min | reservar, cancelar, confirmar, reseñar, reagendar |
| Consulta por código | 30 / min | tiquete, estado de pago, posición en fila |
| Lectura pública | 120 / min | disponibilidad, listados, fila, portafolio |
| Webhook / refresh | 60·30 / min | webhook Wompi, refresh de token |

El límite generoso en lectura evita romper el wizard (varios pasos consultan
disponibilidad); el estricto protege las acciones sensibles. Cada activación se
registra como evento `rate_limited`. Se detecta la IP real vía `X-Forwarded-For`
(primer salto que agrega API Gateway).

**Prueba.** `tests/test_availability.py::...` (rate limit existente) + la config
por tipo se ejercita en el resto de la suite pública.

## 8. Seguridad de la pasarela de pagos (Wompi) — CORREGIDO

Revisado contra los dos mecanismos de firma de Wompi
(`app/services/payments.py`):

- **`signature:integrity`** (al iniciar el checkout): ya estaba —
  `SHA256(referencia + monto_en_centavos + moneda + integrity_secret)`.
  Impide alterar monto o referencia antes de pagar.
- **Checksum de eventos (webhook):** endurecido.
  - **Nunca** se marca un turno como pagado por la respuesta del navegador; el
    único camino a "aprobado" es el webhook validado (o el simulador local en
    modo mock, que jamás se activa con llaves reales).
  - Comparación del checksum en **tiempo constante** (`hmac.compare_digest`).
  - **Se exige** que la firma cubra `transaction.id`, `transaction.status` y
    `transaction.amount_in_cents`: un evento con la lista de propiedades
    recortada (checksum trivial) se rechaza.
  - **El monto y la moneda del evento deben coincidir** con los del pago: una
    transacción real de $1 no puede aprobar un anticipo de $20.000.
  - El webhook **no opera en modo mock ni sin `wompi_events_secret`** (con
    secret vacío el checksum sería calculable por cualquiera): responde 403.
  - Todo fallo de firma/monto se registra como evento de seguridad.
- **URLs de eventos separadas por ambiente:** el modo (`mock`/`sandbox`/
  `production`) y las llaves se configuran por variables de entorno / Secrets
  Manager; sandbox y producción usan llaves y endpoints distintos, nunca
  mezclados. El arranque (`main.py::_enforce_production_secrets`) **falla** si
  `wompi_mode=production` sin las tres llaves configuradas.

**Pruebas.** `tests/test_payments.py::test_wompi_webhook_checksum`,
`::test_wompi_webhook_rejected_in_mock_mode`,
`::test_wompi_webhook_amount_mismatch`,
`::test_wompi_webhook_requires_signed_properties`.

## 9. Endurecimiento adicional (encontrado durante la auditoría)

- **Secretos de producción:** el arranque aborta si `ENVIRONMENT != local` y el
  `JWT_SECRET` es el de fábrica o mide menos de 32 caracteres. Mejor no levantar
  que firmar JWT con un secreto público del repositorio.
- **Cabeceras de seguridad:** `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY` (API y frontend, excepto `/embed` que es incrustable a
  propósito), `Referrer-Policy`, `Permissions-Policy` y HSTS en prod
  (`main.py`, `next.config.ts`).
- **Validación real de imágenes subidas:** el `Content-Type` lo declara el
  cliente y no es confiable; ahora se verifica por **magic bytes**
  (`sniff_image_content_type`) — se rechaza un ejecutable renombrado a `.jpg`.

---

## 10. Riesgos conocidos / aceptados

| # | Riesgo | Sev. | Recomendación |
|---|--------|------|---------------|
| R1 | **Rate limit y honeypot son la única barrera anti-bot mientras Turnstile esté apagado.** El código está listo pero el CAPTCHA no se activa hasta configurar las llaves de Cloudflare. | Media | Crear el sitio en Cloudflare Turnstile (gratis) y setear `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` antes de exponer el sitio a tráfico real. |
| R2 | **Los contadores de rate limit viven en memoria por instancia.** Con varias Lambdas concurrentes, el límite efectivo se multiplica por el número de instancias. El *bloqueo de login* sí es global (DB). | Media | En producción, complementar con el throttling de API Gateway (ya en Terraform) y/o mover el rate limit a Redis/DynamoDB si el tráfico lo amerita. |
| R3 | **Alarmas de CloudWatch/SNS no aprovisionadas** (esperan checkpoint de costos). Hoy los eventos quedan en la DB y en los logs, pero nadie recibe aviso automático. | Media | Aplicar `infra/modules/monitoring` (~0.60 USD/mes por las 6 alarmas + SNS por correo). Requiere confirmar la suscripción SNS que llega al correo. |
| R4 | **Sesión del admin en `localStorage`** (no cookie `HttpOnly`). Un XSS podría leer el token. Mitigado por CSP implícita de Next, tokens de vida corta (30 min) y `token_version` para revocación global. | Baja | Si se endurece a futuro, migrar a cookies `HttpOnly`+`SameSite=Strict` con CSRF token. No urgente dado el modelo de amenaza (panel de uso interno). |
| R5 | **Sin verificación de antigüedad (timestamp) del evento de webhook.** El checksum evita falsificación, pero un evento válido reenviado (replay) se reprocesaría — inofensivo hoy porque `apply_result` es idempotente (un pago aprobado no cambia). | Baja | Si Wompi expone un `timestamp` fiable, rechazar eventos con más de N minutos. La idempotencia ya neutraliza el impacto. |
| R6 | **Contraseña seed compartida** (`BadBoys2026!` para admin y barberos). | Media | Forzar cambio en el primer login del dueño y de cada barbero (la pantalla `/admin/cuenta` ya existe). Documentado como paso de puesta en marcha. |
| R7 | **`login_throttles` y `security_events` crecen sin purga.** No es un riesgo de seguridad sino de mantenimiento. | Baja | Job periódico (o TTL) que borre eventos con más de 90 días. |

---

## Cómo re-ejecutar los chequeos

```powershell
# Backend: pruebas + auditoría de dependencias
cd backend
.\.venv\Scripts\python.exe -m pytest -m "not postgres" -q
.\.venv\Scripts\python.exe -m pip_audit --skip-editable

# Frontend: typecheck, pruebas, build y auditoría
$env:PATH = "D:\Downloads\Proyecto Barbería\.tools\node;$env:PATH"
cd frontend
npm run lint; npm test; npm run build; npm audit

# Capturas de verificación visual (con backend :8000 y frontend :3000 arriba)
$env:CAPTURE="1"; npx playwright test screenshots.capture   # → docs/screenshots/
```

En CI todo esto corre en `.github/workflows/ci.yml` y
`.github/workflows/security-audit.yml`.
