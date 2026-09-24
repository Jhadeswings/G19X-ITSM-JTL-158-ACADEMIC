// Cliente HTTP mínimo para la API del backend.
//
// Reglas (Style Guide §13.6): nunca se muestran excepciones técnicas al
// usuario; los errores se traducen a mensajes comprensibles. El token de
// acceso viaja SIEMPRE en la cabecera Authorization (el backend deriva
// toda la identidad del token, ET §31/§32).

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/** Error de API con mensaje comprensible y estado HTTP asociado. */
export class ErrorApi extends Error {
  constructor(mensaje, estado) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.estado = estado
  }
}

/** Traduce el `detail` de FastAPI (string o arreglo) a un mensaje legible. */
function detalleLegible(cuerpo) {
  const detalle = cuerpo?.detail
  if (typeof detalle === 'string') return detalle
  if (Array.isArray(detalle) && detalle.length > 0) {
    return 'Algunos datos enviados no son válidos. Revisa e inténtalo de nuevo.'
  }
  return 'Ocurrió un problema inesperado. Inténtalo de nuevo más tarde.'
}

/**
 * Realiza una solicitud JSON a la API.
 * @returns {Promise<object>} cuerpo de la respuesta.
 * @throws {ErrorApi} con mensaje comprensible y estado HTTP.
 */
export async function solicitar(ruta, { metodo = 'GET', cuerpo, token } = {}) {
  let respuesta
  try {
    respuesta = await fetch(`${BASE_URL}${ruta}`, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      ...(cuerpo !== undefined && { body: JSON.stringify(cuerpo) }),
    })
  } catch {
    throw new ErrorApi(
      'No fue posible conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.',
      0,
    )
  }

  if (!respuesta.ok) {
    let cuerpo = null
    try {
      cuerpo = await respuesta.json()
    } catch {
      cuerpo = null
    }
    throw new ErrorApi(detalleLegible(cuerpo), respuesta.status)
  }
  return respuesta.json()
}
