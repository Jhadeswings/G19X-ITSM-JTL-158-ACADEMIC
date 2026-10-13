// Pantalla pública «Restablecer contraseña» (PRD §3.4/§3.5; DECISIONES §4/§53).
//
// Paso 2 del flujo de recuperación (H1): la persona PEGA el token que llegó
// por correo (el MVP no define URL de destino: el token se copia manualmente)
// y define su nueva contraseña. Contrato real del backend (nada se inventa):
// - 200 → {"mensaje": "Contraseña restablecida."};
// - 400 → SIEMPRE «Token inválido o expirado.», sin distinguir token
//   inválido, vencido, reutilizado o cuenta inactiva (ambigüedad deliberada);
// - 422 → la contraseña no cumple la política §3.5 (mínimo 8 caracteres y al
//   menos un número): la valida el esquema del backend, que es la autoridad.
//
// Seguridad: el token y las contraseñas viven SOLO en el estado local del
// formulario. Tras un éxito se limpian y NUNCA se guardan en localStorage,
// sessionStorage, cookies, URL, logs ni consola. Es un componente DISTINTO de
// CambioContrasena (primer acceso, con sesión) y de CambioPasswordCuenta
// (cambio autenticado con contraseña actual): aquí no hay sesión ni Bearer.

import { useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { restablecerPassword } from '../api/autenticacion.js'
import Alert from './ui/Alert.jsx'
import { Button } from './ui/Button.jsx'
import FormField from './FormField.jsx'
import { Input } from './ui/Input.jsx'
import BrandMark from './BrandMark.jsx'
import ContextualNetwork from './ContextualNetwork.jsx'

/** Traduce los errores del cliente HTTP (Style Guide §13.6). */
function mensajeDeError(error) {
  if (error?.estado === 422) {
    return 'La nueva contraseña no cumple los requisitos indicados.'
  }
  // 400 (y el resto): el backend ya responde con un texto legible y uniforme
  // («Token inválido o expirado.»); la causa exacta NO se distingue aquí.
  return (
    error?.message || 'No fue posible restablecer la contraseña. Inténtalo de nuevo.'
  )
}

/**
 * Validación local mínima: completitud, coincidencia y un espejo de la
 * política visible (§3.5). NO sustituye la del backend (422): solo evita un
 * envío que se sabe fallido y mantiene el mensaje comprensible.
 */
function validarLocal(token, nueva, repetir) {
  if (!token.trim()) return 'Pega el token de recuperación que llegó a tu correo.'
  if (!nueva) return 'Escribe tu nueva contraseña.'
  if (nueva.length < 8 || !/\d/.test(nueva)) {
    return 'La nueva contraseña debe tener al menos 8 caracteres y un número.'
  }
  if (nueva !== repetir) {
    return 'Las dos contraseñas no coinciden. Vuelve a escribirlas.'
  }
  return null
}

export default function RestablecerContrasena({ alVolverLogin, alSolicitarOtro }) {
  const [token, setToken] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [exito, setExito] = useState(null)
  const [error, setError] = useState(null)

  async function manejarEnvio(evento) {
    evento.preventDefault()
    if (enviando) return
    setError(null)
    const problema = validarLocal(token, nueva, repetir)
    if (problema) {
      setError(problema)
      return
    }
    setEnviando(true)
    try {
      const respuesta = await restablecerPassword(token.trim(), nueva)
      // Éxito: el mensaje del backend se muestra tal cual y los valores
      // sensibles se limpian de inmediato (nada queda en el estado).
      setExito(respuesta?.mensaje || 'Contraseña restablecida.')
      setToken('')
      setNueva('')
      setRepetir('')
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const panel = exito ? (
    <>
      <div className="auth-access__heading">
        <p className="eyebrow eyebrow--accent">Acceso seguro</p>
        <h2 id="restablecer-titulo-exito">Contraseña restablecida</h2>
        <p>Ya puedes iniciar sesión con tu nueva contraseña.</p>
      </div>
      <Alert tone="success">{exito}</Alert>
      {alVolverLogin && (
        <Button
          type="button"
          size="large"
          className="auth-form__submit"
          onClick={alVolverLogin}
        >
          Ir a iniciar sesión <ArrowRight aria-hidden="true" />
        </Button>
      )}
    </>
  ) : (
    <>
      <div className="auth-access__heading">
        <p className="eyebrow eyebrow--accent">Acceso seguro</p>
        <h2 id="restablecer-titulo">Restablecer contraseña</h2>
        <p>Pega el token que llegó a tu correo y define tu nueva contraseña.</p>
      </div>

      <form className="auth-form" onSubmit={manejarEnvio} aria-busy={enviando}>
        <FormField id="reset-token" label="Token de recuperación" required>
          <Input
            id="reset-token"
            type="text"
            autoComplete="off"
            spellCheck={false}
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            invalid={Boolean(error)}
          />
        </FormField>

        <FormField
          id="reset-nueva"
          label="Nueva contraseña"
          hint="Mínimo 8 caracteres y al menos un número."
          required
        >
          <Input
            id="reset-nueva"
            type="password"
            autoComplete="new-password"
            aria-describedby="reset-nueva-hint"
            required
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            invalid={Boolean(error)}
          />
        </FormField>

        <FormField id="reset-repetir" label="Confirmar nueva contraseña" required>
          <Input
            id="reset-repetir"
            type="password"
            autoComplete="new-password"
            required
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            invalid={Boolean(error)}
          />
        </FormField>

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" size="large" loading={enviando} className="auth-form__submit">
          {enviando ? 'Restableciendo…' : 'Restablecer contraseña'}
          {!enviando && <ArrowRight aria-hidden="true" />}
        </Button>
      </form>
    </>
  )

  return (
    <main className="auth-layout">
      <section className="auth-identity" aria-labelledby="restablecer-mensaje-titulo">
        <BrandMark inverse />
        <div className="auth-identity__message">
          <p className="eyebrow eyebrow--light">Restablecer contraseña</p>
          <h1 id="restablecer-mensaje-titulo">Tu acceso, bajo tu control.</h1>
          <p>Usa el token de tu correo para definir una contraseña nueva y volver a entrar.</p>
        </div>
        <div className="auth-principles" aria-label="Principios de la plataforma">
          <span>Evidencia</span><span>Contexto</span><span>Desarrollo</span>
        </div>
        <ContextualNetwork className="auth-identity__network" />
      </section>

      <section
        className="auth-access"
        aria-labelledby={exito ? 'restablecer-titulo-exito' : 'restablecer-titulo'}
      >
        <div className="auth-access__inner">
          {panel}

          {!exito && (alSolicitarOtro || alVolverLogin) && (
            <div className="auth-access__help">
              {alSolicitarOtro && (
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  onClick={alSolicitarOtro}
                >
                  <RotateCcw aria-hidden="true" /> Solicitar un token nuevo
                </Button>
              )}
              {alVolverLogin && (
                <Button
                  type="button"
                  variant="ghost"
                  size="small"
                  onClick={alVolverLogin}
                >
                  <ArrowLeft aria-hidden="true" /> Volver al inicio de sesión
                </Button>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}