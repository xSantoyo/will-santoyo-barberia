# REFACTOR — De plataforma multi-barbero a la agenda personal de Will Santoyo

**Fecha:** 15 de agosto de 2026
**Rama:** `master`
**Estado:** ✅ backend y frontend completos y en verde · corriendo en local

### Cierre de la Fase 5 (15-ago-2026)

| Verificación | Resultado |
|---|---|
| `tsc --noEmit` | ✅ 0 errores |
| `next build` | ✅ completo |
| Vitest | ✅ 10/10 |
| pytest | ✅ 70/70 |
| Reserva de punta a punta | ✅ código `D6U7UZMP`, turno #1, visible en el panel |
| Viewport móvil (375×812) | ✅ sin desbordamiento horizontal, 11/11 botones ≥44px |

**Skills aplicadas, en orden y antes de escribir cada pieza:** `pick-ui-library`
(previo, justifica `sonner` y `clsx`) → `prototype` (estructura) → `apple-design` +
`emil-design-eng` (jerarquía, curvas, reduced-motion) → `animate` (transición
direccional entre pasos) → `ask-sonner` (un solo `<Toaster/>` en la raíz).

**Pendiente:** el pase final de `improve-animations` y `review-animations` sobre las
animaciones heredadas (las secciones antiguas todavía usan `transition-all` y
duraciones de 300–500 ms, que el estándar de la skill marca como bloqueo).

### Progreso real

| Fase | Estado |
|---|---|
| 0 · Auditoría | ✅ completa (este documento) |
| 1 · Modelo y semilla | ✅ completa · commit `fecc741` |
| 2 · API backend | ✅ completa · commit `fecc741` |
| 9a · Tests backend | ✅ **70/70 en verde** |
| 3 · Contratos frontend | 🟡 `types.ts` y `api.ts` listos; falta `admin-api.ts` |
| 4 · Borrado de rutas | ✅ `/barbero/[id]` y `/admin/barberos` eliminadas |
| 5–8, 9b, 10, 11 | ⬜ pendientes |

### Backend — terminado y verificado

- `Barber` → `Professional` (tabla de registro único), `BarberTimeOff` → `TimeOff`
- `barber_id` → `professional_id` en `appointments`, `reviews`, `time_off`
- `AdminUser` pierde `barber_id`; el rol `barbero` se retira por completo
- `services/professional.py` — resolver único: **ningún identificador de profesional
  cruza la frontera HTTP**
- Endpoints eliminados: `GET/POST/PATCH /barbers`, `/barbers/{id}/portfolio`,
  `/barbers` público. Nuevos: `/professional`, `/profile`, `/time-off`, `/trayectoria`
- `dashboard`, `agenda`, `queue` y `stats` colapsan a un bloque único; `reviews` pierde
  `per_barber`
- `seed.py`: Will Santoyo, Bogotá, sus redes, horario lunes a sábado
- `content/bad-boys/` → `content/will-santoyo/{gallery,profile,cuts,products}`
- Migración `0009` (renombrados, no destructiva) **lista para ejecutar**
- Migración `0010` (destructiva) en `alembic/proposed/` con extensión `.proposed`:
  **fuera del alcance de `alembic upgrade head`** hasta que la apruebes
- 13 tests del rol barbero y del CRUD de barberos retirados por quedar sin objeto

> ⚠️ **Nota de entorno resuelta:** el venv apuntaba a un Python 3.13 borrado. Se recreó
> con Python 3.14.7. Si `pytest` falla con "no se encuentra el ejecutable", recrear:
> `cd backend; py -3 -m venv .venv; .venv\Scripts\pip install -e ".[dev]"`

### Frontend — 63 errores de tipo pendientes

`types.ts` y `api.ts` ya reflejan la API nueva, y las dos rutas de barberos están
borradas. Eso deja al descubierto todo lo que aún habla el idioma viejo:

