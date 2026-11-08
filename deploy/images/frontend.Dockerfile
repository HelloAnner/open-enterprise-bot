# Optional static frontend image; this is not a fifth backend.
FROM node:22.23.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV VITE_API_BASE_URL=/api NODE_OPTIONS=--max-old-space-size=2048
RUN npm test && npm run build
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
