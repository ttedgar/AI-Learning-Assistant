# Stage 1 — build the Vite React app
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
# Build-time env vars (VITE_ prefix) are baked into the JS bundle at build time.
# Pass them via --build-arg or docker-compose build.args.
ARG VITE_BACKEND_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# Dev auth bypass — only set via docker-compose.dev.yml, never in production.
# Vite 5 loads import.meta.env.VITE_* only from .env files, not from process.env,
# so we write the args into .env before running the build.
ARG VITE_DEV_AUTH=false
ARG VITE_DEV_USER_ID
ARG VITE_DEV_USER_EMAIL
RUN echo "VITE_BACKEND_URL=$VITE_BACKEND_URL" >> .env && \
    echo "VITE_SUPABASE_URL=$VITE_SUPABASE_URL" >> .env && \
    echo "VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY" >> .env && \
    echo "VITE_DEV_AUTH=$VITE_DEV_AUTH" >> .env && \
    echo "VITE_DEV_USER_ID=$VITE_DEV_USER_ID" >> .env && \
    echo "VITE_DEV_USER_EMAIL=$VITE_DEV_USER_EMAIL" >> .env && \
    npm run build

# Stage 2 — serve via Nginx
FROM nginx:1.27-alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA config: all routes fall back to index.html (React Router handles routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
