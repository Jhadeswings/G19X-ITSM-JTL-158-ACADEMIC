# Sistema de Identificación de Talento de Alto Potencial — MVP

MVP web local para **PluriOne S.A. de C.V.**

- **PRD:** v1.3 · **Especificación Técnica:** v1.5 · **Style Guide:** v1.1 (documentos en la raíz)
- **Estado actual:** scaffolding inicial. Sin lógica de negocio, sin autenticación, sin tablas de dominio.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI (Python 3.11) |
| ORM | SQLAlchemy 2.x |
| Migraciones | Alembic |
| Base de datos | PostgreSQL 15 (con extensión `pg_trgm`) |
| Contenedores | Docker / Docker Compose |

## Requisitos

- Docker y Docker Compose
- (Opcional, para desarrollo fuera de Docker) Node.js ≥ 18 y Python 3.11

## Levantar el entorno

```bash
# 1. Variables de entorno
cp .env.example .env            # Windows: copy .env.example .env
cd backend && cp .env.example .env && cd ..   # opcional, solo para correr el backend fuera de Docker
cd frontend && cp .env.example .env && cd ..  # opcional, solo para correr el frontend fuera de Docker

# 2. Construir y arrancar (db + backend + frontend)
docker compose up --build
```

Servicios resultantes:

| Servicio | URL / acceso |
|---|---|
| Frontend (React) | http://localhost:5173 |
| Backend (FastAPI) | http://localhost:8000 |
| Documentación interactiva (OpenAPI) | http://localhost:8000/docs |
| Healthcheck del backend | http://localhost:8000/health |
| PostgreSQL 15 | `localhost:5433` (usuario/contraseña según `.env`) |

> Docker Compose garantiza que el backend solo ejecuta `alembic upgrade head`
> después de que PostgreSQL pase su healthcheck (Especificación Técnica §34).

## Correo: credencial temporal y recuperación de acceso

El alta de empleados (PRD §3.3) y la recuperación de acceso (PRD §3.4)
entregan su secreto **solo por correo**, mediante un proveedor SMTP
configurable por entorno (`backend/.env`; decisión y variables en
`backend/DECISIONES_TECNICAS.md` §53):

| Variable | Uso | Ejemplo local (MailHog) |
|---|---|---|
| `SMTP_HOST` / `SMTP_PORT` | Servidor SMTP | `localhost` / `1025` |
| `SMTP_USER` / `SMTP_PASSWORD` | Credenciales (opcionales en local) | (vacío) |
| `SMTP_FROM` | Remitente | `no-reply@empresa.dev` |
| `SMTP_STARTTLS` | Conexión segura STARTTLS | `false` |

- **Entorno local (recomendado):** `docker compose --profile mail up`
  levanta MailHog (SMTP `localhost:1025`, bandeja en
  `http://localhost:8025`). Configura las variables anteriores en
  `backend/.env`, reinicia el backend, crea un empleado o solicita una
  recuperación: el correo debe aparecer en la bandeja.
- **Producción:** define host/puerto/usuario/contraseña del proveedor real
  y `SMTP_STARTTLS=true`. Jamás versiones credenciales (`SMTP_PASSWORD`
  debe estar vacía en `.env.example`; un test lo vigila).
- **Sin proveedor o con fallo del envío:** el **alta** responde 503 y NO
  crea la cuenta (nunca queda una credencial sin entregar); la
  **recuperación** responde 202 uniforme, registra el error interno y
  conserva el token vigente para reintentar.
- Las pruebas automatizadas usan un proveedor simulado: nunca envían
  correos reales. **La entrega contra un proveedor SMTP real aún no ha
  sido validada con credenciales de producción.**

## Estructura del repositorio

```
.
├── docker-compose.yml       # orquestación local (db, backend, frontend)
├── db/init/                 # scripts de inicialización de PostgreSQL (pg_trgm)
├── backend/                 # API FastAPI + Alembic
│   ├── app/
│   │   ├── core/            # configuración y conexión a base de datos
│   │   ├── api/             # (futuro) rutas
│   │   ├── models/          # (futuro) entidades SQLAlchemy
│   │   ├── schemas/         # (futuro) esquemas Pydantic
│   │   └── services/        # (futuro) servicios de dominio
│   └── alembic/             # migraciones (versions/ vacía en esta fase)
└── frontend/                # SPA React (Vite)
```

## Desarrollo fuera de Docker (opcional)

**Backend** (requiere PostgreSQL accesible, p. ej. el de Docker en `localhost:5433`):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows | source .venv/bin/activate (Linux/macOS)
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

## Ejecutar la suite backend

> **La suite NUNCA debe apuntar a la base de desarrollo.** Hace
> `TRUNCATE ... CASCADE` en cada test: es una base **desechable**.

Un solo camino oficial:

```bash
# 1) Crear/verificar la base de pruebas (idempotente; el entrypoint de
#    Postgres la crea sola la primera vez: 'talento_test')
docker compose up -d db

# 2) Ejecutar la suite (siempre contra 'talento_test')
cd backend && python -m pytest

# 3) Destruir la base de pruebas (opcional: es desechable)
docker exec talento_db psql -U talento -d postgres -c "DROP DATABASE IF EXISTS talento_test;"
```

No hace falta configurar nada: la suite deriva sola la URL de pruebas a
partir de la de desarrollo, conservando usuario, contraseña, host y puerto
y cambiando solo el nombre de la base.

**Si la suite apunta a la base de desarrollo, se aborta antes de ejecutar
nada** (`BaseDeDatosNoPermitida`), con un mensaje explícito. La barrera vive
en `backend/tests/db_guardia.py` y se aplica dos veces: al importar
`conftest.py` (antes de crear el engine) y en cada test, comprobando
`current_database()` justo antes de cada `TRUNCATE`.

Para usar una base de pruebas propia:

```bash
TEST_DATABASE_URL="postgresql://usuario:clave@host:5433/mi_bd_de_pruebas" python -m pytest
```

El nombre **debe** empezar por `talento_test`.

## Notas de fase (scaffolding)

- No hay tablas de dominio todavía; `alembic/versions/` está vacía y `alembic upgrade head` es *no-op*.
- No se usa `create_all()` ni SQLite (prohibido por Especificación Técnica §1).
- No se han agregado claves de API de IA ni servicios externos; se integrarán (Groq/Gemini vía LangChain) en fases posteriores.
- Zona horaria de negocio: `America/Mexico_City`.
