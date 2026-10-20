# Decisiones técnicas — Fase 3: Autenticación y Autorización

Fuente de verdad: `PRD_Sistema_Talento_Alto_Potencial_MVP_v1.4.md` y
`Especificacion_Tecnica_Definitiva_MVP_v1.6.md` (antes v1.3/v1.5). Este documento registra
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
2. **Entrega por correo** (ver §53; sustituye al mecanismo provisional de
   log que usaba `RECOVERY_TOKEN_DEV_LOG`, eliminado): el token viaja
   EXCLUSIVAMENTE en el correo de restablecimiento. Si el envío falla o
   no hay proveedor, el token queda vigente y la respuesta 202 uniforme
   no cambia.
3. `POST /auth/recovery/reset` → valida política, expiración y un solo
   uso; restablece la contraseña y limpia tokens expirados. Errores:
   400 genérico "Token inválido o expirado.".

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

### 9.1 Aislamiento de la base de datos de pruebas (MB-7-TEST-SAFETY)

La suite hace `TRUNCATE ... CASCADE` antes y después de cada test. Por
construcción **borra datos**, así que jamás debe apuntar a la base de
desarrollo (`talento_alto_potencial`).

Decisión: la suite usa **siempre** una base desechable cuyo nombre empieza
por `talento_test`, creada automáticamente por
`db/init/02_bd_pruebas.sql` (entrypoint de Postgres). La barrera es
`backend/tests/db_guardia.py`, aplicada en **dos** puntos:

1. **Al importar `conftest.py`**, antes de que exista el engine: se deriva
   la URL de pruebas y se verifica. Si no puede demostrarse que es una
   base de pruebas, la importación **aborta** y no se ejecuta nada.
2. **En cada test**, con la conexión abierta: se comprueba
   `current_database()` (lo que el servidor responde, no lo configurado)
   justo antes de cada `TRUNCATE`.

Es **fail-closed**: si la base no es demostrablemente de pruebas, se
rechaza. La base de desarrollo se rechaza **por nombre**, aunque llegue
desde otro host o puerto. El usuario **no necesita recordar ninguna
variable**: si no define `TEST_DATABASE_URL`, la suite la deriva sola.

`no_db` (marcador en pruebas puramente estáticas) es una **optimización**
que evita abrir conexión; **no** es la barrera de seguridad.

Comandos oficiales (una sola ruta):

```bash
# 1) Crear/verificar la base de pruebas (idempotente; la crea sola el entrypoint)
docker compose up -d db

# 2) Ejecutar la suite completa (SIEMPRE contra 'talento_test')
cd backend && python -m pytest

# 3) Destruir la base de pruebas (opcional: es desechable)
docker exec talento_db psql -U talento -d postgres -c "DROP DATABASE IF EXISTS talento_test;"
```

Ejecución: `cd backend && python -m pytest` (ver §9.1 para el aislamiento).

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
se entrega EXCLUSIVAMENTE por correo, dentro de la transacción —si el
envío falla, 503 y la cuenta no se crea— (antes se registraba en el log
de desarrollo local; mecanismo eliminado, ver §53).

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

> Nota: un fragmento huérfano de la antigua redacción del §4 quedaba
> duplicado aquí (describía la entrega del token por log y la función
> `_entregar_token_recuperacion` como sustituible en el futuro). Se
> eliminó al implementar el envío real de correo (§53); el flujo vigente
> de recuperación está completo en §4.

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

---

# Decisiones técnicas — Fase 6: evaluaciones oficiales y 9-Box histórico

## 29. Concurrencia de la generación: pg_advisory_xact_lock por periodo

`evaluation_service.generar_evaluaciones()` toma
`pg_advisory_xact_lock(clave)` ANTES del pre-check, donde
`clave = anio * 4 + trimestre` derivada del `YYYY-QN` (inyectiva, estable
y sin dependencia del hashing). El lock es de alcance transaccional: se
libera con el COMMIT/ROLLBACK de la propia generación, sin limpieza
manual. Dos ejecuciones simultáneas del mismo periodo se serializan: la
segunda espera, y al reanudar su pre-check (`COUNT(periodo)`) ya ve las
filas confirmadas de la primera ⇒ `409`. No se depende solo del
pre-check: `UNIQUE(empleado_id, periodo)` (migración 0001) + captura de
`IntegrityError` ⇒ `409` como defensa final. El test de concurrencia usa
dos sesiones PostgreSQL independientes en hilos reales.

## 30. Snapshot histórico: columnas planas, nunca recálculo

`Evaluacion` guarda los cinco niveles y estados por columna
(`desempeno_tecnico_nivel/status`, ...) más `performance_axis`,
`potential_axis` (`Numeric(4,3)`) y `box_code` (`String(16)`, alfabeto
A/M/B). La generación es el ÚNICO punto que calcula (CompetencyEngine →
`nine_box.calcular_nine_box`); las lecturas devuelven exclusivamente los
valores guardados. Solo las etiquetas de presentación
(`etiqueta_performance`/`etiqueta_potencial`) se derivan del eje
almacenado con `nine_box.etiqueta_eje` (determinista, no es un recálculo
de competencias). DI se guarda como `nivel NULL` +
`INSUFFICIENT_DATA` (§14), y ejes/celda quedan `NULL` (§20.2).

## 31. Periodo vigente

`app/core/fechas.periodo_actual()` (ya existente) determina el periodo
`YYYY-QN` con fecha de negocio `America/Mexico_City` calculada desde UTC.
La aplicación es responsable del periodo (§22): nada de `CURRENT_DATE`
en PostgreSQL. El endpoint de generación NO acepta periodo del cliente.

## 32. 9-Box histórico

Se reutiliza el servicio puro `app/services/nine_box.py` (Fase 6,
preexistente) sin duplicar lógica. `box_code` usa el alfabeto A/M/B de
Style Guide §16 (primer carácter = Desempeño, segundo = Potencial):
AA/AM/AB/MA/MM/MB/BA/BM/BB. Nunca códigos A1/A2/A3. La celda se deriva
únicamente de los ejes.

