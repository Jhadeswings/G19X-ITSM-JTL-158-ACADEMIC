// CompetencyCard / InsufficientDataCard (Style Guide §15.1/§15.3).
//
// Muestra el nivel EXACTO que envía el backend: nombre, nivel numérico,
// etiqueta textual y evidencia breve. "Datos insuficientes" se presenta
// de forma neutra (sin rojo) y sin convertir DI en 0. Cero cálculos.

import { NOMBRES_COMPETENCIAS, ETIQUETAS_EVIDENCIA } from '../textos.js'

const DI = 'INSUFFICIENT_DATA'

/** Resumen de evidencia: pares "etiqueta valor" recibidos del backend. */
function ResumenEvidencia({ evidencia }) {
  const entradas = Object.entries(evidencia || {}).filter(
    ([clave]) => clave in ETIQUETAS_EVIDENCIA,
  )
  if (entradas.length === 0) return null
  return (
    <p className="competencia__evidencia">
      {entradas
        .map(([clave, valor]) => `${ETIQUETAS_EVIDENCIA[clave]}: ${valor}`)
        .join(' · ')}
    </p>
  )
}

export default function CompetenciaCard({ competencia }) {
  const nombre = NOMBRES_COMPETENCIAS[competencia.clave] || competencia.clave
  const sinDatos = competencia.estado === DI

  return (
    <article
      className={`competencia${sinDatos ? ' competencia--di' : ''}`}
      aria-label={`${nombre}${
        sinDatos
          ? ': datos insuficientes'
          : `: nivel ${competencia.nivel}, ${competencia.etiqueta}`
      }`}
    >
      <h3 className="competencia__nombre">{nombre}</h3>
      {sinDatos ? (
        <>
          <p className="competencia__nivel competencia__nivel--di">
            — Datos insuficientes
          </p>
          <p className="competencia__ayuda">
            Aún no hay suficiente evidencia registrada para calcular este
            indicador.
          </p>
        </>
      ) : (
        <p className="competencia__nivel">
          {competencia.nivel} · {competencia.etiqueta}
        </p>
      )}
      <ResumenEvidencia evidencia={competencia.evidencia} />
      <a className="competencia__como" href="#como-se-obtienen">
        ¿Cómo se obtiene? →
      </a>
    </article>
  )
}
