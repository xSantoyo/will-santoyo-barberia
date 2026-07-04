# Infraestructura (Terraform)

```
infra/
├── modules/
│   ├── network/      # VPC mínima, subnets, security groups
│   ├── database/     # RDS PostgreSQL 16 (db.t4g.micro)
│   ├── api/          # Lambda (imagen contenedor) + API Gateway HTTP API
│   ├── storage/      # S3 (media) + CloudFront
│   ├── frontend/     # Amplify Hosting conectado al repo GitHub
│   ├── automation/   # EC2 t4g.micro con Docker + n8n (user_data)
│   └── secrets/      # Secrets Manager (JWT, DB, Meta WhatsApp, webhook HMAC)
└── environments/
    ├── dev/
    └── prod/
```

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
| EC2 n8n | t4g.micro + 20 GB EBS | ~7–9 |
| S3 + CloudFront | pocos GB + tráfico bajo | ~1–3 |
| Amplify Hosting | build + hosting SSR bajo tráfico | ~5–15 |
| Secrets Manager | ~5 secretos | ~2 |
| **Total** | | **~30–50 USD/mes** |

(No incluye el costo por conversación de WhatsApp Business, que factura Meta aparte.)
