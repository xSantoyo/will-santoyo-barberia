# Bad Boys Barbershop — Plataforma de Gestión y Reservas

Plataforma completa de gestión y reservas para barberías, con arquitectura **multi-tenant**
lista para escalar a múltiples negocios. El primer cliente en producción es
**Bad Boys Barbershop** (Colombia, 3 barberos).

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS + Framer Motion |
| Backend / API | Python 3.12+ / FastAPI, empaquetado para AWS Lambda (Mangum) |
| Base de datos | PostgreSQL (RDS en prod, Docker en local) |
| ORM / migraciones | SQLAlchemy 2.x + Alembic |
| Imágenes | Amazon S3 + CloudFront (local: carpeta `content/`) |
| Autenticación | JWT propio (access + refresh), bcrypt, roles `admin` / `barbero` |
| IaC | Terraform (`infra/`, entornos `dev` y `prod`) |
| CI/CD | GitHub Actions |
| Testing | pytest (backend) · Vitest + Playwright (frontend) |

## Estructura del repositorio

```
├── frontend/          # Next.js — sitio público + panel admin
├── backend/           # FastAPI — API REST multi-tenant
│   ├── app/           #   código de la aplicación
│   ├── alembic/       #   migraciones de base de datos
│   └── tests/         #   suite pytest
├── infra/             # Terraform (modules + environments/{dev,prod})
├── automation/        # (histórico) workflows n8n del diseño original — ver ADR-009
├── content/bad-boys/  # Fotos reales del cliente (gallery / barbers / cuts)
├── docs/              # ARCHITECTURE, DEPLOYMENT (+ docs/archive/)
└── docker-compose.yml # Postgres + backend + frontend con un solo comando
```

## Desarrollo local (un solo comando)

Requisitos: Docker Desktop (o Docker Engine + Compose v2).

```bash
docker compose up --build
```

Esto levanta:

| Servicio | URL | Notas |
|---|---|---|
| PostgreSQL 16 | `localhost:5432` | usuario/clave/db: `badboys` |
| Backend FastAPI | http://localhost:8000 | docs interactivas en `/docs` |
| Frontend Next.js | http://localhost:3000 | sitio público + `/admin` |

Al arrancar, el backend aplica migraciones Alembic y carga **datos semilla**
(tenant Bad Boys, 3 barberos con horarios distintos, servicios y precios,
usuario admin `admin` / `BadBoys2026!` — cámbialo en producción).

**Fotos reales:** coloca tus imágenes en `content/bad-boys/{gallery,barbers,cuts}`
y se indexan solas en la galería del sitio al arrancar; o súbelas por drag & drop
desde el panel (`/admin/galeria`). En producción viven en S3 + CloudFront.

### Desarrollo sin Docker (backend)

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate   # Windows
pip install -e ".[dev]"
# Postgres local o SQLite de desarrollo:
set DATABASE_URL=sqlite:///./dev.db
alembic upgrade head && python -m app.seed
uvicorn app.main:app --reload
```

### Desarrollo sin Docker (frontend)

```bash
cd frontend
npm install
npm run dev
```

## Tests

```bash
# Backend
cd backend && pytest

# Frontend
cd frontend && npm test        # unitarios/componentes (Vitest)
cd frontend && npm run test:e2e  # end-to-end (Playwright, requiere stack corriendo)
```

## Documentación

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitectura, diagrama y decisiones técnicas (ADRs)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — despliegue a AWS con Terraform, paso a paso
- `docs/archive/` — documentación del canal WhatsApp/n8n retirado (ADR-009), como referencia

## Principios de diseño

1. **Multi-tenant desde el modelo de datos**: toda tabla de negocio lleva `tenant_id`.
   Hoy existe un solo tenant (`bad-boys`), pero el esquema no se rehace para escalar.
2. **Serverless-first**: Lambda + API Gateway + RDS escala a cero costo marginal en horas muertas.
3. **Sin canal de notificación externo (ADR-009)**: el cliente recibe su código de
   gestión en pantalla (y debe guardarlo); el negocio ve los turnos nuevos en el
   dashboard del panel. Cero dependencias de Meta/WhatsApp API.
4. **Zona horaria única**: `America/Bogota` en frontend, backend, DB y mensajes.
5. **Doble-reserva imposible a nivel de base de datos**: constraint de exclusión
   (`EXCLUDE USING gist`) sobre rango horario por barbero, no solo validación de aplicación.
