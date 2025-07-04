FROM node:20

WORKDIR /app

COPY package*.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .

RUN npx prisma generate

EXPOSE 3001

CMD ["pnpm", "start"] 