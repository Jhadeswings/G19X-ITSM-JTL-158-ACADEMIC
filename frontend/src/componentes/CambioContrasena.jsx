// Cambio obligatorio de contraseña del primer acceso (PRD §3.3).
//
// Usa ÚNICAMENTE el endpoint existente POST /api/v1/auth/password/change con
// el token de la propia sesión. La política de contraseña (PRD §3.5) la valida
// el backend: aquí solo se informa al usuario y se evita enviar un formulario
// incompleto. Mientras must_change_password = true el backend bloquea el resto
// de endpoints (403), por lo que esta pantalla no ofrece ninguna otra acción.
// Un 401 cierra la sesión y vuelve al inicio de sesión (ET §31).
//
// Los errores se muestran con lenguaje descriptivo y neutral, sin detalles
// técnicos ni excepciones (Style Guide §13.6/§25).

import { useState } from 'react'
import { cambiarPassword } from '../api/autenticacion.js'

/** Mensaje comprensible por estado HTTP (nunca detalles técnicos). */
function mensajeDeError(error) {
  if (error?.estado === 400) {
    return error.message || 'No fue posible cambiar la contraseña.'
  }
  if (error?.estado === 422) {
    return 'La nueva contraseña no cumple los requisitos indicados.'
  }
  if (error?.estado === 403) {
    return 'Tu cuenta no puede cambiar la contraseña en este momento.'
  }
  return (
    error?.message || 'No fue posible cambiar tu contraseña. Inténtalo de nuevo.'
  )
}

export default function CambioContrasena({ token, alCambiar, alCerrarSesion }) {
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  async function manejarEnvio(evento) {
    evento.preventDefault()
    setError(null)

    if (nueva !== repetir) {
      setError('Las dos contraseñas no coinciden. Vuelve a escribirlas.')
      return
    }

    setEnviando(true)
    try {
      await cambiarPassword(token, nueva)
      alCambiar?.()
    } catch (e) {
      if (e?.estado === 401) {
        alCerrarSesion?.()
        return
      }
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="login">
      <h1>Primer acceso</h1>
      <form className="login__tarjeta" onSubmit={manejarEnvio}>
        <h2>Define tu nueva contraseña</h2>
        <p className="seccion__intro" id="ayuda-password">
          Tu contraseña actual es temporal. Define una nueva para continuar.
          Mínimo 8 caracteres y al menos un número.
        </p>
        <label className="campo" htmlFor="password-nueva">
          Nueva contraseña
          <input
            id="password-nueva"
            type="password"
            autoComplete="new-password"
            aria-describedby="ayuda-password"
            required
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
          />
        </label>
        <label className="campo" htmlFor="password-repetir">
          Repite la nueva contraseña
          <input
            id="password-repetir"
            type="password"
            autoComplete="new-password"
            required
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
          />
        </label>
        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="boton boton--primario"
          disabled={enviando}
        >
          {enviando ? 'Guardando…' : 'Guardar contraseña'}
        </button>
        <button
          type="button"
          className="boton boton--fantasma"
          onClick={() => alCerrarSesion?.()}
        >
          Cerrar sesión
        </button>
      </form>
    </main>
  )
}
