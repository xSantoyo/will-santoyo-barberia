# Arquitectura — Plataforma Will Santoyo

> Documento de referencia técnica. Última actualización: Fase 0–3 (julio 2026).

## 1. Diagrama general

```
Cliente (navegador)
        │
        ▼
┌─────────────────────────────┐
│ Frontend Next.js (App Router)│  AWS Amplify Hosting (SSR/ISR soportado)
└─────────────┬───────────────┘
              │ REST/JSON  (HTTPS)
              ▼
┌─────────────────────────────┐        ┌──────────────────────────┐
│ Backend FastAPI              │───────►│ Amazon RDS PostgreSQL 16 │
│ AWS Lambda + API Gateway     │  SQL   │ (multi-tenant)           │
│ (Mangum ASGI adapter)        │        └──────────────────────────┘
└─────────────┬───────────────┘
              │ presigned URLs
              ▼
       ┌──────────────────────┐
       │ S3 + CloudFront      │  imágenes: gallery/barbers/cuts
       └──────────────────────┘
```

> Nota: la capa n8n → WhatsApp del diseño original fue **retirada** (ADR-009).
> El código de gestión en pantalla y el dashboard del admin cubren la
> comunicación con cliente y negocio sin canal externo.

## 2. Decisiones de arquitectura (ADR resumidas)

### ADR-001 — Serverless-first para el backend
**Decisión:** FastAPI empaquetado con Mangum sobre Lambda + API Gateway HTTP API.
**Por qué:** con 3 barberos el tráfico es de decenas de peticiones/hora; Lambda escala a
cero y el costo es marginal. FastAPI corre idéntico en local (uvicorn) y en Lambda
(Mangum), así que el desarrollo no se acopla a AWS.
**Trade-off aceptado:** cold starts de ~1s en la primera petición; irrelevante para
este caso de uso. Si el tráfico creciera, el mismo contenedor pasa a Fargate sin
cambiar código.

### ADR-002 — Multi-tenant por columna `tenant_id` (pool model)
**Decisión:** una sola base de datos, columna `tenant_id` (FK a `tenants`) en toda tabla
de negocio, con índices compuestos que empiezan por `tenant_id`.
**Por qué:** es el modelo de menor costo operativo a esta escala y el estándar para SaaS
early-stage. Silo por schema/DB se puede introducir después para clientes enterprise sin
romper el modelo (el `tenant_id` ya viaja por toda la aplicación).
**Regla dura:** ninguna query de negocio sin filtro de tenant. El acceso a datos pasa por
repositorios que exigen `tenant_id` como argumento.

### ADR-003 — Prevención de doble-reserva a nivel de base de datos
**Decisión:** constraint de exclusión PostgreSQL:
```sql
ALTER TABLE appointments ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('pendiente','confirmado','en_curso'));
```
**Por qué:** la validación de aplicación (que también existe, para dar errores amigables)
sufre condiciones de carrera entre dos requests concurrentes. El constraint hace que la
carrera la pierda uno de los dos `INSERT`s con un error 23P01 que el backend traduce a
HTTP 409. Requiere la extensión `btree_gist` (disponible en RDS).
**Nota de portabilidad:** en SQLite (solo tests unitarios rápidos) el constraint no
existe; la suite incluye tests de integración contra Postgres real (docker-compose / CI)
que verifican el constraint disparando inserts concurrentes.

### ADR-004 — n8n como capa de automatización desacoplada ⛔ SUPERSEDIDO por ADR-009
**Decisión original:** el backend emitía webhooks de dominio y n8n los convertía en
mensajes de WhatsApp. **Retirado en julio 2026** — ver ADR-009. Los workflows
exportados se conservan como referencia histórica en `automation/workflows/`.

### ADR-005 — Fechas y horas
**Decisión:** todas las columnas temporales son `TIMESTAMPTZ` guardadas en UTC; la zona
de negocio `America/Bogota` vive en la fila del tenant y se aplica en los bordes
(API de disponibilidad, mensajes de WhatsApp, UI). El frontend nunca usa la zona del
navegador para lógica de negocio.
**Por qué:** Colombia no tiene DST hoy, pero legislar sobre "hora local ingenua" en la DB
es la fuente clásica de bugs si el negocio se expande. UTC + conversión en bordes es lo
único que sobrevive a múltiples tenants en múltiples países (Fase 5).

### ADR-006 — Autenticación JWT propia (no Cognito)
**Decisión:** JWT firmado con clave simétrica (HS256) emitido por FastAPI; access token
de 30 min + refresh token de 14 días con rotación; contraseñas bcrypt (passlib).
**Por qué:** el requisito son 2 roles y ~4 usuarios por tenant. Cognito añade curva de
aprendizaje, costos de MAU y lock-in para un problema que passlib+PyJWT resuelven en
200 líneas auditables. El diseño deja la interfaz `AuthService` aislada por si algún
día se migra a un IdP.

### ADR-007 — Imágenes por URLs pre-firmadas
**Decisión:** el navegador del admin sube directo a S3 con `presigned POST` generado por
el backend (valida tipo/tamaño y registra el `MediaAsset` en DB); CloudFront sirve las
imágenes públicas. En local, un `StorageService` alternativo escribe a
`content/will-santoyo/` y las sirve el propio backend.
**Por qué:** las imágenes no deben pasar por Lambda (límite de payload de 6 MB y costo
de tiempo de ejecución). El patrón presigned es el estándar.