## 33. Atomicidad e inmutabilidad

Generación en UNA transacción: advisory lock → pre-check → empleados
activos → cálculo → `add_all` → `flush` (fuerza CHECK/UNIQUE dentro de
la transacción) → `commit`. Cualquier fallo (incluido un empleado que
lanza) ⇒ rollback total, cero evaluaciones parciales. Inmutabilidad en
dos capas (§24): la API no define PATCH/DELETE y el trigger
`trg_evaluaciones_inmutable` (migración 0001, Fase 2) rechaza
UPDATE/DELETE directos — verificado con SQL crudo en la suite.

## 34. Endpoints y códigos de estado

- `POST /api/v1/rh/evaluations/generate` (solo RH): `201` si se generaron
  evaluaciones; `200` coherente con `total_generadas=0` cuando no hay
  empleados activos (no se inventa nada); `409` si el periodo ya existe.
- `GET /api/v1/rh/evaluations` (paginado, filtros `empleado_id`/`periodo`
  validado con patrón `^\d{4}-Q[1-4]$`) y `GET /api/v1/rh/evaluations/{id}`:
  contrato completo con 9-Box (PRD §10).
- `GET /api/v1/rh/employees/{id}/evaluations`: historial por empleado (404
  si el empleado no existe).
- `GET /api/v1/me/evaluations` (solo Empleado): historial propio SIN ejes
  ni 9-Box (`EvaluacionEmpleadoOut`, PRD §21). No existe
  `GET /me/evaluations/{id}` (superficie mínima anti-IDOR).

## 35. Ownership (§32) y migraciones de Fase 6

- `empleado_id` SIEMPRE derivado de la cuenta autenticada
  (`empleado_id_propio`); RH accede a cualquier histórico por contrato.
  `generado_por_cuenta_id` registra la cuenta RH que ejecutó.
- Migraciones: NINGUNA. El modelo `Evaluacion` ya cumplía exactamente la
  Especificación (campos §21, `UNIQUE(empleado_id, periodo)` y trigger de
  inmutabilidad §24, ambos en la migración 0001 de Fase 2). Se verificó
  antes de decidir: no crear migración si ya cumple.

---

# Decisiones técnicas — Fase 7: búsqueda manual de talento

## 36. Servicio y contrato estricto

`TalentSearchService.search_manual(criteria)` (Especificación §26) es un
servicio de SOLO LECTURA que reutiliza `CompetencyEngine` sin duplicar
ninguna fórmula. `BusquedaManualIn` es estricto (`extra="forbid"`):
`competencies` obligatorio con ≥1 criterio, `code` validado por el enum
cerrado de las cinco competencias (código desconocido ⇒ 422), `min_level`
entero 1–5 (0/6/4.5 ⇒ 422). Se rechazan códigos DUPLICADOS (AND ambiguo
entre dos `min_level` del mismo `code`); y `extra="forbid"` impide campos
de selección arbitrarios como `employee_id` del cliente (§32/IDOR).

## 37. Reglas y orden

AND entre todos los criterios; solo empleados ACTIVOS;
`INSUFFICIENT_DATA` no satisface ningún `min_level` (ni siquiera 1).
Orden: promedio informativo de las competencias seleccionadas (desc,
`Decimal` cuantizado a 2 decimales, calculado en memoria) y, en empate,
nombre ascendente y después id ascendente (PRD §13.2). El promedio NO es
competencia, NO es ResultadoActual, NO es score global ni ranking, y NO
se persiste: la suite compara row counts de todas las tablas antes y
después y verifica que no existe tabla de búsquedas/promedios. Sin
etiquetas de "mejor empleado"/"top talento" en ningún punto del contrato.

## 38. Endpoint, permisos y migraciones de Fase 7

`POST /api/v1/rh/talent-search/manual` (solo `require_rh`; Empleado 403,
sin token 401). La respuesta incluye eco de `criterios` para la revisión
de RH prevista por el flujo de lenguaje natural (§27), niveles y estado
de las competencias consultadas por empleado coincidente, y
`promedio_seleccionadas`. Migraciones: NINGUNA (nada se persiste; no se
modificó ningún modelo).


# Decisiones técnicas — Fase 8: interpretación IA de búsqueda (§27)

## 39. Contrato, endpoint y privacidad

`POST /api/v1/rh/talent-search/interpret` (solo `require_rh`) recibe
EXCLUSIVAMENTE `query_text` (`InterpretacionIn`, `extra="forbid"`, no
vacío, máx 500 caracteres). La salida del LLM se valida con el MISMO
contrato Pydantic cerrado para ambos proveedores
(`CriteriosInterpretadosDTO`, `extra="forbid"`): cualquier campo
prohibido (`employee_id`, `candidate_names`, `winner`,
`recommended_employee`, `talent_score`, `reason_for_selection`...) o
valor inválido invalida la interpretación y cuenta como fallo del
proveedor (→ fallback). El prompt lleva SOLO `query_text` + catálogo
cerrado + reglas de `min_level` (§27.1): sin PII, sin empleados, sin
evaluaciones/participaciones/capacitaciones ni `resolvio_problema`
(verificado por test con datos sembrados). La interpretación NO ejecuta
la búsqueda ni persiste nada (§27): la suite compara row counts de todas
las tablas antes y después. Sin proveedores configurados (claves
opcionales en variables de entorno, nunca versionadas) el endpoint
responde 502 controlado; nunca se inventa una interpretación.

## 40. LangChain: transporte solamente (stack obligatorio ET §1)

La Especificación Técnica v1.5 §1 declara LangChain como orquestación IA
obligatoria. Se incorpora SOLO en la capa de transporte de cada proveedor
con los paquetes de integración `langchain-core`, `langchain-groq` y
`langchain-google-genai` (NO `langchain` completo: no hay chains,
agents, memoria ni RAG que justificaran el paquete entero).

