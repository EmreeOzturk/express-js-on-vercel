FROM node:20 AS build

WORKDIR /app

COPY package*.json pnpm-lock.yaml* ./
RUN npm install -g pnpm@8.6.10 && pnpm install --frozen-lockfile

COPY . .

RUN npx prisma generate --schema=./prisma/schema.prisma
RUN pnpm run build

FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json pnpm-lock.yaml* ./
RUN npm install -g pnpm@8.6.10 && pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3001

CMD ["pnpm", "start"] 