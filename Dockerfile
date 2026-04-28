# --- builder stage --------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app

# node:20-slim strips libssl which Prisma engine binaries require.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# install deps with full devDependencies for build
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# copy sources and build
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build


# --- runtime stage --------------------------------------------------------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# same OpenSSL requirement for prisma migrate deploy at container start
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# copy prod deps only
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

# copy build output
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Apply migrations on container start, then launch the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
