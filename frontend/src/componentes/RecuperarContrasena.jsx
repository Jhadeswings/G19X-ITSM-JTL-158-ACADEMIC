// Pantalla pública «Recuperar acceso» (PRD §3.4; ET §31; DECISIONES §3/§53).
//
// Paso 1 del flujo de recuperación (H1): la persona escribe su correo de
// acceso y el backend decide —SIEMPRE con la misma respuesta 202— si registra
// y envía un token. Esta pantalla:
// - muestra el `mensaje` que devuelve el backend TAL CUAL: nunca lo sustituye
//   por un texto propio que afirme que el correo existe o que el mensaje fue
//   entregado (anti-enumeración, DECISIONES §3);
// - es pública y de un solo propósito: no conoce sesiones ni tokens;
// - ofrece el paso 2 («Introducir token de recuperación») y el regreso al
//   login; ambas las resuelve el shell público de App con estados locales.
//
// El token viaja SOLO por correo (DECISIONES §53): aquí no se pide ni se
// muestra nunca.

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Mail } from 'lucide-react'
import { solicitarRecuperacion } from '../api/autenticacion.js'
import Alert from './ui/Alert.jsx'
import { Button } from './ui/Button.jsx'
import { Input } from './ui/Input.jsx'
import BrandMark from './BrandMark.jsx'
import ContextualNetwork from './ContextualNetwork.jsx'

/** Espejo MÍNIMO del EmailStr del backend: solo formato, sin reglas nuevas. */
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Traduce los errores del cliente HTTP (Style Guide §13.6): nunca detalles
 * técnicos y JAMÁS información sobre la existencia de la cuenta.
 */
function mensajeDeError(error) {
  if (error?.estado === 422) {
    return 'Revisa el correo de acceso: el formato no es válido.'
  }
  if (error?.estado === 0) {
    return (
      error?.message ||
      'No fue posible conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.'
    )
  }
  // Cualquier otro fallo es neutral: no revela nada sobre la cuenta.
  return 'No fue posible solicitar la recuperación. Inténtalo de nuevo más tarde.'
}

export default function RecuperarContrasena({ alVolverLogin, alIrAToken }) {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmacion, setConfirmacion] = useState(null)
  const [error, setError] = useState(null)

  async function manejarEnvio(evento) {
    evento.preventDefault()
    if (enviando) return
    setError(null)
    const valor = email.trim()
    if (!EMAIL_VALIDO.test(valor)) {
      setError('Escribe un correo de acceso válido.')
      return
    }
    setEnviando(true)
    try {
      const respuesta = await solicitarRecuperacion(valor)
      // 202 uniforme (PRD §3.4): el mensaje del backend se muestra TAL CUAL.
      // La respuesta es idéntica exista o no la cuenta: ninguna variación
      // visual puede depender de eso.
      setConfirmacion(respuesta?.mensaje || null)
    } catch (e) {
      setConfirmacion(null)
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-identity" aria-labelledby="recuperar-mensaje-titulo">
        <BrandMark inverse />
        <div className="auth-identity__message">
          <p className="eyebrow eyebrow--light">Recuperar acceso</p>
          <h1 id="recuperar-mensaje-titulo">Volver a tu espacio toma un paso.</h1>
          <p>Escribe tu correo de acceso y solicita instrucciones para restablecer tu contraseña.</p>
        </div>
        <div className="auth-principles" aria-label="Principios de la plataforma">
          <span>Evidencia</span><span>Contexto</span><span>Desarrollo</span>
        </div>
        <ContextualNetwork className="auth-identity__network" />
      </section>

      <section className="auth-access" aria-labelledby="recuperar-titulo">
        <div className="auth-access__inner">
          <div className="auth-access__heading">
            <p className="eyebrow eyebrow--accent">Acceso seguro</p>
            <h2 id="recuperar-titulo">Recuperar acceso</h2>
            <p>Solicita instrucciones con tu correo de acceso.</p>
          </div>

          <form className="auth-form" onSubmit={manejarEnvio} aria-busy={enviando}>
            <div className="field-control">
              <label htmlFor="recuperar-email">Correo de acceso</label>
              <div className="field-control__input">
                <Mail aria-hidden="true" />
                <Input
                  id="recuperar-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  invalid={Boolean(error)}
                />
              </div>
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            {confirmacion && (
              <Alert tone="info" title="Solicitud recibida">{confirmacion}</Alert>
            )}

            <Button type="submit" size="large" loading={enviando} className="auth-form__submit">
              {enviando
                ? 'Enviando…'
                : confirmacion
                  ? 'Enviar instrucciones de nuevo'
                  : 'Enviar instrucciones'}
              {!enviando && <ArrowRight aria-hidden="true" />}
            </Button>

            {confirmacion && alIrAToken && (
              <Button
                type="button"
                variant="secondary"
                size="large"
                className="auth-form__submit"
                onClick={alIrAToken}
              >
                Introducir token de recuperación <ArrowRight aria-hidden="true" />
              </Button>
            )}
          </form>

          {alVolverLogin && (
            <div className="auth-access__help">
              <Button type="button" variant="ghost" size="small" onClick={alVolverLogin}>
                <ArrowLeft aria-hidden="true" /> Volver al inicio de sesión
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}