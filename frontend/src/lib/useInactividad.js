import { useCallback, useEffect, useRef, useState } from 'react'
import { renovarSesion } from '../api/autenticacion.js'

/**
 * Cierre de sesión por inactividad (Bloque F).
 *
 * Cifras aprobadas:
 *   - 28 min sin actividad significativa → aviso previo;
 *   - +2 min sin actividad → cierre automático (30 min de inactividad).
 *
 * ESTRATEGIA DE RENOVACIÓN (documentada a propósito):
 *
 *   1. `pointerdown`, `keydown`, `scroll` y `touchstart` son actividad
 *      SIGNIFICATIVA. `mousemove` queda EXCLUIDO a propósito: se dispara con
 *      solo mover el cursor sobre la ventana y daría actividad falsa.
 *   2. Los eventos llegan en ráfagas (un scroll genera decenas). Por eso la
 *      marca de actividad se coalesce: cuenta 1 vez cada `SUAVIZADO_MS`, y los
 *      temporizadores se PROGRAMAN (no se reinician en cada evento), de modo que
 *      una ráfaga no genera N renovaciones.
 *   3. La renovación NO se pide en cada evento: como máximo 1 vez cada
 *      `RENOVAR_CADA_MS` y solo cuando al token le queda poco, así que un
 *      usuario activo va renovando en silencio sin una petición por pulsación.
 *   4. `seguirConectado` (botón del aviso) fuerza una renovación inmediata: es
 *      la acción explícita del usuario.
 *
 * El reloj de inactividad es INDEPENDIENTE del `exp` del token: son dos relojes
 * distintos. La inactividad decide cuándo avisar y cuándo cerrar; el `exp` real
 * decide si el backend aceptará la renovación. Nunca se asume que la sesión
 * sigue viva por haber habido actividad.
 */

const MS_MIN = 60 * 1000

/** Sin actividad significativa durante este tiempo → aviso previo. */
export const AVISO_MS = 28 * MS_MIN
/** Aviso visible durante este tiempo antes del cierre automático. */
export const CIERRE_MS = 2 * MS_MIN
/** Mínimo entre dos renovaciones automáticas. */
export const RENOVAR_CADA_MS = 5 * MS_MIN
/** Coalescencia: una ráfaga de eventos cuenta como una sola actividad. */
const SUAVIZADO_MS = 1000

/** Eventos de actividad. `mousemove` NO está, y es deliberado. */
const EVENTOS_ACTIVIDAD = ['pointerdown', 'keydown', 'scroll', 'touchstart']

/**
 * Lee `iat` y `exp` del JWT (payload Base64 legible, NO cifrado) y devuelve la
 * vida real del token en ms, o `null` si no se puede leer.
 *
 * NO es validación de seguridad: no comprueba firma, issuer niAudience. Solo
 * sirve para PLANIFICAR la renovación. El backend sigue siendo la autoridad y
 * un token expirado o manipulado simplemente producirá una decisión de UX
 * inofensiva (o ninguna) y, en su caso, un 401.
 */
export function duracionTokenMs(token) {
  try {
    const [, carga] = token.split('.')
    const { iat, exp } = JSON.parse(atob(carga))
    if (typeof exp !== 'number' || typeof iat !== 'number') return null
    const duracion = (exp - iat) * 1000
    return duracion > 0 ? duracion : null
  } catch {
    return null
  }
}

/** Milisegundos que le quedan al token, o `null` si no se puede leer. */
export function msRestantes(token) {
  const duracion = duracionTokenMs(token)
  if (duracion === null) return null
  try {
    const [, carga] = token.split('.')
    const exp = JSON.parse(atob(carga)).exp
    return exp * 1000 - Date.now()
  } catch {
    return null
  }
}

/**
 * ¿Toca renovar?
 *
 * Se dispara cuando al token le queda como máximo DOS TERCIOS de su vida real
 * (`duracion * 2/3`). Así el umbral SE DERIVA de `iat`/`exp` y no de un número
 * fijo: si el backend cambia `ACCESS_TOKEN_EXPIRE_MINUTES`, la planificación se
 * adapta sola.
 *
 * Equivalencia con el comportamiento anterior (token de 30 min):
 *   `restante <= 30 min * 2/3 = 20 min`, exactamente el umbral fijo de 20 min
 *   que se tenía hardcodeado. Con 60 min el umbral pasa a 40 min; con 15 min,
 *   a 10 min.
 *
 * Si el token ya expiró, `restante <= 0` cumple la condición y se intenta la
 * renovación: el backend la rechazará con 401 y la sesión se cerrará. NO se
 * intenta "revivir" nada.
 */
export function debeRenovar(token) {
  const duracion = duracionTokenMs(token)
  if (duracion === null) return false
  const restante = msRestantes(token)
  if (restante === null) return false
  return restante <= (duracion * 2) / 3
}