### ADR-009 — Sin WhatsApp Business API ni n8n (julio 2026)
**Decisión:** se elimina por completo la integración con Meta WhatsApp Business Cloud
API (directa o vía BSP) y con ella el servicio n8n, cuyo único propósito era orquestar
esos envíos.
**Por qué:** el costo por conversación de Meta y, sobre todo, el proceso de
verificación de negocio ante Meta no se justifican para el alcance actual (una
barbería, 3 barberos). Menos partes móviles = menos costo fijo (~9 USD/mes de EC2
menos, cero costo por conversación) y menos superficie operativa.
**Cómo se cubren las necesidades que atendía:**
- *Confirmación al cliente:* el **código de gestión se muestra de forma prominente en
  pantalla** al confirmar la reserva, con instrucción explícita de guardarlo
  (captura/copiar). Con él consulta o cancela en `/turno/<código>` o con
  teléfono + código.
- *Alerta de turno nuevo al negocio:* dashboard del panel admin (turnos del día,
  turno en curso) + indicador de "turnos nuevos sin revisar" con marca local de
  última revisión. Sin canal externo.
- *Recordatorio 24h / no-show:* quedan fuera del alcance v1. Si se retoman, la vía
  preparada es EventBridge Scheduler + Lambda o un canal más barato (email), sin
  reconstruir nada: el modelo de datos y los estados ya lo soportan.
**Qué se conserva:** los workflows n8n exportados quedan en `automation/workflows/`
como referencia histórica (no se despliegan); el enlace `wa.me` del sitio público se
mantiene — es un enlace de chat normal, no usa la API.
**Reversibilidad:** re-agregar el canal es aditivo (webhook post-commit + plantillas);
ninguna decisión de esquema lo bloquea.

### ADR-008 — Amplify Hosting para Next.js
**Decisión:** Amplify Hosting (soporta SSR/ISR de Next.js App Router de forma nativa).
**Verificación pendiente al desplegar (Fase 4):** confirmar en la documentación vigente
de Amplify la versión máxima de Next.js soportada; si hubiera un gap, la alternativa
sin cambiar de espíritu es exportar el sitio público como estático + rutas dinámicas
en Lambda, o SST/OpenNext sobre CloudFront+Lambda.

## 3. Modelo de datos

```
tenants ─┬─< barbers ─────< barber_time_off        (descansos puntuales)
         ├─< services
         ├─< appointments >── appointment_services  (M:N con snapshot de precio)
         ├─< admin_users
         └─< media_assets
```

Tablas y campos clave (ver `backend/app/models.py` como fuente de verdad):

| Tabla | Campos relevantes |
|---|---|
| `tenants` | `id`, `name`, `slug`, `whatsapp_number`, `timezone`, `brand_config` (JSONB), horario del negocio (JSONB por día) |
| `barbers` | `id`, `tenant_id`, `name`, `photo_key`, `specialty`, `schedule` (JSONB por día: inicio/fin o null=descanso), `is_active` |
| `barber_time_off` | excepciones puntuales: `barber_id`, `date`, `reason` |
| `services` | `id`, `tenant_id`, `name`, `price_cop` (entero, centavos no aplican en COP), `duration_min`, `is_active` |
| `appointments` | `id`, `tenant_id`, `barber_id`, `customer_name`, `customer_whatsapp`, `starts_at`/`ends_at` (UTC), `status`, `daily_number` (turno del día por barbero), `manage_code` (código único de gestión), timestamps |
| `appointment_services` | snapshot de `price_cop` y `duration_min` al momento de reservar |
| `admin_users` | `username`, `password_hash`, `role` (`admin`/`barbero`), `barber_id` opcional |
| `media_assets` | `tenant_id`, `kind` (`gallery`/`barber`/`cut`), `s3_key`, `sort_order` |
| `audit_log` | quién hizo qué: `actor_user_id`, `action`, `entity`, `entity_id`, `payload` (JSONB) |

Estados de un turno: `pendiente → confirmado → en_curso → completado`,
con salidas `cancelado` y `no_show`. El turno nace `confirmado` (la confirmación
automática es el comportamiento de negocio deseado; `pendiente` queda reservado para
futuros flujos de aprobación manual).

## 4. Eventos y notificaciones

Retirados junto con n8n/WhatsApp (ADR-009). El "canal" del cliente es el código de
gestión en pantalla; el del negocio, el dashboard del panel. El contrato de webhooks
original quedó documentado en el historial de git y en `automation/workflows/` por si
se retoma un canal de notificaciones en el futuro.

## 5. Seguridad

- HTTPS extremo a extremo (API Gateway + Amplify + CloudFront).
- Rate limiting en endpoints públicos de agendamiento (slowapi en app; en prod además
  throttling de API Gateway).
- Validación estricta con Pydantic v2; ORM SQLAlchemy (cero SQL concatenado).
- CORS restringido al dominio del frontend.
- Secretos solo en AWS Secrets Manager / SSM; en local `.env` (gitignored) con
  `.env.example` documentado.
- `audit_log` de acciones de administración (crear/reprogramar/cancelar turnos, cambios
  de servicios/barberos).

## 6. Entornos

| | Local | dev (AWS) | prod (AWS) |
|---|---|---|---|
| DB | Postgres 16 en Docker | RDS db.t4g.micro | RDS db.t4g.micro (multi-AZ opcional) |
| API | uvicorn --reload | Lambda alias `dev` | Lambda alias `prod` |
| Frontend | next dev | Amplify branch `dev` | Amplify branch `main` |
| Imágenes | carpeta `content/` | S3 dev | S3 prod + CloudFront |

## 7. Qué NO se construye todavía (Fase 5, futuro)

- Onboarding self-service de nuevas barberías y panel super-admin.
- Facturación/cobros.
- El diseño actual no lo bloquea: crear un tenant nuevo hoy es un insert en `tenants` +
  usuarios/barberos/servicios propios; todo el código ya resuelve por `tenant_id`.
