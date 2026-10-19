# PRD — Sistema de Identificación de Talento de Alto Potencial

**Empresa:** PluriOne S.A. de C.V. (Develop Talent & Technology)  
**Versión:** 1.3 — Corrección final pre-GLM  
**Estado:** CERRADO PARA IMPLEMENTACIÓN  
**Fecha:** Septiembre 2026

---

# 0. Control de cambios

Esta versión mantiene el diseño y alcance del MVP previamente aprobado. No agrega módulos ni cambia el modelo de negocio. Solamente convierte en reglas explícitas los puntos que podían interpretarse de forma distinta durante la implementación.

Correcciones cerradas en esta versión:

1. La búsqueda con lenguaje natural admite texto libre como entrada de interpretación, pero la IA solo recibe el contexto mínimo necesario y nunca PII de empleados; la salida es un DTO estructurado y validado.
2. La mentoría define el comportamiento del desempate cuando alguna de las otras cuatro competencias está en `Datos insuficientes`.
3. `Atención requerida` se calcula como vista derivada y no como entidad persistente `Alert`; se fija el significado de participación reciente.
4. Fortalezas y oportunidades se derivan de reglas del sistema, no de una decisión libre de la IA.
5. El orden informativo de resultados de búsqueda no constituye un ranking ni un score global de talento.
6. Se fija un diccionario único de etiquetas para niveles 1–5.
7. Se fija redondeo decimal determinista para la fórmula de Aprendizaje.
8. Se fija orden determinista en empates de resultados.

---

# 1. Propósito

Construir un MVP web local para que PluriOne S.A. de C.V. pueda registrar evidencia laboral, calcular cinco competencias mediante reglas transparentes, consultar resultados actuales e históricos y apoyar acciones de desarrollo y búsqueda interna de talento.

El sistema debe priorizar trazabilidad, comprensión y separación entre:

- datos registrados;
- resultados calculados por reglas;
- interpretaciones o recomendaciones generadas por IA.

La IA es una capa de apoyo. Nunca sustituye las reglas de negocio, los permisos ni la selección de candidatos.

---

# 2. Alcance del MVP

## 2.1 Incluido

- autenticación y recuperación de acceso;
- dos roles humanos: `RH` y `Empleado`;
- cuenta técnica `CuentaAcceso` para autenticación;
- gestión de empleados;
- gestión administrativa de proyectos existentes;
- creación de proyectos por Empleado después de búsqueda obligatoria;
- registro y edición controlada de participaciones;
- registro de capacitaciones;
- cálculo de cinco competencias;
- resultado actual dinámico, no persistido;
- evaluaciones oficiales históricas e inmutables;
- 9-Box exclusivo para RH;
- búsqueda manual de talento;
- búsqueda asistida por lenguaje natural;
- comparación de empleados;
- mentoría;
- análisis de brechas;
- historial de evaluaciones;
- recomendaciones de desarrollo mediante IA;
- auditoría de correcciones administrativas;
- exportaciones definidas por el producto;
- Docker local y PostgreSQL.

## 2.2 Fuera de alcance

No implementar como parte del MVP:

- multitenancy;
- aplicación móvil nativa;
- hosting público de producción;
- módulo completo de vacantes/reclutamiento;
- ranking social entre empleados;
- inferencia psicométrica, de salud mental o personalidad;
- modelo predictivo supervisado para potencial;
- K-Means como mecanismo central de talento;
- reactivación de cuentas/proyectos como flujo especial;
- combinación/merge de proyectos;
- entidad persistente `Alert`;
- `ResultadoActual` persistido;
- score global de talento no definido en este PRD;
- chatbot permanente;
- Generative UI que cambie la navegación;
- 3D/phygital.

---

# 3. Roles, autenticación y acceso

## 3.1 Roles humanos

Solo existen dos roles de negocio:

- `RH`
- `Empleado`

`CuentaAcceso` es una entidad técnica de autenticación, no un tercer rol.

## 3.2 CuentaAcceso

Cada cuenta tiene exactamente un correo de acceso.

Ese correo sirve para:

- iniciar sesión;
- recuperación de contraseña;
- envío de credencial temporal inicial.

No existe un campo separado `correo_institucional`.

No se exige dominio corporativo. RH registra el correo que el empleado usará para acceder al sistema, sea personal o de otro tipo. El sistema no valida que pertenezca a un dominio específico.

`Empleado` no duplica el correo. El correo vive en `CuentaAcceso`.

La relación es:

```text
RH → CuentaAcceso sin empleado_id obligatorio
Empleado → CuentaAcceso 1:1
```

