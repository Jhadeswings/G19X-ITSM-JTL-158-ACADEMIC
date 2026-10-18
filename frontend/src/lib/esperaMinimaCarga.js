// Espera mínima cancelable para los estados de carga iniciales del Empleado.
//
// Evita el "flash" de un indicador que desaparece en cuanto el backend
// responde muy rápido: la transición a contenido espera, como MÁXIMO, este
// mínimo perceptible medido DESDE EL INICIO de la petición (si la petición
// tarda más, no se agrega ninguna espera extra). Los ERRORES no esperan:
// llegan al estado de error en cuanto ocurren.
//
// Independiente de React y sin llamadas de red: solo temporizadores.
// `cancelar()` limpia los temporizadores pendientes (desmontaje o reintento):
// las esperas canceladas RESUELVEN de inmediato para no dejar promesas
// colgadas, y el llamador debe ignorar el resultado obsoleto con su propia
// guarda de vigencia.

/** Presencia mínima de los estados de carga iniciales del Empleado. */
export const MIN_CARGA_EMPLEADO_MS = 400

/**
 * Crea una espera mínima cancelable.
 * `esperar(desde)` resuelve cuando se completa el tiempo restante o cuando
 * se cancela. `cancelar()` limpia los temporizadores y resuelve las esperas
 * pendientes para no dejar promesas colgadas.
 */
export function crearEsperaMinimaCarga() {
  const pendientes = new Set()
  return {
    esperar(desde = Date.now()) {
      const restante = Math.max(0, MIN_CARGA_EMPLEADO_MS - (Date.now() - desde))
      if (restante === 0) return Promise.resolve()
      return new Promise((resolver) => {
        const registro = { resolver, id: null }
        registro.id = setTimeout(() => {
          pendientes.delete(registro)
          resolver()
        }, restante)
        pendientes.add(registro)
      })
    },
    cancelar() {
      for (const registro of pendientes) {
        clearTimeout(registro.id)
        pendientes.delete(registro)
        registro.resolver()
      }
    },
  }
}
