FROM node:20 AS build

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml* ./

# Install pnpm and all dependencies
RUN npm install -g pnpm@8.6.10 && \
    pnpm install

# Copy source code
COPY . .

# Generate Prisma client and build
RUN npx prisma generate --schema=./prisma/schema.prisma && \
    pnpm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8.6.10

# Copy package files
COPY package*.json pnpm-lock.yaml* ./

# Install only production dependencies (skip postinstall scripts)
RUN pnpm install --prod --ignore-scripts

# Copy built application and Prisma schema
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Generate Prisma client in production
RUN npx prisma generate --schema=./prisma/schema.prisma

EXPOSE 3001

CMD ["pnpm", "start"] 