# Sistema de Identificación de Talento de Alto Potencial — MVP

MVP web local para **PluriOne S.A. de C.V.**

**Alumno:** Jade Tinoco Landa · **Matrícula:** 222T098
**Institución:** Instituto Tecnológico Superior de Misantla
**Identificador académico del proyecto:** G19X-ITSM-JTL-158

- **PRD:** v1.4 ([`docs/prd.md`](docs/prd.md)) · **Especificación Técnica:** v1.6 ([`docs/especificacion-tecnica.md`](docs/especificacion-tecnica.md)) · **Style Guide:** v1.2 ([`docs/style-guide.md`](docs/style-guide.md)) · versiones anteriores en [`docs/historico/`](docs/historico)
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
  de desarrollo (IA opcional) y **descarga del informe PDF real** del perfil
  («Descargar PDF», DECISIONES §55) además de la hoja de impresión del
  navegador («Guardar como PDF», ET §43).
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
cd backend && cp .env.example .env && cd ..   # también obligatorio para Docker Compose (Windows: copy backend\.env.example backend\.env)
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

`backend/.env` **también es necesario para Docker Compose**: el servicio
`backend` lo carga mediante `env_file`, y `docker compose up` falla si el
archivo no existe. Completa sus variables con valores válidos para tu
entorno: `SECRET_KEY` (generada como arriba), la vida de los tokens y el
proveedor SMTP/IA. Además define la **`DATABASE_URL` (obligatoria)**, la
conexión a PostgreSQL para ejecutar el backend fuera de Docker (host y puerto
publicados, por defecto `localhost:5433`); dentro de la red de Compose la
fija el propio `docker-compose.yml` (host `db`, puerto `5432`), por lo que la
de `backend/.env` no aplica en contenedores. Sin `DATABASE_URL` la aplicación
no arranca (fail-fast, igual que `SECRET_KEY`). Las
variables SMTP y las claves de IA pueden quedarse vacías: sin proveedor de
correo el alta responde 503 sin crear la cuenta, y sin claves de IA la
interpretación de búsqueda responde con el error 502 controlado (ver
«Correo» más abajo). Los `.env` reales, con o sin secretos, jamás se suben
a Git: están ignorados (ver nota anterior).

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
  sido validada con credenciales de producción.** Como verificación
  parcial, el flujo completo (alta con credencial temporal y recuperación
  con token) se probó contra una cuenta de Gmail de pruebas en
  desarrollo; esa verificación local no equivale a validar una
  configuración de producción.

## Usuario de prueba

