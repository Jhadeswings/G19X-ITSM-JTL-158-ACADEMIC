import { useState } from 'react'
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react'
import { iniciarSesion } from '../api/autenticacion.js'
import Alert from './ui/Alert.jsx'
import { Button } from './ui/Button.jsx'
import { Input } from './ui/Input.jsx'
import BrandMark from './BrandMark.jsx'
import ContextualNetwork from './ContextualNetwork.jsx'

/**
 * @param {object} props
 * @param {(sesion: object) => void} props.onExito
 * @param {'inactividad'|null} [props.motivoCierre] si la sesión anterior se
 *   cerró por inactividad, se explica en el login. El logout manual y el
 *   rechazo del backend llegan como `null` y NO muestran mensaje (comportamiento
 *   previo intacto).
 * @param {() => void} [props.onRecuperar] abre la vista pública «Recuperar
 *   acceso» (PRD §3.4): el enlace «¿Olvidaste tu contraseña?» del pie.
 * @param {() => void} [props.onIrAToken] abre directamente la vista pública
 *   de restablecimiento para quien YA tiene un token recibido por correo.
 */
export default function InicioSesion({
  onExito,
  motivoCierre = null,
  onRecuperar,
  onIrAToken,
}) {
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
    <main className="auth-layout">
      <section className="auth-identity" aria-labelledby="login-message-title">
        <BrandMark inverse />
        <div className="auth-identity__message">
          <p className="eyebrow eyebrow--light">Crecimiento conectado</p>
          <h1 id="login-message-title">La evidencia de hoy construye el desarrollo de mañana.</h1>
          <p>Un espacio para comprender capacidades, contexto y oportunidades de crecimiento.</p>
        </div>
        <div className="auth-principles" aria-label="Principios de la plataforma">
          <span>Evidencia</span><span>Contexto</span><span>Desarrollo</span>
        </div>
        <ContextualNetwork className="auth-identity__network" />
      </section>

      <section className="auth-access" aria-labelledby="access-title">
        <div className="auth-access__inner">
          <div className="auth-access__heading">
            <p className="eyebrow eyebrow--accent">Acceso seguro</p>
            <h2 id="access-title">Inicia sesión</h2>
            <p>Continúa a tu espacio de talento.</p>
          </div>
          {motivoCierre === 'inactividad' && (
            <Alert tone="info" className="auth-access__aviso">
              Tu sesión se cerró por inactividad. Inicia sesión nuevamente para
              continuar.
            </Alert>
          )}
          <form className="auth-form" onSubmit={manejarEnvio} aria-busy={enviando}>
            <div className="field-control">
              <label htmlFor="email">Correo de acceso</label>
              <div className="field-control__input">
                <Mail aria-hidden="true" />
                <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(error)} />
              </div>
            </div>
            <div className="field-control">
              <label htmlFor="password">Contraseña</label>
              <div className="field-control__input">
                <LockKeyhole aria-hidden="true" />
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} invalid={Boolean(error)} />
              </div>
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" size="large" loading={enviando} className="auth-form__submit">
              {enviando ? 'Ingresando…' : 'Ingresar'} {!enviando && <ArrowRight aria-hidden="true" />}
            </Button>
          </form>
          {/* Recuperación de acceso (PRD §3.4, H1): dos entradas públicas del
              login. «¿Olvidaste tu contraseña?» inicia el flujo completo y
              «Ya tengo un token» lleva directo al paso 2 para quien vuelve
              con su token ya en mano. Opcionales para no romper usos
              previos del componente. */}
          <div className="auth-access__help">
            {onRecuperar && (
              <Button type="button" variant="ghost" size="small" onClick={onRecuperar}>
                ¿Olvidaste tu contraseña?
              </Button>
            )}
            {onIrAToken && (
              <Button type="button" variant="ghost" size="small" onClick={onIrAToken}>
                Ya tengo un token de recuperación
              </Button>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
