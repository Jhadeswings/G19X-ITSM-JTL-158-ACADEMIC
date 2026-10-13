# Style Guide UX/UI — Sistema de Identificación de Talento de Alto Potencial

**Empresa:** PluriOne S.A. de C.V. (Develop Talent & Technology)  
**Autora / responsable de diseño:** Jade Tinoco Landa  
**Fecha:** Octubre 2026  
**Versión:** 1.2 — Acciones de desarrollo en Perfil RH  
**Estado:** **EN REVISIÓN FRENTE A IMPLEMENTACIÓN (PRD v1.4 §20.2.1). Esta versión no se declara cerrada hasta revisar su resultado frente a la implementación real (§35).**

---

## 1. Propósito

Este documento define el lenguaje visual, los componentes y las reglas de experiencia que deben utilizarse en todas las pantallas del MVP.

Debe servir como referencia común para:

- prototipado;
- diseño UX/UI;
- implementación frontend;
- revisión visual;
- consistencia entre pantallas.

No sustituye al PRD ni a la Especificación Técnica.

- **PRD:** comportamiento de producto.
- **Especificación Técnica:** implementación funcional/técnica.
- **Style Guide:** presentación visual y experiencia de interacción.

Principio central:

> **La interfaz debe sentirse como una herramienta de crecimiento, no de vigilancia.**

Principio de jerarquía:

> **Primero claridad, después acción y finalmente decoración.**

---

# 2. Personalidad visual

Palabras guía:

**Claro · Calmado · Humano · Profesional · Moderno**

La interfaz no debe sentirse como:

- un software empresarial frío;
- una hoja de Excel convertida en aplicación;
- un dashboard saturado;
- una aplicación de vigilancia;
- un producto tecnológico lleno de efectos.

Debe sentirse como una herramienta analítica confiable, respetuosa y cómoda para sesiones prolongadas.

---

# 3. Principios de diseño

## 3.1 Minimalismo funcional

Cada elemento visual debe tener una función. No agregar elementos únicamente por decoración.

## 3.2 Estructura predecible

El contenido puede adaptarse al contexto, pero la estructura de navegación no cambia automáticamente.

## 3.3 Diseño inclusivo

La información nunca debe depender únicamente del color. Utilizar texto, iconos, etiquetas y estados visibles.

## 3.4 Baja carga cognitiva

Las tareas complejas se dividen en pasos. Los formularios se organizan por secciones.

## 3.5 Transparencia

Cuando una cifra o resultado pueda generar dudas, se debe explicar su origen.

## 3.6 Separación entre dato y sugerencia

Los resultados calculados por reglas deben distinguirse visualmente de recomendaciones o explicaciones generadas por IA.

## 3.7 Low-data UX

Priorizar recursos ligeros, consultas paginadas, respuestas pequeñas, SVG/iconos ligeros y ausencia de recursos audiovisuales innecesarios.

---

# 4. Sistema de color

## 4.1 Tokens base

| Token | Valor | Uso |
|---|---|---|
| `--color-bg` | `#F6F7F5` | Fondo general |
| `--color-surface` | `#FFFFFF` | Tarjetas y superficies |
| `--color-surface-soft` | `#F0F4F2` | Fondos suaves |
| `--color-text-primary` | `#263238` | Texto principal |
| `--color-text-secondary` | `#5F6B73` | Texto secundario |
| `--color-primary` | `#4F7F7B` | Acción principal y navegación activa |
| `--color-primary-soft` | `#E4EEEC` | Fondos activos suaves |
| `--color-secondary` | `#637696` | Información secundaria |
| `--color-accent` | `#D99A7C` | Acentos puntuales |
| `--color-border` | `#DCE2DF` | Bordes y divisores |

## 4.2 Regla general

La mayoría de la interfaz utiliza neutros. El color principal sirve para acciones y énfasis. El color secundario y el acento se usan con moderación.

No saturar las pantallas con colores.

## 4.3 Colores semánticos

Utilizar colores accesibles para:

- éxito;
- información;
- advertencia;
- error.

