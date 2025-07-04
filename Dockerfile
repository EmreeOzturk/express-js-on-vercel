FROM node:20

WORKDIR /app

COPY package*.json pnpm-lock.yaml* ./
RUN npm install -g pnpm@8.6.10 && pnpm install --frozen-lockfile

COPY . .

RUN npx prisma generate --schema=./prisma/schema.prisma

EXPOSE 3001

CMD ["pnpm", "start"] 