| Archivo | Errores | Trabajo |
|---|---:|---|
| `app/admin/page.tsx` | 19 | Dashboard: `barbers[]` → bloque único |
| `components/booking/Wizard.tsx` | 10 | **5 pasos → 3** + rediseño |
| `app/hoy/page.tsx` | 5 | La Fila: carriles → carril único |
| `app/turno/[code]/page.tsx` | 3 | Quitar `barber_name` del tiquete |
| `lib/admin-api.ts` | 3 | Quitar `barbers()`, `createBarber()`, `updateBarber()` |
| `app/page.tsx` | 3 | Home reconstruida alrededor de Will |
| `components/admin/ClientProfileModal.tsx` | 3 | Quitar "barbero favorito" |
| `app/embed/page.tsx` | 3 | Widget sin carriles |
| `app/admin/turnos/page.tsx` | 3 | Sin filtro ni columna de barbero |
| `components/public/LiveStrip.tsx` | 3 | "N sillas libres" → estado único |
| `app/admin/mi-desempeno/page.tsx` | 3 | `BarberStats` → `PerformanceStats` |
| `components/public/Sections.tsx` | 2 | **Borrar la sección `Barbers`** |
| `app/mi-historial/page.tsx` | 1 | Quitar `barber_name` |
| `app/admin/agenda/page.tsx` | 1 | Una sola columna |
| `tests/components.test.tsx` | 1 | Actualizar |

**Pendiente además del tipado:** el rediseño visual (Fases 5–8) y el QA de movimiento
(Fase 10), que exigen leer y aplicar `prototype`, `apple-design`, `emil-design-eng`,
`animate`, `ask-sonner`, `find-animation-opportunities`, `improve-animations` y
`review-animations`. **Todavía no se ha escrito UI nueva**, así que la regla dura del
encargo sigue intacta: nada de UI sin pasar por esas skills.

---

## 0. Resumen ejecutivo

El repositorio implementa hoy **Bad Boys Barbershop**: una plataforma multi-tenant,
multi-barbero (3 sillas), con selección de profesional en la reserva, portafolios
individuales, tablero de fila con un carril por barbero y panel administrativo con
rol `barbero` restringido a la agenda propia.

El nuevo alcance es **la página de reservas personal de Will Santoyo**, barbero
profesional en Bogotá. Un solo profesional, una sola agenda, una sola silla.

**Hallazgo determinante de la auditoría:** el nombre "Will" **no aparece en ninguna
parte del repositorio**. Los tres barberos son placeholders (`Barbero 1`, `Barbero 2`,
`Barbero 3`) y las carpetas `content/bad-boys/{barbers,cuts,gallery}` están **vacías**.
Esto significa que:

- No hay assets reales de otros barberos que borrar (riesgo cero en esa dimensión).
- El refactor **no es un recorte, es un rebrand completo**: marca, copy, identidad
  visual y metadatos se reconstruyen alrededor de una persona.

### Identidad de destino (fuente: perfil público de Instagram aportado por el dueño)

