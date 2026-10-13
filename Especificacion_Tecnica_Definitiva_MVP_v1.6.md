# Especificación Técnica Definitiva — Sistema de Identificación de Talento de Alto Potencial

**Empresa:** PluriOne S.A. de C.V. (Develop Talent & Technology)  
**Versión:** 1.6 — Recomendación RH bajo demanda  
**Estado:** CERRADA PARA IMPLEMENTACIÓN  
**Fecha:** Octubre 2026

---

# 0. Regla de autoridad

Este documento define la implementación funcional y técnica del MVP.

Orden de autoridad:

1. **PRD v1.4** → qué debe hacer el producto.
2. **Especificación Técnica v1.6** → cómo implementarlo.
3. **Style Guide v1.2** → cómo presentarlo visualmente.

No crear reglas de negocio nuevas para llenar huecos.

---

# 1. Stack obligatorio

- Frontend: React.
- Backend: FastAPI.
- ORM: SQLAlchemy.
- Migraciones: Alembic.
- Base de datos: PostgreSQL 15.
- Contenedores: Docker / Docker Compose.
- IA primaria: Groq.
- IA fallback: Google Gemini.
- Orquestación IA: LangChain.
- Zona horaria de negocio: `America/Mexico_City`.

No usar `Base.metadata.create_all()` como mecanismo de migración.

La estructura de base de datos debe evolucionar mediante Alembic.

---

# 2. Arquitectura

```text
React
  ↓
API FastAPI
  ↓
Servicios de dominio
  ├── CompetencyEngine
  ├── TalentSearchService
  ├── MentorshipService
  ├── EvaluationService
  ├── ProjectMatchingService
  ├── AuditService
  └── AIOrchestrator
        ├── Groq
        └── Gemini fallback
  ↓
SQLAlchemy
  ↓
PostgreSQL
```

La lógica de negocio crítica no debe vivir únicamente en componentes React.

---

# 3. Entidades principales

Entidades mínimas:

- `CuentaAcceso`
- `Empleado`
- `Proyecto`
- `Participacion`
- `Capacitacion`
- `Evaluacion`
- `AuditoriaModificacion`

No crear como entidad persistente:

- `ResultadoActual`
- `Alert`
- `TalentScore`
- `RankingTalento`

---

# 4. CuentaAcceso

Campos funcionales mínimos:

- `id`
- `empleado_id` nullable, unique cuando exista
- `rol` (`RH` | `EMPLEADO`)
- `email`
- `password_hash`
- `activo`
- `must_change_password`
- `created_at`
- `updated_at`

## 4.1 Reglas

- `email` debe ser único de forma case-insensitive.
- Normalizar el email para comparación.
- RH puede existir sin `empleado_id`.
- Una cuenta de empleado se relaciona 1:1 con `Empleado`.
- No existe `Empleado.correo_institucional`.

## 4.2 Seguridad

Nunca almacenar contraseñas en texto plano.

La cuenta inicial de empleado se crea con credencial temporal y `must_change_password = true`.

La recuperación no debe revelar si una cuenta existe.

---

# 5. Empleado

Campos mínimos:

- `id`
- `nombre`
- `puesto`
- `area`
- `fecha_ingreso`
- `activo`
- timestamps técnicos

No guardar email duplicado.

---

# 6. Proyecto

Campos mínimos:

- `id`
- `nombre`
- `nombre_normalizado`
- `area`
- `cliente` cuando aplique al modelo de producto
- `estado`
- timestamps

Estados permitidos:

```text
EN_PROCESO
COMPLETADO
CANCELADO
```

El proyecto nuevo creado por un Empleado inicia en `EN_PROCESO`.

## 6.1 Unicidad

Crear índice/constraint `UNIQUE` sobre `nombre_normalizado`.

---

# 7. Normalización de proyectos

Función canónica:

1. Unicode NFD.
2. eliminar diacríticos.
3. `lower()`.
4. `strip()`.
5. colapsar cualquier secuencia de espacios en un solo espacio.

Ejemplo conceptual:

```text
"  Proyecto ÁRBOL  "
→ "proyecto arbol"
```

La misma función debe usarse en aplicación y pruebas.

---

# 8. Coincidencia aproximada de proyectos

PostgreSQL debe habilitar `pg_trgm` para la búsqueda aproximada.

Configurar un umbral de similitud inicial de `> 0.30` para sugerencias.

Mostrar como máximo 5 sugerencias.

La lógica de sugerencia nunca debe sustituir la verificación exacta por `nombre_normalizado`.

Flujo:

```text
normalización
↓
comparación exacta
↓
si no hay exacta → similitud pg_trgm
↓
max 5 sugerencias
```

La coincidencia aproximada no crea automáticamente una relación con el proyecto.

---

# 9. Participacion

Campos funcionales mínimos:

- `id`
- `empleado_id`
- `proyecto_id`
- `rol`
- `entregables`
- `en_equipo`
- `coordino_tareas`
- `explico_a_publico_distinto`
- `resolvio_problema`
- `horas`
- `fecha_registro`
- timestamps

La participación es única por combinación empleado/proyecto según la regla de producto vigente.

## 9.1 Permisos de edición

### Empleado

Después del registro inicial solo puede actualizar:

- `rol`
- `entregables`
- `horas`

### RH

Puede corregir cualquier campo administrativo permitido por el modelo.

Toda corrección RH debe crear un registro en `AuditoriaModificacion`.

---

# 10. Resolvio problema

`resolvio_problema` es un dato contextual.

No debe ser consultado por `CompetencyEngine`.

No debe entrar en filtros de `TalentSearchService`.

No debe entrar en `MentorshipService`.

No debe enviarse a ningún prompt/DTO de IA.

---

# 11. Capacitacion

Campos mínimos:

- `id`
- `empleado_id`
- `nombre`
- `fecha`
- `completado`
- timestamps

La fórmula de aprendizaje utiliza cursos completados del año calendario local actual.

---

# 12. Zona horaria

La zona horaria de negocio es:

```text
America/Mexico_City
```

Las marcas temporales del sistema deben almacenarse de manera consistente, preferentemente en UTC con tipo aware, y convertirse a la zona de negocio cuando se necesiten fechas/calendarios de negocio.

Nunca usar la hora local del contenedor como fuente implícita de lógica de negocio.

---

# 13. CompetencyEngine

Debe existir un servicio centralizado, testeable y reutilizable:

```text
CompetencyEngine.calculate(employee_id)
```

No duplicar fórmulas en endpoints, componentes o consultas independientes.

La salida debe distinguir:

```text
numeric result
insufficient data
supporting evidence
```

No usar IA dentro del motor de competencias.

---

# 14. Representación de nivel

Usar:

```text
1 Inicial
2 En desarrollo
3 En crecimiento
4 Consolidado
5 Alto
```

`Datos insuficientes` no es un entero.

Recomendación de modelo:

```text
level INTEGER NULL
status ENUM/flag = CALCULABLE | INSUFFICIENT_DATA
```

No almacenar una etiqueta de UI como fuente primaria de negocio.

---

# 15. Conversión porcentaje → nivel

Implementación exacta:

```python
if percentage <= 20:
    level = 1
elif percentage <= 40:
    level = 2
elif percentage <= 60:
    level = 3
elif percentage <= 80:
    level = 4
else:
    level = 5
```

Validar que el porcentaje esté en `[0, 100]`.

---

# 16. Fórmulas del CompetencyEngine

## 16.1 Desempeño técnico

```text
completed / (completed + cancelled)
```

Excluir `EN_PROCESO`.

Si el denominador es menor que 3 → `INSUFFICIENT_DATA`.

## 16.2 Liderazgo

```text
count(coordino_tareas = true) / count(participaciones)
```

Mínimo 3 participaciones.

## 16.3 Trabajo en equipo

```text
count(en_equipo = true) / count(participaciones)
```

Mínimo 3 participaciones.

## 16.4 Comunicación

```text
count(explico_a_publico_distinto = true) / count(participaciones)
```

Mínimo 3 participaciones.