## 3.3 Alta de empleado

RH registra:

- nombre;
- correo de acceso;
- puesto;
- área;
- fecha de ingreso.

El sistema genera una credencial temporal y la envía al correo de acceso. En el primer acceso el empleado debe cambiar la contraseña.

## 3.4 Recuperación

La recuperación debe mostrar una respuesta uniforme independientemente de que el correo exista o no. Nunca revelar existencia de cuentas.

## 3.5 Contraseña

Mínimo de 8 caracteres y al menos un número.

---

# 4. Competencias

El sistema tiene exactamente cinco competencias:

1. Desempeño técnico
2. Liderazgo
3. Trabajo en equipo
4. Capacidad de aprendizaje
5. Comunicación

Experiencia no es una sexta competencia.

Experiencia es contexto y no participa en fórmulas de competencias, 9-Box, mentoría, búsqueda ni identificación de alto potencial.

---

# 5. Niveles de competencia

El resultado de una competencia numérica se expresa en niveles enteros de 1 a 5.

| Nivel | Etiqueta oficial |
|---|---|
| 1 | Inicial |
| 2 | En desarrollo |
| 3 | En crecimiento |
| 4 | Consolidado |
| 5 | Alto |

Cuando no existe evidencia mínima suficiente, el resultado es:

`Datos insuficientes`

No convertir `Datos insuficientes` a nivel numérico.

La interfaz debe presentar el estado de forma textual; el color nunca es la única señal.

---

# 6. Conversión porcentaje → nivel

Regla única para porcentajes de 0 a 100:

```text
0 <= porcentaje <= 20       → nivel 1
20 < porcentaje <= 40       → nivel 2
40 < porcentaje <= 60       → nivel 3
60 < porcentaje <= 80       → nivel 4
80 < porcentaje <= 100      → nivel 5
```

Los límites son inclusivos en el extremo superior de cada tramo.

---

# 7. Cálculo de competencias

## 7.1 Desempeño técnico

```text
completados /
(completados + cancelados)
```

Los proyectos `En proceso` se excluyen.

Mínimo de 3 proyectos evaluables. Si hay menos de 3, el resultado es `Datos insuficientes`.

## 7.2 Liderazgo

```text
participaciones con coordino_tareas = true /
total de participaciones
```

Mínimo de 3 participaciones.

## 7.3 Trabajo en equipo

```text
participaciones con en_equipo = true /
total de participaciones
```

Mínimo de 3 participaciones.

## 7.4 Comunicación

```text
participaciones con explico_a_publico_distinto = true /
total de participaciones
```

Mínimo de 3 participaciones.

## 7.5 Capacidad de aprendizaje

Requiere evidencia de al menos:

- 2 cursos registrados, o
- 3 proyectos registrados.

### Componente A — diversidad de roles

```text
0 roles distintos → 1
1 rol distinto    → 2
2 roles distintos → 3
3 roles distintos → 4
4+ roles distintos → 5
```

### Componente B — cursos completados en el año calendario actual

```text
0–1   → 1
2–3   → 2
4–5   → 3
6–7   → 4
8+    → 5
```

### Fórmula

```text
score = A * 0.60 + B * 0.40
nivel = round_half_up(score)
```

El redondeo `round_half_up` significa que un .5 se redondea hacia arriba.

---

# 8. Experiencia

Experiencia se muestra como contexto y puede incluir:

- antigüedad a partir de la fecha de ingreso;
- cantidad de proyectos únicos en los que participó.

No existe un `ExperienceScore` oficial.

No se usa para:

- nivel de competencia;
- 9-Box;
- mentoría;
- búsqueda manual o IA;
- identificación de alto potencial;
- score global.

---

# 9. Resultado actual

El `ResultadoActual` se calcula dinámicamente a partir del estado vigente de:

- empleado;
- participaciones;
- proyectos;
- capacitaciones.

No se persiste como entidad histórica.

Debe distinguirse visualmente de las evaluaciones oficiales históricas.

Orden conceptual cuando ambos aparecen:

```text
Resultado actual
↓
Evaluación oficial histórica
```

---

# 10. 9-Box

Visible exclusivamente para RH.

## 10.1 Desempeño

Se determina con el nivel de Desempeño técnico.

```text
1–2.999... → Bajo
3–3.999... → Medio
4–5         → Alto
```

## 10.2 Potencial

```text
potencial =
(Liderazgo + Trabajo en equipo +
 Capacidad de aprendizaje + Comunicación) / 4
```

