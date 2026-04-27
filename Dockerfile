# --- builder stage --------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

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
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# copy prod deps only
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

# copy build output
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Apply migrations on container start, then launch the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