**La instalación oficial no define usuario y contraseña universales de
demostración** (decisión de seguridad del proyecto: ninguna credencial fija
vive en el código ni en el repositorio). Existe, opcionalmente, un artefacto
de datos sintéticos de demostración para evaluación académica, con
credenciales públicas y estrictamente locales: véase
[Datos de demostración](#datos-de-demostración-opcional-evaluación-académica).

- **Primer usuario RH:** se configura al arrancar el sistema con las
  variables `SEED_RH_EMAIL` y `SEED_RH_PASSWORD` de la raíz `.env`; sigue las
  instrucciones de [Primer acceso de RH](#primer-acceso-de-rh).
- **Empleados de prueba:** los crea RH desde la aplicación; cada empleado
  recibe una **credencial temporal por correo** y debe cambiarla en su primer
  inicio. En desarrollo los correos se consultan en la bandeja de MailHog
  (`http://localhost:8025`; véase la sección de correo de arriba).
- Guía completa de uso por rol (RH y Empleado):
  [`docs/manual-usuario.md`](docs/manual-usuario.md).

## Datos de demostración (opcional, evaluación académica)

Esta sección describe un **artefacto opcional de evaluación local**. La
**instalación oficial del sistema no lo requiere ni lo usa**: véase
[Levantar el entorno](#levantar-el-entorno), donde Alembic sigue siendo la
única fuente oficial del esquema y la primera cuenta de RH se crea con
`SEED_RH_EMAIL`/`SEED_RH_PASSWORD`.

`db/base-de-datos.sql` es un volcado generado con `pg_dump` desde una base
que cumplió exactamente el camino oficial: migraciones de Alembic aplicadas
sobre una base vacía y, después, el seed opcional
`backend/app/core/seed_demo.py` (dataset 100 % sintético, invocación manual
con `--confirmar-demo`; nunca corre en el arranque de Docker y no modifica
el seed RH oficial).

### Cuentas del dataset de demostración

Todas las cuentas usan la **misma contraseña pública**: `Demo2026A`.

| Correo | Rol | Notas |
|---|---|---|
| `rh.demo@example.com` | RH | Sin empleado asociado. |
| `empleado01@example.com` … `empleado05@example.com` | Empleado | Empleados activos con historia de proyectos, capacitaciones y evaluaciones. |
| `empleado06@example.com` | Empleado | Empleado inactivo a propósito (las evaluaciones lo excluyen). |

> **Advertencia de seguridad:** son credenciales **públicas**, creadas solo
> para la demostración local de este MVP. **Nunca deben emplearse en
> producción** ni en ningún entorno con datos reales. El seed rechaza
> ejecutarse si `APP_ENV=production` y aborta si la base no cumple la
> convención `talento_demo*` o contiene datos ajenos.

> **Advertencia de correo:** `example.com` es un dominio reservado de
> ejemplo (RFC 2606): **esas cuentas no recibirán ningún correo**. El
> sistema no intentará enviar nada a esas direcciones durante la
> demostración y cualquier recuperación de contraseña quedará sin entregar.

La base de demostración **no incluye** la cuenta del seed de RH oficial
(`rh@empresa.dev`): esa cuenta la crea `python -m app.core.seed` a partir de
`SEED_RH_EMAIL` / `SEED_RH_PASSWORD` del `.env` de la raíz, y por tanto sus
credenciales son **las que tú definas**, no las públicas del dataset. Tras
ejecutar el seed, la base de demostración queda con **8 cuentas**: las 7
públicas de la tabla anterior más `rh@empresa.dev`. Para validar el login de
RH basta con cualquiera de las cuentas públicas de la tabla.

### Importar `db/base-de-datos.sql`

Crear una base vacía con nombre único que cumpla la convención demo y
volcar el archivo en ella:

```bash
# 1) Crear la base vacía (verifica antes que no exista)
docker exec talento_db psql -U talento -d postgres -c \
  "SELECT datname FROM pg_database WHERE datname = 'talento_demo_evaluacion';"
docker exec talento_db psql -U talento -d postgres -c \
  "CREATE DATABASE talento_demo_evaluacion;"

# 2) Importar el volcado, deteniéndose ante cualquier error
docker exec -i talento_db psql -U talento -d talento_demo_evaluacion \
  -v ON_ERROR_STOP=1 < db/base-de-datos.sql
```

En PowerShell (Windows), la tubería debe ser transparente a bytes para no
corromper los acentos del dataset:

```powershell
cmd /c type db\base-de-datos.sql | docker exec -i talento_db psql -U talento -d talento_demo_evaluacion -v ON_ERROR_STOP=1
```

La importación termina sin errores y la base queda con `alembic_version`
en la revisión `b7c1e9f2a4d3`, 97 restricciones en total (35 restricciones
PK/FK/UNIQUE/CHECK más 62 columnas `NOT NULL`), el trigger de inmutabilidad
de `evaluaciones`, las secuencias ajustadas y las 7 cuentas de demostración.
El inicio de sesión funciona con la API real:
`POST /api/v1/auth/login` con cualquiera de las cuentas anteriores y
`Demo2026A` responde 200.

> **Cómo verificar que la base existe.** `pg_isready` **no** sirve para
> esto: responde `accepting connections` y termina con código **0** incluso
> cuando la base indicada **no existe** (solo comprueba que el servidor
> acepta conexiones). La comprobación correcta es consultar el catálogo:
>
> ```bash
> docker exec talento_db psql -U talento -d postgres -tAc \
>   "SELECT count(*) FROM pg_database WHERE datname = 'talento_demo_evaluacion';"
> ```
>
> Devuelve `1` si existe y `0` si no. Mide el código de salida **dentro del
> contenedor** (`docker exec ... sh -c "..."`) para no confundirlo con el de
> PowerShell.

### Conectar el backend a la base de demostración

Importar el volcado no basta: el backend tiene que apuntar a
`talento_demo_evaluacion`. Hay dos caminos, ambos verificados.

#### Opción A — Docker Compose (override de `POSTGRES_DB`)

En el `.env` de la **raíz** (el que lee Docker Compose):

```bash
POSTGRES_DB=talento_demo_evaluacion
```

Compose lo propaga automáticamente a la URL del backend:

```
postgresql+psycopg2://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
```

> **Limitación importante (verificada):** `POSTGRES_DB` **solo se aplica la
> primera vez que se inicializa el volumen** de PostgreSQL. Si el volumen ya
> existía con otra base, cambiar `POSTGRES_DB` **no crea** la base nueva: el
> servidor sigue teniendo únicamente la original. Comprobado: tras
> inicializar un volumen con `POSTGRES_DB=base_inicial` y relanzarlo con
> `POSTGRES_DB=base_cambiada`, el catálogo siguió conteniendo solo
> `base_inicial`.
>
> Consecuencia: para usar la base de demostración con Compose sobre un volumen
> ya inicializado, **importa el volcado a mano** en esa base (sección
> anterior) y apunta `POSTGRES_DB` a ella; o parte de un volumen nuevo.

#### Opción B — Backend fuera de Docker

`backend/.env` (o la variable de entorno) debe llevar explícitamente el nombre
de la base de demostración, apuntando al puerto **publicado en el host**:

```bash
DATABASE_URL=postgresql+psycopg2://talento:talento_local@localhost:5433/talento_demo_evaluacion
```

Arranque:

```bash
cd backend
.venv\Scripts\activate        # Windows | source .venv/bin/activate (Linux/macOS)
uvicorn app.main:app --port 8000
```

> `DATABASE_URL` es obligatoria (sin valor por defecto: si falta, la app no
> arranca) y en esta vía debe apuntar a la base de demostración, no a
> `talento_alto_potencial`. El puerto es el **publicado en el host** (`POSTGRES_PORT`,
> por defecto `5433`), no el `5432` interno del contenedor.

Con el backend levantado, el login se valida contra la API real:

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"rh.demo@example.com","password":"Demo2026A"}'
```

Responde **200** con `access_token` y `rol: "RH"`. Con
`empleado01@example.com` responde **200** con `rol: "EMPLEADO"`; con una
contraseña incorrecta responde **401** y el mensaje uniforme «Credenciales
inválidas.».

#### Frontend (interfaz web)

Con Compose no hay nada que configurar: el proxy de Vite ya apunta al
servicio `backend` (`VITE_API_PROXY_TARGET: http://backend:8000`).

Fuera de Docker, el valor por defecto del proxy (`http://localhost:8000`)
coincide con el backend local:

```bash
cd frontend
npm install
npm run dev
```

El navegador sigue llamando a rutas relativas del mismo origen
(`http://localhost:5173/api/v1/auth/login`) y el proxy de Vite las reenvía al
backend. Verificado de extremo a extremo: login 200 con rol RH a través del
proxy.

### El seed de RH y su efecto sobre la base de demostración

El arranque del backend en Compose encadena tres pasos:

```
alembic upgrade head && python -m app.core.seed && uvicorn app.main:app ...
```

- `alembic upgrade head` es **idempotente**: el volcado ya contiene la
  revisión vigente (`b7c1e9f2a4d3`), así que no aplica nada nuevo.
- `python -m app.core.seed` **sí modifica la base de demostración**: crea la
  cuenta de RH de las variables `SEED_RH_EMAIL` / `SEED_RH_PASSWORD`
  (`rh@empresa.dev` con la contraseña del `.env`) si no existe. Tras el seed la
  base tiene **8 cuentas**: las 7 de demostración más `rh@empresa.dev`. Es
  idempotente: si la cuenta ya existe, no hace nada.
- Si el seed **falla**, la cadena `&&` se corta y **Uvicorn no arranca**. Y el
  seed termina con código de salida **1** si `SEED_RH_EMAIL` o
  `SEED_RH_PASSWORD` están vacíos, o si la contraseña no cumple la política
  del PRD §3.5 (mínimo 8 caracteres y al menos un número). Verificado: con la
  contraseña `corta` el seed imprime «Seed de RH abortado: …» y sale con
  código 1, y la cadena `alembic && seed && uvicorn` no llega a lanzar
  Uvicorn.

> **Advertencia:** si levantas Compose contra la base de demostración,
> `SEED_RH_EMAIL` y `SEED_RH_PASSWORD` deben ser **válidos y cumplir la
> política**; si no, el backend no levanta la API y, con
> `restart: unless-stopped`, Compose lo reinicia en bucle. El seed aborta
> (código de salida 1) cuando las variables están vacías —lo que ocurre si
> el `.env` de la raíz no las define o si Compose no encuentra ese archivo— y
> también cuando la contraseña no cumple la política del PRD §3.5. Alternativa:
> arranca el backend fuera de Docker (opción B), donde el seed no forma parte
> de la cadena de arranque.

### Guía de demostración de 10 minutos

Recorrido sugerido para presentar el MVP con el dataset de demostración
(secciones anteriores). Tiempos orientativos; la suma es de 10 minutos.
Los pasos y la preparación corresponden **exclusivamente** a la base de
demostración `talento_demo_evaluacion`: no modifican la base de desarrollo
`talento_alto_potencial` ni la base de pruebas `talento_test`.

**Preparación (antes de empezar; no cuenta en los 10 minutos):**

1. Levanta la base de demostración y el sistema como se describe arriba:
   importa `db/base-de-datos.sql` en una base nueva
   `talento_demo_evaluacion`, fija `POSTGRES_DB=talento_demo_evaluacion` en
   el `.env` de la raíz y arranca con `docker compose up`. En el arranque
   Alembic aplica las migraciones pendientes sobre el volcado: es normal y
   no daña el dataset.
2. Deja el navegador en `http://localhost:5173` con la pantalla de inicio
   de sesión abierta. No necesitas MailHog ni claves de IA: las cuentas demo
   no reciben correo y la búsqueda manual no depende de IA.

**Paso 1 — Arranque y acceso como RH (1:30).** Inicia sesión con
`rh.demo@example.com` / `Demo2026A`. *Resultado esperado:* la app abre el
Inicio de RH (panel operativo). *Si falla:* confirma que la base activa es
la de demostración (`POSTGRES_DB`) y que el backend terminó de arrancar; en
la instalación oficial sin dataset, usa las credenciales de
`SEED_RH_EMAIL`.

**Paso 2 — Panel de RH y matriz 9-Box (2:00).** Presenta el Inicio de RH
(resumen operativo y «Atención requerida»):

![Inicio del panel de RH con resumen de empleados, proyectos y atención requerida](docs/capturas/rh-inicio.png)

La captura muestra el panel inicial de RH. La matriz 9-Box no está en el
dashboard: es exclusiva de RH y se consulta desde el perfil de un empleado.
Entra en «Empleados», abre un empleado activo y muestra el bloque «9-Box»
con sus ejes (desempeño/potencial) y la celda actual resaltada. *Resultado
esperado:* matriz 3×3 con la posición del empleado. *Si falla:* si el perfil
muestra «Datos insuficientes», explica que es un estado válido del motor de
competencias (nunca se inventan niveles) y abre otro empleado del dataset.

![Matriz 9-Box calculada con desempeño alto, potencial medio y celda AM resaltada](docs/capturas/perfil-ninebox.png)

**Paso 3 — Comparación de empleados (1:30).** En «Comparar», selecciona dos
empleados activos. *Resultado esperado:* vista lateral con las cinco
competencias (valor y etiqueta) y la experiencia solo como contexto; por
diseño no hay ganador, ranking ni score global. *Si falla:* muestra
«Brechas por competencia», otra vista derivada del mismo estado actual.

![Comparación de dos empleados en cinco competencias y experiencia contextual](docs/capturas/comparar-empleados.jpeg)

**Paso 4 — Búsqueda de talento (2:00).** Recorrido principal: en
«Búsqueda», filtra manualmente por competencia y nivel mínimo y ejecuta la
búsqueda. *Resultado esperado:* lista de empleados activos que cumplen
todos los criterios. De forma opcional, si las claves de IA ya están
configuradas, escribe una necesidad en lenguaje natural y muestra que la IA
solo PROPONE criterios que RH revisa antes de buscar; si no hay claves,
continúa simplemente con la búsqueda manual, que siempre está disponible.

![Búsqueda manual de talento por competencia y nivel mínimo con un resultado coincidente](docs/capturas/busqueda-talento.png)

**Paso 5 — Perfil y descarga de PDF (1:30).** En «Empleados», abre un
perfil y pulsa «Descargar PDF». *Resultado esperado:* se descarga un PDF
real de dos páginas (tamaño Carta) con resultado actual, evidencias,
fortalezas y oportunidades, experiencia y última evaluación oficial.

Las imágenes siguientes son una **muestra sintética de referencia** del
PDF de perfil (generada con datos de prueba; no son capturas de una sesión
real de la aplicación):

![Página 1 del PDF de perfil — muestra sintética de referencia](docs/capturas/pdf-perfil-pagina-1.png)

![Página 2 del PDF de perfil — muestra sintética de referencia](docs/capturas/pdf-perfil-pagina-2.png)

*Si falla:* reintenta con el mismo botón (ofrece reintento ante error) o
presenta el perfil en pantalla, que contiene las mismas secciones.

**Paso 6 — Perspectiva del empleado (1:30).** Pulsa «Cerrar sesión» en la
cabecera e inicia con `empleado01@example.com` / `Demo2026A`.
*Resultado esperado:* espacio del empleado con «Mi progreso» y, si se
desea, «Mis proyectos» o «Mi historial». Señala que el empleado NO ve ejes
ni 9-Box (PRD §21). *Si falla:* prueba con `empleado02`…`empleado05`; no
uses `empleado06`, que está inactivo a propósito.

### Regenerar `db/base-de-datos.sql`

Úsalo solo si el esquema (Alembic) o el dataset de `seed_demo.py` cambian:

```bash
# 1) Base temporal nueva con prefijo demo (verificar que no exista antes)
docker exec talento_db psql -U talento -d postgres -c \
  "CREATE DATABASE talento_demo_regeneracion;"

# 2) Migraciones oficiales de Alembic sobre esa base
cd backend
DATABASE_URL="postgresql+psycopg2://talento:talento_local@localhost:5433/talento_demo_regeneracion" \
  python -m alembic upgrade head

# 3) Seed de demostración, con su confirmación explícita
DATABASE_URL="postgresql+psycopg2://talento:talento_local@localhost:5433/talento_demo_regeneracion" \
  python -m app.core.seed_demo --confirmar-demo

# 4) Volcado con pg_dump (NO usar pg_dumpall)
docker exec talento_db pg_dump -U talento talento_demo_regeneracion -f /tmp/base-de-datos.sql
docker cp talento_db:/tmp/base-de-datos.sql ../db/base-de-datos.sql
cd ..

# 5) Eliminar SOLO la base temporal creada para regenerar
docker exec talento_db psql -U talento -d postgres -c \
  "DROP DATABASE talento_demo_regeneracion;"
```

En PowerShell, `docker cp` puede requerir ejecutar el volcado y la copia en
la misma sesión; la verificación final es comparar el tamaño/contenido del
archivo copiado con `docker exec talento_db sh -c "wc -c /tmp/base-de-datos.sql"`.

### Separación entre instalación oficial y evaluación académica

- **Instalación oficial:** [Levantar el entorno](#levantar-el-entorno);
  esquema solo con Alembic, cuenta RH con variables del `.env`, sin
  credenciales fijas. Es el único camino válido para cualquier uso real.
- **Evaluación académica:** este apartado; importa un archivo estático en
  una base desechable `talento_demo*` con credenciales públicas, para
  mostrar el MVP poblado sin depender del flujo de correo ni del alta RH.

El seed de demostración nunca borra ni modifica datos ajenos: no contiene
`TRUNCATE` ni `DROP`, solo carga en bases vacías o revalida un dataset ya
completo (idempotente).

## Estructura del repositorio

```
.
├── docker-compose.yml       # orquestación local (db, backend, frontend, mailhog)
├── docs/                    # documentación técnica en Markdown
│   ├── prd.md                      # PRD v1.4 (vigente)
│   ├── especificacion-tecnica.md   # Especificación Técnica v1.6 (vigente)
│   ├── style-guide.md              # Style Guide UX/UI v1.2 (vigente)
│   ├── manual-usuario.md           # manual de uso por rol (RH y Empleado)
│   ├── notas-diseno.md             # evolución del diseño frontend y alcance futuro
│   └── historico/                  # versiones anteriores (PRD v1.3, ET v1.5, SG v1.1)
├── db/
│   ├── init/                # scripts de inicialización de PostgreSQL (pg_trgm)
│   └── base-de-datos.sql    # volcado opcional de la base de demostración (evaluación académica)
├── backend/                 # API FastAPI + Alembic
│   ├── DECISIONES_TECNICAS.md  # decisiones técnicas del proyecto (subordinadas a PRD/ET/SG)
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

> Si lo que quieres es levantar el backend contra la **base de
> demostración**, `DATABASE_URL` (obligatoria, en `backend/.env`) debe apuntar
> explícitamente a `talento_demo_evaluacion`. Véase
> [Conectar el backend a la base de demostración](#conectar-el-backend-a-la-base-de-demostración).

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

## Limitaciones conocidas

Nada de lo listado aquí es un defecto oculto: son límites declarados del MVP,
distinguidos en tres categorías.

### A. Implementado, pero no validado en producción

- **Envío de correo con un servidor SMTP real:** las verificaciones
  existentes se realizaron con MailHog (buzón local de desarrollo).
- **Proveedores reales de IA (Groq/Gemini):** la interpretación de búsqueda y
  las recomendaciones se han probado con proveedores simulados; sin claves
  configuradas el sistema degrada de forma controlada.
- **Despliegue público de producción:** el entorno Compose actual es de
  desarrollo (`uvicorn --reload` y el servidor de desarrollo de Vite) y no
  configura HTTPS de producción.
- **Exportación de perfil a PDF:** la acción «Descargar PDF» genera el
  archivo PDF real en el backend (DECISIONES §55) y no depende del
  navegador; la opción «Guardar como PDF» sí depende del diálogo de
  impresión del navegador y se conserva como alternativa.

### B. Decisiones deliberadas de diseño o seguridad

- **Ausencia de credenciales fijas en la instalación oficial** (véase
  [Usuario de prueba](#usuario-de-prueba)). El artefacto opcional de
  [datos de demostración](#datos-de-demostración-opcional-evaluación-académica)
  usa credenciales públicas que son **solo** para evaluación local.
- **Recuperación de contraseña mediante token entregado por correo** que el
  usuario introduce manualmente; el MVP no define un enlace público de
  recuperación.
- **Tokens de acceso JWT de 30 minutos y ausencia de refresh tokens**,
  conforme a la decisión técnica documentada en
  `backend/DECISIONES_TECNICAS.md` §1.
- **Almacenamiento de la sesión en `localStorage`**, conforme a la
  implementación actual del frontend.

### C. Fuera del alcance del MVP

Exclusiones declaradas por el producto (PRD v1.4 §2.2). **No son funciones
fallidas ni pendientes de arreglo**: multitenancy, aplicación móvil nativa,
hosting público de producción, módulo completo de vacantes/reclutamiento,
ranking social entre empleados, score global de talento, chatbot permanente,
reactivación de cuentas/proyectos como flujo especial y combinación/merge de
proyectos. La lista completa está en [`docs/prd.md`](docs/prd.md) (§2.2).