## 16.5 Capacidad de aprendizaje

Condición mínima:

```text
completed_courses >= 2 OR unique_projects >= 3
```

Componente A:

```text
0 roles → 1
1 rol   → 2
2 roles → 3
3 roles → 4
4+ roles → 5
```

Componente B, cursos completados durante el año calendario local:

```text
0–1 → 1
2–3 → 2
4–5 → 3
6–7 → 4
8+  → 5
```

Fórmula:

```text
score = A * 0.60 + B * 0.40
level = round_half_up(score)
```

Implementar `round_half_up`, no el redondeo bancario de Python `round()`.

---

# 17. Experiencia

Se calcula bajo demanda desde:

- `fecha_ingreso`;
- cantidad de proyectos únicos.

No crear una competencia de experiencia.

No incluir experiencia en `CompetencyEngine`.

No incluirla en 9-Box, mentoría ni filtros de alto potencial.

---

# 18. ResultadoActual

No existe tabla ni modelo persistente `ResultadoActual`.

Implementar como DTO o resultado calculado por servicio.

Ejemplo conceptual:

```python
ResultadoActualDTO(
    competencies=...,
    experience=...,
    strengths=...,
    opportunities=...,
)
```

La respuesta debe derivar del estado actual de la base de datos.

No persistir una copia para “agilizar” el MVP salvo que una decisión posterior lo cambie explícitamente en el PRD.

---

# 19. Fortalezas y oportunidades

Debe existir una función determinista, independiente de IA:

```text
level 4–5 → strength
level 1–2 → opportunity
level 3   → neither
DI        → excluded
```

No utilizar experiencia.

No utilizar `resolvio_problema`.

No utilizar inferencia del LLM.

La IA puede generar explicación/recomendación posterior.

---

# 20. 9-Box service

Crear servicio puro para calcular:

```text
performance_axis
potential_axis
box_code
```

## 20.1 Performance

Proviene exclusivamente de Desempeño técnico.

## 20.2 Potential

```text
(leadership + teamwork + learning + communication) / 4
```

No redondear antes de clasificar.

Si cualquiera de las cinco competencias es `INSUFFICIENT_DATA`:

```text
performance_axis = null
potential_axis = null
box_code = null
```

Usar `Numeric(4,3)` para `potential_axis` y preservar precisión decimal.

## 20.3 Rangos

```text
[1,3) → Bajo
[3,4) → Medio
[4,5] → Alto
```

La celda se deriva de los ejes, nunca de IA.

---

# 21. Evaluacion

Campos mínimos:

- `id`
- `empleado_id`
- `periodo` (`YYYY-QN`)
- cinco competencias históricas
- ejes 9-Box históricos cuando sean calculables
- timestamp de generación
- usuario RH que ejecutó la generación

Los niveles históricos deben ser valores capturados en el momento de generación; no volver a calcularse al consultar el histórico.

---

# 22. Periodo actual

La función de periodo debe usar fecha en `America/Mexico_City`.

Mapeo:

```text
01–03 → Q1
04–06 → Q2
07–09 → Q3
10–12 → Q4
```

No usar `CURRENT_DATE` en constraints de PostgreSQL para esta lógica.

La aplicación es responsable de determinar el periodo actual.

---

# 23. Generación de evaluaciones

Endpoint protegido exclusivamente para RH.

La generación debe ocurrir dentro de una transacción atómica.

Proceso:

```text
resolver periodo actual
↓
seleccionar empleados activos
↓
calcular resultado actual para cada uno
↓
insertar snapshots históricos
↓
commit
```

Si un paso falla, no deben quedar evaluaciones parcialmente generadas.

Constraint obligatorio:

```text
UNIQUE(empleado_id, periodo)
```

Debe existir manejo explícito de concurrencia para evitar doble generación cuando dos solicitudes llegan simultáneamente.

---

# 24. Inmutabilidad de Evaluacion

La evaluación oficial es inmutable.

Debe protegerse en dos capas:

## Aplicación

- no existe `PATCH /evaluaciones/{id}`;
- no existe `DELETE /evaluaciones/{id}`;
- endpoints de lectura son read-only.

