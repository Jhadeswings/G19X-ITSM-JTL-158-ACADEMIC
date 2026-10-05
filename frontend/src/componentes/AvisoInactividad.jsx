import { useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'
import Alert from './ui/Alert.jsx'
import { Button } from './ui/Button.jsx'

/**
 * Aviso de sesión por vencer (Bloque F).
 *
 * OVERLAY BLOQUEANTE y de UN SOLO USO: existe únicamente para el aviso de
 * inactividad. NO es un sistema genérico de Dialog/Modal — no acepta `titulo`
 * ni `children`, no se exporta desde `ui/` y no se reutiliza en otra pantalla.
 *
 * ACCESIBILIDAD (encapsulada aquí, sin componente genérico):
 *   - al abrir, el foco pasa al botón «Seguir conectado»;
 *   - `Tab` y `Shift+Tab` ciclan dentro del overlay: el foco NO puede escapar a
 *     los controles de la aplicación que quedan detrás;
 *   - al cerrar, el foco vuelve al elemento que lo tenía, si sigue existiendo.
 *
 * `Escape` NO cierra el aviso: solo lo cierra una interacción válida,
 * «Seguir conectado» o el agotamiento del contador.
 */
export default function AvisoInactividad({ segundos, alSeguirConectado }) {
  const minutos = Math.floor(segundos / 60)
  const resto = segundos % 60

  const cajaRef = useRef(null)
  const botonRef = useRef(null)
  // Elemento que tenía el foco antes de abrirse el aviso.
  const focoAnterior = useRef(null)

  useEffect(() => {
    focoAnterior.current = document.activeElement
    botonRef.current?.focus()

    function controles() {
      return cajaRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled])',
      )
    }

    /**
     * Teclas de NAVEGACIÓN dentro del overlay: se retienen para que no lleguen
     * al detector de inactividad.
     *
     * `keydown` es actividad significativa porque el usuario puede estar
     * escribiendo, pero tabular o pulsar Escape no es haber interactuado con la
     * aplicación: sin esta retención, bastaría con mover el foco con el teclado
     * para hacer desaparecer el aviso y el overlay dejaría de ser bloqueante.
     *
     * `Escape` NO cierra el aviso: solo lo cierra una interacción real,
     * «Seguir conectado» o el agotamiento del contador.
     */
    const TECLAS_NAVEGACION = new Set(['Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

    function alTabular(evento) {
      if (!TECLAS_NAVEGACION.has(evento.key)) return
      evento.stopPropagation()
      if (evento.key !== 'Tab') return

      const lista = controles()
      if (!lista?.length) return
      const primero = lista[0]
      const ultimo = lista[lista.length - 1]
      const activo = document.activeElement
      const dentro = cajaRef.current?.contains(activo)

      if (evento.shiftKey) {
        if (activo === primero || !dentro) {
          evento.preventDefault()
          ultimo.focus()
        }
      } else if (activo === ultimo || !dentro) {
        evento.preventDefault()
        primero.focus()
      }
    }

    // Red de seguridad: si el evento NACIERA fuera de la caja, también se retiene.
    // El criterio correcto es el TARGET del evento, no `document.activeElement`:
    // el trap mueve el foco dentro de la caja, así que usar `activeElement`
    // dejaba de retener la siguiente tecla (carrera real entre ambos handlers).
    function alTabularFuera(evento) {
      if (!TECLAS_NAVEGACION.has(evento.key)) return
      // Si el evento viene de dentro, lo atiende `alTabular` en la caja.
      if (evento.target && cajaRef.current?.contains(evento.target)) return
      evento.stopPropagation()
      if (evento.key !== 'Tab') return
      const lista = controles()
      if (!lista?.length) return
      evento.preventDefault()
      ;(evento.shiftKey ? lista[lista.length - 1] : lista[0]).focus()
    }

    const caja = cajaRef.current
    caja?.addEventListener('keydown', alTabular, true)
    document.addEventListener('keydown', alTabularFuera, true)
    return () => {
      caja?.removeEventListener('keydown', alTabular, true)
      document.removeEventListener('keydown', alTabularFuera, true)
      // Restaurar el foco solo si el elemento sigue en el DOM y es focusable.
      const anterior = focoAnterior.current
      if (anterior && anterior.isConnected && typeof anterior.focus === 'function') {
        anterior.focus()
      }
    }
  }, [])

  return (
    <div
      className="sesion-aviso"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sesion-aviso-titulo"
      aria-describedby="sesion-aviso-mensaje"
    >
      <div className="sesion-aviso__caja" ref={cajaRef}>
        <Alert tone="info" title="Tu sesión está por vencer">
          <span id="sesion-aviso-mensaje">
            No hemos detectado actividad durante un tiempo. Tu sesión se cerrará
            automáticamente por seguridad.
          </span>
        </Alert>

        <p className="sesion-aviso__contador">
          <Clock aria-hidden="true" />
          <span id="sesion-aviso-titulo">
            Se cierra en {minutos}:{String(resto).padStart(2, '0')}
          </span>
        </p>

        <Button ref={botonRef} type="button" onClick={alSeguirConectado}>
          Seguir conectado
        </Button>
      </div>
    </div>
  )
}