// Lógica pura de presentación de la evidencia de competencias (Style Guide §15.1).
//
// Solo ORDEN y FILTRADO: qué claves se muestran, en qué orden y con qué
// jerarquía. NO renderiza markup, NO conoce clases CSS y NO decide nada de
// negocio. Aquí no se calcula ningún indicador ni se deriva ninguna frase: los
// valores se entregan tal cual llegan en `competencia.evidencia` (ET §13).
//
// Compartido por las distintas vistas de presentación de competencias. La
// envoltura visual de cada vista es responsabilidad de quien lo consume: este
// módulo no impone tarjetas, densidad ni navegación.

import { ETIQUETAS_EVIDENCIA } from '../textos.js'

// Orden explícito de presentación por competencia. Solo claves que ya
// tienen etiqueta en `ETIQUETAS_EVIDENCIA`: no se inventan datos ni
// etiquetas. `valor`, `score`, `componente_*` y `anio_calendario` quedan
// fuera porque no tienen etiqueta y pertenecen al detalle futuro.
export const ORDEN_EVIDENCIA = {
  desempeno_tecnico: {
    principal: ['proyectos_completados', 'proyectos_evaluables'],
    secundario: ['proyectos_cancelados'],
    excluido: ['proyectos_en_proceso_excluidos'],
  },
  liderazgo: {
    principal: ['participaciones', 'coordino_tareas_true'],
    secundario: [],
    excluido: [],
  },
  trabajo_equipo: {
    principal: ['participaciones', 'en_equipo_true'],
    secundario: [],
    excluido: [],
  },
  comunicacion: {
    principal: ['participaciones', 'explico_a_publico_distinto_true'],
    secundario: [],
    excluido: [],
  },
  aprendizaje: {
    principal: [
      'roles_distintos',
      'proyectos_unicos',
      'capacitaciones_registradas',
      'cursos_completados_anio',
    ],
    secundario: ['minimo_capacitaciones', 'minimo_proyectos_unicos'],
    excluido: [],
  },
}

/**
 * Entradas de evidencia de UNA competencia, en orden determinista.
 *
 * Contrato de solo lectura (sin efectos, sin React, sin CSS):
 * - devuelve `[{ clave, valor, jerarquia }]` con `jerarquia` en
 *   'principal' | 'secundario' | 'excluido';
 * - descarta toda clave sin etiqueta en `ETIQUETAS_EVIDENCIA` (por eso
 *   `valor`, `score`, `componente_*` y `anio_calendario` nunca aparecen);
 * - los valores se entregan TAL CUAL llegan: `0` sigue siendo `0`;
 * - sin competencia conocida cae al orden de `ETIQUETAS_EVIDENCIA`.
 *
 * @param {string} claveCompetencia clave de la competencia.
 * @param {object} evidencia `competencia.evidencia` tal cual llega del backend.
 * @returns {Array<{clave: string, valor: number|string, jerarquia: string}>}
 */
export function entradasOrdenadas(claveCompetencia, evidencia) {
  const datos = evidencia || {}
  const orden = ORDEN_EVIDENCIA[claveCompetencia]
  const niveles = []
  if (orden) {
    for (const nivel of ['principal', 'secundario', 'excluido']) {
      for (const clave of orden[nivel]) {
        if (Object.hasOwn(datos, clave) && clave in ETIQUETAS_EVIDENCIA) {
          niveles.push({ clave, valor: datos[clave], jerarquia: nivel })
        }
      }
    }
    return niveles
  }
  return Object.keys(ETIQUETAS_EVIDENCIA)
    .filter((clave) => Object.hasOwn(datos, clave))
    .map((clave) => ({ clave, valor: datos[clave], jerarquia: 'principal' }))
}
