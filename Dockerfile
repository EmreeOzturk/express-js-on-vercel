FROM node:20 AS build

WORKDIR /app

# Copy package files and Prisma schema first
COPY package*.json pnpm-lock.yaml* ./
COPY prisma ./prisma

# Install pnpm and all dependencies
RUN npm install -g pnpm@8.6.10 && \
    pnpm install

# Copy rest of source code
COPY . .

# Generate Prisma client and build
RUN npx prisma generate --schema=./prisma/schema.prisma && \
    pnpm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8.6.10

# Copy package files and Prisma schema first
COPY package*.json pnpm-lock.yaml* ./
COPY prisma ./prisma

# Install production dependencies including prisma
RUN pnpm install --prod

# Copy built application
COPY --from=build /app/dist ./dist

# Generate Prisma client in production stage
RUN npx prisma generate --schema=./prisma/schema.prisma

EXPOSE 3001

CMD ["pnpm", "start"] 