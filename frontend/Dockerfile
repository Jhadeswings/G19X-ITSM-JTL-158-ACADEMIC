FROM node:22-alpine

ENV TZ=America/Mexico_City

WORKDIR /app

# Manifiestos primero: la capa de dependencias se cachea y el install es
# reproducible. Las dependencias se instalan EN LA IMAGEN (no en el bind
# mount del host); docker-compose las conserva con un volumen anónimo sobre
# /app/node_modules para no mezclar binarios nativos de Linux con los del host.
COPY package.json package-lock.json ./
RUN npm ci

# Código del frontend: deja la imagen autosuficiente. En desarrollo, compose
# monta ./frontend sobre /app para poder editar con recarga en caliente.
COPY . .

EXPOSE 5173

# Dev server de Vite (compose ya no sobreescribe el comando).
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
