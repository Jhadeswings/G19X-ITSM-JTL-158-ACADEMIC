# Manual de usuario — Sistema de Identificación de Talento de Alto Potencial

**Versión del manual:** 1.0 (MVP) · **Aplicación:** MVP local para PluriOne S.A. de C.V.

Este manual explica cómo **usar** la aplicación: está dirigido a personas que operan el
sistema (RH y Empleados), no a quienes la desarrollan. La instalación y los comandos
técnicos viven en el [`README.md`](../README.md) del repositorio.

---

## Índice

1. [Objetivo y alcance](#1-objetivo-y-alcance)
2. [Requisitos y puesta en marcha](#2-requisitos-y-puesta-en-marcha)
3. [Acceso inicial y contraseñas](#3-acceso-inicial-y-contraseñas)
4. [Manual del rol RH](#4-manual-del-rol-rh)
5. [Manual del rol Empleado](#5-manual-del-rol-empleado)
6. [Mensajes, estados y resolución de problemas](#6-mensajes-estados-y-resolución-de-problemas)
7. [Privacidad y seguridad de uso](#7-privacidad-y-seguridad-de-uso)
8. [Limitaciones conocidas](#8-limitaciones-conocidas)
9. [Referencias](#9-referencias)

---

## 1. Objetivo y alcance

La aplicación permite a la organización **registrar evidencia laboral** (proyectos,
participaciones y capacitaciones), **calcular cinco competencias** con reglas
transparentes y **consultar resultados actuales e históricos** para apoyar acciones
de desarrollo y la búsqueda interna de talento.

- Las **competencias** son: Desempeño técnico, Liderazgo, Trabajo en equipo,
  Capacidad de aprendizaje y Comunicación. Cada una se expresa en niveles del 1
  al 5 con su etiqueta oficial (1 Inicial · 2 En desarrollo · 3 En crecimiento ·
  4 Consolidado · 5 Alto). Cuando no hay evidencia suficiente, el resultado es el
  estado **«Datos insuficientes»**, que es un estado válido, no un error.
- La **experiencia** (antigüedad y proyectos únicos) se muestra solo como contexto.
- La **inteligencia artificial** es una capa de apoyo opcional: interpreta
  búsquedas escritas en lenguaje natural y genera sugerencias de desarrollo.
  Nunca calcula competencias, ni decide selecciones, ni modifica resultados.

### Perfiles de usuario

| Perfil | Qué puede hacer |
|---|---|
| **RH** | Gestiona empleados y proyectos, corrige participaciones (con auditoría), consulta el 9-Box, busca talento (manual y con lenguaje natural), compara empleados, consulta mentoría y brechas, genera evaluaciones oficiales y consulta la auditoría global. |
| **Empleado** | Ve su propio progreso, registra y edita sus participaciones y capacitaciones, consulta su historial de evaluaciones y administra su contraseña. **Nunca** ve el 9-Box, ni comparaciones organizacionales, ni datos de otras personas. |

Fuera del alcance del MVP (por decisión de producto): eliminación de proyectos,
multitenancy, aplicación móvil, ranking social entre empleados y puntuación
global de talento. Véase la sección 8.

---

## 2. Requisitos y puesta en marcha

La instalación completa (Docker, variables de entorno, arranque de servicios y
suites de pruebas) está documentada paso a paso en el
[`README.md`](../README.md) del proyecto. En resumen de operación:

| Servicio | Dirección local habitual |
|---|---|
| Aplicación web | `http://localhost:5173` |
| Documentación de la API (desarrolladores) | `http://localhost:8000/docs` |
| Bandeja de correo de desarrollo (MailHog) | `http://localhost:8025` |

> **Nota:** el buzón MailHog existe solo en desarrollo y se levanta con el perfil
> `mail` de Docker Compose (ver README, sección «Correo»). No es un servicio de
> producción.

---

## 3. Acceso inicial y contraseñas

### 3.1 Primera cuenta de RH

La instalación oficial no crea automáticamente cuentas fijas de demostración:
todo acceso nace del correo. Existe, opcionalmente, un mecanismo de datos
sintéticos para fines académicos, descrito en el README (sección «Datos de
demostración»), con credenciales públicas de uso estrictamente local y nunca
para producción. La primera cuenta de RH se crea de
forma automática al arrancar el sistema a partir de las variables
`SEED_RH_EMAIL` y `SEED_RH_PASSWORD` definidas en el archivo de entorno de la
raíz del proyecto (ver README, «Primer acceso de RH»). Con ese correo y esa
contraseña se inicia sesión en la aplicación.

### 3.2 Alta de empleados y credencial temporal

Cuando RH registra un empleado nuevo (sección 4.2), el sistema genera una
**contraseña temporal** y la envía **exclusivamente al correo de acceso** de esa
persona; nunca se muestra en pantalla ni se almacena en texto plano. En el
primer inicio de sesión, la aplicación **exige cambiar la contraseña** antes de
mostrar cualquier otra pantalla.

En desarrollo local, esos correos pueden consultarse en la bandeja de MailHog
(`http://localhost:8025`).

### 3.3 Política de contraseñas

Toda contraseña nueva debe tener **mínimo 8 caracteres y al menos un número**.
La aplicación valida esta política tanto al cambiar la contraseña como al
restablecerla por recuperación.

### 3.4 Recuperación de acceso

En la pantalla de inicio de sesión, el enlace **«¿Olvidaste tu contraseña?»**
abre el formulario de recuperación: escribes tu correo de acceso y envías la
solicitud. La respuesta es siempre la misma exista o no la cuenta (para no
revelar qué correos están registrados). Si el correo corresponde a una cuenta
activa, llegará un mensaje con un **código de un solo uso** válido por un
tiempo limitado (30 minutos por defecto).

El mensaje **no contiene enlaces**: copia el código que llegue por correo y
pégalo en la pantalla **«Restablecer contraseña»**, donde además defines tu
nueva contraseña (misma política de la sección 3.3). Si el código es inválido
o ya expiró, la aplicación responde «Token inválido o expirado.» y puedes
solicitar uno nuevo.

### 3.5 Duración de la sesión

La sesión dura **30 minutos** y se renueva mientras haya actividad. Si pasas
**28 minutos sin actividad**, aparece un aviso con el botón **«Seguir
conectado»**: púlsalo para renovar la sesión sin perder lo que estabas
haciendo; si no respondes, la sesión se cierra automáticamente y deberás
iniciar sesión de nuevo.

---

## 4. Manual del rol RH

Al iniciar sesión, RH entra al panel **Inicio**. El menú lateral muestra nueve
secciones, siempre en el mismo orden: **Inicio · Empleados · Proyectos ·
Búsqueda · Comparar · Mentoría · Brechas · Evaluaciones · Auditoría.**

### 4.1 Inicio (dashboard operativo)

Muestra tres métricas principales (empleados activos, proyectos activos y
**Atención requerida**) y la **distribución de una competencia a la vez**
(seleccionas la competencia y ves cuántas personas hay en cada nivel).
«Atención requerida» es una guía operativa, no una alarma: enumera empleados
activos cuyo perfil básico está incompleto o que no registran participaciones
en los últimos 90 días.

### 4.2 Empleados

**Listado.** Tabla paginada con las columnas Empleado, Puesto, Área y Estado
(Activo/Inactivo, siempre con texto, no solo color). Arriba tienes:

- **Búsqueda** por nombre o puesto (texto libre).
- **Filtros generales:** estado (Todos/Activos/Inactivos) y área
  (coincidencia exacta), con el botón **«Limpiar filtros»**.
- **Filtros de competencia y resultado** (grupo separado): eliges una
  competencia y un criterio — **Nivel mínimo** (1–5) o **Datos
  insuficientes**. Si eliges solo la competencia, aparece la ayuda
  «Seleccionar solo una competencia no filtra la lista. Elige un criterio:
  Nivel mínimo o Datos insuficientes.» (la competencia sola no filtra).

**Registrar empleado.** El botón **«Registrar empleado»** abre el formulario
de alta: nombre, correo de acceso, puesto, área y fecha de ingreso. Al crear
la cuenta, la contraseña temporal se envía al correo indicado (sección 3.2);
si el sistema no tiene proveedor de correo configurado, el alta no se
completa y se informa del problema, para que ninguna cuenta quede sin
credencial entregada.

**Perfil individual.** Al abrir un empleado verás, en este orden:
Información básica → Resultado actual (calculado al momento, distinto de las
evaluaciones históricas) → Competencias con su evidencia → Experiencia
(contexto) → **9-Box** (visible solo para RH) → Última evaluación oficial →
Historial → Fortalezas y oportunidades → **Acciones de desarrollo**.

- **Fortalezas y oportunidades** las derivan reglas del sistema (niveles 4–5 →
  fortalezas; 1–2 → oportunidades; 3 → sin clasificar; «Datos insuficientes» →
  excluido). No es una opinión de la IA.
- **Acciones de desarrollo** es una sugerencia de apoyo generada con IA **solo
  cuando pulsas «Consultar sugerencia»**: el perfil no la genera al abrirse.
  La sugerencia incluye su procedencia («Sugerencia de apoyo · Generada con
  IA…») y el descargo «No determina niveles ni modifica el resultado oficial»,
  con texto breve y hasta 5 acciones dirigidas al empleado, tal como las
  genera el sistema. Si la IA no está disponible, verás un estado neutral con
  la opción de reintentar; nunca se muestra texto inventado.
- **Guardar como PDF** exporta el perfil usando el diálogo de impresión del
  navegador (opción «Guardar como PDF»). La exportación no crea ni modifica
  ningún resultado.

### 4.3 Proyectos

Catálogo compartido y paginado de todos los proyectos de la organización.
RH **consulta y administra** proyectos existentes (datos y estado: En proceso,
Completado o Cancelado), pero no hay botón de «nuevo proyecto»: los proyectos
nuevos los registra el Empleado tras una búsqueda obligatoria.

En el **detalle de un proyecto** se listan sus participaciones y puedes
**corregir administrativamente** cualquiera de ellas: se abren los campos
(rol, entregables, los cuatro indicadores y horas) y el **motivo de la
corrección es obligatorio**. Toda corrección queda registrada en la auditoría
(sección 4.9) con los valores anteriores y nuevos.

### 4.4 Búsqueda

Dos modos, siempre con revisión humana antes de ejecutar:

- **Manual:** seleccionas una o varias competencias y un nivel mínimo (el
  estándar para alto potencial es 4). Se cumplen **todas** las competencias
  elegidas (condición Y). «Datos insuficientes» nunca satisface un nivel.
- **Lenguaje natural (opcional, con IA):** escribes la necesidad con tus
  palabras (p. ej. «necesito personas con liderazgo y trabajo en equipo
  fuertes»); el sistema **interpreta** el texto y te muestra los **criterios
  detectados** para que los revises y ajustes antes de ejecutar la búsqueda.
  La IA nunca presenta directamente a una persona como «seleccionada» o
  «mejor candidato».

Solo entran en resultados los **empleados activos**. El listado puede
ordenarse de forma informativa por el promedio de las competencias
seleccionadas: ese promedio **no** es una puntuación global ni un ranking
humano. Si la IA no está disponible, la interpretación responde con un error
controlado y puedes usar la búsqueda manual con normalidad.

### 4.5 Comparar

Seleccionas **dos o más empleados activos** y el sistema muestra, uno junto a
otro, las cinco competencias y la experiencia como contexto. La comparación
**no muestra el 9-Box ni declara un ganador**: no usa colores para señalar
«mejor» persona.

### 4.6 Mentoría

Indicas el **empleado receptor** y la **competencia objetivo**. El sistema
responde con posibles mentores bajo la etiqueta **«Criterio del sistema»**
(activos, con nivel numérico en esa competencia y estrictamente superior al
del receptor; el desempate es determinista). Nunca se etiqueta a nadie como
«mejor empleado» ni «top mentor». Si el receptor tiene nivel 5 o «Datos
insuficientes», no se sugiere mentor.

### 4.7 Brechas

Eliges **una competencia a la vez**. La vista separa a las personas evaluables
de las que están en «Datos insuficientes» y muestra cantidad y porcentaje en
niveles 1–2 y en 3–5. Los porcentajes se presentan con contexto, **no** como
señal de alarma automática.

### 4.8 Evaluaciones

La evaluación oficial es una **fotografía histórica e inmutable** de los
resultados calculados (las cinco competencias y el 9-Box del momento).

1. El sistema determina el **periodo vigente** automáticamente por fecha
   (trimestre en curso, p. ej. `2026-Q4`).
2. El botón de **generación** incluye a los empleados activos; la
   confirmación explica que la fotografía será histórica e inmutable.
3. Tras generarse, la evaluación **no puede editarse ni eliminarse** desde la
   aplicación; si después se corrigen datos de origen, la evaluación histórica
   no cambia. Las generaciones posteriores usan el estado de datos de su
   momento.
4. La vista muestra la última evaluación y el **historial por periodo**.

Si dos personas intentan generar el mismo periodo a la vez, el sistema lo
detecta y solo registra una generación.

### 4.9 Auditoría

Registro paginado y de solo lectura de **quién cambió qué, cuándo y con qué
valores** (anterior → nuevo). Distingue dos operaciones: **CORRECCIÓN**
(cambios administrativos de RH) y **MODIFICACION_EMPLEADO** (ediciones del
propio empleado sobre su participación). Las consultas de auditoría no generan
registros. Registran auditoría las correcciones de participaciones por RH
(CORRECCION) y las modificaciones del empleado sobre su propia participación
(MODIFICACION_EMPLEADO). Las altas de empleados y los cambios de sus datos
laborales no generan registro de auditoría en el MVP.

---

## 5. Manual del rol Empleado

Tras iniciar sesión (y cambiar la contraseña temporal si es tu primer acceso),
el empleado entra a **«Mi progreso»**. El menú lateral muestra seis secciones
siempre en el mismo orden: **Inicio · Mi progreso · Mis proyectos · Mis
capacitaciones · Mi historial · Mi cuenta.**

### 5.1 Inicio

Panel de orientación con tu avance (progreso, proyectos, resumen de
competencias y **«Próximo paso»**, que es una guía de siguiente acción, no una
alerta). No muestra 9-Box ni comparaciones con otras personas.

### 5.2 Mi progreso

Tu foto actual: **«¿Cómo voy?»**, las **cinco competencias** con su nivel y
etiqueta, **«¿Cómo se obtienen?»** (qué evidencia alimenta cada una), tus
**fortalezas** y **oportunidades** (por reglas del sistema), la **recomendación
de desarrollo** (sugerencia de IA opcional, claramente separada de los datos)
y el panel de **transparencia de datos**. El nivel de cada competencia se
despliega con su evidencia; «Datos insuficientes» aparece como estado válido
cuando falta evidencia mínima.

### 5.3 Mis proyectos

Dos pestañas: **«Registrados»** (tus participaciones, la pestaña inicial) y
**«Registrar participación»** (el asistente de registro).

El registro sigue tres pasos obligatorios:

1. **Buscar** el proyecto por nombre. Si existe uno con el mismo nombre
   normalizado, se selecciona; si no hay coincidencia exacta, el sistema puede
   mostrarte hasta **5 sugerencias aproximadas** como advertencia informativa
   (no un error): revisa si tu proyecto ya existe antes de crear uno nuevo.
2. **Crear o seleccionar**: eliges un proyecto existente o creas uno nuevo
   (todo proyecto nuevo nace en estado **En proceso**).
3. **Registrar participación**: indicas rol, entregables, los indicadores
   (trabajo en equipo, coordinación de tareas, explicación a públicos
   distintos, situación/resolución de problema) y las horas.

Después del alta **solo puedes editar** el rol, los entregables y las horas de
tu participación; los indicadores objetivos quedan bloqueados para ti (si hay
un error en ellos, pide a RH la corrección administrativa). Tus ediciones
quedan registradas en tu historial como **MODIFICACION_EMPLEADO**; si no
cambias ningún valor, no se genera registro.

### 5.4 Mis capacitaciones

Listado de tus capacitaciones (orden de la más reciente a la más antigua) con
sus tres datos: **nombre**, **fecha** y estado **completado**. El formulario
de registro exige nombre y fecha; marcar «completado» indica que el curso
terminó (solo los cursos completados del año en curso alimentan la
competencia de Capacidad de aprendizaje).

### 5.5 Mi historial

Dos contenidos:

- **Evaluaciones oficiales**: tus evaluaciones por periodo. La **evolución**
  se muestra una competencia a la vez (selector). No se muestran ejes ni
  9-Box.
- **Historial de mis participaciones**: la cronología de las correcciones que
  RH aplicó a tus participaciones (con motivo) y de tus propias
  modificaciones; tus propios cambios se muestran como «Tú». Es una vista de
  solo lectura.

### 5.6 Mi cuenta

Muestra tus **datos laborales** (nombre, puesto, área y correo de acceso), que
son de solo lectura: si algo está mal, pide a RH que lo corrija. La única
acción disponible es **cambiar tu contraseña** (validando tu contraseña
actual y la política de la sección 3.3).

---

## 6. Mensajes, estados y resolución de problemas

| Situación | Qué verás | Qué hacer |
|---|---|---|
| Cargando | Indicador de carga de la sección (espejo de la espera, sin bloquear toda la pantalla) | Esperar; las secciones cargan de forma independiente |
| Sin datos | Estado vacío neutro con explicación | Registrar la información correspondiente (participaciones, capacitaciones) |
| «Datos insuficientes» | Estado textual válido en una competencia | No es un error: indica que falta evidencia mínima; se resuelve registrando más evidencia |
| Error de consulta en una sección | Mensaje de error propio de esa sección con botón de reintento | Reintentar; el resto de la pantalla no se destruye |
| Sesión expirada | La aplicación regresa al inicio de sesión | Iniciar sesión de nuevo (ver aviso de inactividad, sección 3.5) |
| Recurso no disponible para ti | Mensaje «Recurso no encontrado.» | El acceso a datos ajenos no está permitido; verifica la sección correcta |
| Token de recuperación inválido | «Token inválido o expirado.» | Solicitar un código nuevo |
| Contraseña no válida | Mensaje de política (mínimo 8 caracteres y un número) | Corregir la contraseña |
| Alta sin proveedor de correo | Error controlado; la cuenta no se crea | Configurar el correo (ver README) y reintentar el alta |
| IA no disponible (búsqueda) | Error controlado 502 en la interpretación | Usar la búsqueda manual |
| IA no disponible (sugerencias) | Estado neutral con «Volver a consultar» | Reintentar más tarde; nunca se inventa texto |
| Evaluación ya generada | El sistema indica el conflicto del periodo | Consultar la evaluación existente |

---

## 7. Privacidad y seguridad de uso

- **Cada quien ve solo lo suyo.** El empleado no puede acceder a datos de
  otras personas ni a vistas exclusivas de RH; el sistema lo impide en el
  servidor, no solo en la interfaz. El 9-Box y las comparaciones
  organizacionales son exclusivos de RH.
- **Las contraseñas no se comparten.** Nadie de la organización (ni RH)
  conoce tu contraseña: se almacena cifrada y el sistema nunca la muestra.
  Las credenciales temporales y los códigos de recuperación llegan **solo**
  a tu correo de acceso.
- **La IA trabaja sin tus datos personales.** Cuando se usa interpretación
  o recomendación, el sistema envía únicamente el contexto mínimo necesario
  (nunca nombres, correos, identificadores ni texto de tus participaciones)
  y valida que la respuesta sea estructurada.
- **Todo cambio relevante queda auditado.** Las correcciones de RH y tus
  propias modificaciones quedan registradas con actor, fecha y valores
  anteriores y nuevos.
- **Cierra tu sesión** al terminar, especialmente en equipos compartidos, y
  usa la opción «Seguir conectado» solo cuando estés presente.
- No escribas contraseñas en mensajes, correos ni notas; el sistema nunca
  te las pedirá por esos medios.

## 8. Limitaciones conocidas

**Funciones implementadas y pendientes de validación en producción** (no son
fallos: funcionan en el entorno de desarrollo):

- Envío de correo con un proveedor SMTP real (en desarrollo se usa el buzón
  local MailHog).
- Interpretación de búsqueda y sugerencias con proveedores de IA reales
  (Groq/Gemini). Sin claves configuradas el sistema degrada de forma
  controlada (secciones 4.4 y 4.2).
- Operación en línea (despliegue web): la instalación actual es local.

**Decisiones deliberadas de diseño o seguridad:**

- La instalación oficial no crea credenciales fijas de demostración: todo
  acceso nace del correo. Existe, opcionalmente, un mecanismo de datos
  sintéticos para evaluación académica (README, «Datos de demostración»),
  con credenciales públicas exclusivamente para uso local, nunca para
  producción.
- El mensaje de recuperación entrega un código sin enlace: debe copiarse y
  pegarse manualmente.
- La sesión usa tokens de corta vida (30 minutos) sin «recordar sesión»
  permanente.
- La exportación a PDF usa la impresión del navegador (no genera un archivo
  por servidor).

**Fuera del alcance del MVP** (decisión de producto, no limitaciones
técnicas): eliminación de proyectos, reactivación o fusión de proyectos,
multitenancy, aplicación móvil nativa, ranking social entre empleados,
puntuación global de talento y chatbot permanente. La lista completa está en
el PRD (§2.2).

## 9. Referencias

| Documento | Contenido |
|---|---|
| [`README.md`](../README.md) | Instalación, arranque, suites de pruebas y configuración |
| [`prd.md`](prd.md) | PRD v1.4: qué hace el producto y sus reglas |
| [`especificacion-tecnica.md`](especificacion-tecnica.md) | Especificación Técnica v1.6: cómo está implementado |
| [`style-guide.md`](style-guide.md) | Style Guide UX/UI v1.2: lenguaje visual y de experiencia |
| [`../backend/DECISIONES_TECNICAS.md`](../backend/DECISIONES_TECNICAS.md) | Decisiones técnicas del proyecto |
| [`historico/`](historico) | Versiones anteriores de los documentos normativos |

> Este manual describe la aplicación tal como está implementada en el MVP.
> Los criterios de negocio definitivos viven en los documentos normativos;
> ante cualquier discrepancia, prevalecen aquellos.




