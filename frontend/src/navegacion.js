// Secciones de navegación del rol Empleado (Style Guide §10; PRD §21).
//
// Solo estructura de navegación: identificador y título visible. No define
// permisos, contenido ni reglas de negocio (eso vive en el backend).

export const SECCIONES_EMPLEADO = [
  { id: 'inicio', titulo: 'Inicio' },
  { id: 'mi-progreso', titulo: 'Mi progreso' },
  { id: 'mis-proyectos', titulo: 'Mis proyectos' },
  { id: 'mis-capacitaciones', titulo: 'Mis capacitaciones' },
  { id: 'mi-historial', titulo: 'Mi historial' },
  { id: 'mi-cuenta', titulo: 'Mi cuenta' },
]

// Sección inicial: la única vista funcional de esta etapa (PRD §21.2).
export const SECCION_INICIAL = 'mi-progreso'

// Secciones de navegación del rol RH (Style Guide §10; PRD §20).
// "Empleados" es un catálogo paginado con el alta integrada como subvista
// interna (listado ↕ alta; PRD §20.1 y §3.3), "Evaluaciones" aplica el
// flujo §20.8 (periodo vigente → generación → historial) y "Proyectos"
// consulta y edita el catálogo existente (§20.3, sin creación). Cada una es
// UNA sola sección de navegación, sin entradas adicionales. El resto
// reutiliza SeccionTemporal hasta su implementación.
export const SECCIONES_RH = [
  { id: 'inicio', titulo: 'Inicio' },
  { id: 'empleados', titulo: 'Empleados' },
  { id: 'proyectos', titulo: 'Proyectos' },
  { id: 'busqueda', titulo: 'Búsqueda' },
  { id: 'comparar', titulo: 'Comparar' },
  { id: 'mentoria', titulo: 'Mentoría' },
  { id: 'brechas', titulo: 'Brechas' },
  { id: 'evaluaciones', titulo: 'Evaluaciones' },
]

// Sección inicial de RH: el dashboard operativo.
export const SECCION_RH_INICIAL = 'inicio'