Lo que NO se delega a LangChain (regla §27.3 del proyecto):
- `AIOrchestrator` conserva el control EXPLÍCITO del fallback
  Groq (primario) → Gemini (fallback) → error controlado 502;
- `ProveedorLLM` sigue siendo la abstracción propia
  (`interpretar(prompt) -> str`, texto crudo);
- `validar_salida_proveedor` + contrato Pydantic siguen siendo la
  única validación de salida (el prompt NO es mecanismo de seguridad);
- el prompt mínimo de `prompt.py` permanece sin cambios.

Los chats de LangChain (`ChatGroq`, `ChatGoogleGenerativeAI`) se
construyen con `temperature=0` y salida JSON. TODA excepción de
construcción o invocación se traduce a `ErrorProveedor` para que el
orquestador decida el fallback: LangChain jamás rompe el flujo
controlado. Los tests siguen mockeando `ProveedorLLM`: no requieren
claves reales ni llamadas a proveedores.

## 41. `area`/`position`: informativos, NO filtros (decisión técnica)

`CriteriosInterpretadosDTO` incluye `area` y `position` porque la
Especificación §27.2 los muestra en el ejemplo de salida estructurada del
LLM. PERO ni §26 (`search_manual(criteria)` define su input solo con
`competencies`) ni el PRD §13.1 (búsqueda manual = competencias +
nivel mínimo) autorizan inequívocamente filtros por área/puesto, y la
regla de autoridad (PRD §24 / ET §0) prohíbe inventar comportamiento.

Por tanto: `area`/`position` viajan en el DTO para la REVISIÓN de RH,
NO se envían a `TalentSearchService` y `BusquedaManualIn` los rechaza
(`extra="forbid"`, cubierto por test). Convertirlos en filtros
ejecutables es una DECISIÓN PENDIENTE DE PRODUCTO, no un gap de
implementación.

## 42. Migraciones de Fase 8

NINGUNA. La interpretación no persiste resultados (§27): no se creó ni
modificó ningún modelo ni tabla.


# Decisiones técnicas — Fase 9: mentoría (PRD §14, Especificación §29)

## 43. MentorshipService: determinista, derivado y sin IA

`MentorshipService.suggest(receiver_id, competency_code)` (§29) es una
consulta DERIVADA del ResultadoActual vigente: reutiliza
`CompetencyEngine` sin duplicar fórmulas, NO usa evaluaciones históricas
como fuente de niveles, NO usa IA (ni Groq, ni Gemini, ni LangChain) y
NO persiste sugerencias, rankings, scores ni relaciones mentor/receptor
(cero escrituras verificadas por test con row counts).

Contrato (`/api/v1/rh/mentorship/suggest`, solo `require_rh`):
`SugerenciaMentoriaIn` es estricto (`extra="forbid"`) y acepta SOLO
`receiver_id` + `competency_code` (enum cerrado de las cinco): el cliente
no puede introducir datos del mentor ni niveles. La respuesta expone
exactamente los tres casos requeridos sin estados adicionales:
sugerencia encontrada (`elegible=true` + `mentor`), receptor no elegible
(`elegible=false`, nivel 5 / DI / inactivo) y ningún mentor elegible
(`elegible=true` + `mentor=null`). La justificación viaja siempre en
`criterio_del_sistema` con la etiqueta obligatoria "Criterio del
sistema" (PRD §14.3); jamás "mejor empleado"/"top mentor"/"mejor
talento" (verificado por test).

Decisiones concretas:
- Receptor inactivo: los documentos exigen receptor activo pero no
  definen código HTTP específico; como el recurso SÍ existe (el 404 está
  reservado a `receiver_id` inexistente), se responde `elegible=false`
  con criterio explícito: comportamiento mínimo compatible sin inventar
  estados.
- Desempate con `Fraction` (racional exacto): el promedio de las otras
  cuatro competencias se compara SIN redondear y sin errores de flotante.
  `INSUFFICIENT_DATA` se EXCLUYE del promedio (nunca vale cero, verificado
  por un test donde contar DI como 0 cambiaría el mentor). Un mentor sin
  NINGÚN valor numérico ordena por debajo de cualquier promedio real y
  pasa directo al desempate por nombre/id.
- El propio receptor nunca es candidato: su nivel no puede ser
  estrictamente superior a sí mismo (§14.2).

## 44. Migraciones de Fase 9

NINGUNA. Mentoría es derivada y no persistente: no se creó ni modificó
ningún modelo ni tabla.


# Decisiones técnicas — Fase 10: brechas y atención requerida

## 45. GapService y AttentionService: vistas derivadas del dashboard

Brechas (PRD §15, `GET /api/v1/rh/gaps?competency_code=...`):
- Una competencia por consulta: el parámetro se valida contra el enum
  cerrado de las cinco (código desconocido ⇒ 422) y repetirlo en la
  query string también ⇒ 422 (contrato estricto).
- Denominador de los porcentajes: EXCLUSIVAMENTE los empleados
  evaluables (CALCULABLE) de esa competencia. `INSUFFICIENT_DATA` se
  cuenta por separado (`datos_insuficientes`), NO entra en los grupos
  1–2 / 3–5, NO entra en el denominador y jamás se convierte en nivel 0.
- Con 0 evaluables los porcentajes son `0.00` (sin división entre
  cero): valor neutro; el PRD prohíbe presentarlo como alarma.
- Fuente: ResultadoActual vigente vía `CompetencyEngine` (sin
  evaluaciones históricas). Sin score, sin ranking, sin persistencia.

Atención requerida (PRD §19.1, ET §30, `GET /api/v1/rh/attention-required`):
- Vista DERIVADA global: NO existe tabla ni modelo `Alert`, no modifica
  datos, no altera competencias/9-Box/evaluaciones y no genera
  auditoría. Solo empleados activos; el cliente no decide quién aparece.
