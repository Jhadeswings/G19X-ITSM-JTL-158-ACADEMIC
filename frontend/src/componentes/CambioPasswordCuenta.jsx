import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { cambiarPasswordConActual } from '../api/autenticacion.js'
import Alert from './ui/Alert.jsx'
import { Button } from './ui/Button.jsx'
import FormField from './FormField.jsx'
import { Input } from './ui/Input.jsx'

// Cambiar contraseña voluntariamente desde "Mi cuenta" (PRD §21.6), para una
// cuenta que YA tiene contraseña definitiva (`must_change_password=false`).
//
// Es un componente DISTINTO de `CambioContrasena.jsx`, que es el onboarding de
// primer acceso: aquí el backend además EXIGE la contraseña actual, así que la
// semántica del formulario es otra y ninguna de las dos se acopla a la otra.
// No conoce `mustChangePassword` y NO modifica la sesión.
//
// Usa el transporte `cambiarPasswordConActual` (MB-6-2). La política real de
// contraseña NO se comprueba aquí: la aplica el esquema del backend (PRD §3.5,
// mínimo 8 caracteres y al menos un número) y responde 422. La única validación
// local es la de completitud y la coincidencia de las dos nuevas.

// Traduce los errores del cliente HTTP (Style Guide §13.6): nunca se muestra
// una excepción técnica. Solo llega aquí el 400 o cualquier otro fallo: el 422
// se traduce y el 401 se resuelve antes, delegando en `alSesionExpirada`.
function mensajeDeError(error) {
  if (error?.estado === 422) {
    return 'La nueva contraseña no cumple los requisitos indicados.'
  }
  // 400 y el resto: el backend ya responde con un texto legible.
  return error?.message || 'No fue posible cambiar tu contraseña. Inténtalo de nuevo.'
}

// Validación local mínima: campos requeridos y coincidencia de las nuevas.
// No juzga la FORTALEZA de la contraseña (eso es del backend).
function validar({ actual, nueva, repetir }) {
  if (!actual) return 'Escribe tu contraseña actual.'
  if (!nueva) return 'Escribe tu nueva contraseña.'
  if (!repetir) return 'Repite tu nueva contraseña.'
  if (nueva !== repetir) {
    return 'Las dos contraseñas no coinciden. Vuelve a escribirlas.'
  }
  return null
}

export default function CambioPasswordCuenta({
  token,
  alSesionExpirada,
  alCambiar,
}) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [exito, setExito] = useState(false)

  async function manejarEnvio(evento) {
    evento.preventDefault()
    if (enviando) return

    setError(null)
    setExito(false)

    const problema = validar({ actual, nueva, repetir })
    if (problema) {
      setError(problema)
      return
    }

    setEnviando(true)
    try {
      const respuesta = await cambiarPasswordConActual(token, actual, nueva)
      setActual('')
      setNueva('')
      setRepetir('')
      // El texto de éxito es el del backend (`mensaje`): no se inventa copy.
      setExito(respuesta?.mensaje || 'Contraseña actualizada.')
      alCambiar?.()
    } catch (e) {
      if (e?.estado === 401) {
        alSesionExpirada?.()
        return
      }
      setError(mensajeDeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form
      className="cuenta-password"
      onSubmit={manejarEnvio}
      aria-busy={enviando}
    >
      <div className="cuenta-password__titulo">
        <KeyRound aria-hidden="true" />
        <h3>Cambiar contraseña</h3>
      </div>

      <FormField id="cuenta-password-actual" label="Contraseña actual" required>
        <Input
          id="cuenta-password-actual"
          type="password"
          autoComplete="current-password"
          required
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          invalid={Boolean(error)}
        />
      </FormField>

      <FormField
        id="cuenta-password-nueva"
        label="Nueva contraseña"
        required
      >
        <Input
          id="cuenta-password-nueva"
          type="password"
          autoComplete="new-password"
          aria-describedby="cuenta-password-nueva-hint"
          required
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          invalid={Boolean(error)}
        />
      </FormField>

      <FormField
        id="cuenta-password-repetir"
        label="Confirma la nueva contraseña"
        required
      >
        <Input
          id="cuenta-password-repetir"
          type="password"
          autoComplete="new-password"
          required
          value={repetir}
          onChange={(e) => setRepetir(e.target.value)}
          invalid={Boolean(error)}
        />
      </FormField>

      {/* Política del conjunto "nueva contraseña" (PRD §3.5): una sola línea
          bajo el par "Nueva / Confirma", como ayuda del CONJUNTO y no como
          texto del campo "Nueva contraseña". Conserva el MISMO texto y su
          `id`, que el campo `nueva` sigue referenciando con
          `aria-describedby`. No añade ninguna validación ni requisito nuevo:
          solo cambia su posición visual. */}
      <p
        className="form-field__hint cuenta-password__politica"
        id="cuenta-password-nueva-hint"
      >
        Mínimo 8 caracteres y al menos un número.
      </p>

      {error && <Alert tone="error">{error}</Alert>}
      {exito && <Alert tone="success">{exito}</Alert>}

      <Button type="submit" loading={enviando}>
        {enviando ? 'Guardando…' : 'Cambiar contraseña'}
      </Button>
    </form>
  )
}