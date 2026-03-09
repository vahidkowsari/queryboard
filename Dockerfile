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

FROM nginx:alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