- Condiciones exactas (§30): `PERFIL_INCOMPLETO` (falta nombre,
  cuenta/correo, puesto, área o fecha de ingreso) O
  `SIN_PARTICIPACION_RECIENTE` (ninguna participación con
  `fecha_registro >= hoy_negocio − 90 días`). Ambas condiciones ⇒ una
  sola aparición con los dos motivos.
- Fecha límite: `fecha_negocio_hoy()` (America/Mexico_City desde UTC,
  §12; nunca hora local del contenedor ni UTC sin convertir). La
  frontera usa `>=`: participación con fecha EXACTAMENTE hoy−90 es
  reciente (no aparece por esa condición); hoy−91 sí. Se usa
  `fecha_registro`, jamás `created_at` técnico, evaluaciones ni niveles.
- Motivos neutrales estructurados (enum cerrado) para orientación
  operativa; vocabulario prohibido verificado por test (PRD §23).
- Orden determinista: nombre ascendente, id ascendente.

## 46. Migraciones de Fase 10

NINGUNA. Ambas vistas son derivadas y no persistente: no se creó ni
modificó ningún modelo ni tabla.


# Decisiones técnicas — Fase 11: comparación de empleados

## 47. ComparisonService: vista lateral derivada (PRD §20.5)

Endpoint: `POST /api/v1/rh/employees/compare`, exclusivo de RH.

- Contrato estricto (`extra="forbid"`): SOLO `employee_ids`, obligatorio,
  mínimo 2, enteros positivos y sin duplicados. Cualquier campo adicional
  (nombres, niveles, resultados) ⇒ 422: el cliente NUNCA puede alterar
  el contenido de la comparación; el backend resuelve todos los datos.
- ID inexistente ⇒ **404** reutilizando `obtener_empleado` (patrón
  existente de recurso inexistente).
- Empleado existente pero INACTIVO ⇒ **422** con el patrón de validación
  existente del proyecto (no se inventó ningún código HTTP nuevo): la
  petición COMPLETA se rechaza. Jamás se elimina un ID en silencio: la
  respuesta debe corresponder exactamente al conjunto válido solicitado,
  o no haber respuesta.
- Contenido por empleado: identificación (id, nombre, puesto, área),
  las CINCO competencias actuales y experiencia como contexto. Se
  reutilizan `CompetencyEngine`, `CompetenciaResultadoDTO` y
  `ExperienciaDTO` (antigüedad + proyectos únicos): cero fórmulas
  duplicadas, `INSUFFICIENT_DATA` preservado (`nivel=None`, nunca 0).
- NO existe: 9-Box, ganador/mejor/top empleado, ranking, score global,
  `ExperienceScore`, recomendación ni selección automática. La
  experiencia NO ordena ni clasifica. Sin IA (sin Groq/Gemini/LangChain/
  AIOrchestrator).
- Orden: se conserva EXACTAMENTE el orden de `employee_ids` recibido
  (PRD no define ranking para comparación). Neutral y determinista:
  evita clasificación implícita por promedio o nivel y permite que la
  UI futura respete la selección de RH.
- Fuente: ResultadoActual vigente. Las evaluaciones históricas NO
  alteran la comparación (verificado por test).

## 48. Migraciones de Fase 11

NINGUNA. La comparación es una vista derivada: no se creó tabla
`Comparison`, ni modelo persistente, ni histórico, ni cache persistente.


# Decisiones técnicas — Fase 12: recomendaciones de desarrollo con IA

## 49. Endpoint, contexto mínimo y separación dato/sugerencia

Endpoint elegido: `GET /api/v1/me/progress/recommendation`, exclusivo de
Empleado (`require_empleado` + `empleado_id_propio`). Motivación: ningún
documento fija ruta exacta; `/me/progress` es el prefijo natural de la
vista "Mi progreso" (PRD §21.2) y sigue la convención `/me/<recurso>` de
los routers existentes. GET sin cuerpo: el cliente NO puede enviar
`employee_id`, niveles, fortalezas ni texto — todo se deriva del token
y del estado actual (query/body inyectados se ignoran por contrato).

Contexto MÍNIMO enviado al LLM (PRD §18, depurado por
`RecommendationService._contexto_minimo`):
- por cada una de las cinco competencias: código + nivel 1–5 o estado
  `INSUFFICIENT_DATA` (nivel `null`);
- fortalezas y oportunidades YA calculadas por reglas (§17.4): la IA
  las recibe como hechos, nunca las deriva;
- experiencia SOLO como contexto: años de antigüedad (entero) y
  proyectos únicos. Nunca fórmula de talento, nunca cambia niveles ni
  categorías.

EXCLUIDO del prompt (verificado por test con proveedor espía): nombre,
correo, `employee_id`/IDs, `resolvio_problema`, texto libre de
participaciones, entregables, situaciones descritas, evidencia interna,
evaluaciones históricas, datos de otros empleados y credenciales.

