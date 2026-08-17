# Will Barber Shop — Reservas de barbería

La página de reservas personal de **Will Barber Shop**, barbero profesional en
Soacha, Cundinamarca. Un solo profesional, una sola agenda: el cliente elige
servicio, fecha y hora, deja sus datos y recibe un código de gestión en
pantalla. Sin selección de barbero, sin cobro en línea.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS + Motion |
| Backend / API | Python 3.12+ / FastAPI, empaquetado para AWS Lambda (Mangum) |
| Base de datos | PostgreSQL (RDS en prod, Docker en local; SQLite como fallback dev) |
| ORM / migraciones | SQLAlchemy 2.x + Alembic |
| Imágenes | Amazon S3 + CloudFront (local: carpeta `content/`) |
| Autenticación | JWT propio (access + refresh), bcrypt |
| IaC | Terraform (`infra/`, entornos `dev` y `prod`) |
| CI/CD | GitHub Actions |
| Testing | pytest (backend) · Vitest + Playwright (frontend) |

## Estructura del repositorio

```
├── frontend/            # Next.js — sitio público + panel de Will
├── backend/             # FastAPI — API REST
│   ├── app/             #   código de la aplicación
│   ├── alembic/         #   migraciones (proposed/ = destructivas, requieren OK)
│   └── tests/           #   suite pytest
├── infra/               # Terraform (modules + environments/{dev,prod})
├── content/will-barbershop # Fotos reales (gallery / profile / cuts / products)
├── legacy-styles/       # Piel anterior archivada (referencia, no código vivo)
├── docs/                # ARCHITECTURE, DEPLOYMENT (+ docs/archive/)
├── DESIGN_SYSTEM.md     # Sistema de diseño vigente («Estudio Barber Shop»)
└── docker-compose.yml   # Postgres + backend + frontend con un solo comando
```

## Desarrollo local

Con Docker:

```bash
docker compose up --build
```

Sin Docker (backend):

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate   # Windows
pip install -e ".[dev]"
set DATABASE_URL=sqlite:///./dev.db
alembic upgrade head && python -m app.seed
uvicorn app.main:app --reload
```

Sin Docker (frontend):

```bash
cd frontend
npm install
npm run dev
```

Al arrancar, la semilla crea el negocio de Will, sus servicios y el usuario
del panel (`will` por defecto). La contraseña **no vive en el repositorio**:
se toma de `SEED_ADMIN_PASSWORD` o, si no la defines, la semilla genera una
aleatoria y la imprime una sola vez en el log del arranque — cópiala de ahí
y cámbiala al entrar.

**Fotos reales:** colócalas en `content/will-barbershop/{gallery,profile,cuts}` y
se indexan solas al arrancar, o súbelas por drag & drop desde `/admin/galeria`.

**Videos:** viven en `content/will-barbershop/videos/`, junto al resto de
medios, y los sirve el backend en `/media/`. Tres archivos por clip:
`-720.mp4` para datos móviles, `-1080.mp4` para escritorio y `-poster.jpg`.
La lista de los publicados está en un solo sitio, `frontend/lib/videos.ts`.
Los originales del celular se quedan en `_originales-video/`.

**Ninguno de los dos entra al repositorio, y es a propósito.** Algunos clips
muestran clientes menores de edad, publicados con permiso de sus padres — un
permiso revocable. Un repositorio público conserva para siempre lo que entra,
incluso en bifurcaciones de terceros: retirar un clip del sitio no bastaría
para retirarlo del mundo. Viviendo en `content/`, borrar el archivo alcanza.
Y no se excluyen solo esos clips sino todos, porque excluir únicamente los de
los menores sería señalar cuáles son.

Para añadir clips, deja los MOV en `_originales-video/` y corre:

```bash
bash scripts/comprimir-videos.sh
```

El guion recorta a 12 s, quita el audio, genera los dos tamaños y el póster, y
**verifica que no sobreviva ningún metadato del original** — los MOV del iPhone
traen fecha de captura y, algunos, las coordenadas GPS del sitio donde se
grabaron. Publicar eso junto a la cara de un cliente es dar su ubicación. Si
encuentra alguno, falla y no te deja publicar.

Después, añade la entrada en `frontend/lib/videos.ts`. **Para retirar un clip,
borra su entrada de ese archivo** (y sus tres archivos, si quieres que además
desaparezca del servidor). No hay un segundo sitio que tocar.

## Tests

```bash
cd backend && pytest -m "not postgres"   # unitarios (SQLite)
cd backend && pytest -m postgres         # constraint anti doble-reserva (necesita PG)
cd frontend && npm run lint              # typecheck
cd frontend && npm test                  # Vitest
```

## Documentación

- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — el sistema de diseño y sus razones
- [REFACTOR_PLAN.md](REFACTOR_PLAN.md) — bitácora del refactor a marca personal
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitectura y ADRs
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — despliegue a AWS con Terraform

## Principios de diseño

1. **Un solo profesional**: ningún identificador de barbero cruza la frontera
   HTTP; la silla única se resuelve en servidor (`services/professional.py`).
2. **Serverless-first**: Lambda + API Gateway + RDS escala a cero en horas muertas.
3. **Código en pantalla (ADR-009)**: el cliente gestiona su turno con el código
   que recibe al reservar; el correo es copia de cortesía opcional.
4. **Zona horaria única**: `America/Bogota` en frontend, backend y datos.
5. **Doble-reserva imposible a nivel de base de datos** en Postgres: constraint
   de exclusión (`EXCLUDE USING gist`) sobre el rango horario, además de la
   validación de aplicación (ver REFACTOR_PLAN.md §Bloque 5 para la divergencia
   SQLite en desarrollo).

> ⚠️ **No corras `npm run build` mientras `npm run dev` está activo:** ambos
> escriben en `frontend/.next/` y el build deja al servidor de desarrollo
> sirviendo HTML sin CSS (`MODULE_NOT_FOUND` en los chunks). Si pasa: detén el
> dev server, borra `.next` y vuelve a arrancarlo.
