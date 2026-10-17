import { useState } from 'react'
import { CheckCircle2, Circle, Eye, EyeOff, KeyRound } from 'lucide-react'
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
// contraseña NO se juzga aquí: la aplica el esquema del backend (PRD §3.5,
// mínimo 8 caracteres y al menos un número) y responde 422. Los indicadores
// visibles y el estado del botón reproducen ESOS MISMOS dos requisitos del
// boceto (P.cta): son presentación de la política existente, no reglas nuevas;
// `validar()` sigue protegiendo el submit (completitud y coincidencia).
//
// Rediseño visual Fase 1 (boceto panel_empleado_v6_zonas(1).html):
//   - ojo por campo (`.cuenta-password__ojo`) con estado local propio: solo
//     alterna el `type` del input controlado, sin resetear valor ni cursor;
//   - indicadores vivos `.cuenta-password__rq` (círculo → check; gris →
//     petróleo) en lugar de la ayuda estática, mismo `id` para
//     `aria-describedby`;
//   - botón petróleo de 40px habilitado solo con las cuatro condiciones del
//     boceto, y el mensaje de éxito REAL del servidor (`.cuenta-password__ok`,
//     role=status) a su lado. Los ERRORES siguen en `Alert` (role=alert): no
//     se sacrifica información de error por la composición visual.
//
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

// Validación local mínima en el submit: campos requeridos y coincidencia.
// No juzga la FORTALEZA de la contraseña (eso es del backend). Se conserva
// aunque el botón ya arranque deshabilitado: protege el envío por Enter y
// cualquier envío programático del formulario.
function validar({ actual, nueva, repetir }) {
  if (!actual) return 'Escribe tu contraseña actual.'
  if (!nueva) return 'Escribe tu nueva contraseña.'
  if (!repetir) return 'Repite tu nueva contraseña.'
  if (nueva !== repetir) {
    return 'Las dos contraseñas no coinciden. Vuelve a escribirlas.'
  }
  return null
}

/** Requisitos de PRD §3.5 que el boceto muestra como indicadores vivos. */
function cumpleLargo(nueva) {
  return nueva.length >= 8
}

function cumpleNumero(nueva) {
  return /\d/.test(nueva)
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
  // Visibilidad por campo (estado local del boceto). Solo cambia el `type`
  // del mismo input controlado: el valor y la posición del cursor se
  // conservan, y el campo no se reinicia.
  const [visibles, setVisibles] = useState({
    actual: false,
    nueva: false,
    repetir: false,
  })

  function alternarVisibilidad(campo) {
    setVisibles((estado) => ({ ...estado, [campo]: !estado[campo] }))
  }

  // Habilitado del botón (boceto P.cta, `sync()`): contraseña actual + largo
  // mínimo + al menos un número + confirmación coincidente. La política del
  // SERVIDOR sigue siendo la autoridad final: un 422 se traduce y se muestra.
  const requisitosOk = cumpleLargo(nueva) && cumpleNumero(nueva)
  const puedeEnviarse =
    Boolean(actual) && requisitosOk && repetir.length > 0 && repetir === nueva

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
      // El texto de éxito es el del backend (`mensaje`): no se inventa copy
      // ni se copia el mensaje ficticio del prototipo estático.
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
        <div className="cuenta-password__campo">
          <Input
            id="cuenta-password-actual"
            type={visibles.actual ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            invalid={Boolean(error)}
          />
          <button
            type="button"
            className="cuenta-password__ojo"
            aria-label="Mostrar u ocultar contraseña"
            aria-pressed={visibles.actual}
            onClick={() => alternarVisibilidad('actual')}
          >
            {visibles.actual ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
          </button>
        </div>
      </FormField>

      <FormField id="cuenta-password-nueva" label="Nueva contraseña" required>
        <div className="cuenta-password__campo">
          <Input
            id="cuenta-password-nueva"
            type={visibles.nueva ? 'text' : 'password'}
            autoComplete="new-password"
            aria-describedby="cuenta-password-nueva-hint"
            required
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            invalid={Boolean(error)}
          />
          <button
            type="button"
            className="cuenta-password__ojo"
            aria-label="Mostrar u ocultar contraseña"
            aria-pressed={visibles.nueva}
            onClick={() => alternarVisibilidad('nueva')}
          >
            {visibles.nueva ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
          </button>
        </div>
      </FormField>

      <FormField
        id="cuenta-password-repetir"
        label="Confirma la nueva contraseña"
        required
      >
        <div className="cuenta-password__campo">
          <Input
            id="cuenta-password-repetir"
            type={visibles.repetir ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            invalid={Boolean(error)}
          />
          <button
            type="button"
            className="cuenta-password__ojo"
            aria-label="Mostrar u ocultar contraseña"
            aria-pressed={visibles.repetir}
            onClick={() => alternarVisibilidad('repetir')}
          >
            {visibles.repetir ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
          </button>
        </div>
      </FormField>

      {/* Indicadores vivos de la política PRD §3.5 (`.rq` del boceto):
          mismo texto que la ayuda estática que reemplazan y mismo `id` para
          `aria-describedby`. Solo cambia el ASPECTO al escribir (círculo →
          check, gris → petróleo); no añaden requisitos ni bloquean nada que
          el backend no bloquee ya. */}
      <p className="cuenta-password__rq" id="cuenta-password-nueva-hint">
        <span
          className={`cuenta-password__req${
            cumpleLargo(nueva) ? ' cuenta-password__req--ok' : ''
          }`}
        >
          {cumpleLargo(nueva) ? (
            <CheckCircle2 aria-hidden="true" />
          ) : (
            <Circle aria-hidden="true" />
          )}
          Mínimo 8 caracteres
        </span>
        <span
          className={`cuenta-password__req${
            cumpleNumero(nueva) ? ' cuenta-password__req--ok' : ''
          }`}
        >
          {cumpleNumero(nueva) ? (
            <CheckCircle2 aria-hidden="true" />
          ) : (
            <Circle aria-hidden="true" />
          )}
          Al menos un número
        </span>
      </p>

      {error && <Alert tone="error">{error}</Alert>}

      {/* `.ft` + `.okm` del boceto: acción a la izquierda y éxito real del
          servidor junto a ella. Los errores NO se sacrifican: siguen siendo
          Alert con role=alert. */}
      <div className="cuenta-password__ft">
        <Button type="submit" loading={enviando} disabled={!puedeEnviarse}>
          {enviando ? 'Guardando…' : 'Cambiar contraseña'}
        </Button>
        {exito && (
          <span className="cuenta-password__ok" role="status">
            {exito}
          </span>
        )}
      </div>
    </form>
  )
}