Contrato IA (`SalidaRecomendacionIA`, cerrado `extra="forbid"`):
`{"recommendation": str ≤500 no vacía, "actions": [str ≤200] × ≤5}`.
Cualquier campo adicional (`employee_id`, `winner`, `talent_score`,
`score`, `nivel`, `competency_level`, `box_code`, `performance_axis`,
`potential_axis`, `strengths_generated_by_ai`,
`opportunities_generated_by_ai`, nombres...) invalida la salida ⇒ se
trata como fallo del proveedor ⇒ fallback. Se rechazan además los cinco
juicios que el PRD prohíbe literalmente ("mejor empleado", "top
talento", "ganador", "bajo potencial", "empleado insuficiente"): lista
mínima cerrada, no un filtro general de lenguaje.

Separación dato/sugerencia (Style Guide §3.6): la respuesta tiene DOS
bloques estructurales — `resultado_actual` (reutiliza
`ResultadoActualDTO` tal cual: competencias con DI preservado,
experiencia, fortalezas y oportunidades por reglas; la IA no puede
modificarlos) y `recomendacion_ia` (con `origen: "IA"` constante,
`proveedor`, `recommendation` y `actions`). El texto IA jamás se
presenta como resultado oficial.

Degradación de la IA (PRD §17: la IA es secundaria):
`recomendacion_ia` puede ser `null` cuando el orquestador no tiene
proveedores o todos fallaron. En ese caso la respuesta es 200 con el
`resultado_actual` del engine intacto y el cliente presenta el bloque B
como "no disponible". El fallo de IA NUNCA convierte la respuesta en
502 ni se sustituye por una recomendación inventada.
`interpretar_busqueda` (Fase 8) NO cambia: `/rh/talent-search/interpret` sigue
resolviendo 502 cuando no hay interpretación posible, porque allí la IA
ES la respuesta.

## 50. Orquestación, fallback y migraciones

Generalización limpia de `AIOrchestrator` sin romper `/interpret`
(Fase 8): el bucle de fallback común vive en `_ejecutar_con_fallback`
(ET §38: Groq → Gemini → 502 interno controlado; sin claves configuradas
el resultado es el mismo 502: nunca se inventa ni hardcodea una
recomendación). En `GET /me/progress/recommendation` ese 502 se captura
en `RecommendationService` y la respuesta es 200 con
`recomendacion_ia: null` (decisión de desacople: ver §49).
`interpretar_busqueda` conserva su comportamiento
exacto (sigue llamando `proveedor.interpretar` y responde 502 cuando no
hay interpretación); el nuevo
`generar_recomendacion(contexto)` usa `proveedor.generar(system,
prompt)` con instrucciones propias (`INSTRUCCIONES_RECOMENDACION`).
Los adaptadores Groq/Gemini, la configuración, LangChain y la validación
Pydantic común NO se duplican: solo se generalizó el método de
invocación (`interpretar` = caso particular con instrucciones §27.1).

Migraciones: NINGUNA. La recomendación NO se persiste: sin tabla, sin
histórico, sin modelo, sin auditoría (§25) y sin cache persistente.
Cada consulta deriva el ResultadoActual vigente y pide una sugerencia
nueva al proveedor.

## 51. MB-6-1: `GET /me` amplía su DTO con `puesto` y `area`

**Decisión.** PRD §21.6 exige que "Mi cuenta" muestre nombre, puesto, área y
correo de acceso. El contrato real de `GET /api/v1/me` solo exponía nombre y
correo: `puesto` y `area` nunca se leían. Se **extiende el DTO existente**
(`MeOut`) con `puesto: str | None` y `area: str | None`, leídos del `Empleado`
asociado a la cuenta autenticada. No se crea ningún endpoint nuevo.

**Por qué extender `/me` y no otra cosa.**

- La ET §31 lista `GET /me` como endpoint mínimo del Empleado y fija el
  principio de que "los nombres exactos pueden adaptarse al estilo REST del
  proyecto, pero los permisos y reglas no". Ampliar un DTO no altera ninguna
  regla de permisos.
- La documentación NO define la forma del DTO de `/me` (ET §36 solo exige
  separar DTOs). Ninguna fuente de verdad prescribe un endpoint dedicado, así
  que la alternativa mínima y coherente es exponer en el contrato que ya
  existe lo que el PRD exige, sin crear una superficie de API nueva.
- Las otras vías disponibles están bloqueadas por la arquitectura: `/rh/employees`
  exige rol RH (`require_rh`) y un Empleado recibiría 403; enviar `empleado_id`
  desde el cliente violaría ET §32; resolver los datos desde el frontend
  trasladaría la fuente de verdad y pondría lógica en el cliente (ET §41).

**Por qué `str | None` y no `str`.** `Empleado.puesto` y `Empleado.area` son
nullable (ET §5, contemplating el estado `profile_incomplete` de ET §30). El
DTO refleja el modelo tal cual: no inventa, completa ni normaliza valores. Si
algún día se define una regla de producto para el perfil incompleto, esa regla
se añadirá después; hoy el dato se expone sin interpretación.

**Invariantes que este cambio NO toca.**

- Ruta y método: sigue siendo `GET /api/v1/me`. Sin POST/PATCH/PUT/DELETE.
- Autorización: sigue usando `get_current_user`, **no** `require_empleado`. Una
  cuenta RH puede leer `/me` y, al no tener `empleado_id`, recibe
  `empleado_nombre`, `puesto` y `area` en `null`.
- Identidad: `empleado_id` se sigue derivando exclusivamente del token (§32).
  El endpoint no acepta `empleado_id` en ruta, query ni cuerpo.
- Sin duplicación: el correo sigue viviendo solo en `CuentaAcceso` (§4.1) y
  estos datos no se replican en la cuenta.
- Sin migraciones: `puesto` y `area` ya existen en `empleados` (migración
  inicial). No se modifica el modelo `Empleado`.
- Sin datos internos: `password_hash`, `activo` y `created_at`/`updated_at`
  siguen sin exponerse.

**Alcance de la UI.** Este cambio es exclusivamente de contrato. La pantalla
"Mi cuenta" y el flujo de cambio de contraseña son microbloques posteriores y no
se implementan aquí.

# Decisiones técnicas — Recomendación de desarrollo para RH (PRD v1.4 §20.2.1)

## 52. Ruta RH separada, mismo generador, mismos invariantes

**Decisión.** PRD v1.4 §20.2.1 exige el bloque «Acciones de desarrollo»
en el Perfil RH. Se crea una ruta separada
`GET /api/v1/rh/employees/{empleado_id}/recommendation` (ET v1.6
§31.1), con `require_rh` y `empleado_id` desde el path, que reutiliza
`RecommendationService`, `AIOrchestrator.generar_recomendacion` y los
DTO existentes sin duplicar lógica.

**Por qué una ruta nueva y no reutilizar `/me`.**
`GET /api/v1/me/progress/recommendation` es exclusivo del empleado
(`require_empleado` + `empleado_id_propio`) y rechaza a RH con 403
(verificado por test). La frase «RH no necesita acceso a este bloque»
de su router se acota a dicha ruta: describe que RH no consume la vista
«Mi progreso», no una prohibición general de sugerencias. La nueva ruta
RH aplica los permisos del perfil RH (mismo alcance que `/result`, sin
restricción exclusiva por estado activo; inexistente → 404) y deja
`/me` intacto.

**Límites de la nueva ruta.**

- Bajo demanda explícita: el perfil no la genera al abrirse; cada
  consulta deriva el resultado vigente y pide una sugerencia nueva.
- Sin persistencia, sin caché persistente, sin historial y sin
  auditoría. No se promete reproducir un texto anterior.
- IA no disponible → 200 con `recomendacion_ia: null`. Nunca texto
  inventado ni fijo.
- Las instrucciones del prompt que nombran «Mi progreso» se conservan
  intactas en el MVP (mención histórica); el texto y las acciones de la
  IA no se reescriben en el frontend.

## 53. Envío de correo SMTP configurable (alta y recuperación)

**Contexto.** La auditoría de secretos detectó que la credencial temporal
del alta y el token de recuperación se registraban en los logs del backend
(`RECOVERY_TOKEN_DEV_LOG`, prefijos `[SOLO DESARROLLO LOCAL]`). El PRD §3.3
exige que la credencial «se envía al correo de acceso» y §3.4 respuesta
uniforme: el log no es un canal de entrega aceptable.

**Decisión.**

1. Proveedor SMTP configurable SOLO por entorno (`SMTP_HOST`, `SMTP_PORT`,
   `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS`,
   `SMTP_TIMEOUT_SEGUNDOS`), con la biblioteca estándar (`smtplib`): sin
   dependencias nuevas ni credenciales en el código. `SMTP_PASSWORD`
   está vigilada por `test_secretos_no_versionados.py`.
2. `app/services/correo_service.py` centraliza plantillas y transporte.
   Cuerpos de texto plano con lo estrictamente necesario; el correo de
   recuperación entrega el TOKEN vigente (un solo uso, 30 min) SIN
   enlaces: el MVP no define URL pública ni pantalla que lo consuma
   (inventarlas sería decisión de producto). Ningún secreto o cuerpo se
   escribe en logs ni en mensajes de error (como máximo, asunto y
   destinatario).
3. Alta (`POST /rh/employees`): el envío ocurre DENTRO de la transacción
   (flush → correo → commit). Sin proveedor configurado o con envío
   rechazado → **503** y rollback: nunca queda una cuenta cuya credencial
   nadie recibió ni se reporta un envío que no ocurrió. El contrato de
   éxito (201 + credencial jamás en la respuesta) y el cambio obligatorio
   de contraseña en el primer acceso NO cambian.
4. Recuperación (`POST /auth/recovery/request`): la respuesta **202
   uniforme no cambia** exista o no la cuenta, falle o no el correo. Con
   fallo se registra el error interno SIN el token; el token queda
   vigente y la solicitud puede repetirse (un fallo de correo no
   inutiliza la recuperación).
5. Se elimina `RECOVERY_TOKEN_DEV_LOG` y todo registro de secretos en
   logs. La suite usa un proveedor SIMULADO (fixture autouse
   `correo_simulado` en `conftest`): cero envíos reales en pruebas y los
   flujos se verifican capturando el mensaje aceptado.
6. Desarrollo local: MailHog opcional (`docker compose --profile mail
   up`) con `SMTP_HOST=localhost`, `SMTP_PORT=1025`,
   `SMTP_STARTTLS=false` (bandeja en `:8025`). La entrega contra un
   proveedor REAL queda pendiente de validar con credenciales de
   producción.

**Invariantes de seguridad.**

- El `empleado_id` del path NUNCA se envía al LLM (el contexto mínimo
  ya lo excluye, PRD §18).
- Sin PII, sin evidencia interna, sin evaluaciones históricas en el
  prompt (mismo contexto mínimo del endpoint del empleado).
- Salida validada con el contrato cerrado `SalidaRecomendacionIA`
  (`extra="forbid"`); fuera de contrato → fallo de proveedor →
  fallback Groq→Gemini → `null`.
- La sugerencia viaja separada con `origen: "IA"` y nunca modifica el
  resultado oficial (Style Guide §3.6/§17.2).

**Migraciones:** NINGUNA.

# Decisiones técnicas — Filtros por competencia y nivel en el listado RH (PRD §20.1)

## 54. Definición funcional de los filtros de competencia y nivel (H3)

**Contexto.** El PRD v1.4 §20.1 exige filtros «limitados por: área;
competencia; nivel» en la vista RH de empleados, pero ni el PRD ni la
Especificación Técnica v1.6 definen su semántica: las reglas de
competencia+nivel de §13.1–§13.2/§26/§28 aplican SOLO a la búsqueda manual
de talento, y la vista actual implementa búsqueda (`q`), área y estado.
Siguiendo el precedente de §41 —un filtro sin autorización inequívoca es
una decisión de producto, no un gap de implementación—, esta sección
REGISTRA esa decisión y fija el criterio de implementación de H3. Es una
decisión funcional POSTERIOR a los documentos originales: no modifica el
PRD, el ET ni el Style Guide; los complementa.

### Decisiones registradas

**H3-A — Semántica del nivel: mínimo e inclusivo.** El nivel se interpreta
como nivel MÍNIMO sobre el resultado actual. Si RH selecciona nivel 3 para
una competencia, se incluyen los empleados cuyo resultado actual calculable
para esa competencia sea 3, 4 o 5; los niveles 1 y 2 quedan excluidos. La
semántica es la de `min_level` de §13.1/§26, aplicada ahora al listado.

**H3-B — Fuente: resultado actual calculado por el backend.** El filtro se
basará en el resultado actual derivado con `CompetencyEngine` bajo las
reglas existentes. NO se basará en una evaluación histórica seleccionada
arbitrariamente, NO se persisten resultados derivados y NO se duplican
fórmulas de competencias. React no calcula ni interpreta niveles: el
frontend solo presenta los filtros y los resultados que devuelve el
backend (ET §13/§42).

**H3-C — Datos insuficientes: estado explícito e independiente.** DI podrá
seleccionarse explícitamente como estado separado de los niveles
numéricos. DI NUNCA equivale a nivel 0, NUNCA satisface un nivel mínimo
numérico y NUNCA entra en promedios ni denominadores (reglas ya vigentes
del sistema). Cuando se selecciona DI, el filtro devuelve los empleados
cuyo resultado actual para la competencia elegida sea realmente DI.

**H3-D — Activos e inactivos.** El filtro de competencia se aplica tanto a
empleados activos como inactivos (el resultado actual existe para ambos,
igual que en el perfil RH). El filtro de estado existente conserva su
semántica y se combina con los demás mediante AND: competencia + nivel
mínimo + área + inactivos devuelve únicamente quienes cumplen TODAS las
condiciones.

**H3-E — Cardinalidad y orden.** Se permite seleccionar UNA sola
competencia por consulta (patrón «una a la vez» del dashboard y Brechas).
El listado conserva su orden actual: NO se ordena por promedio, nivel,
puntuación ni prioridad, y NO se generan rankings de empleados (el
promedio informativo de §13.2 sigue siendo exclusivo de la búsqueda
manual).

### Reglas de interacción

1. Sin competencia seleccionada no se aplica ningún filtro de competencia.
2. El nivel mínimo y el estado DI SOLO pueden aplicarse cuando exista una
   competencia seleccionada (son dependientes de ella).
3. Nivel mínimo y DI son excluyentes para una misma consulta: nunca se
   combinan como si DI fuera un nivel.
4. Los filtros existentes de búsqueda (`q`), área y estado siguen
   funcionando igual y se combinan con el de competencia mediante AND.
5. Al cambiar o limpiar la competencia, los valores dependientes
   (nivel/DI) se restablecen de manera coherente: nunca queda un nivel o
   un DI huérfanos de competencia.
6. El total de resultados y la paginación corresponden al conjunto
   DESPUÉS de aplicar todos los filtros: sin páginas incompletas
   artificiales.
7. Los empleados sin resultado calculable en la competencia elegida
   (estado DI) no se clasifican como nivel numérico: solo aparecen bajo el
   filtro explícito de DI (H3-C).
8. La fuente sigue siendo el resultado actual para activos e inactivos,
   respetando los permisos y reglas de acceso existentes (solo RH).

### Requisitos técnicos derivados (para la implementación posterior)

- El backend mantiene la autoridad sobre cálculo, filtrado, permisos,
  total y paginación.
- Se reutiliza `CompetencyEngine`; no se duplican reglas de cálculo.
- Los filtros por texto (`q`), área y estado limitan previamente los
  candidatos cuando sea compatible con la implementación existente.
- El filtrado por competencia se ejecuta ANTES de calcular la paginación
  final y el total.
- Evitar consultas N+1 y verificar el coste del cálculo (`calculate` por
  empleado candidato) al filtrar conjuntos grandes (ET §40).
- Sin persistencia, sin migraciones, sin puntuaciones globales, sin
  rankings y sin cambios al contrato de evaluaciones históricas.
- Nombres finales de los parámetros de `GET /rh/employees` (fase 1,
  backend): `competencia` (código oficial del catálogo cerrado de las
  cinco), `nivel_min` (entero 1–5, inclusivo) y `solo_di` (booleano;
  `false` o ausente = filtro DI no solicitado). FastAPI rechaza con 422
  una competencia fuera del catálogo y un nivel fuera de 1–5; el endpoint
  rechaza además con 422 `nivel_min` o `solo_di=true` sin `competencia`,
  y su combinación simultánea. Una `competencia` enviada SIN criterio de
  nivel/DI no filtra: el listado conserva el comportamiento actual
  (regla de interacción 1).

### Criterios de aceptación (verificables en la futura implementación)

1. El nivel mínimo es inclusivo: nivel 3 incluye niveles 3, 4 y 5.
2. DI es un estado separado de los niveles numéricos (nunca nivel 0,
   nunca satisface un mínimo numérico).
3. El filtro funciona para empleados activos e inactivos.
4. Búsqueda, área, estado y competencia se combinan correctamente (AND).
5. Totales y páginas corresponden al resultado filtrado, sin páginas
   incompletas artificiales.
6. La competencia y su nivel no se calculan en React: el backend decide.
7. Se conserva el orden existente, sin ranking ni puntuación global.
8. La implementación reutiliza `CompetencyEngine` y no persiste resultados
   derivados.
9. Se conservan los permisos y los comportamientos de errores existentes
   (401 sin token, 403 Empleado, 422 de validación).
10. Las pruebas cubren filtros combinados, niveles inclusivos, DI,
    paginación, autorización y ausencia de escrituras en la base de datos
    (comparación de row counts, patrón de §37).

## 55. Exportación real del perfil a PDF (HTML+CSS + Chromium, backend)

**Contexto.** La exportación original (Tarea D) usaba la hoja de impresión
del navegador (`window.print()`, ET §43). El producto exigió después una
descarga REAL: un archivo `.pdf` generado por el sistema, con texto
seleccionable y sin depender del diálogo de impresión. La primera versión
usó ReportLab, pero su salida no cumplía la especificación visual; se
reemplazó por una plantilla maquetada.

**Decisión.**

1. Motor: **plantilla HTML + CSS convertida a PDF con Chromium vía
   Playwright**. Archivos dedicados: `app/services/pdf/plantilla_perfil.html`
   (estructura) y `app/services/pdf/perfil_pdf.css` (hoja de impresión con
   `@page { size: Letter portrait; margin: 14mm 12mm; }`). El renderizado
   usa `print_background=True` (fondos y colores de impresión),
   `prefer_css_page_size=True` (la CSS manda el tamaño de página) y
   márgenes del renderizador a 0 (sin márgenes contradictorios), con
   `display_header_footer=False` (sin cabeceras, pies ni numeración).
   Resultado: texto real seleccionable, no una captura. Exactamente 2
   páginas Carta: la página 1 cierra con «Fortalezas y oportunidades |
   Experiencia» y la 2 abre con «Última evaluación oficial»; los cortes se
   evitan con `break-inside/break-before` en la CSS.
2. Chromium se instala **al construir la imagen Docker** (`python -m
   playwright install --with-deps chromium` + fuentes), nunca en cada
   petición: el servicio solo lanza el navegador, y la página, el navegador
   y el contexto se cierran siempre (`finally`), también ante errores. Un
   fallo de generación responde 500 con mensaje genérico; el detalle no se
   expone ni se registra con datos del empleado.
3. Endpoint `GET /api/v1/rh/employees/{empleado_id}/profile/pdf` dentro
   del router YA protegido por `require_rh` (401 sin token, 403 Empleado,
   404 inexistente): misma autorización y anti-IDOR que el perfil en
   pantalla. La vista añade la acción «Descargar PDF» junto al «Guardar
   como PDF» histórico, que se conserva.
4. `app/services/perfil_pdf_service.py` COMPONE servicios existentes
   (`empleado_service`, `resultado_actual_service`, `nine_box_service`,
   `evaluation_service`): cero fórmulas duplicadas (ET §13), cero
   persistencia (no crea evaluaciones ni guarda `ResultadoActual`,
   §18/§24) y CERO IA — la descarga nunca dispara una sugerencia
   (§52): el bloque «Acciones de Desarrollo» es un texto fijo de
   presentación. Todo el contenido dinámico se escapa (`xml.sax.saxutils`)
   antes de insertarse en el HTML.
5. `INSUFFICIENT_DATA` se imprime como «Datos insuficientes» (cursiva
   `#90A4AE`, nunca nivel 0, §14) y el 9-Box vacío como tal (§20.2). El
   histórico del snapshot NUNCA se recalcula; convive con un resultado
   actual que puede diferir (prueba `test_historico_no_recalculado`). Sin
   evaluaciones oficiales se muestra el estado de ausencia permitido, sin
   inventar periodo.
6. Nombre de archivo ASCII sanitizado SIN correo:
   `perfil-empleado-{slug}-{YYYY-MM-DD}.pdf` (fecha de negocio
   `America/Mexico_City`, nunca la de una evaluación). El documento no
   lleva cabeceras, pies, fechas al margen ni números de página; nada del
   contenido se registra en logs.
7. `reportlab` se eliminó de `requirements.txt`: su único consumidor era
   este servicio. `playwright` pasa a ser dependencia de ejecución y
   `pypdf` de pruebas (inspección de páginas/tamaño y extracción de texto).

**Pruebas** (`tests/test_perfil_pdf.py`): validez de archivo, cabecera
`Content-Disposition`, dos páginas Carta exactas (612 × 792 pt por página),
corte de páginas (página 1 cierra en FyO|Experiencia; página 2 abre en
«Última evaluación oficial»), ausencia de cabeceras/pies/numeración,
secciones y acentos, orden de las cinco competencias, datos reales por
empleado (nunca los del documento de referencia), DI y ausentes («—»),
histórico no recalculado, autorización 401/403/404, ausencia de escrituras
(row counts) y de invocación IA (trampa en `construir_orchestrator`), y una
**muestra sintética** con todos los valores de referencia del documento
(generada con `tests/muestra_perfil_pdf.py`, auxiliar LOCAL excluido del
repositorio: no forma parte de la suite ni de la entrega; ver
`.gitignore`). Frontend: 6 pruebas
en `PerfilEmpleado.test.jsx` (descarga con nombre del servidor, estado
«Generando PDF…», error con reintento, 401 delegado, sin IA ni
escrituras).

## 56. Extractor de texto IA: cadena o lista de partes (`_texto_crudo`)

**Contexto.** Los adaptadores LangChain actuales (comprobado con
`langchain-google-genai` 4.x y modelos de varias partes) pueden devolver
`message.content` como LISTA de partes (`[{"type": "text", "text": ...}]`)
en lugar de una cadena. El extractor original solo aceptaba `str`, de modo
que respuestas válidas de Gemini se descartaban como «sin texto» y el
orquestador terminaba en el error controlado (502) aunque la llamada al
proveedor hubiera tenido éxito.

**Decisión.**

1. `_texto_crudo` (`app/services/ai/proveedores.py`) acepta cadena O lista
   de partes: concatena exclusivamente los segmentos de texto válidos
   (dicts `{"type": "text", "text": ...}` u objetos con atributo `text`);
   las partes de otro tipo (p. ej. `thinking`) se omiten de forma
   explícita. JAMÁS se fabrica texto que el proveedor no envió.
2. Una respuesta SIN texto utilizable — cadena vacía, lista vacía, partes
   sin texto o un tipo distinto — sigue siendo `ErrorProveedor`
   controlado: nunca se convierte silenciosamente en una respuesta
   válida.
3. Aplica a AMBOS adaptadores (Groq y Gemini) por compartir la función;
   sin cambios de modelos, dependencias ni parámetros de generación.

**Pruebas.** `backend/tests/test_interpretacion_busqueda.py::
TestTextoCrudo` cubre cadena simple, cadena vacía, listas con texto,
listas mixtas (thinking+text+objeto), lista vacía y partes sin texto.
Verificado además contra los proveedores reales (Groq primario y Gemini
fallback) en entorno de desarrollo.
