# Decisiones técnicas — Fase 3: Autenticación y Autorización

Fuente de verdad: `PRD_Sistema_Talento_Alto_Potencial_MVP_v1.3.md` y
`Especificacion_Tecnica_Definitiva_MVP_v1.5.md`. Este documento registra
las decisiones de implementación que la documentación NO fija, para que
sean explícitas, auditables y reversibles.

## 1. Sesión / token: JWT de acceso (HS256) con `Authorization: Bearer`

**Decisión.** La documentación no fija tecnología de sesión. Se usa un JWT
de acceso de corta vida (30 min por defecto, `ACCESS_TOKEN_EXPIRE_MINUTES`)
firmado con HS256, obtenido en `POST /api/v1/auth/login` y enviado como
`Authorization: Bearer <token>`. Implementación: `PyJWT` + `bcrypt`
(hash directo, sin `passlib` por sus incompatibilidades conocidas con
bcrypt >= 4.1).

**Por qué.**

- Es el estándar de facto con FastAPI (`OAuth2PasswordBearer`): integra
  OpenAPI/Swagger autorizado, lo que permite probar login desde `/docs`
  sin frontend.
- Stateless: no requiere tabla de sesiones ni infraestructura extra,
  coherente con un MVP local en Docker.
- `sub` = `cuenta_id` emitido siempre por el backend. En cada request la
  cuenta se **recarga desde la base de datos**: un token de una cuenta
  desactivada deja de servir de inmediato; nunca se confía en claims
  obsoletos de `rol`/`activo`.
- `SECRET_KEY` es obligatoria desde variables de entorno (fail-fast) y
  nunca se versiona (`.gitignore` cubre `.env`).

**Refresh tokens**: fuera del alcance del MVP local (complejidad
innecesaria). Decisión reversible: si se exige más adelante, se añade sin
cambiar el contrato de login.

## 2. Hash de contraseñas

- bcrypt con sal aleatoria (coste por defecto 12 rondas; configurable vía
  `BCRYPT_LOG_ROUNDS` — los tests usan 4 por velocidad, producción usa 12).
- Nunca se almacena texto plano (§4.2). `verificar_password` tolera hashes
  malformados sin reventar (devuelve `False`).
- Política PRD §3.5 validada en backend en TODAS las entradas de contraseña
  nueva (`POST /auth/password/change` y `POST /auth/recovery/reset`) vía
  `app.core.security.validar_politica_password`.

## 3. Anti-enumeración

- Login responde 401 con el MISMO mensaje ("Credenciales inválidas.") para
  email inexistente, contraseña incorrecta y cuenta inactiva. Cuando el
  email no existe se consume un hash dummy para igualar el tiempo de
  respuesta (mitigación de timing attack).
- Recuperación responde SIEMPRE 202 con el mismo cuerpo (PRD §3.4).
- `verificar_pertenencia` (base anti-IDOR §32) responde 404, no 403, para
  no revelar la existencia de recursos ajenos.

## 4. Recuperación de acceso en desarrollo local

**Decisión.** La documentación no define proveedor de correo y prohíbe
inventar uno. El flujo es:

1. `POST /auth/recovery/request` → 202 con mensaje uniforme. Si el email
   corresponde a una cuenta activa, se genera `secrets.token_urlsafe(48)`
   y se guarda **solo su hash SHA-256** en la tabla `tokens_recuperacion`
   (migración Alembic `938cef8a3bac`), con expiración (30 min por defecto)
   y flag de un solo uso.
2. **Entrega en desarrollo local**: el token se escribe en el log del
   backend, controlado por `RECOVERY_TOKEN_DEV_LOG` (default true).
   **Este mecanismo es EXCLUSIVO de desarrollo local y NO debe usarse

## 5. must_change_password

- Login con credencial temporal funciona y devuelve el flag en true.
- Con `must_change_password=true`, TODOS los endpoints protegidos quedan
  bloqueados (403) excepto `POST /auth/password/change` (dependencia
  `get_current_user_allow_pending`). Con flag en false, el cambio exige
  `password_actual` correcta. Tras un cambio exitoso el flag pasa a false.

## 6. RBAC y protección de recursos

- `get_current_user`: autenticado (JWT válido + cuenta activa + contraseña
  definitiva). `require_rh` / `require_empleado`: autorización por rol,
  ejecutada SIEMPRE en backend (§31). En esta fase no existe ningún
  endpoint de negocio RH/Empleado, por diseño: las dependencias se
  prueban directamente como funciones y quedarán aplicadas a los routers
  `/rh/*` y `/me/*` de las fases futuras.
- Base anti-IDOR (§32): `empleado_id_propio` (el empleado SIEMPRE se
  deriva de la cuenta autenticada, nunca del cliente) y
  `verificar_pertenencia` (ownership de recurso). No se inventan reglas
  de propiedad de módulos que aún no existen.

## 7. Seed de RH inicial (§35)

- `python -m app.core.seed` (docker-compose lo ejecuta tras
  `alembic upgrade head`). Credenciales SOLO desde `SEED_RH_EMAIL` /
  `SEED_RH_PASSWORD` (variables de entorno, sin valores por defecto y
  nunca versionadas; el seed aborta con error explícito si faltan o si la
  contraseña viola la política del PRD §3.5).
