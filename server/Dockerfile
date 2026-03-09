FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src/ src/
COPY migrations/ migrations/
COPY tsconfig.json ./
COPY projects.config.json ./

EXPOSE 3001

CMD ["npx", "tsx", "src/index.ts"]