No se redondea para clasificar el eje.

```text
1–2.999... → Bajo
3–3.999... → Medio
4–5         → Alto
```

Si cualquiera de las cinco competencias está en `Datos insuficientes`, los ejes del 9-Box son `null` y no debe asignarse una celda.

## 10.3 Reglas de presentación

El 9-Box no funciona como semáforo humano ni como juicio personal.

La celda actual se distingue con:

- borde primario de 2 px;
- fondo primario suave;
- etiqueta `Actual`.

---

# 11. Proyectos

Los proyectos pertenecen a un catálogo compartido por toda la organización.

Estados oficiales:

- `En proceso`
- `Completado`
- `Cancelado`

`En proceso` es un estado operativo normal, no una alerta.

## 11.1 Creación

Solo el Empleado puede crear un proyecto nuevo.

Antes de crear un proyecto existe búsqueda obligatoria.

Flujo:

```text
Buscar proyecto
↓
Seleccionar existente / revisar aproximados
↓
Crear nuevo si no existe
↓
Registrar participación
```

Un proyecto nuevo inicia en `En proceso`.

RH administra proyectos existentes, pero no tiene un botón de creación de proyecto desde cero.

## 11.2 Nombre de proyecto

El sistema mantiene un `nombre_normalizado` para comparación y unicidad.

Normalización:

1. convertir a minúsculas;
2. recortar espacios extremos;
3. colapsar espacios internos repetidos;
4. normalizar Unicode NFD;
5. eliminar diacríticos.

Debe evitarse crear duplicados exactos después de esta normalización.

## 11.3 Coincidencias aproximadas

Cuando no hay coincidencia exacta, el sistema puede mostrar hasta 5 sugerencias aproximadas.

La coincidencia aproximada es una advertencia informativa, no un error.

---

# 12. Participaciones

La participación es independiente del proyecto y representa la evidencia específica de un empleado.

En el registro inicial se capturan todos los indicadores definidos por producto, incluyendo:

- rol;
- entregables;
- trabajo en equipo;
- coordinación;
- explicación a públicos distintos;
- situación/problema;
- horas.

## 12.1 Edición del Empleado después del alta inicial

Solo puede editar:

- rol;
- entregables;
- horas.

Los indicadores objetivos registrados al crear la participación quedan bloqueados para el Empleado.

## 12.2 Edición administrativa RH

RH puede corregir los campos de una participación de forma administrativa.

Cada corrección administrativa debe quedar auditada.

## 12.3 resolvio_problema

`resolvio_problema` es contexto humano.

No participa en ninguna fórmula.

No participa en la selección de mentor.

No participa en búsqueda.

No se envía al modelo de IA.

---

# 13. Búsqueda de talento

## 13.1 Búsqueda manual

RH puede seleccionar una o varias competencias y un nivel mínimo.

La condición es AND:

```text
Empleado cumple competencia A
Y
Empleado cumple competencia B
Y
...
```

El nivel mínimo estándar para la búsqueda de alto potencial es 4, aunque la interfaz puede permitir otros niveles dentro de 1–5 si están definidos por el producto.

Solo empleados activos entran en los resultados operativos.

`Datos insuficientes` no satisface un criterio numérico.

## 13.2 Orden de resultados

Cuando se muestran varias competencias seleccionadas, el resultado puede ordenarse de forma informativa por el promedio de esas competencias.

Ese promedio:

- no es una nueva competencia;
- no es `ResultadoActual` adicional;
- no es un score global de talento;
- no es un ranking humano;
- no es una decisión de selección.

En igualdad, el desempate de resultados debe ser determinista por nombre de empleado ascendente y después por identificador.

## 13.3 Búsqueda con lenguaje natural

Flujo obligatorio:

```text
Necesidad escrita por RH
↓
Interpretación estructurada
↓
Criterios detectados
↓
Revisión de RH
↓
Filtro backend
↓
Resultados
```

Ejemplo:

> “Necesito personas con liderazgo y trabajo en equipo fuertes.”

Puede producir:

```text
Liderazgo >= 4
Trabajo en equipo >= 4
```

RH debe poder revisar y modificar los criterios antes de ejecutar la búsqueda.

La IA nunca presenta directamente un empleado como “seleccionado” o “mejor candidato”.

---

# 14. Mentoría

RH selecciona:

- empleado receptor;
- competencia objetivo.

## 14.1 Elegibilidad del receptor

- nivel 1–4: puede sugerirse mentor;
- nivel 5: no sugerir mentor;
- `Datos insuficientes`: no sugerir mentor.

