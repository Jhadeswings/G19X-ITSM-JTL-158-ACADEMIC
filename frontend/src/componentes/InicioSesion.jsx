// Inicio de sesión mínimo (PRD §3): email + contraseña contra el
// backend. Mensajes de error comprensibles, sin detalles técnicos.

import { useState } from 'react'
import { iniciarSesion } from '../api/autenticacion.js'

export default function InicioSesion({ onExito }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  async function manejarEnvio(evento) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const sesion = await iniciarSesion(email.trim(), password)
      onExito(sesion)
    } catch (e) {
      setError(
        e?.estado === 401
          ? 'Credenciales inválidas. Verifica tu correo y contraseña.'
          : e?.message || 'No fue posible iniciar sesión. Inténtalo de nuevo.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="login">
      <h1>Sistema de Identificación de Talento de Alto Potencial</h1>
      <form className="login__tarjeta" onSubmit={manejarEnvio}>
        <h2>Inicia sesión</h2>
        <label className="campo" htmlFor="email">
          Correo de acceso
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="campo" htmlFor="password">
          Contraseña
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  )
}
