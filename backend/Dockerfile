FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=America/Mexico_City

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# En compose, el command se sobreescribe para ejecutar migraciones antes de arrancar.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