export default function useInactividad({
  token,
  onCerrar,
  onRenovar,
  avisoMs = AVISO_MS,
  cierreMs = CIERRE_MS,
}) {
  const [aviso, setAviso] = useState(null)

  // Refs: los temporizadores viven fuera del estado para que reprogramarlos no
  // provoque renders, y los callbacks se leen siempre actualizados.
  const timerAviso = useRef(null)
  const timerCierre = useRef(null)
  const intervaloContador = useRef(null)
  const inicioAviso = useRef(null)
  const ultimaRenovacion = useRef(0)
  const ultimoEvento = useRef(0)
  const avisoRef = useRef(null)

  const limpiarAviso = useCallback(() => {
    if (timerAviso.current) clearTimeout(timerAviso.current)
    if (timerCierre.current) clearTimeout(timerCierre.current)
    if (intervaloContador.current) clearInterval(intervaloContador.current)
    timerAviso.current = null
    timerCierre.current = null
    intervaloContador.current = null
    inicioAviso.current = null
    setAviso(null)
  }, [])

  const cerrarPorInactividad = useCallback(() => {
    limpiarAviso()
    onCerrar('inactividad')
  }, [limpiarAviso, onCerrar])

  /** Renueva si toca: respeta el intervalo mínimo y la vida restante del token. */
  const renovarSiToca = useCallback(() => {
    if (!token) return
    const ahora = Date.now()
    // Antistorms: como máximo una renovación cada RENOVAR_CADA_MS.
    if (ahora - ultimaRenovacion.current < RENOVAR_CADA_MS) return
    // El umbral se DERIVA de la vida real del token (`iat`/`exp`), no de un
    // número fijo. Si no se puede leer, no se renueva a ciegas.
    if (!debeRenovar(token)) return

    ultimaRenovacion.current = ahora
    renovarSesion(token)
      .then((sesion) => onRenovar(sesion))
      .catch((e) => {
        // 401 = el backend rechazó la sesión: se cierra, NO se reintenta ni se
        // intenta revivir. Cualquier otro fallo (red) se ignora: la sesión sigue
        // viva y se reintentará en la próxima actividad con vida útil corta.
        if (e?.estado === 401) onCerrar('expirada')
      })
  }, [token, onCerrar, onRenovar])

  /** Programa aviso y cierre desde AHORA (no acumula reinicios). */
  const programar = useCallback(() => {
    if (timerAviso.current) clearTimeout(timerAviso.current)
    if (timerCierre.current) clearTimeout(timerCierre.current)

    timerAviso.current = setTimeout(() => {
      // Aviso visible con contador descendente de `cierreMs`.
      inicioAviso.current = Date.now()
      setAviso(Math.ceil(cierreMs / 1000))

      intervaloContador.current = setInterval(() => {
        const restante = cierreMs - (Date.now() - inicioAviso.current)
        const valor = Math.max(0, Math.ceil(restante / 1000))
        if (valor !== avisoRef.current) {
          avisoRef.current = valor
          setAviso(valor)
        }
      }, 1000)

      timerCierre.current = setTimeout(cerrarPorInactividad, cierreMs)
    }, avisoMs)
  }, [avisoMs, cierreMs, cerrarPorInactividad])

  /** Actividad del usuario: coalesce, reprograma y quizá renueva. */
  const registrarActividad = useCallback(() => {
    const ahora = Date.now()
    if (ahora - ultimoEvento.current < SUAVIZADO_MS) return
    ultimoEvento.current = ahora
    // Volver a interactuar durante el aviso lo cancela.
    limpiarAviso()
    programar()
    renovarSiToca()
  }, [limpiarAviso, programar, renovarSiToca])

  /** Acción explícita "Seguir conectado": renueva ya y reinicia el contador. */
  const seguirConectado = useCallback(() => {
    limpiarAviso()
    programar()
    if (!token) return
    ultimaRenovacion.current = Date.now()
    renovarSesion(token)
      .then((sesion) => onRenovar(sesion))
      .catch((e) => {
        if (e?.estado === 401) onCerrar('expirada')
      })
  }, [token, limpiarAviso, programar, onCerrar, onRenovar])

  // Suscripción a la actividad. Sin sesión no hay nada que vigilar.
  useEffect(() => {
    if (!token) return undefined
    programar()
    EVENTOS_ACTIVIDAD.forEach((evento) =>
      window.addEventListener(evento, registrarActividad, { passive: true }),
    )
    return () => {
      EVENTOS_ACTIVIDAD.forEach((evento) =>
        window.removeEventListener(evento, registrarActividad),
      )
      if (timerAviso.current) clearTimeout(timerAviso.current)
      if (timerCierre.current) clearTimeout(timerCierre.current)
      if (intervaloContador.current) clearInterval(intervaloContador.current)
    }
  }, [token, programar, registrarActividad])

  return { aviso, registrarActividad, seguirConectado }
}