Estos colores representan el **estado de una acción o del sistema**, no el valor de una persona.

## 4.4 Competencias

Los niveles 1–5 no deben comunicarse únicamente mediante rojo/amarillo/verde.

Cada competencia debe mostrar:

- nivel numérico;
- etiqueta textual;
- explicación/evidencia cuando corresponda;
- color como apoyo visual.

`Datos insuficientes` no debe utilizar rojo como tratamiento principal.

## 4.5 Estados de proyecto

| Estado | Tratamiento visual |
|---|---|
| En proceso | Identidad/neutro; no es advertencia |
| Completado | Verde semántico suave |
| Cancelado | Neutro; no implica error automáticamente |

---

# 5. Tipografía

## Familia

**Inter**

## Escala

| Uso | Tamaño / interlineado |
|---|---|
| H1 | 32 / 40 px |
| H2 | 24 / 32 px |
| H3 | 20 / 28 px |
| Body | 16 / 24 px |
| Body small | 14 / 20 px |
| Label | 14 / 20 px |
| Caption | 13 / 18 px |

## Pesos

- 400 — texto normal;
- 500 — énfasis ligero/labels;
- 600 — títulos y datos importantes;
- 700 — uso excepcional.

Evitar mayúsculas completas y bloques de texto excesivamente densos.

---

# 6. Espaciado

Escala base de 8 px:

`4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 · 64`

Usos orientativos:

- 8 px — relaciones estrechas;
- 16 px — separación interna;
- 24 px — bloques relacionados;
- 32 px — secciones;
- 48–64 px — zonas principales.

Evitar valores arbitrarios cuando exista un valor de la escala adecuado.

---

# 7. Layout y responsive

## Desktop

- Sidebar de referencia: **240 px**.
- Área principal con `max-width: 1280 px`.
- Padding lateral: 24–32 px.

Los 1280 px corresponden al **área de contenido**, no a toda la aplicación.

## Tablet

- Sidebar compacto;
- menor padding;
- tablas adaptadas.

## Mobile

- navegación lateral como drawer;
- tarjetas apiladas;
- tablas convertidas a tarjetas/vistas simplificadas cuando sea necesario;
- controles cómodos para interacción táctil.

## Breakpoints de referencia

- `>= 1280 px` — desktop grande;
- `1024–1279 px` — desktop;
- `768–1023 px` — tablet;
- `< 768 px` — mobile.

Los breakpoints pueden ajustarse técnicamente sin cambiar la experiencia definida.

---

# 8. Bordes y profundidad

## Radius

- Card: `12 px`;
- Input / Select / Button: `8 px`;
- Badge: cápsula.

## Border

`1 px solid #DCE2DF`

## Sombras

La profundidad se obtiene primero con:

1. diferencia de superficies;
2. espacio;
3. bordes;
4. sombra suave cuando aporte separación.

Evitar sombras grandes o agresivas.

---

# 9. Iconografía

Familia recomendada: **Lucide Icons**.

- estilo lineal;
- aproximadamente 20 px en navegación/controles;
- una sola familia de iconos.

Los iconos acompañan al texto. No deben sustituir información importante por sí solos.

---

# 10. Navegación

## Sidebar RH

1. Inicio
2. Empleados
3. Proyectos
4. Búsqueda
5. Comparar
6. Mentoría
7. Brechas
8. Evaluaciones

## Sidebar / navegación Empleado

1. Inicio
2. Mi progreso
3. Mis proyectos
4. Mis capacitaciones
5. Mi historial
6. Mi cuenta

## Activo

Utilizar:

- fondo `--color-primary-soft`;
- texto/icono `--color-primary`.

No usar barras de color exageradas.

---

# 11. Header y Breadcrumb

## Header

Altura de referencia: `64 px`.

Debe contener:

- contexto/breadcrumb cuando corresponda;
- título;
- acciones principales limitadas;
- cuenta del usuario.

## Breadcrumb

Ejemplo:

`Empleados / Juan Pérez`

Debe ser discreto y ayudar a responder:

> **¿Dónde estoy?**

---

# 12. Componentes base

## 12.1 Card

- fondo: `#FFFFFF`;
- border: `1 px #DCE2DF`;
- radius: `12 px`;
- padding estándar: `24 px`.

Variantes:

- compacta: 16 px;
- estándar: 24 px;
- destacada: 32 px.

## 12.2 MetricCard

Usada en Dashboard RH.

Debe incluir:

- etiqueta;
- valor principal;
- descripción opcional;
- icono opcional;
- acción opcional.

No introducir múltiples gráficos dentro de una sola métrica.

## 12.3 Button

Variantes:

- Primary;
- Secondary;
- Ghost;
- Destructive.

Tamaños:

- Small: 36 px;
- Medium: 44 px;
- Large: 48 px.

Estándar de la aplicación: **44 px**.

Estados obligatorios:

- default;
- hover;
- focus;
- pressed;
- disabled;
- loading.

## 12.4 Input

Altura de referencia: 44–48 px.

Orden:

1. etiqueta;
2. campo;
3. ayuda/error.

Estados:

- default;
- hover;
- focus;
- filled;
- error;
- disabled.

## 12.5 Select

Misma altura y lenguaje que Input.

Debe mostrar claramente el valor seleccionado, focus y errores.

## 12.6 RadioGroup

Preferido para opciones mutuamente excluyentes como:

> ¿Trabajaste en equipo?

`( ) Sí  ( ) No`

## 12.7 Checkbox

Usado para selecciones múltiples o independientes.

## 12.8 Textarea

Altura inicial de referencia: 96–120 px.

Uso principal:

- entregables;
- descripción de problemas/bloqueos;
- textos permitidos por el flujo.

---

# 13. Estados de interfaz

## 13.1 Badge

Ejemplos:

- Activo;
- En proceso;
- Completado;
- Cancelado;
- Datos insuficientes.

El texto siempre debe ser legible sin depender del color.

## 13.2 Alert

Estructura:

1. icono;
2. título;
3. explicación;
4. acción cuando corresponda.

## 13.3 Toast

Para acciones breves como:

- guardado;
- actualización;
- fallo simple.

Un error que requiere acción permanece hasta ser atendido o descartado.

Las operaciones críticas no dependen únicamente de un Toast.

## 13.4 EmptyState

Debe explicar:

- qué está vacío;
- por qué puede estarlo;
- qué puede hacer el usuario.

## 13.5 Loading

Preferir skeletons para cargas estructuradas.

Animaciones discretas.

## 13.6 ErrorState

Debe responder:

- qué ocurrió;
- qué significa;
- qué puede hacer el usuario.

Nunca mostrar excepciones técnicas al usuario final.

---

# 14. Componentes de datos

## 14.1 Table

Para RH.

- encabezados claros;
- filas de aproximadamente 56–64 px;
- padding suficiente;
- hover discreto;
- selección visible;
- acciones a la derecha.

No comprimirla hasta parecer Excel.

## 14.2 Pagination

Ejemplo:

`Mostrando 1–20 de 42    ← 1 2 3 →`

Usarla solo cuando el volumen lo justifique.

## 14.3 SearchInput

Usado en:

- empleados;
- proyectos;
- búsqueda de talento.

Debe soportar escribir, buscar, limpiar y cargar.

## 14.4 FilterBar

Mostrar solo filtros relevantes.

Los filtros secundarios pueden agruparse como `Más filtros`.

Mostrar filtros activos y permitir `Limpiar`.

---

# 15. Competencias

## 15.1 CompetencyCard

Debe mostrar:

- nombre;
- nivel numérico;
- etiqueta;
- evidencia/explicación breve;
- acceso a `¿Cómo se obtiene?` cuando corresponda.

Ejemplo:

> **Liderazgo**  
> **3 · En crecimiento**  
> Coordinó tareas en 3 de 5 participaciones.  
> ¿Cómo se obtiene? →

No representar el nivel como una barra de “porcentaje de valor”.

## 15.2 CompetencyDetail

Puede mostrar:

- datos analizados;
- numerador/denominador;
- porcentaje;
- nivel resultante;
- regla aplicada.

Debe priorizar comprensión.

## 15.3 InsufficientDataCard

Ejemplo:

> **Comunicación**  
> **— Datos insuficientes**  
> Aún no hay suficiente evidencia para calcular este indicador.  
> Se requieren 3 participaciones.

No utilizar rojo como tratamiento principal.

---

# 16. 9-Box

Visible exclusivamente para RH.

Las nueve celdas tienen apariencia mayoritariamente neutra.

La posición actual se distingue mediante:

- `border: 2px solid var(--color-primary)`;
- `background: var(--color-primary-soft)`;
- indicador `Actual`.

Ejemplo:

```text
                POTENCIAL
           Bajo   Medio   Alto

Desempeño
Alto        AB      AM      AA
Medio       MB     [MM]     MA
Bajo        BB      BM      BA
```

La información textual de Desempeño y Potencial tiene prioridad sobre el color.

El 9-Box no debe funcionar como un semáforo humano.

---

# 17. IA

## 17.1 AIExplanation

La IA aparece como una capa de apoyo.

Ejemplo:

> **✦ Lectura del resultado**  
> El perfil muestra un desempeño técnico consolidado y oportunidades de crecimiento en liderazgo.

Debajo:

> Generado a partir de indicadores estructurados del sistema.

No utilizar chatbot permanente.

## 17.2 AIRecommendation

Debe presentarse como sugerencia.

Ejemplo:

> **✦ Una idea para el desarrollo**  
> Practicar la coordinación de tareas en proyectos pequeños puede ayudar a ampliar esta experiencia.

No debe utilizar lenguaje determinista.

## 17.3 Regla conceptual

```text
Datos
  ↓
Resultado calculado
  ↓
Explicación IA
```

Nunca:

```text
IA
  ↓
Resultado oficial
```

---

# 18. Proyectos y Participaciones

## 18.1 ProjectCard

Para Empleado:

- nombre;
- rol del empleado;
- estado;
- fecha/periodo;
- acceso a participación.

Para RH puede mostrar más contexto.

## 18.2 ProjectSearch

Estados:

1. inicial;
2. buscando;
3. resultados;
4. coincidencia exacta;
5. coincidencia aproximada;
6. sin resultados;
7. error.

### Exacta

Mostrar:

> **Este proyecto ya existe.**

Acción:

> **Seleccionar proyecto**

### Aproximada

Mostrar:

> **¿Tal vez buscas uno de estos proyectos?**

La coincidencia aproximada es advertencia informativa, no error.

## 18.3 ParticipationForm

Orden:

1. rol;
2. entregables;
3. trabajo en equipo;
4. coordinación;
5. explicación a públicos distintos;
6. situación/problema como contexto;
7. horas.

Después del registro inicial, el Empleado solo puede editar:

- rol;
- entregables;
- horas.

Los indicadores objetivos bloqueados deben mostrarse como:

> Registrado al crear la participación.

El bloqueo no debe parecer punitivo.

## 18.4 StepIndicator

Usado en el flujo de proyectos:

`1 Buscar → 2 Crear/seleccionar → 3 Registrar participación`

---

# 19. Capacitaciones e historial

## TrainingCard

Debe mostrar:

- nombre;
- fecha;
- estado de completado.

No necesita gráficos.

## Timeline

Para historial de proyectos/evaluaciones.

Usar líneas y elementos visuales sutiles.

## Evolución

La vista de evolución histórica del Empleado muestra **una competencia a la vez por defecto** mediante selector.

No mostrar cinco líneas simultáneas como vista inicial.

---

# 20. Transparencia y privacidad

## DataTransparencyPanel

Debe responder:

> **¿Qué datos utiliza el sistema?**

Puede mostrar:

- participaciones;
- roles;
- trabajo en equipo;
- coordinación;
- comunicación con públicos distintos;
- capacitación.

Debe dejar claro que la IA no determina los niveles.

## PrivacyNote / StatusMessage

