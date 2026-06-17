# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# VITE_API_URL viene iniettato al build-time (Vite lo bake nel bundle JS)
ARG VITE_API_URL=https://italiadigitale-api-440752089673.europe-west8.run.app
ENV VITE_API_URL=$VITE_API_URL

# Installa dipendenze (sfrutta cache layer se package*.json non cambiano)
COPY package*.json ./
RUN npm ci --prefer-offline

# Copia sorgenti ed esegui build di produzione
COPY . .
RUN npm run build

# ── Stage 2: Serve con Nginx ─────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Copia bundle statico
COPY --from=builder /app/dist /usr/share/nginx/html

# Configurazione Nginx personalizzata (SPA routing + gzip + cache headers)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Cloud Run espone la porta 8080 di default
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
