# Build multi-stage: imagen final liviana con output standalone de Next.js
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# URL del backend vista desde el NAVEGADOR (se inyecta en el bundle del cliente)
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

# La imagen de node trae el usuario `node` (uid 1000) sin privilegios. Copiar
# ya con su propiedad evita un chown -R sobre todo el árbol.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Si alguien logra ejecutar código dentro del contenedor, root le da el
# contenedor entero y facilita escapar al host.
USER node

EXPOSE 3000
CMD ["node", "server.js"]