Para aclaraciones como:

> Esta información se registra al crear la participación.

> Este dato no modifica tus competencias.

> La experiencia es información contextual.

No utilizar como alarmas.

---

# 21. Formularios y modales

## Modal

Uso restringido.

Ancho de referencia: 400–520 px.

Estructura:

- título;
- explicación;
- acción secundaria;
- acción principal.

No usar modales para tareas simples que puedan realizarse en página.

## Drawer

Puede mostrar detalles ligeros desde listas. No sustituye páginas completas cuando el contenido requiere concentración.

---

# 22. Accesibilidad

Todas las pantallas deben considerar como mínimo:

- contraste suficiente;
- focus visible;
- navegación por teclado;
- etiquetas explícitas;
- color no como única señal;
- controles cómodos;
- estados legibles sin color;
- soporte de `prefers-reduced-motion`.

## Focus

Referencia visual:

- anillo de aproximadamente 2 px;
- `--color-primary`;
- separación suficiente del control.

## Hover

Debe ser sutil.

No usar:

- zoom;
- saltos verticales;
- elevaciones exageradas;
- cambios bruscos de color.

---

# 23. Movimiento y animación

Referencia:

- 150–200 ms para interacciones simples;
- 200–250 ms para aperturas/cierres más complejos.

Evitar:

- parallax;
- fondos animados;
- elementos flotando permanentemente;
- rebotes;
- animaciones decorativas constantes.

Respetar `prefers-reduced-motion`.

---

# 24. Densidad por rol

## RH

Densidad media:

- más datos;
- tablas;
- filtros;
- acciones contextuales.

Pero organizada por bloques.

## Empleado

Densidad baja:

- menos controles simultáneos;
- más espacio;
- más explicación;
- más orientación;
- menos contexto corporativo.

---

# 25. UX Writing

## Preferir

- Resultado actual
- Datos insuficientes
- Sin participación reciente
- Oportunidades de desarrollo
- Datos utilizados
- Criterio del sistema

## Evitar

- Empleado problemático
- Empleado insuficiente
- Valor del empleado
- Ranking de talento
- Bajo potencial como juicio personal

## Regla

La interfaz debe describir **datos, evidencia y acciones posibles**, no etiquetar a la persona como resultado de un indicador.

---

# 26. Reglas específicas de las pantallas

## Dashboard RH

- tres métricas principales;
- una competencia por selector;
- alertas compactas;
- búsqueda visible;
- no hacer del 9-Box el elemento dominante;
- atención requerida no debe sentirse alarmista.

## Lista de empleados

- tabla sencilla;
- búsqueda y filtros limitados;
- competencias fuera de la tabla principal;
- selección múltiple solo cuando se necesite comparar.

## Perfil individual RH

Orden recomendado:

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

No colocar el 9-Box como primer elemento ni como “veredicto”.

### Acciones de desarrollo (RH, último bloque; PRD v1.4 §20.2.1)

Tarjeta propia con el patrón del perfil (título, nota, estados),
tras «Fortalezas / oportunidades». Bloque secundario separado de los
datos calculados (§3.6).

Comportamiento: reposo inicial con explicación de una línea y botón
primario «Consultar sugerencia». El perfil NO genera la sugerencia al
abrirse. Al pulsar: estado de carga local del bloque (el resto del
perfil no se bloquea) → sugerencia o estado neutral. Cada nueva
pulsación genera una consulta nueva sobre los datos actuales.

Sugerencia: etiqueta de procedencia «Sugerencia de apoyo · Generada
con IA (proveedor) a partir de los indicadores del sistema» y descargo
«No determina niveles ni modifica el resultado oficial». Texto breve +
lista de hasta 5 acciones, tal como los genera la IA: el frontend no
los reescribe. El texto está dirigido al empleado y RH puede
compartirlo con él tal cual.

Estados: reposo / cargando / sugerencia / no disponible (neutro, con
«Volver a consultar») / error de consulta (con reintento). Sin
gráficas, sin ejes, sin 9-Box, sin porcentajes derivados.
Accesibilidad: botón con etiqueta explícita, estados anunciables por
texto (no solo color), foco visible, navegación por teclado.