| Campo | Valor |
|---|---|
| Nombre | Will Santoyo |
| Oficio | Barbero profesional |
| Ciudad | Bogotá, Colombia |
| Instagram | [@_barber_wil_](https://instagram.com/_barber_wil_) |
| TikTok | Will Santoyo |
| Facebook | facebook.com/willsantoyo.0 |
| Teléfono de agenda | 321 201 4153 |

> ⚠️ **A verificar contigo:** el teléfono y las redes se toman del perfil público de
> Instagram. Ya son públicos ahí como número de agenda, pero confírmame la dirección
> exacta del local (hoy es un placeholder: `Cra. 00 # 00-00, Barrio Ejemplo`) y si
> quieres que el teléfono aparezca en el sitio.

---

## 1. Inventario del acoplamiento multi-barbero

Medido por número de referencias a `barber`/`barbero` por archivo.

### 1.1 Frontend — eliminar por completo

| Archivo | Refs | Destino |
|---|---:|---|
| `frontend/app/barbero/[id]/page.tsx` | 21 | **BORRAR** — ruta de portafolio por barbero |
| `frontend/app/admin/barberos/page.tsx` | 52 | **BORRAR** — CRUD de barberos |
| `Sections.tsx` → export `Barbers` | 30 | **BORRAR** — sección "Nuestro equipo" |

### 1.2 Frontend — transformar

| Archivo | Refs | Cambio |
|---|---:|---|
| `components/booking/Wizard.tsx` | 42 | 5 pasos → 3; eliminar paso "Barbero"; rediseño completo |
| `lib/types.ts` | 21 | Eliminar `BarberPublic`, `BarberAdmin`, `BarberPortfolio`, `BarberStats`, `DashboardBarberBlock`; podar `barber_*` de 8 interfaces |
| `app/admin/turnos/page.tsx` | 32 | Quitar filtro y columna de barbero |
| `app/admin/agenda/page.tsx` | 19 | Una sola columna de agenda |
| `lib/admin-api.ts` | 22 | Quitar `barbers()`, `createBarber()`, `updateBarber()` |
| `app/admin/page.tsx` | 13 | Dashboard: bloques por barbero → bloque único |
| `lib/api.ts` | 11 | Quitar `barbers()`, `portfolio()`; `availability()`/`book()` sin `barber_id` |
| `app/turno/[code]/page.tsx` | 10 | Quitar `barber_name` del tiquete |
| `app/page.tsx` | 8 | Home reconstruida alrededor de Will |
| `app/admin/mi-desempeno/page.tsx` | 7 | Deja de ser vista de rol `barbero`: es *la* vista de Will |
| `app/admin/layout.tsx` | 7 | Quitar navegación condicional por rol |
| `app/hoy/page.tsx` | 5 | La Fila: carriles → carril único |
| `components/public/LiveStrip.tsx` | 3 | "N sillas libres" → estado único |
| `components/public/Hero.tsx` | 3 | Hero personal |
| `app/layout.tsx` | 4 | Metadatos y SEO |
| `components/admin/ClientProfileModal.tsx` | 4 | Quitar "barbero favorito" |

### 1.3 Backend — transformar

| Archivo | Refs | Cambio |
|---|---:|---|
| `app/routers/admin.py` | 126 | Eliminar 5 endpoints de barberos; colapsar dashboard/agenda/stats |
| `app/routers/public.py` | 68 | Eliminar 3 endpoints; quitar `barber_id` de disponibilidad y reserva |
| `app/services/appointments.py` | 50 | Resolución del profesional en servidor, no por parámetro |
| `app/seed.py` | 29 | 3 barberos placeholder → Will; tenant → marca personal |
| `app/models.py` | 21 | Ver decisión de modelo de datos (§4) |
| `app/schemas.py` | 17 | Podar `barber_id`/`barber_name` de ~12 esquemas |
| `app/services/availability.py` | 15 | Firma sin `Barber`; horario desde el tenant |
| `app/services/clients.py` | 5 | Quitar `favorite_barber` |
| `app/routers/common.py` | 7 | Quitar resolución de barbero |
| `app/deps.py` | 3 | Quitar dependencia de rol `barbero` |
| `app/routers/auth.py` | 4 | Token sin `barber_id`; rol único |

### 1.4 Tests — 11 archivos, ~250 referencias

`test_security.py` (50), `test_admin.py` (41), `test_booking.py` (39),
`test_payments.py` (28), `test_growth.py` (27), `test_double_booking.py` (26),
`test_walkin_attendance.py` (22), `test_postgres_constraint.py` (22),
`test_clients_reviews.py` (21), `test_availability.py` (19),
`test_notifications.py` (19), `test_queue.py` (12), `conftest.py` (15).

Frontend: `tests/components.test.tsx` (19), `e2e/screenshots.capture.spec.ts` (25),
`e2e/admin-panel.spec.ts` (10), `e2e/booking-flow.spec.ts`, `tests/calendar.test.ts` (4).

### 1.5 Documentación y varios

`SECURITY.md` (20), `docs/ARCHITECTURE.md` (14), `docs/PROPUESTA_COMERCIAL.md` (11),
`README.md` (8), `MIGRATION.md` (4), `scratchpad/demo_queue.py` (14),
`automation/workflows/04-resumen-diario.json` (4).

---

## 2. Modelo de datos actual

```
Tenant ──1:N──> Barber ──1:N──> BarberTimeOff
                  │
                  ├──1:N──> Appointment      (appointments.barber_id, FK)
                  ├──1:N──> Review           (reviews.barber_id, FK)
                  └──0:1──> AdminUser        (admin_users.barber_id, FK, rol "barbero")
```

**Tablas con acoplamiento directo:**

| Tabla | Columna | Nota |
|---|---|---|
| `barbers` | (tabla completa) | name, photo_key, specialty, instagram, schedule, is_active, sort_order |
| `barber_time_off` | `barber_id` FK | excepciones puntuales de horario |
| `appointments` | `barber_id` FK | **ancla del constraint anti doble-reserva** |
| `reviews` | `barber_id` FK | reseña atribuida a un barbero |
| `admin_users` | `barber_id` FK + `role` | rol `barbero` con agenda restringida |
| `media_assets` | `kind = "barber"` | tipo de asset "foto de barbero" |

**Índices y constraints acoplados:**

- `ix_appointments_barber_start` (`barber_id`, `starts_at`)
- `uq_barber_time_off` (`barber_id`, `date`)
- `EXCLUDE USING gist` sobre rango horario **por barbero** (migración `0001`, ADR-003) —
  es la garantía a nivel de base de datos de que no existe doble reserva.

---

## 3. Flujo de reserva actual (a reemplazar)

`/agendar` → `Wizard.tsx`, **5 pasos**:

1. **Barbero** — grid de 3 tarjetas con foto, nombre y especialidad. En móvil auto-avanza.
2. **Servicios** — multi-selección + selector de "parche" (1–3 personas, turnos seguidos).
3. **Fecha y hora** — calendario que deshabilita días según `barber.schedule`,
   `barber_time_off`, fechas pasadas y horizonte de 30 días; panel de horarios vía
   `POST /availability` con `barber_id`.
4. **Tus datos** — nombre, WhatsApp, correo opcional, acompañantes, códigos de regalo/referido.
5. **Confirmar** — resumen (primera fila: "Barbero"), honeypot + Turnstile, `POST /appointments`.

→ **Confirmación**: código de gestión revelado con animación de navaja, número de turno
del día, anticipo Wompi opcional, añadir a calendario.

**Flujo nuevo — 3 pasos:** `Servicio → Fecha y hora → Tus datos` → confirmación.
El paso 1 desaparece; el resumen se integra al paso 3 en lugar de ser un paso propio
(cumple el criterio de "máximo 3 pasos").

---

## 4. Decisión de modelo de datos

> El encargo pide resolver `barber_id` "con la estrategia más limpia (constante de
> configuración o eliminación de la relación)" y documentar la decisión.