## 14.2 Elegibilidad del mentor

El mentor debe:

- estar activo;
- tener resultado numérico en la competencia objetivo;
- tener nivel estrictamente superior al receptor.

No se considera experiencia para elegir mentor.

## 14.3 Desempate

Primero se prioriza mayor nivel en la competencia objetivo.

Si existe empate, se calcula el promedio de las otras cuatro competencias usando únicamente valores numéricos disponibles.

Las competencias en `Datos insuficientes` se excluyen del promedio de desempate.

Si no existe ningún valor numérico disponible para desempatar, se usa orden determinista por nombre y después identificador.

La interfaz debe usar:

`Criterio del sistema`

No usar:

- Mejor empleado;
- Top mentor;
- Mejor talento.

---

# 15. Brechas

RH puede seleccionar una competencia a la vez.

Debe mostrar:

- empleados evaluables;
- `Datos insuficientes` por separado;
- cantidad y porcentaje en niveles 1–2;
- cantidad y porcentaje en niveles 3–5.

El porcentaje no se presenta automáticamente como señal de alarma.

---

# 16. Evaluaciones oficiales

La evaluación oficial es una fotografía histórica de los resultados calculados por las reglas del sistema.

No la genera la IA.

## 16.1 Periodo

El periodo vigente se determina automáticamente según fecha local de negocio `America/Mexico_City`:

```text
enero–marzo      → YYYY-Q1
abril–junio      → YYYY-Q2
julio–septiembre → YYYY-Q3
octubre–diciembre→ YYYY-Q4
```

## 16.2 Generación

Solo RH puede generar una evaluación.

Se incluyen empleados activos en el momento de generación.

La generación debe ser atómica.

Debe existir como máximo una evaluación por empleado y periodo.

## 16.3 Inmutabilidad

Una evaluación oficial histórica no puede editarse ni eliminarse desde la aplicación.

La inmutabilidad debe estar protegida tanto por API como por base de datos.

La corrección de datos fuente posteriores no modifica una evaluación histórica ya generada.

---

# 17. IA

## 17.1 Proveedores

- Groq como proveedor primario;
- Google Gemini como fallback;
- LangChain para orquestación.

## 17.2 Qué sí hace la IA

- interpretar lenguaje natural de RH para convertirlo a criterios estructurados soportados;
- explicar resultados calculados;
- generar recomendaciones de desarrollo;
- expresar información estructurada en lenguaje comprensible.

## 17.3 Qué nunca hace

- calcular competencias;
- modificar resultados oficiales;
- crear permisos;
- decidir quién puede ver información;
- seleccionar unilateralmente un empleado;
- calcular 9-Box;
- alterar evaluaciones históricas;
- usar `resolvio_problema` como evidencia;
- crear un score global.

## 17.4 Fortalezas y oportunidades

Son derivadas por reglas del sistema:

- niveles 4–5 → fortalezas;
- niveles 1–2 → oportunidades;
- nivel 3 → no se clasifica automáticamente como fortaleza ni oportunidad;
- `Datos insuficientes` → excluido.

Experiencia no se usa para estas categorías.

La IA puede explicar o proponer acciones de desarrollo, pero no decide estas categorías.

---

# 18. Protección de información en IA

La búsqueda de lenguaje natural sí comienza con texto libre proporcionado por RH. Ese texto es una entrada efímera de interpretación y no se convierte en un resultado de negocio por sí mismo.

Antes de enviar información a un proveedor LLM:

- no enviar nombre de empleados;
- no enviar correo;
- no enviar identificadores de empleados;
- no enviar texto libre de participaciones;
- no enviar `resolvio_problema`;
- no enviar información que no sea necesaria para interpretar la intención.

La salida del modelo debe transformarse a un DTO estructurado validado.

Si una consulta contiene una referencia personal no soportada, debe rechazarse o solicitar una descripción basada en criterios, sin reenviar PII al modelo.

---

# 19. Dashboard RH

Debe mostrar como núcleo:

- empleados activos;
- proyectos activos;
- atención requerida.

La distribución de competencias se consulta una competencia a la vez.

El 9-Box no es el elemento dominante del dashboard.

## 19.1 Atención requerida

`Atención requerida` es una vista derivada, no una entidad persistente.

Un empleado activo aparece en esta vista si cumple al menos una condición:

1. perfil básico incompleto;
2. no tiene ninguna participación registrada durante los últimos 90 días.

Se considera perfil básico incompleto si falta alguno de estos datos obligatorios: nombre, correo de acceso, puesto, área o fecha de ingreso.