## PostgreSQL

Crear trigger o mecanismo equivalente que rechace `UPDATE` y `DELETE` de registros históricos de `Evaluacion`.

Los listeners de SQLAlchemy no son suficientes como única defensa.

---

# 25. AuditoriaModificacion

Entidad mínima:

- `id`
- `actor_cuenta_id`
- `entidad`
- `entidad_id`
- `operacion`
- `valores_anteriores` JSONB nullable
- `valores_nuevos` JSONB nullable
- `fecha`

Puede existir `motivo` si está definido por el formulario administrativo.

La auditoría es obligatoria para correcciones RH sobre datos operativos relevantes, especialmente `Participacion`.

No crear auditoría para resultados calculados dinámicamente que no se modifican.

---

# 26. Búsqueda manual

Servicio:

```text
TalentSearchService.search_manual(criteria)
```

Input conceptual:

```json
{
  "competencies": [
    {"code": "liderazgo", "min_level": 4},
    {"code": "trabajo_equipo", "min_level": 4}
  ]
}
```

Regla:

```text
AND entre todos los criterios
```

Solo empleados activos.

`INSUFFICIENT_DATA` no satisface `min_level`.

---

# 27. Búsqueda con lenguaje natural

La entrada libre de RH se acepta exclusivamente para interpretación de intención.

Arquitectura:

```text
query_text
↓
AIOrchestrator
↓
StructuredSearchCriteriaDTO
↓
Pydantic validation
↓
revisión RH
↓
TalentSearchService
```

## 27.1 Input al LLM

Puede incluir:

- texto de intención de RH;
- catálogo cerrado de competencias soportadas;
- reglas soportadas para min_level;
- campos de filtro permitidos.

No enviar:

- nombres de empleados;
- correos;
- IDs de empleados;
- entregables;
- texto libre de participaciones;
- `resolvio_problema`;
- datos personales no necesarios.

El `query_text` no se almacena como requisito de negocio del MVP.

## 27.2 Output del LLM

Debe ser exclusivamente un objeto estructurado validable.

Ejemplo:

```json
{
  "competencies": [
    {"code": "liderazgo", "min_level": 4},
    {"code": "trabajo_equipo", "min_level": 4}
  ],
  "area": null,
  "position": null
}
```

No permitir en el DTO campos como:

- `candidate_names`;
- `recommended_employee`;
- `winner`;
- `talent_score`;
- `reason_for_selection`.

El backend valida que la salida solo contenga campos permitidos.

Si el texto de RH contiene nombres o PII que no son necesarios para expresar criterios, no deben enviarse al proveedor LLM. Puede rechazarse la entrada y solicitar criterios estructurados.

## 27.3 Fallback

Intento 1: Groq.  
Intento 2: Gemini.

La misma validación de esquema aplica a ambos.

Si ambos fallan, la búsqueda no se ejecuta automáticamente con una interpretación improvisada.

---

# 28. Orden de resultados de búsqueda

Si se solicita orden por competencias seleccionadas:

```text
average(selected_numeric_levels)
```

No persistir este promedio como score.

No llamarlo “score de talento”.

En empate:

1. `nombre` ascendente;
2. `id` ascendente.

Los resultados son una lista filtrada, no un ranking corporativo.

---

# 29. Mentoría

Servicio:

```text
MentorshipService.suggest(receiver_id, competency_code)
```

## 29.1 Receptor

Si nivel objetivo:

```text
1–4 → elegible
5 → no suggestion
DI → no suggestion
```

## 29.2 Mentor

Requisitos:

- activo;
- nivel numérico objetivo;
- nivel objetivo del mentor > receptor.

## 29.3 Desempate

Orden:

1. mayor nivel en competencia objetivo;
2. mayor promedio de las otras cuatro competencias usando solo valores numéricos;
3. nombre ascendente;
4. id ascendente.

No usar IA para elegir el mentor.

---

# 30. Atención requerida

No crear tabla `Alert`.

Implementar como consulta/servicio derivado, por ejemplo:

```text
AttentionService.get_required_attention()
```

Condiciones exactas para empleado activo:

```text
profile_incomplete == true
OR
no participation with fecha_registro >= now_local - 90 days
```

`profile_incomplete = true` si falta cualquiera de estos campos obligatorios: nombre, cuenta/correo de acceso, puesto, área o fecha de ingreso.

La fecha debe calcularse en `America/Mexico_City`.

Esta consulta no modifica datos y no genera una alerta persistente.

No usarla para modificar competencias, 9-Box o evaluaciones.

---

# 31. API y autorización

Todas las decisiones de acceso deben validarse en backend.

Separar:

```text
authentication
authorization
resource ownership
business rule
```

Endpoints mínimos orientativos:

```text
POST   /auth/login
POST   /auth/recovery/request
POST   /auth/recovery/reset
POST   /auth/password/change

GET    /me
GET    /me/result
GET    /me/projects
GET    /me/participations
POST   /me/participations
PATCH  /me/participations/{id}
GET    /me/trainings
POST   /me/trainings
GET    /me/evaluations

GET    /rh/employees
POST   /rh/employees
GET    /rh/employees/{id}
GET    /rh/employees/{id}/result
GET    /rh/employees/{id}/recommendation
GET    /rh/employees/{id}/evaluations

GET    /rh/projects
GET    /rh/projects/{id}
PATCH  /rh/projects/{id}
POST   /rh/projects/{id}/validate

POST   /rh/talent-search/manual
POST   /rh/talent-search/interpret
POST   /rh/mentorship/suggest
GET    /rh/gaps
POST   /rh/evaluations/generate
GET    /rh/evaluations
GET    /rh/evaluations/{id}

GET    /health
```

Los nombres exactos pueden adaptarse al estilo REST del proyecto, pero los permisos y reglas no.

No crear endpoint de modificación para evaluación histórica.

## 31.1 Recomendación de desarrollo para RH (PRD v1.4 §20.2.1)

`GET /rh/employees/{empleado_id}/recommendation`: sugerencia de
desarrollo con IA para el empleado indicado, bajo demanda explícita de
RH. Es una ruta separada de `GET /me/progress/recommendation`, que
sigue siendo exclusiva del empleado y rechaza a RH.

- Autorización: `require_rh`. Empleado → 403. Sin token → 401.
  `empleado_id` sale del path; el cliente no envía niveles,
  fortalezas, texto ni ningún identificador adicional. Empleado
  inexistente → 404 (mismo comportamiento que
  `GET /rh/employees/{id}/result`). Elegibilidad: exactamente el mismo
  alcance que el perfil RH y `/result`, sin restricción exclusiva por
  estado activo.
- Comportamiento: reutiliza `RecommendationService`,
  `AIOrchestrator.generar_recomendacion` y los DTO existentes
  (`RecomendacionIAOut` / `RecomendacionIABloqueOut` /
  `SalidaRecomendacionIA` cerrado `extra="forbid"`). El `empleado_id`
  del path NUNCA se envía al LLM: el contexto mínimo ya lo excluye
  (PRD §18). Las instrucciones del prompt que nombran la vista «Mi
  progreso» se conservan intactas en el MVP y se documentan como
  históricas.
- Respuestas: 200 con `{ resultado_actual, recomendacion_ia }`; IA no
  disponible → 200 con `recomendacion_ia: null` (§38). Nunca texto
  inventado.
- Persistencia: ninguna. Sin tabla, sin migración, sin auditoría, sin
  caché persistente y sin historial. Cada consulta deriva el resultado
  actual vigente y pide una sugerencia nueva; no se promete reproducir
  un texto generado anteriormente.

---

# 32. Validación de ownership

Para endpoints de Empleado:

- obtener el `empleado_id` desde la cuenta autenticada;
- nunca confiar exclusivamente en un `empleado_id` enviado por el cliente;
- verificar que cada `participacion`, `capacitacion` o `evaluacion` pertenece al empleado autenticado.

Esto evita IDOR.

---

# 33. Migraciones y constraints

Alembic debe contener:

- tablas;
- índices;
- constraints;
- extensión `pg_trgm`;
- índices de similitud necesarios;
- trigger de inmutabilidad de `Evaluacion`.

No depender de creación automática del ORM para reproducir el esquema.

Los constraints de rango deben ser estáticos. No utilizar funciones como `CURRENT_DATE` dentro de `CHECK` para reglas de negocio temporales.

---

# 34. PostgreSQL healthcheck

Docker Compose debe garantizar que PostgreSQL esté healthy antes de ejecutar migraciones del backend.

Patrón:

```text
PostgreSQL
  ↓ healthcheck
backend migration
  ↓
backend app
```

No asumir que “container started” significa “database ready”.

---

# 35. Seed de RH

El usuario RH inicial debe crearse mediante seed/migración idempotente y segura ante concurrencia.

Nunca hardcodear secretos reales dentro del repositorio.

Usar variables de entorno para credenciales iniciales y secretos.

No versionar `.env` con secretos.

---

# 36. DTOs y contratos

Separar DTOs de:

- autenticación;
- resultados actuales;
- evaluaciones históricas;
- búsqueda manual;
- interpretación IA;
- recomendación IA (empleado y RH, mismo contrato);
- mentoría;
- auditoría.

Los DTOs de IA deben ser estrictos y cerrados.

No utilizar `dict[str, Any]` como contrato de salida para reglas críticas.

---

# 37. Prompting y orquestación IA

El prompt debe instruir explícitamente:

- usar únicamente las competencias y campos permitidos;
- no inventar niveles;
- no proponer personas;
- no producir IDs;
- no producir decisiones de selección;
- devolver solo JSON compatible con el schema.

Aun con instrucciones de prompt, el backend debe validar el resultado.

Nunca confiar en prompt como mecanismo de seguridad.

---

# 38. Manejo de fallos IA

Si Groq falla:

```text
Groq → Gemini
```

Si Gemini también falla:

- retornar error controlado de interpretación;
- no ejecutar filtros inventados;
- permitir reintento o edición manual por RH.

La funcionalidad manual no depende de la IA.

En recomendaciones de desarrollo (ruta de empleado y ruta RH): si no
hay proveedores configurados o todos fallan, la respuesta es 200 con el
resultado calculado intacto y `recomendacion_ia: null` (degradación, no
502). La salida del LLM fuera de contrato se trata como fallo del
proveedor y aplica el mismo fallback. Nunca se sustituye por una
recomendación inventada ni por texto fijo.

---

# 39. Tests obligatorios

## 39.1 Competencias

Probar al menos:

- límites 20/40/60/80;
- denominadores insuficientes;
- `En proceso` excluido de desempeño;
- casos 3 participaciones exactas;
- aprendizaje con los límites de cursos;
- redondeo `.5` con `ROUND_HALF_UP`;
- DI propagado correctamente.

## 39.2 9-Box

Probar:

- Bajo/Medio/Alto en cada eje;
- cualquier competencia DI → ejes null;
- potencial sin redondeo previo.

## 39.3 Evaluaciones

Probar:

- periodo actual según `America/Mexico_City`;
- una evaluación por empleado/periodo;
- generación atómica;
- concurrencia;
- update rechazado;
- delete rechazado.

## 39.4 Búsqueda

Probar:

- AND entre competencias;
- DI no satisface min level;
- orden por promedio informativo;
- empate determinista;
- DTO IA inválido rechazado;
- campos no permitidos rechazados;
- fallback Groq → Gemini.

## 39.5 Mentoría

Probar:

- receptor nivel 5;
- receptor DI;
- mentor solo si es estrictamente superior;
- empate por promedio de valores numéricos;
- DI excluido del promedio de desempate;
- desempate final determinista.

## 39.6 Seguridad

Probar IDOR.

Probar autorización RH vs Empleado.

Probar recuperación uniforme.

## 39.7 Recomendación RH

Probar:

- RH autorizado → 200 con `{ resultado_actual, recomendacion_ia }`;
- Empleado → 403; sin token → 401;
- empleado inexistente → 404;
- salida del LLM fuera de contrato → fallback y degradación a
  `recomendacion_ia: null` con 200, sin texto inventado;