### Estrategia elegida: **silla única con resolución en servidor**, en dos tiempos

**Tiempo 1 — colapso de aplicación (se ejecuta ya, no destructivo):**

- El concepto "barbero" **desaparece por completo por encima de la capa de
  persistencia**: no existe en la API pública, ni en los esquemas, ni en los tipos del
  frontend, ni en la UI. Ningún `barber_id` cruza jamás la frontera HTTP.
- El backend resuelve el profesional con un único resolver interno
  (`get_professional(db, tenant)`), que devuelve la fila única activa.
- `barbers` queda como **tabla de perfil de un solo registro** (Will), con un guard de
  aplicación que impide crear un segundo.

**Tiempo 2 — colapso de esquema (migración `0009`, escrita pero NO ejecutada):**

Requiere tu OK porque toca datos existentes:

- `barbers.schedule` → `tenants.schedule`; `photo_key`/`specialty`/`instagram` → `tenants.brand_config`
- `barber_time_off` → `time_off` (con `tenant_id`, sin `barber_id`)
- `DROP COLUMN appointments.barber_id`, `reviews.barber_id`, `admin_users.barber_id`
- `DROP TABLE barbers`
- Reconstruir el `EXCLUDE USING gist` sobre `tenant_id` en vez de `barber_id`
- `media_assets.kind`: retirar `"barber"`

### Por qué en dos tiempos y no de una

`appointments.barber_id` **no es una columna fantasma mientras ancla el constraint de
exclusión**: es hoy la garantía, a nivel de motor de base de datos, de que dos clientes
no pueden ocupar el mismo horario (ADR-003). Eliminarla exige reconstruir ese constraint
sobre `tenant_id`, lo que implica `DROP CONSTRAINT` + `DROP COLUMN` sobre una tabla con
reservas reales — exactamente el tipo de cambio que acordamos no ejecutar sin tu
aprobación. La migración queda escrita y probada contra una base limpia; tú decides
cuándo corre contra producción.

---

## 5. Endpoints afectados

### Públicos (`/api/public`)

| Endpoint | Acción |
|---|---|
| `GET /barbers` | **Eliminar** |
| `GET /barbers/{id}/portfolio` | **Eliminar** (su contenido se absorbe en la home) |
| `GET /barbers/{id}/time-off` | → `GET /time-off` |
| `POST /availability` | Quitar `barber_id` del cuerpo |
| `POST /appointments` | Quitar `barber_id` del cuerpo |
| `POST /appointments/group` | Quitar `barber_id` del cuerpo |
| `GET /queue` | `lanes[]` → objeto único |
| `GET /reviews` | Quitar `per_barber` |
| `GET /appointments/{code}` | Quitar `barber_name` |

### Admin (`/api/admin`)

