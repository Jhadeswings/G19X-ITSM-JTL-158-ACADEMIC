// Fixture compartido: payload fiel al DTO real de
// GET /api/v1/me/progress/recommendation (solo para tests).

export const DI = 'INSUFFICIENT_DATA'
export const CALC = 'CALCULABLE'

export function crearRespuesta({
  fortalezas = ['liderazgo'],
  oportunidades = ['comunicacion'],
  recomendacion_ia = {
    origen: 'IA',
    proveedor: 'groq',
    recommendation:
      'Una idea para el desarrollo: practicar la comunicación con públicos distintos puede ayudar a ampliar tu experiencia.',
    actions: ['Explicar un tema a un público distinto en tu próximo proyecto.'],
  },
} = {}) {
  return {
    resultado_actual: {
      empleado_id: 7,
      competencias: [
        {
          clave: 'desempeno_tecnico',
          estado: CALC,
          nivel: 4,
          valor: '80.00',
          evidencia: { proyectos_completados: 4, proyectos_evaluables: 5 },
          etiqueta: 'Consolidado',
        },
        {
          clave: 'liderazgo',
          estado: CALC,
          nivel: 5,
          valor: '100.00',
          evidencia: { participaciones: 3, coordino_tareas_true: 3 },
          etiqueta: 'Alto',
        },
        {
          clave: 'trabajo_equipo',
          estado: CALC,
          nivel: 3,
          valor: '60.00',
          evidencia: { participaciones: 3, en_equipo_true: 2 },
          etiqueta: 'En crecimiento',
        },
        {
          clave: 'comunicacion',
          estado: DI,
          nivel: null,
          valor: null,
          evidencia: { participaciones: 2 },
          etiqueta: null,
        },
        {
          clave: 'aprendizaje',
          estado: DI,
          nivel: null,
          valor: null,
          evidencia: { capacitaciones_registradas: 1 },
          etiqueta: null,
        },
      ],
      experiencia: {
        fecha_ingreso: '2020-01-01',
        anios_antiguedad: '6.00',
        proyectos_unicos: 5,
      },
      fortalezas,
      oportunidades,
    },
    recomendacion_ia,
  }
}
