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
