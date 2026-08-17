# Imagen de desarrollo local (docker-compose). Para AWS Lambda ver Dockerfile.lambda
FROM python:3.12-slim

WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY pyproject.toml requirements.lock ./
COPY app ./app
COPY alembic.ini ./
COPY alembic ./alembic

# Primero las versiones exactas del lock, despues el paquete sin dependencias:
# asi la imagen es reproducible y no se cuela una version publicada hoy que
# nadie ha revisado. Regenerar el lock al cambiar pyproject.toml.
RUN pip install --no-cache-dir -r requirements.lock \
    && pip install --no-cache-dir --no-deps .

# Usuario sin privilegios: si alguien logra ejecutar código dentro del
# contenedor, root le da el contenedor entero y facilita escapar al host.
RUN useradd --system --create-home --uid 10001 app \
    && chown -R app:app /srv
USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
