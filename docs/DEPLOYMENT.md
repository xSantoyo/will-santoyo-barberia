# Guía de despliegue

## 0. Entorno local (verificación previa obligatoria)

Todo debe funcionar en local antes de tocar AWS:

```bash
docker compose up --build
# Frontend  http://localhost:3000
# Backend   http://localhost:8000/docs
# n8n       http://localhost:5678  (importar automation/workflows/*.json)
# Admin     http://localhost:3000/admin  →  admin / BadBoys2026!
```

Suites de verificación:

```bash
cd backend && pytest -m "not postgres"          # 35 tests unitarios
docker compose up -d db                          # para los tests de integración:
TEST_POSTGRES_URL=postgresql+psycopg://badboys:badboys@localhost:5432/badboys \
  pytest -m postgres                             # constraint anti doble-reserva
cd frontend && npm run lint && npm test          # typecheck + componentes
npx playwright test                              # E2E (requiere stack corriendo)
```

## 1. Prerrequisitos AWS

- Cuenta AWS con usuario/rol de administrador para Terraform.
- AWS CLI configurado (`aws configure`).
- Terraform >= 1.7.
- Bucket S3 para el estado remoto (una sola vez):
  ```bash
  aws s3 mb s3://bad-boys-terraform-state --region us-east-1
  aws s3api put-bucket-versioning --bucket bad-boys-terraform-state \
    --versioning-configuration Status=Enabled
  ```
- Repositorio ECR para la imagen del backend (una sola vez):
  ```bash
  aws ecr create-repository --repository-name badboys-backend
  ```

## 2. Publicar la primera imagen del backend

```bash
aws ecr get-login-password | docker login --username AWS \
  --password-stdin <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com
docker build -f backend/Dockerfile.lambda \
  -t <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com/badboys-backend:v1 backend
docker push <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com/badboys-backend:v1
```

(Los despliegues siguientes los hace GitHub Actions — ver §6.)

## 3. Terraform

```bash
cd infra/environments/prod
cp terraform.tfvars.example terraform.tfvars   # completar TODOS los valores
terraform init
terraform plan -var-file=terraform.tfvars
```

> ⚠️ **CHECKPOINT DE COSTOS (obligatorio, sección 0 del spec):** revisar el plan
> y la estimación de `infra/README.md` (~30–50 USD/mes) con el dueño del proyecto
> **antes** de ejecutar `terraform apply`. Ni CI ni ningún script lo hace
> automáticamente.

```bash
terraform apply -var-file=terraform.tfvars     # solo tras aprobación explícita
```

Salidas relevantes: `api_endpoint`, `frontend_url`, `n8n_public_ip`,
`cloudfront_domain`.

## 4. Post-aprovisionamiento

1. **Migraciones**: invocar la Lambda con la tarea de migración:
   ```bash
   aws lambda invoke --function-name badboys-prod-api \
     --cli-binary-format raw-in-base64-out \
     --payload '{"badboys_task": "migrate"}' out.json && cat out.json
   ```
2. **Seed inicial**: conectarse una vez (bastion temporal o `psql` desde la
   instancia n8n, que está en la VPC) y ejecutar `python -m app.seed`, o insertar
   el tenant con SQL equivalente. Cambiar inmediatamente la contraseña admin.
3. **DNS de n8n**: apuntar `n8n.TU-DOMINIO.com` (registro A) a `n8n_public_ip`.
   Caddy emite el certificado TLS automáticamente al primer acceso.
4. **n8n**: crear el usuario owner, importar `automation/workflows/*.json` y
   definir en el entorno del contenedor las variables de `docs/AUTOMATION.md`.
5. **WhatsApp**: seguir `docs/WHATSAPP_SETUP.md` (plantillas + credenciales).
6. **Amplify**: la app queda conectada al repo por Terraform; el primer build se
   dispara al hacer push a `main`. Configurar el dominio propio en la consola de
   Amplify si aplica.

## 5. Secretos

| Secreto | Dónde vive | Quién lo consume |
|---|---|---|
| `badboys-prod/app` (JWT, service key, HMAC) | Secrets Manager | Lambda (al arrancar) |
| `badboys-prod/database` (DATABASE_URL) | Secrets Manager | Lambda |
| `badboys-prod/whatsapp` (token Meta) | Secrets Manager | n8n (inyectar en el compose de la instancia) |

La Lambda los carga en el arranque vía `AWS_SECRETS_PREFIX` (ver
`backend/app/config.py::load_aws_secrets`). Rotación: actualizar el secreto y
forzar un nuevo despliegue de la Lambda.

## 6. CI/CD (GitHub Actions)

- **CI** (`.github/workflows/ci.yml`): en cada push/PR — tests backend (SQLite +
  Postgres real como servicio), typecheck+tests+build frontend, `terraform validate`.
- **Deploy** (`.github/workflows/deploy.yml`): al pasar CI en `main` — build de la
  imagen Lambda → push a ECR → `update-function-code` → migraciones. Autenticación
  por **OIDC** (crear el rol IAM con confianza a GitHub y guardarlo como secreto
  `AWS_DEPLOY_ROLE_ARN` del repo). El frontend lo despliega Amplify solo.
- `terraform apply` **nunca** corre en CI: siempre manual con el checkpoint.

## 7. Monitoreo

- Logs del backend: CloudWatch `/aws/lambda/badboys-prod-api` (retención 30 días).
- Alarma `badboys-prod-api-5xx` (≥5 errores en 5 min). Conectar una acción SNS →
  email en la consola si se desea aviso.
- Fallos de notificación WhatsApp: panel admin (tabla `notification_log`) y
  ejecuciones de n8n.

## 8. Rollback

- Backend: `aws lambda update-function-code --image-uri <tag anterior>` (los tags
  son el SHA del commit).
- Frontend: en Amplify Console → Redeploy de un build anterior.
- Base de datos: RDS con backups automáticos 7 días (restore point-in-time).
