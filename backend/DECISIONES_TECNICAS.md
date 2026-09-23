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



