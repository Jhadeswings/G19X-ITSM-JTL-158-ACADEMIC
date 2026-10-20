FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=America/Mexico_City

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Chromium de Playwright para la exportación PDF del perfil (DECISIONES
# §55): se instala y configura AL CONSTRUIR la imagen — con sus dependencias
# de sistema y fuentes (acento español incluido) — para que en ejecución el
# backend solo LANCE el navegador, jamás descargue nada por petición.
RUN python -m playwright install --with-deps chromium \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-liberation2 fonts-dejavu-core fontconfig \
    && rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 8000

# En compose, el command se sobreescribe para ejecutar migraciones antes de arrancar.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