| Endpoint | Acción |
|---|---|
| `GET/POST/PATCH /barbers` | **Eliminar** (3 endpoints) |
| `GET/POST /barbers/{id}/time-off` | → `/time-off` |
| `GET /barber-stats` | → `GET /stats` |
| `GET /dashboard` | `barbers[]` → bloque único |
| `GET /agenda` | Sin agrupación por barbero |
| `GET /appointments` | Sin filtro `barber_id` |
| `POST /appointments`, `/appointments/walk-in` | Sin `barber_id` |

### Auth

| Endpoint | Acción |
|---|---|
| `POST /login`, `/refresh`, `/change-password` | `TokenPair` sin `barber_id`; rol único `admin` |

---

## 6. Dependencias

**Auditadas contra la skill `pick-ui-library`** (paso obligatorio antes de decidir stack):

| Necesidad | Estado |
|---|---|
| Animación (springs, layout, enter/exit) | ✅ `framer-motion` ya instalado — es justo la recomendación (`motion`). Sin cambios. |
| Toasts / feedback | ❌ **Falta.** Hoy el feedback son `<div>` de error en línea. La skill marca esto como *mismatch* explícito → **añadir `sonner`**. |
| className condicional | ⚠️ El Wizard encadena ternarios de 3 niveles en template literals → **añadir `clsx`**. |
| Animar números | ⚠️ `FlipNumber.tsx` es una implementación a mano; la skill recomienda `NumberFlow`. **Propuesta, no obligatoria** — el componente actual funciona y es parte del concepto visual aprobado de La Fila. Se deja como está. |

**Ninguna dependencia queda huérfana** tras el refactor: `lucide-react`, `framer-motion`,
`next`, `react` siguen en uso. No hay nada que desinstalar.

**Neto:** +2 dependencias ligeras (`sonner`, `clsx`), ambas justificadas por la skill.

---

## 7. Plan de ejecución por fases

Commits atómicos, en este orden (cada fase deja el repo compilando):

| # | Fase | Alcance | Skills aplicadas |
|---|---|---|---|
| 1 | **Modelo y semilla** | Resolver de profesional único, guard de fila única, seed → Will Santoyo, migración `0009` escrita sin ejecutar | — |
| 2 | **API backend** | Eliminar endpoints de barberos, podar esquemas, colapsar disponibilidad/dashboard/agenda/stats/queue | — |
| 3 | **Contratos frontend** | `types.ts`, `api.ts`, `admin-api.ts` alineados a la nueva API | — |
| 4 | **Borrado de rutas** | `/barbero/[id]`, `/admin/barberos`, sección `Barbers` | — |
| 5 | **Wizard 3 pasos** | Rediseño completo del flujo de reserva | `prototype`, `apple-design`, `emil-design-eng`, `animate`, `ask-sonner` |
| 6 | **Home personal** | Hero, historia, servicios, galería, horarios, ubicación, CTA único | `apple-design`, `emil-design-eng`, `find-animation-opportunities`, `animate` |
| 7 | **Panel de Will** | Vista única de administración, sin roles | `emil-design-eng`, `ask-sonner` |
| 8 | **Copy, SEO y metadatos** | Primera persona, `schema.org` tipo persona/negocio local, OG tags | — |
| 9 | **Tests** | 11 archivos backend + 5 frontend actualizados | — |
| 10 | **QA de movimiento** | Auditoría y pulido de todas las animaciones | `improve-animations`, `review-animations` |
| 11 | **Verde** | `build` + `lint` + `typecheck` + `pytest` | — |

---

## 8. Requiere tu aprobación explícita

Solo lo destructivo sobre datos. Todo lo demás se ejecuta sin consultar.

1. **Migración `0009`** (§4, Tiempo 2) — queda escrita y probada, no se ejecuta.
2. **Reservas históricas de los 3 barberos placeholder** — si la base local o de
   producción tiene citas de prueba atadas a `Barbero 1/2/3`, propongo reasignarlas a
   Will antes de la migración, no borrarlas. Dime si prefieres purgarlas.
3. **Usuarios `barbero1/2/3`** — el rol desaparece; propongo desactivarlos
   (`is_active = false`) en vez de borrarlos, para conservar la trazabilidad del
   `audit_log`.

## 9. A confirmar (no bloquea la ejecución)

- Dirección real del local (hoy placeholder).
- Si el teléfono `321 201 4153` debe aparecer públicamente en el sitio.
- Si se conserva el nombre comercial "Bad Boys Barbershop" como local donde Will
  atiende, o el sitio pasa a ser 100% "Will Santoyo". **Asumo lo segundo**: marca
  personal pura, que es lo que pide el encargo.
