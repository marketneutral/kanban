# Allocator — investment process kanban
# Runs on port 8642 by default (override with -e PORT=...).

FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies (prisma schema needed for @prisma/client postinstall)
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# Build the app
COPY . .
ENV DATABASE_URL="file:../data/app.db"
RUN npx prisma generate && npm run build


FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    DATABASE_URL="file:../data/app.db" \
    PORT=8642

COPY --from=build /app ./
RUN chmod +x docker/entrypoint.sh && mkdir -p data && chown -R node:node /app
USER node

# SQLite database + uploaded documents live here — mount a volume to persist
VOLUME /app/data

EXPOSE 8642
ENTRYPOINT ["./docker/entrypoint.sh"]
