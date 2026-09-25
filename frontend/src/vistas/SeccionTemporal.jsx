// Estado temporal de una sección aún no implementada (Style Guide §13.4/§28).
//
// No contiene datos, métricas ni funcionalidad: solo indica dónde está el
// usuario y qué puede hacer hoy. Las secciones se implementarán en etapas
// posteriores (PRD §21).

import EstadoVacio from '../componentes/EstadoVacio.jsx'

export default function SeccionTemporal({ titulo }) {
  return (
    <EstadoVacio
      titulo={`«${titulo}» todavía no está disponible`}
      descripcion="Esta sección se implementará en una etapa posterior del sistema. Por ahora, la única vista funcional es «Mi progreso»."
    />
  )
}
