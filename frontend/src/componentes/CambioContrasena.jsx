import { useState } from 'react'
import { ArrowRight, KeyRound, LogOut } from 'lucide-react'
import { cambiarPassword } from '../api/autenticacion.js'
import Alert from './ui/Alert.jsx'
import { Button } from './ui/Button.jsx'
import { Input } from './ui/Input.jsx'
import BrandMark from './BrandMark.jsx'
import ContextualNetwork from './ContextualNetwork.jsx'

function mensajeDeError(error) {
  if (error?.estado === 400) return error.message || 'No fue posible cambiar la contraseña.'
  if (error?.estado === 422) return 'La nueva contraseña no cumple los requisitos indicados.'
  if (error?.estado === 403) return 'Tu cuenta no puede cambiar la contraseña en este momento.'
  return error?.message || 'No fue posible cambiar tu contraseña. Inténtalo de nuevo.'
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
      if (e?.estado === 401) { alCerrarSesion?.(); return }
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="onboarding-layout">
      <section className="onboarding-context" aria-labelledby="onboarding-title">
        <BrandMark inverse />
        <div className="onboarding-context__step" aria-hidden="true"><span>01</span><i /></div>
        <div className="onboarding-context__copy">
          <p className="eyebrow eyebrow--light">Primer acceso</p>
          <h1 className="visualmente-oculto">Primer acceso</h1>
          <h2 id="onboarding-title">Crea tu contraseña. Tu recorrido comienza aquí.</h2>
          <p>Un paso breve para proteger tu cuenta antes de entrar a tu espacio de desarrollo.</p>
        </div>
        <ContextualNetwork className="onboarding-context__network" label="Red conceptual de primer acceso" />
      </section>
      <section className="onboarding-action" aria-labelledby="create-password-title">
        <div className="onboarding-action__inner">
          <div className="onboarding-action__icon"><KeyRound aria-hidden="true" /></div>
          <p className="eyebrow eyebrow--accent">Cuenta y seguridad</p>
          <h2 id="create-password-title">Crea tu contraseña</h2>
          <p className="onboarding-action__intro">Tu credencial actual es temporal. Define una nueva para continuar con acceso completo.</p>
          <form className="auth-form" onSubmit={manejarEnvio} aria-busy={enviando}>
            <div className="field-control">
              <label htmlFor="password-nueva">Nueva contraseña</label>
              <Input id="password-nueva" type="password" autoComplete="new-password" aria-describedby="ayuda-password" required value={nueva} onChange={(e) => setNueva(e.target.value)} invalid={Boolean(error)} />
              <small id="ayuda-password">Mínimo 8 caracteres y al menos un número.</small>
            </div>
            <div className="field-control">
              <label htmlFor="password-repetir">Repite la nueva contraseña</label>
              <Input id="password-repetir" type="password" autoComplete="new-password" required value={repetir} onChange={(e) => setRepetir(e.target.value)} invalid={Boolean(error)} />
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" size="large" loading={enviando} className="auth-form__submit">
              {enviando ? 'Guardando…' : 'Guardar contraseña'} {!enviando && <ArrowRight aria-hidden="true" />}
            </Button>
            <Button type="button" variant="ghost" onClick={() => alCerrarSesion?.()}>
              <LogOut aria-hidden="true" /> Cerrar sesión
            </Button>
          </form>
        </div>
      </section>
    </main>
  )
}
