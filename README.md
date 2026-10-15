# Sistema de Identificación de Talento de Alto Potencial — MVP

MVP web local para **PluriOne S.A. de C.V.**

- **PRD:** v1.4 · **Especificación Técnica:** v1.6 · **Style Guide:** v1.2 (documentos en la raíz)
- **Estado actual:** MVP funcional: autenticación con roles, gestión de empleados
  y proyectos, participaciones con auditoría transaccional, evaluaciones
  oficiales históricas, historial personal del empleado y exportación de
  perfiles a PDF.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI (Python 3.11) |
| ORM | SQLAlchemy 2.x |
| Migraciones | Alembic |
| Base de datos | PostgreSQL 15 (con extensión `pg_trgm`) |
| Contenedores | Docker / Docker Compose |

## Funcionalidades implementadas

Todo lo listado aquí existe en el código y está cubierto por las suites de
pruebas (`backend/tests/`, `frontend/src/**/__tests__/`).

### Autenticación y permisos (Fase 3; ET §31/§32)

- Login con email + contraseña (JWT de acceso firmado HS256, ~30 min,
  renovable). Recuperación de acceso por correo y cambio de contraseña.
- Credencial temporal (`must_change_password`): al primer inicio el sistema
  **exige cambiar la contraseña** antes de permitir cualquier otra pantalla.
- RBAC aplicado en el backend: roles `RH` y `EMPLEADO` con rutas exclusivas
  (`/api/v1/rh/*` y `/api/v1/me/*`), y ownership estricto: el empleado solo
  accede a sus propios recursos (anti-IDOR).

### Módulo RH

- **Empleados:** alta (la credencial temporal se entrega solo por correo),
  listado con filtros de competencia y nivel, perfil completo, recomendación
  de desarrollo (IA opcional) y **exportación del perfil a PDF** («Guardar
  como PDF»: hoja de impresión del navegador, ET §43).
- **Proyectos y participaciones:** administración de proyectos existentes,
  consulta del detalle y **corrección administrativa de participaciones**,
  auditada en la misma transacción.
- **Evaluaciones oficiales:** generación de snapshots históricos por periodo
  (inmutables) con las cinco competencias y 9-Box.
- **Búsqueda de talento:** búsqueda manual por competencias y
  **interpretación en lenguaje natural** (IA opcional, ET §27).
- **Vistas derivadas:** comparación de empleados (9-Box), brechas por
  competencia, sugerencia de mentoría y «Atención requerida».
- **Auditoría global** (`GET /api/v1/rh/audits`): registro paginado de quién
  cambió qué, cuándo y con qué valores anterior → nuevo. Distingue
  `CORRECCION` (RH) de `MODIFICACION_EMPLEADO` (empleado).

### Módulo Empleado

- **Mis proyectos** (búsqueda y registro), **mis participaciones** (edición
  limitada a rol/entregables/horas), **mis capacitaciones**.
- **Mi progreso:** recomendación de desarrollo (IA opcional).
- **Mi historial:** evaluaciones oficiales por periodo con evolución por
  competencia, y **«Historial de mis participaciones»**: las correcciones que
  RH aplicó y las modificaciones propias (`GET /api/v1/me/audits`, filtrado
  por el backend según la identidad autenticada; el autor propio se muestra
  como «Tú»).
- **Mi cuenta:** datos laborales y cambio de contraseña.

### Auditoría transaccional (ET §9.1/§25, ampliado)

Toda corrección de RH y toda modificación real del empleado sobre su
participación genera un registro de auditoría **en la misma transacción**:
actor (cuenta autenticada), valores anteriores y nuevos de los campos
modificados, y motivo (solo lo define RH). Una actualización sin cambio real
no genera auditoría. Las consultas de auditoría son de solo lectura y no
generan registros.

### Integración de IA (opcional)

Interpretación de búsqueda y recomendaciones de desarrollo usan un proveedor
configurable (Groq primario, Gemini de respaldo; claves en `backend/.env`).
Sin claves configuradas, el resto del sistema funciona con normalidad y la
interpretación responde un 502 controlado. Las pruebas automatizadas usan
proveedores simulados: nunca llaman a servicios externos.

## Requisitos

- Docker y Docker Compose
- (Opcional, para desarrollo fuera de Docker) Node.js ≥ 18 y Python 3.11

## Levantar el entorno

### 1. Variables de entorno

```bash
cp .env.example .env            # Windows: copy .env.example .env
cd backend && cp .env.example .env && cd ..   # opcional, solo para correr el backend fuera de Docker
cd frontend && cp .env.example .env && cd ..  # opcional, solo para correr el frontend fuera de Docker
```

En el `.env` de la raíz (el que lee Docker Compose):

- **`SECRET_KEY` (obligatoria):** clave con la que el backend firma los JWT.
  Docker Compose **no arranca** si no está definida. Genera una propia:

  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(48))"
  ```

- **`SEED_RH_EMAIL` / `SEED_RH_PASSWORD`:** credenciales de la **primera
  cuenta de RH**. Véase «Primer acceso de RH» más abajo.
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT`
  (por defecto `talento` / `talento_local` / `talento_alto_potencial` / `5433`).

