FROM node:22-alpine

ENV TZ=America/Mexico_City

WORKDIR /app

# Solo el manifiesto: las dependencias se instalan al arrancar (modo dev).
COPY package.json ./

EXPOSE 5173

# En compose, el command se sobreescribe para levantar el dev server de Vite.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
