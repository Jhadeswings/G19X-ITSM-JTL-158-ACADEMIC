// Constantes y helpers de presentación compartidos por las DOS páginas de la
// sección Proyectos RH (RH-02.3): el Index (/proyectos) y el Show
// (/proyectos/:id). Solo presentación: sin estado y sin llamadas HTTP, para
// que ambas páginas muestren EXACTAMENTE los mismos literales y tonos.

/** Texto neutro para datos ausentes: nunca un hueco ni un error. */
export const SIN_DATO = '—'

/** Marca final del document.title de la sección (RH-02.3 §9). */
export const MARCA_TITULO = 'Talento PluriOne'

/** Estados oficiales del proyecto (ET §6; Literal del backend). */
export const ESTADOS_PROYECTO = ['EN_PROCESO', 'COMPLETADO', 'CANCELADO']

/** Etiquetas de presentación de los estados oficiales (Style Guide §4.5). */
export const ETIQUETAS_ESTADO = {
  EN_PROCESO: 'En proceso',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado',
}

/** Tono del badge (Style Guide §4.5): EN_PROCESO es identidad, NO advertencia. */
export const TONOS_ESTADO = {
  EN_PROCESO: 'neutral',
  COMPLETADO: 'success',
  CANCELADO: 'outline',
}

export function etiquetaEstado(estado) {
  return ETIQUETAS_ESTADO[estado] ?? estado
}

export function tonoEstado(estado) {
  return TONOS_ESTADO[estado] ?? 'neutral'
}

/**
 * Columnas de la tabla de participantes (RH-02.1; Style Guide §14.1): nombre
 * y puesto vienen del backend (identificación de presentación); ni métricas
 * ni ranking — el orden es el cronológico del backend. Horas y acción
 * alineadas a la derecha (§14.1), igual que su encabezado.
 */
export const COLUMNAS_PARTICIPANTES = [
  { key: 'empleado', label: 'Empleado' },
  { key: 'puesto', label: 'Puesto' },
  { key: 'rol', label: 'Rol' },
  { key: 'horas', label: 'Horas', align: 'right' },
  { key: 'accion', label: 'Acción', align: 'right' },
]

/** Estado inicial de una consulta: el mismo patrón que las demás vistas RH. */
export function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

// --- RH-02.3.3: duración mínima de los estados de carga de Proyectos RH ----
// Evita el "flash" de un loading que desaparece en cuanto el backend responde
// muy rápido: la transición a contenido espera, como MÁXIMO, este mínimo
// perceptible medido DESDE EL INICIO de la petición (si la petición tarda
// más, no se agrega ninguna espera extra). Los ERRORES no esperan: llegan al
// estado de error en cuanto ocurren. Ámbito: SOLO Proyectos RH.

/** Presencia mínima del loading de Proyectos RH (bloque §5: 400–500 ms). */
export const MIN_CARGA_PROYECTOS_MS = 450

/**
 * Espera mínima CANCELABLE para los estados de carga de Proyectos RH.
 * `cancelar()` limpia los temporizadores pendientes (desmontaje o cambio de
 * proyecto): las esperas canceladas nunca resuelven, así que ningún setState
 * posterior puede ejecutarse.
 */
export function crearEsperaMinima() {
  const temporizadores = new Set()
  return {
    esperar(desde = performance.now()) {
      const restante = Math.max(
        0,
        MIN_CARGA_PROYECTOS_MS - (performance.now() - desde),
      )
      if (restante === 0) return Promise.resolve()
      return new Promise((resolver) => {
        const id = setTimeout(() => {
          temporizadores.delete(id)
          resolver()
        }, restante)
        temporizadores.add(id)
      })
    },
    cancelar() {
      for (const id of temporizadores) clearTimeout(id)
      temporizadores.clear()
    },
  }
}

