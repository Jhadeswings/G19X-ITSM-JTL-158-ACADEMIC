// AIRecommendation (Style Guide §17.2/§3.6).
//
// La recomendación se presenta EXPLÍCITAMENTE como sugerencia: bloque
// visualmente secundario (fondo suave, texto de apoyo), separado de los
// datos calculados, con procedencia visible y descargo: no es
// diagnóstico, ranking ni juicio, y no modifica el resultado oficial.
// El contenido llega del backend; el frontend no genera ni persiste nada.
//
// Si el backend envía `recomendacion_ia: null` (IA no disponible), el
// bloque muestra un estado controlado de "no disponible" en lugar de
// desaparecer o convertir la vista en error: el resultado oficial del
// sistema se muestra con normalidad y no depende de la IA.

import { Sparkles } from 'lucide-react'

export default function AIRecommendation({ recomendacion }) {
  if (!recomendacion) {
    return (
      <aside className="ia" aria-label="Recomendación de desarrollo no disponible">
        <h3 className="ia__titulo">Recomendación no disponible</h3>
        <p className="ia__texto">
          La sugerencia con IA no está disponible en este momento. Tu
          resultado oficial calculado por el sistema no depende de ella y
          se muestra con normalidad.
        </p>
      </aside>
    )
  }
  return (
    <aside className="ia" aria-label="Recomendación de desarrollo generada por IA">
      <div className="ia__label"><Sparkles aria-hidden="true" /> Sugerencia de apoyo</div>
      <h3 className="ia__titulo">Una idea para el desarrollo</h3>
      <p className="ia__texto">{recomendacion.recommendation}</p>
      {recomendacion.actions?.length > 0 && (
        <ul className="ia__acciones">
          {recomendacion.actions.map((accion) => (
            <li key={accion}>{accion}</li>
          ))}
        </ul>
      )}
      <p className="ia__nota">
        Generada con IA ({recomendacion.proveedor}) a partir de los
        indicadores estructurados del sistema. Es una sugerencia: no
        determina tus niveles ni modifica tu resultado oficial.
      </p>
    </aside>
  )
}
