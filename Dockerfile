FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY src/ src/
COPY public/ public/
COPY index.html vite.config.ts tsconfig*.json ./

ARG VITE_API_DOMAIN=""
ENV VITE_API_DOMAIN=$VITE_API_DOMAIN

RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist /app/dist

EXPOSE 80
CMD ["serve", "-s", "dist", "-l", "80"]
