# Infraestructura (Terraform)

```
infra/
├── modules/
│   ├── network/      # VPC mínima, subnets, security groups
│   ├── database/     # RDS PostgreSQL 16 (db.t4g.micro)
│   ├── api/          # Lambda (imagen contenedor) + API Gateway HTTP API
│   ├── storage/      # S3 (media) + CloudFront
│   ├── frontend/     # Amplify Hosting conectado al repo GitHub
│   └── secrets/      # Secrets Manager (JWT, DATABASE_URL)
└── environments/
    ├── dev/
    └── prod/
```

> El módulo `automation/` (EC2 con n8n) fue eliminado en ADR-009: sin
> integración de WhatsApp no hay nada que orquestar fuera del backend.

## Uso

```bash
cd infra/environments/dev
terraform init
terraform plan -var-file=terraform.tfvars      # revisar SIEMPRE el plan
terraform apply                                # ⚠️ genera costos reales en AWS
```

> **Checkpoint obligatorio de costos:** antes del primer `terraform apply` contra una
> cuenta real, revisar el plan y la estimación de costo mensual con el dueño del
> proyecto (ver sección de costos en `docs/DEPLOYMENT.md`). Nada en CI ejecuta
> `apply` automáticamente: el pipeline se detiene en `plan`.

## Estimación de costo mensual (us-east-1, referencia jul-2026 — confirmar con la calculadora AWS)

| Recurso | Config | USD/mes aprox. |
|---|---|---|
| RDS PostgreSQL | db.t4g.micro, 20 GB gp3, single-AZ | ~15–17 |
| Lambda + API Gateway | < 100k req/mes | ~0–2 |
| S3 + CloudFront | pocos GB + tráfico bajo | ~1–3 |
| Amplify Hosting | build + hosting SSR bajo tráfico | ~5–15 |
| Secrets Manager | 2 secretos + endpoint VPC | ~8 |
| **Total** | | **~25–40 USD/mes** |

(Bajó frente a la estimación original al eliminar la instancia EC2 de n8n y los
costos por conversación de WhatsApp Business — ver ADR-009.)

## Alternativa evaluada (ronda de stack, jul-2026): Supabase Postgres

En vez de RDS + Secrets endpoint (~23–25 USD/mes solo en base de datos), el
mismo backend puede apuntar a un Postgres administrado de Supabase **sin tocar
código**: el soporte de su pooler (Supavisor, modo transacción) ya está en
`backend/app/db.py` y se activa solo por la URL de conexión.

| Opción | USD/mes | Notas |
|---|---|---|
| RDS db.t4g.micro + Secrets VPC endpoint | ~23–25 | Todo dentro de la VPC (este Terraform) |
| Supabase Pro | 25 | Incluye backups diarios y panel SQL; sin VPC/NAT que mantener |
| Supabase Free | 0 | Solo staging/demos: 500 MB y **se pausa a los 7 días sin tráfico** |

Cómo conectarlo (cuando el dueño cree el proyecto en supabase.com):
1. `create extension if not exists btree_gist;` (lo exige la migración 0001).
2. Migraciones y tareas puntuales → conexión **directa** (puerto 5432).
3. La Lambda → el **pooler en modo transacción** (puerto 6543): la app detecta
   `pooler.supabase.com:6543` y configura NullPool + sin prepared statements.
4. `DATABASE_URL` va en Secrets Manager igual que hoy; el resto no cambia.

Decisión completa y porqués en `MIGRATION.md` (raíz del repo).