- sin proveedores configurados → 200 con resultado calculado y
  `recomendacion_ia: null`;
- cero escrituras: la consulta no crea filas persistentes ni auditoría.

---

# 40. Rendimiento y consultas

- paginar listas RH;
- evitar N+1 en empleados/proyectos/participaciones;
- consultar solo campos necesarios para dashboards;
- mantener respuestas de IA pequeñas;
- evitar cargar historial completo sin necesidad;
- usar índices adecuados para claves foráneas, estados, áreas y búsquedas.

La UX debe poder utilizar skeletons y estados de carga sin bloquear toda la pantalla innecesariamente.

---

# 41. Frontend y Style Guide

El frontend debe implementar el Style Guide v1.2.

Tokens visuales, componentes y navegación deben ser reutilizables.

No crear:

- otra paleta;
- otro sistema de botones;
- navegación distinta por pantalla;
- dark mode obligatorio;
- chatbot permanente;
- 3D/phygital;
- score global.

La densidad de información debe diferenciar:

- RH → media;
- Empleado → baja.

`Datos insuficientes` es un estado válido y no debe visualizarse como error destructivo.

---

# 42. Reglas de presentación con impacto funcional

El frontend debe respetar estas correspondencias:

```text
Resultado actual → antes de histórico
9-Box → solo RH
IA → explicación/recomendación secundaria
Acciones de desarrollo (RH) → sugerencia secundaria con disparo explícito
Criterio del sistema → mentoría
Atención requerida → orientación operativa
Datos insuficientes → estado válido
```

No presentar recomendaciones de IA como resultado oficial.

---

# 43. Exportaciones

Las exportaciones deben respetar los mismos permisos del usuario que las solicita.

No exportar información a la que el usuario no tendría acceso en la interfaz.

La exportación no crea ni modifica resultados.

---

# 44. Definiciones de “no hacer”

GLM no debe:

- persistir `ResultadoActual`;
- crear una tabla `Alert` para `Atención requerida`;
- hacer que la IA calcule competencias;
- mandar PII a la IA para interpretar búsquedas;
- mandar `resolvio_problema` a la IA;
- dejar que la IA seleccione candidatos;
- dejar que la IA seleccione mentores;
- crear score global;
- crear ranking corporativo;
- permitir update/delete de `Evaluacion`;
- usar listeners como única protección de inmutabilidad;
- usar `create_all()` como migración;
- introducir reglas temporales mediante `CURRENT_DATE` en CHECK;
- usar experiencia en fórmulas de talento;
- incluir proyectos `En proceso` en Desempeño técnico;
- convertir DI en nivel 0;
- cambiar el umbral de `pg_trgm` sin decisión de producto;
- crear proyectos automáticamente al detectar una coincidencia aproximada.
- inventar recomendaciones de desarrollo cuando la IA no está disponible;
- persistir, cachear o historificar recomendaciones de desarrollo.

---

# 45. Criterio técnico de aceptación

La implementación está lista para revisión funcional cuando:

1. `CompetencyEngine` produce resultados reproducibles.
2. `ResultadoActual` solo existe en memoria/DTO.
3. `Evaluacion` es snapshot histórico e inmutable.
4. PostgreSQL enforcea las constraints críticas.
5. RH/Empleado están protegidos en backend.
6. La búsqueda IA termina en DTO validado y filtros backend.
7. La IA no recibe PII ni contexto de participaciones innecesario.
8. Mentoría y búsqueda tienen desempates deterministas.
9. `Atención requerida` se calcula sin entidad persistente.
10. Auditoría registra correcciones RH.
11. Alembic reproduce el esquema desde cero.
12. Docker espera healthcheck de PostgreSQL.
13. Las pruebas cubren límites y casos DI.
14. El frontend respeta Style Guide v1.2.
15. La recomendación RH reutiliza el contrato de recomendación IA y no persiste nada.

**ESTADO: LISTA PARA ENTREGA A GLM.**
