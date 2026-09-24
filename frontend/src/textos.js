// Textos de presentación estáticos (Style Guide v1.1 / PRD v1.3).
//
// SOLO copy: no hay ninguna fórmula, umbral ni clasificación aquí.
// Niveles, etiquetas de nivel (etiqueta), estados y categorías llegan
// SIEMPRE calculados por el backend (CompetencyEngine / §17.4).

export const NOMBRES_COMPETENCIAS = {
  desempeno_tecnico: 'Desempeño técnico',
  liderazgo: 'Liderazgo',
  trabajo_equipo: 'Trabajo en equipo',
  comunicacion: 'Comunicación',
  aprendizaje: 'Capacidad de aprendizaje',
}

// "¿Cómo se obtienen?" (PRD §5–§7): explicación descriptiva por
// competencia. Es texto fijo de orientación, no un cálculo.
export const COMO_SE_OBTIENEN = {
  desempeno_tecnico:
    'Se obtiene de tus proyectos completados y cancelados. Los proyectos En proceso aún no cuentan.',
  liderazgo:
    'Se obtiene de la coordinación de tareas en tus participaciones registradas.',
  trabajo_equipo:
    'Se obtiene del indicador de trabajo en equipo en tus participaciones registradas.',
  comunicacion:
    'Se obtiene de la explicación a públicos distintos en tus participaciones registradas.',
  aprendizaje:
    'Se obtiene de tus capacitaciones y de los roles en proyectos únicos registrados.',
}

// Etiquetas legibles de la evidencia que envía el backend (contador
// neutro: el valor mostrado es exactamente el recibido).
export const ETIQUETAS_EVIDENCIA = {
  participaciones: 'participaciones',
  coordino_tareas_true: 'coordinó tareas',
  en_equipo_true: 'trabajó en equipo',
  explico_a_publico_distinto_true: 'explicó a públicos distintos',
  proyectos_completados: 'proyectos completados',
  proyectos_cancelados: 'proyectos cancelados',
  proyectos_evaluables: 'proyectos evaluables',
  proyectos_en_proceso_excluidos: 'proyectos en proceso (excluidos)',
  capacitaciones_registradas: 'capacitaciones registradas',
  cursos_completados_anio: 'cursos completados este año',
  proyectos_unicos: 'proyectos únicos',
  roles_distintos: 'roles distintos',
  minimo_capacitaciones: 'mínimo de capacitaciones requeridas',
  minimo_proyectos_unicos: 'mínimo de proyectos únicos requeridos',
}