Para el criterio de participación reciente se utiliza la fecha de registro de la participación.

Estas condiciones no cambian ningún resultado de competencia ni producen alertas persistentes.

La interfaz debe presentarlo como orientación operativa, no como juicio sobre la persona.

---

# 20. Vistas RH

## 20.1 Empleados

Búsqueda por:

- nombre;
- puesto;
- área.

Filtros limitados por:

- área;
- competencia;
- nivel.

Tabla:

- Empleado;
- Puesto;
- Área;
- Estado.

## 20.2 Perfil individual

Orden:

```text
Información básica
↓
Resultado actual
↓
Competencias
↓
Experiencia
↓
9-Box
↓
Última evaluación
↓
Evolución
↓
Fortalezas / oportunidades
↓
Acciones de desarrollo
```

## 20.3 Proyectos

Catálogo compartido.

RH consulta, edita y administra proyectos existentes.

No existe botón `Nuevo proyecto` para RH.

## 20.4 Búsqueda

Debe mostrar los criterios interpretados antes de los resultados.

## 20.5 Comparación

Permite seleccionar 2 o más empleados activos.

Muestra:

- cinco competencias;
- experiencia como contexto.

No muestra 9-Box ni declara un ganador.

## 20.6 Mentoría

Muestra posibles mentores y `Criterio del sistema`.

## 20.7 Brechas

Una competencia a la vez.

## 20.8 Evaluaciones

```text
Periodo vigente
↓
Generación
↓
Fotografía histórica
↓
Historial
```

---

# 21. Vistas Empleado

## 21.1 Inicio

Debe incluir orientación sobre:

- progreso;
- proyectos;
- resumen de competencias;
- próximo paso.

No muestra 9-Box ni comparación organizacional.

## 21.2 Mi progreso

Debe mostrar:

- cinco competencias;
- cómo se obtienen;
- fortalezas;
- oportunidades;
- recomendación IA;
- transparencia de datos.

## 21.3 Mis proyectos

Incluye búsqueda obligatoria antes de crear un proyecto.

## 21.4 Mis capacitaciones

Permite registrar:

- nombre;
- fecha;
- completado.

## 21.5 Mi historial

Muestra evaluaciones oficiales históricas.

La evolución muestra una competencia a la vez por defecto.

No muestra ejes ni 9-Box.

## 21.6 Mi cuenta

Muestra:

- nombre;
- puesto;
- área;
- correo de acceso.

Permite cambiar contraseña.

No permite modificar datos laborales.

---

# 22. Privacidad, seguridad y auditoría

RBAC se aplica en backend, no solo en frontend.

El backend debe validar propiedad y alcance de cada recurso para prevenir IDOR.

Toda corrección administrativa relevante debe registrar auditoría.

La auditoría debe permitir conocer al menos:

- quién modificó;
- qué entidad;
- qué registro;
- cuándo;
- operación;
- valores anteriores y posteriores cuando aplique.

---

# 23. Principios UX obligatorios

- lenguaje descriptivo y neutral;
- no etiquetar a personas como “insuficientes”;
- no usar ranking humano;
- no utilizar color como único indicador;
- 9-Box únicamente RH;
- IA como apoyo;
- `Datos insuficientes` como estado válido, no error;
- `En proceso` como estado normal;
- sin gamificación de evaluaciones;
- navegación predecible.

---

# 24. Reglas de autoridad entre documentos

Cuando se entregue el conjunto a GLM:

1. este PRD define qué debe hacer el producto;
2. la Especificación Técnica define cómo implementarlo;
3. el Style Guide define cómo presentarlo;
4. ninguno de los tres autoriza a inventar reglas de negocio;
5. si una decisión no está especificada, GLM debe usar el comportamiento mínimo compatible con estas reglas, no crear una funcionalidad nueva.

---

# 25. Criterio de cierre

El MVP se considera funcionalmente cerrado cuando:

- los resultados calculados son reproducibles con las fórmulas definidas;
- `ResultadoActual` no se persiste como histórico;
- las evaluaciones oficiales quedan inmutables;
- RH y Empleado ven únicamente lo permitido;
- la búsqueda manual y natural terminan en filtros estructurados backend;
- la IA no puede alterar resultados oficiales;
- la mentoría y sus desempates son deterministas;
- `Atención requerida` es derivada, no persistente;
- fortalezas y oportunidades son reproducibles por reglas;
- el frontend respeta el Style Guide v1.1.

**ESTADO: LISTO PARA ENTREGA A GLM.**