- Idempotente (si la cuenta existe, no hace nada) y seguro ante
  concurrencia: el índice UNIQUE sobre `lower(email)` es la barrera final;
  una carrera produce `IntegrityError` que se captura sin romper nada.

## 8. Migraciones

- Solo se añadió la tabla `tokens_recuperacion` (migración
  `938cef8a3bac`, revisión previa `278af5f545ff`). No se modificó ningún
  modelo existente: `CuentaAcceso` ya cumplía §4.
- Prohibido `create_all()` (§1): los tests aplican `alembic upgrade head`
  contra el PostgreSQL real de Docker.

## 9. Tests

- 49 tests en `backend/tests/` contra PostgreSQL real (Docker, puerto
  5433): política y hash de contraseñas, login (correcto/rechazado/
  inactivo/case-insensitive), acceso sin autenticación, RBAC (dependencias
  `require_rh`/`require_empleado` + endpoint real `/me`), flujo completo
  de `must_change_password`, recuperación (existente/inexistente/uniforme/
  un solo uso/expirado) y caso básico anti-IDOR.
- Ejecución: `cd backend && python -m pytest`.

## 10. Nota sobre emails de dominio `.local`

`EmailStr` (pydantic + email-validator) rechaza dominios special-use
(`.local`, `.test`, `.example`). Por eso los ejemplos del seed usan
`rh@empresa.dev`. Cualquier email sembrado debe ser sintácticamente
real, aunque no exista realmente.

---

# Decisiones técnicas — Fase 4A: Empleados y Proyectos

## 11. Estados separados: Empleado.activo vs CuentaAcceso.activo

Desactivar un empleado (`PATCH /rh/employees/{id}/estado`) modifica
ÚNICAMENTE `Empleado.activo`. La documentación no define una regla que
propague el estado a `CuentaAcceso`, por lo que NO se automatiza: el
login sigue exactamente las reglas de Fase 3 (cuenta activa → acceso
válido). Si el producto define más adelante esa relación, se implementará
como regla explícita.

## 12. Búsqueda obligatoria sin bloqueos por parecido

La coincidencia aproximada es una **advertencia informativa** (PRD
§11.3): NO impide crear un proyecto y NO crea ninguna relación. El único
rechazo al crear/editar es el **duplicado exacto** tras la normalización
canónica (409, exigido por PRD §11.2 / Especificación §6.1). El flujo
Buscar → Revisar → Crear queda disponible vía
`GET /me/projects/search` (exacta identificada como existente + ≤5
sugerencias trgm >0.30) y `POST /me/projects`.

## 13. pg_trgm

Umbral `similarity > 0.30` fijado explícitamente en el WHERE y también
en la sesión (`set_config('pg_trgm.similarity_threshold','0.3')`) para
que el operador `%` (que usa el índice GIN de Fase 2) coincida con la
regla. Máximo 5 sugerencias, orden por similitud DESC con desempate
determinista por `nombre_normalizado` ASC. La verificación exacta por
`nombre_normalizado` SIEMPRE se ejecuta primero (§8).

## 14. Credencial temporal del alta de empleado

`POST /rh/employees` crea Empleado + CuentaAcceso (`must_change_password
= true`) en una transacción. La credencial temporal la genera el sistema
(`secrets`, cumple política §3.5) y NUNCA se expone en la respuesta API:
en desarrollo local se registra en el log con el prefijo
`[SOLO DESARROLLO LOCAL]` (mismo patrón que la recuperación; sustituible
por envío de correo real sin tocar el flujo).

## 15. RH no crea proyectos

No existe `POST /rh/projects` (el método responde 405): RH solo lista,
consulta y edita proyectos existentes (PRD §11.1). El estado de un
proyecto solo cambia vía edición administrativa de RH; los proyectos
nuevos creados por Empleado inician siempre en `EN_PROCESO`.

## 16. Paginación

Todas las listas administrativas devuelven `{total, pagina, por_pagina,
items}` con LIMIT/OFFSET y COUNT separado; `por_pagina` máx 100. Nunca
se cargan todos los registros (§40).

## 17. Migraciones

Ninguna: los modelos de Fase 2 ya cubrían campos, UNIQUE de
`nombre_normalizado`, CHECK de estado, índice GIN trigram y `pg_trgm`.

---

# Decisiones técnicas — Fase 4B: Participaciones, Capacitaciones y Auditoría

## 18. Contrato estricto en la edición del Empleado

`ParticipacionEmpleadoUpdateIn` usa `extra="forbid"`: cualquier campo
bloqueado (`empleado_id`, `proyecto_id`, `en_equipo`, `coordino_tareas`,
`explico_a_publico_distinto`, `resolvio_problema`, `fecha_registro`)
responde **422** — nunca se ignora silenciosamente. Los mismos esquemas
de entrada (`CreateIn` incluido) rechazan `empleado_id` del cliente:
el empleado SIEMPRE se deriva de la cuenta autenticada (§32).

## 19. Corrección RH e identidad del registro

