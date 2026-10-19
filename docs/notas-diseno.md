# Notas de diseño — Evolución del frontend y alcance de cambios futuros

**Versión:** 1.0 · **Ámbito:** diseño frontend del MVP · **Carácter:** nota
complementaria; **no sustituye** a los documentos normativos.

Esta nota registra, para futuros revisores del repositorio, el estado real del
diseño del frontend, qué lo gobierna y qué está previsto. Distingue
explícitamente **hechos actuales** de **trabajo planificado**. La decisión
normativa sigue perteneciendo a [`style-guide.md`](style-guide.md) (Style
Guide v1.2), al [`prd.md`](prd.md) (PRD v1.4) y a
[`especificacion-tecnica.md`](especificacion-tecnica.md) (ET v1.6).

---

## Índice

- [A. Estado del Style Guide v1.2](#a-estado-del-style-guide-v12)
- [B. Panel del empleado: diseño vigente](#b-panel-del-empleado-diseño-vigente)
- [C. Criterios que permanecen vigentes](#c-criterios-que-permanecen-vigentes)
- [D. Futuro rediseño del panel de RH (planificado)](#d-futuro-rediseño-del-panel-de-rh-planificado)
- [E. Evolución prevista de la guía](#e-evolución-prevista-de-la-guía)
- [F. Referencias](#f-referencias)

---

## A. Estado del Style Guide v1.2

- El Style Guide **v1.2 se conserva como guía activa** y como referencia de
  sus fundamentos: color, tipografía (**Inter**), espaciado, layout, estados,
  accesibilidad, densidad por rol y UX writing. Sus tokens visuales están
  respaldados por un guardarraíl automatizado
  (`frontend/src/test/estilos.test.js`).
- Su estado documental es **«EN REVISIÓN»** y así se mantiene. Su propio §35
  exige una **revisión visual humana** sobre la implementación real antes de
  declarar el cierre; **las pruebas automatizadas no sustituyen esa revisión
  visual** (validan estructura, contratos y tokens, no percepción visual).
- Esta nota **no modifica, no reinterpreta y no cierra** ningún requisito del
  Style Guide. Donde el diseño implementado del empleado introdujo patrones
  no descritos en v1.2, se registran en la sección B como hechos, sin
  presentarlos como nueva norma.

## B. Panel del empleado: diseño vigente

**Hecho actual.** Las seis secciones del panel del empleado —**Inicio, Mi
progreso, Mis proyectos, Mis capacitaciones, Mi historial y Mi cuenta**—
fueron rediseñadas visualmente (commits `2bd68ab`…`658e74d`) a partir del
**prototipo interno** `panel_empleado_v6_zonas(1).html` (versión 6,
composición por zonas). Ese prototipo es una **referencia local de diseño**:
no forma parte del repositorio publicado y no se copia a `docs/`.

Patrones del prototipo **confirmados en el código** de la implementación:

| Patrón | Evidencia en el código |
|---|---|
| Zonas/franjas de contenido de ancho completo (blanca y verde petróleo, sin bordes de tarjeta) y cabeceras tipo *hero* con antetítulo | `MiProgreso.jsx` (cabeceras `growth-hero` y franjas), `MiHistorial.jsx` (zonas 1–3), `Inicio.jsx` (`inicio-hero`) |
| Jerarquía visual por secciones: antetítulo + título + introducción | `Inicio.jsx`, `MiProgreso.jsx` (eyebrow/copy) |
| Acordeones accesibles con botón nativo y `aria-expanded` (solo CSS) | `MiProgreso.jsx` (competencias con evidencia), `MisProyectos.jsx` (participaciones) |
| Desplegable «¿Cómo se obtienen?» cerrado por defecto, que se abre con su chevron **o** desde el enlace-ancla `#como-se-obtienen` de las tarjetas | `MiProgreso.jsx` (listener de hash) |
| Navegación por pestañas «Registrados» / «Registrar participación» y flujo de registro 01 Buscar → 02 Crear o seleccionar → 03 Registrar participación (con sugerencias aproximadas de proyectos) | `MisProyectos.jsx` |
| «Ver más (N)»: paginación que anexa la siguiente página sin recargar | `MisProyectos.jsx` |
| Indicadores vivos de requisitos de contraseña (mínimo 8 caracteres y un número) y control de visibilidad por campo | `CambioPasswordCuenta.jsx` |
| Estados de carga visibles por sección y reintento sin destruir la pantalla | vistas del empleado + `lib/esperaMinimaCarga.js` (commit `658e74d`) |
| `:focus-visible` y `prefers-reduced-motion` | estilos del frontend (vigilados en parte por `estilos.test.js`) |

**Desviaciones conocidas respecto al prototipo** (verificadas, no pendencias):
la aplicación conserva la **tipografía Inter** del Style Guide (el prototipo
usa IBM Plex Sans), y no implementa el menú de usuario con avatar de la
cabecera del boceto, el riel de solo iconos para tablet ni el escalado para
pantallas 4K del prototipo.

## C. Criterios que permanecen vigentes

La evolución visual del panel del empleado **no sustituye automáticamente**
ninguno de los siguientes criterios, que continúan aplicándose:

- **Fundamentos de diseño vigentes:** tipografía Inter, tokens de color y
  espaciado, y fundamentos de accesibilidad del Style Guide v1.2 (con su
  guardarraíl automatizado).
- **Reglas funcionales y de negocio:** las del PRD v1.4 (competencias y sus
  fórmulas, 9-Box exclusivo de RH, inmutabilidad de evaluaciones, mentoría y
  búsqueda con desempates deterministas, etc.).
- **Contratos de API:** los de la ET v1.6 (endpoints, permisos, paginación,
  filtros de competencia y nivel).
- **Requisitos de seguridad:** RBAC y *ownership* en backend, protección de
  PII frente a la IA, gestión de secretos por entorno.
- **Criterios de RH:** las reglas del Style Guide v1.2 para las pantallas de
  RH siguen describiendo la implementación actual de ese panel (que no fue
  rediseñado), incluidos los cierres D1/D2 de filtros de la lista de
  empleados y el bloque «Acciones de desarrollo» del perfil.

En resumen: los **patrones visuales nuevos** de la sección B son lenguaje de
presentación del panel del empleado; los **criterios normativos** citados
arriba permanecen y prevalecen.

## D. Futuro rediseño del panel de RH (planificado)

**Trabajo planificado, no realizado.** Existe la intención de rediseñar
visualmente, en una fase futura e independientemente autorizada, el frontend
del panel de RH (las vistas de RH de `frontend/src/vistas/` y sus estilos).

- El alcance previsto es **visual y de presentación**.
- **Esta nota no autoriza** ningún cambio de backend, base de datos, API,
  contratos, reglas de negocio ni comportamiento funcional.
- Si durante ese rediseño se identifican necesidades que afecten esas áreas
  (por ejemplo, datos no expuestos hoy por la API, cambios de contrato o de
  reglas de producto), deberán **evaluarse y autorizarse por separado** antes
  de implementarse.
- Regla práctica propuesta: si un cambio obligara a modificar aserciones de
  negocio (no solo de clase/CSS) en las pruebas de las vistas, deja de ser
  «solo presentación» y requiere autorización adicional.

## E. Evolución prevista de la guía

Secuencia recomendada (orden, no calendario):

1. **Mantener** el diseño actual del panel del empleado.
2. Completar la **revisión documental y visual** que corresponda (incluida la
   revisión visual humana que el §35 del Style Guide exige; esta nota no la
   realiza ni la sustituye).
3. Realizar el **futuro rediseño visual de RH** mediante una fase autorizada
   independiente, con el alcance de la sección D.
4. **Revisar visualmente ambos paneles** sobre la implementación real.
5. **Consolidar** las reglas de diseño en una futura versión del Style Guide
   cuando exista evidencia suficiente de ambos paneles.

La futura **v1.3 del Style Guide es una propuesta de evolución**: no es una
versión aprobada, no está escrita y no tiene fecha comprometida. Hasta que
exista, v1.2 sigue siendo el documento normativo vigente con estado
«EN REVISIÓN».

## F. Referencias

| Documento | Contenido |
|---|---|
| [`style-guide.md`](style-guide.md) | Style Guide UX/UI v1.2 (normativo, «EN REVISIÓN») |
| [`manual-usuario.md`](manual-usuario.md) | Manual de usuario del MVP |
| [`prd.md`](prd.md) | PRD v1.4: qué hace el producto |
| [`especificacion-tecnica.md`](especificacion-tecnica.md) | ET v1.6: cómo está implementado |
| [`../README.md`](../README.md) | Instalación, ejecución y pruebas |

> Nota: el prototipo `panel_empleado_v6_zonas(1).html` se menciona como
> referencia local de diseño y **no se distribuye con el repositorio**; por
> eso este documento no enlaza a él.

