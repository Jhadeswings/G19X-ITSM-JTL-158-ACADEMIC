// Estado temporal de una sección aún no implementada (Style Guide §13.4/§28).
//
// No contiene datos, métricas ni funcionalidad: solo indica dónde está el
// usuario y qué puede hacer hoy. La reutilizan el shell de Empleado (PRD
// §21) y el de RH (PRD §20), por lo que el texto es neutral respecto al rol:
// no nombra vistas que solo existan en uno de los dos.

import EstadoVacio from '../componentes/EstadoVacio.jsx'

export default function SeccionTemporal({ titulo }) {
  return (
    <EstadoVacio
      titulo={`«${titulo}» todavía no está disponible`}
      descripcion="Esta sección se implementará en una etapa posterior del sistema."
    />
  )
}