`PATCH /rh/participations/{id}` corrige rol, entregables, en_equipo,
coordino_tareas, explico_a_publico_distinto, resolvio_problema y horas
(+ `motivo` opcional ≤512). `empleado_id`, `proyecto_id` y
`fecha_registro` NO son corregibles (422 por contrato): no es un caso de
corrección definido por los documentos y rompería la identidad/unicidad
del registro.

## 20. Auditoría transaccional

`auditoria_service.registrar()` añade la `AuditoriaModificacion` a la
misma sesión SIN hacer commit: el único commit es el del servicio que
aplica la corrección → corrección y auditoría son atómicas (si el commit
falla, no queda ninguna de las dos — probado forzando un DataError).
Se audita SOLO la corrección RH (§9.1/§25): ni la creación/edición del
propio Empleado ni las lecturas generan auditoría. Los snapshots
guardan únicamente los campos corregidos (anteriores/nuevos).
`resolvio_problema` se almacena y expone sin lógica adicional (§10).

## 21. Capacitaciones: contrato mínimo documental

Solo existe lo respaldado por PRD §21.4 / Especificación §11 / §31:
POST (registrar nombre/fecha/completado), GET lista propia y GET propia
(ownership 404 uniforme). NO existen PATCH, DELETE ni endpoints RH de
capacitaciones: ningún documento los define. `completado` se fija al
registrar; la lógica del año calendario local (America/Mexico_City)
corresponde a CompetencyEngine (fase posterior).

## 22. Fechas de negocio

`app/core/fechas.py: fecha_negocio_hoy()` convierte UTC →
America/Mexico_City (settings.TZ) para `fecha_registro`, que siempre la
fija el servidor. Se añadió la dependencia `tzdata` (en Windows no hay
base de zonas horarias del sistema; en Linux garantiza
reproducibilidad).

## 23. Migraciones de Fase 4B

Ninguna: `Participacion` ya tenía UNIQUE (empleado_id, proyecto_id) y
CHECK horas>=0; `Capacitacion` y `AuditoriaModificacion` ya tenían todos
los campos e índices exigidos (§9, §11, §25).



   como mecanismo de envío en producción** (queda registrado con el
   prefijo `[SOLO DESARROLLO LOCAL]`).
3. `POST /auth/recovery/reset` → valida política, expiración y un solo
   uso; restablece la contraseña y limpia tokens expirados. Errores:
   400 genérico "Token inválido o expirado.".

**Envío posterior en producción**: la entrega está aislada en la función
`_entregar_token_recuperacion` (`app/services/auth_service.py`). Cuando la
organización defina un proveedor (SMTP u otro), se sustituye SOLO esa
función por una interfaz de envío real; el resto del flujo (emisión,
hash, expiración, un solo uso, respuesta uniforme) no cambia.

---

# Decisiones técnicas — Fase 5: CompetencyEngine y ResultadoActual

## 24. Condición mínima de aprendizaje: regla de autoridad PRD vs Especificación

El PRD ("2 cursos registrados, o 3 proyectos registrados") y la
Especificación Técnica §16.5 (Componente B = cursos `completado=true` del
año calendario local) describen **dos conteos distintos**. Decisión: la
condición mínima sigue al PRD — `COUNT(Capacitacion) >= 2` (sin importar
`completado`) O `COUNT(DISTINCT proyecto_id) >= 3` — mientras que el
Componente B cuenta exclusivamente cursos `completado=true` con `fecha`
dentro del año calendario actual de `America/Mexico_City`
(`fecha_negocio_hoy().year`, §12). Los conteos nunca se mezclan.

## 25. Límites de nivel sin errores de flotante

`app/core/redondeo.porcentaje_a_nivel(num, den)` compara
`num * 100 <= limite * den` con aritmética entera exacta: los límites
20/40/60/80 (inclusive el límite superior) son precisos incluso con
fracciones como 1/5. `round_half_up` usa `Decimal(str(v)).quantize(
ROUND_HALF_UP)`, nunca `round()` bancario.

## 26. ResultadoActual es solo memoria

`ResultadoActualDTO` (Pydantic) existe únicamente como retorno de
`CompetencyEngine.calculate()`. El motor es de solo lectura: sin
`add`/`commit`, sin migración, sin tabla. Los tests verifican
`information_schema.tables`, `Base.metadata.tables`, los row counts
antes/después y la ausencia de modelo `ResultadoActual`.

## 27. Otras decisiones

- Competencias booleanas comparten `_indicador_booleano` (mínimo 3
  participaciones cada una, contadas por separado).
- DI ⇒ `nivel=None`, `valor=None`, `etiqueta=None`; excluida de
  fortalezas y oportunidades (§14, §19).
- Experiencia: antigüedad = días/365.2425 (2 decimales), `None` si falta
  `fecha_ingreso`; ingreso futuro se trunca a 0.
- `resolvio_problema` no se consulta en ninguna query del motor.
- Sin endpoints nuevos hasta validar el motor (regla de fase).

## 28. Migraciones de Fase 5

Ninguna (por definición: §18 prohíbe persistir ResultadoActual y no se
modificó ningún modelo).