## Proyectos RH

- catálogo compartido;
- no mostrar botón de nuevo proyecto;
- buscar, consultar y administrar.

## Proyectos Empleado

```text
Mis proyectos
↓
Registrar participación
↓
Buscar
↓
Seleccionar o crear
↓
Registrar participación
```

## Búsqueda de talento

La IA puede ayudar a interpretar la necesidad, pero debe mostrarse la interpretación antes de presentar resultados:

```text
Necesidad
↓
Criterios detectados
↓
Revisión RH
↓
Resultados
```

Nunca sugerir visualmente que la IA tomó la decisión final.

## Comparación

No utilizar colores para declarar un ganador. Mostrar valores y etiquetas.

## Mentoría

Preferir:

> **Criterio del sistema**

No usar:

- Mejor empleado;
- Top mentor;
- Mejor talento.

## Brechas

Los porcentajes de niveles 1–2 no deben aparecer automáticamente en rojo. Mostrar cantidad, porcentaje y contexto.

## Evaluaciones

Orden:

```text
Periodo vigente
↓
Generación
↓
Fotografía histórica
↓
Historial
```

La confirmación debe explicar que la fotografía será histórica e inmutable.

No utilizar mensajes celebratorios o gamificados para la generación de una evaluación oficial.

## Inicio del Empleado

`Próximo paso` es un bloque de orientación, no una alerta.

## Mi progreso

Orden:

```text
¿Cómo voy?
↓
Competencias
↓
¿Cómo se obtienen?
↓
Fortalezas
↓
Oportunidades
↓
Recomendación
```

## Mi historial

Una competencia a la vez como vista predeterminada.

## Mi cuenta

El tema oscuro y personalización avanzada de tamaño de texto quedan fuera del alcance obligatorio del MVP. La arquitectura podrá prepararse para ellos en el futuro.

---

# 27. Acciones y navegación contextual

Cuando se seleccionen empleados para comparación:

```text
2 empleados seleccionados       [Comparar]
```

La barra de acciones contextual solo aparece cuando corresponde.

No ocupar espacio de manera permanente.

---

# 28. Estados vacíos y errores

## Vacío

Debe orientar.

Ejemplo:

> **Todavía no hay proyectos registrados**  
> Registra tu primera participación para comenzar a construir tu historial.  
> `[Registrar participación]`

## Error

Debe indicar:

> **No pudimos cargar esta información.**  
> La información no está disponible en este momento.  
> `[Reintentar]`

Nunca mostrar stack traces, errores SQL o nombres de clases al usuario.

---

# 29. Reglas de implementación de componentes

Los componentes reutilizables deben centralizar:

- tokens;
- estados;
- tamaños;
- variantes;
- responsive;
- accesibilidad.

No crear estilos diferentes para el mismo componente en cada pantalla.

Si una pantalla necesita una variante, debe derivarse de una variante explícita del sistema.

---

# 30. Arquitectura visual recomendada

```text
components/
│
├── layout/
│   ├── Sidebar
│   ├── Header
│   └── Breadcrumb
│
├── ui/
│   ├── Button
│   ├── Input
│   ├── Select
│   ├── Card
│   ├── Badge
│   ├── Modal
│   ├── Alert
│   └── ...
│
├── talent/
│   ├── CompetencyCard
│   ├── CompetencyDetail
│   ├── NineBox
│   ├── AIExplanation
│   └── AIRecommendation
│
├── projects/
│   ├── ProjectCard
│   ├── ProjectSearch
│   └── ParticipationForm
│
└── feedback/
    ├── EmptyState
    ├── Loading
    └── ErrorState
```

La estructura exacta puede variar técnicamente, pero no debe perderse la reutilización de componentes.

---

# 31. Componentes prioritarios

## Nivel 1 — Base

- Layout;
- Sidebar;
- Header;
- Breadcrumb;
- Button;
- Input;
- Select;
- Card;
- Badge.