> Las contraseñas de plantilla de los `.env.example` (p. ej. `Cambia4Me`)
> son SOLO un ejemplo y **deben sustituirse antes de cualquier despliegue
> real**, igual que `SECRET_KEY`. Nunca se versionan secretos reales: los
> `.env` están ignorados por Git.

`backend/.env` (solo se usa fuera de Docker; dentro de la red de Compose las
variables las fija el propio `docker-compose.yml`) documenta además la
conexión a PostgreSQL, la vida de los tokens y el proveedor SMTP/IA.

### 2. Construir y arrancar

```bash
# db + backend + frontend
docker compose up --build

# con el buzón de correo de desarrollo (recomendado):
docker compose --profile mail up --build
```

Al arrancar, el backend ejecuta automáticamente `alembic upgrade head`
(migraciones) y un **seed idempotente** de la cuenta RH (si procede), y solo
después levanta la API.

Servicios resultantes:

| Servicio | URL / acceso |
|---|---|
| Frontend (React) | http://localhost:5173 |
| Backend (FastAPI) | http://localhost:8000 |
| Documentación interactiva (OpenAPI) | http://localhost:8000/docs |
| Healthcheck del backend | http://localhost:8000/health |
| MailHog (perfil `mail`) | SMTP `localhost:1025` · bandeja http://localhost:8025 |
| PostgreSQL 15 | `localhost:5433` (usuario/contraseña según `.env`) |

> Docker Compose garantiza que el backend solo ejecuta `alembic upgrade head`
> después de que PostgreSQL pase su healthcheck (Especificación Técnica §34).

### 3. Comprobar que los servicios arrancaron

```bash
docker compose ps                 # los 4 servicios deben estar "Up" (db: healthy)
curl http://localhost:8000/health # {"status":"ok"}
```

- Frontend: abre http://localhost:5173 (título «Sistema de Talento de Alto
  Potencial»).
- Contrato de la API: http://localhost:8000/docs enumera todos los endpoints
  registrados (p. ej. `/api/v1/rh/audits` y `/api/v1/me/audits`).
- Si un contenedor falla: `docker compose logs <servicio>`.

### Primer acceso de RH

No existen credenciales de demostración fijas. La primera cuenta de RH se
crea con el seed a partir de `SEED_RH_EMAIL` y `SEED_RH_PASSWORD` (raíz
`.env`; ET §35): si la cuenta ya existe el seed no hace nada, y si faltan
las variables o la contraseña no cumple la política (mínimo 8 caracteres y
al menos un número, PRD §3.5), el seed se aborta con un error explícito en
los logs. Con esas credenciales se inicia sesión en http://localhost:5173.

El resto de cuentas (empleados) **no se crean con contraseñas conocidas**:
el alta de RH envía una credencial temporal al correo del empleado (en
desarrollo, a la bandeja de MailHog) y el sistema exige cambiarla en el
primer inicio antes de mostrar cualquier otra pantalla.

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
├── docker-compose.yml       # orquestación local (db, backend, frontend, mailhog)
├── db/init/                 # scripts de inicialización de PostgreSQL (pg_trgm)
├── backend/                 # API FastAPI + Alembic
│   ├── app/
│   │   ├── core/            # configuración, conexión a BD, seguridad, seed
│   │   ├── api/             # routers: auth, me_*, rh_*
│   │   ├── models/          # entidades SQLAlchemy (cuentas, empleados, proyectos,
│   │   │                    #   participaciones, evaluaciones, auditoría, tokens…)
│   │   ├── schemas/         # esquemas Pydantic de entrada/salida
│   │   └── services/        # lógica de dominio (auditoría, participaciones…)
│   ├── alembic/versions/    # migraciones del esquema
│   └── tests/               # suite pytest (base de pruebas aislada)
└── frontend/                # SPA React (Vite)
    └── src/
        ├── api/             # módulos de transporte por dominio
        ├── componentes/     # componentes compartidos (estados, tabla, paginación…)
        ├── estilos/         # CSS por sección
        └── vistas/          # pantallas de RH (Empleados, Proyectos, Evaluaciones,
                             #   Busqueda, Comparar, Brechas, Mentoria, Auditorías…)
                             #   y de Empleado (Inicio, MiProgreso, MisProyectos,
                             #   MisCapacitaciones, MiHistorial, MiCuenta)
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

## Ejecutar la suite frontend y compilar

Requisito: Node.js ≥ 18 (el `npm install` instala las dependencias; en Docker
el contenedor ya las trae).

```bash
cd frontend
npm install     # solo la primera vez
npm test        # suite completa (vitest run): pruebas de API y de vistas
npm run build   # compilación de producción (Vite → dist/)
npm run dev     # servidor de desarrollo (http://localhost:5173)
```

Las pruebas del frontend no tocan ninguna base de datos: el cliente HTTP está
mockeado en todos los archivos de `src/**/__tests__/`.

## Notas de estado (MVP)

- El esquema evoluciona SOLO con Alembic (prohibido `create_all()` y SQLite,
  ET §1) y todas las entidades de dominio ya tienen migraciones.
- La IA (interpretación de búsqueda y recomendaciones) es opcional: sin claves
  en `backend/.env` el sistema funciona y la interpretación responde un 502
  controlado (ET §27).
- Zona horaria de negocio: `America/Mexico_City`.
- La entrega de correo contra un proveedor SMTP real aún no ha sido validada
  con credenciales de producción (en desarrollo se usa MailHog).