## Nivel 2 — Estructura

- Table;
- Pagination;
- SearchInput;
- FilterBar;
- Modal;
- Alert;
- Toast;
- EmptyState;
- Loading;
- ErrorState.

## Nivel 3 — Producto

- CompetencyCard;
- CompetencyDetail;
- InsufficientDataCard;
- NineBox;
- NineBoxCell;
- AIExplanation;
- AIRecommendation;
- ProjectCard;
- ProjectSearch;
- ParticipationForm;
- TrainingCard;
- Timeline;
- DataTransparencyPanel;
- StepIndicator.

---

# 32. Revisión de pantallas contra el Style Guide

La auditoría visual v1.1 revisó:

### Autenticación

- Login;
- cambio de contraseña;
- recuperación;
- restablecimiento.

### RH

- Dashboard;
- Lista de empleados;
- Perfil individual;
- Proyectos;
- Detalle de proyecto;
- Búsqueda de talento;
- Comparación;
- Mentoría;
- Brechas;
- Evaluaciones.

### Empleado

- Inicio;
- Mi progreso;
- Mis proyectos;
- detalle de participación;
- Mis capacitaciones;
- Mi historial;
- Mi cuenta.

### Resultado de auditoría

No se detectaron inconsistencias que requieran un rediseño estructural.

Se cerraron las siguientes decisiones:

- tratamiento de estados;
- comportamiento del 9-Box;
- presencia visual de la IA;
- navegación predecible;
- densidad diferenciada RH/Empleado;
- uso de gráficas;
- focus y hover;
- alcance de temas visuales;
- ancho del layout;
- tratamiento de Datos insuficientes;
- lenguaje de mentoría y brechas.

---

# 33. Checklist antes de cerrar cualquier pantalla

## Visual

- [ ] Respeta la paleta.
- [ ] Usa Inter.
- [ ] Respeta el sistema de espaciado.
- [ ] No satura de colores.
- [ ] No utiliza sombras agresivas.
- [ ] Mantiene jerarquía clara.

## UX

- [ ] Tiene una tarea principal clara.
- [ ] El usuario sabe dónde está.
- [ ] Los textos son cortos y comprensibles.
- [ ] Las acciones principales son evidentes.
- [ ] Existen estados vacíos.
- [ ] Existen estados de error.

## Accesibilidad

- [ ] El color no es la única señal.
- [ ] Existe focus visible.
- [ ] Los controles tienen etiquetas.
- [ ] Puede navegarse por teclado.
- [ ] Se respeta `prefers-reduced-motion`.

## Producto

- [ ] No se inventan métricas.
- [ ] No se inventan roles.
- [ ] No se expone información restringida.
- [ ] La IA aparece como apoyo.
- [ ] Datos y recomendaciones están diferenciados.

---

# 34. Regla de implementación para GLM

Cuando el Style Guide se entregue al agente de programación:

1. El Style Guide define la presentación visual.
2. El PRD define el comportamiento de producto.
3. La Especificación Técnica define la implementación funcional y técnica.
4. Ningún documento autoriza inventar nuevas reglas de negocio.
5. Una variante visual debe derivarse de componentes/tokens existentes antes de crear uno nuevo.

GLM no debe:

- introducir una paleta alternativa;
- crear un segundo sistema de botones;
- rediseñar la navegación por pantalla;
- introducir dark mode como funcionalidad obligatoria;
- convertir la IA en chatbot si no está definido;
- introducir 3D, phygital o Generative UI en el MVP;
- crear un score global no definido por el modelo.

---

# 35. Estado final

Este Style Guide v1.2 consolida todo lo de v1.1, más:

- bloque «Acciones de desarrollo» en el Perfil individual RH (§26).

**ESTADO: EN REVISIÓN FRENTE A IMPLEMENTACIÓN.**

Conforme a sus propias reglas, esta versión no se declara cerrada
hasta revisar su resultado frente a la implementación real. La
siguiente revisión visual debe realizarse sobre prototipos o
implementación real, no mediante nuevas decisiones aisladas de estilo.
