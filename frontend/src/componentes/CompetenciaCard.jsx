// CompetencyCard / InsufficientDataCard (Style Guide §15.1/§15.3).
//
// Muestra el nivel EXACTO que envía el backend: nombre, nivel numérico,
// etiqueta textual y evidencia breve. "Datos insuficientes" se presenta
// de forma neutra (sin rojo) y sin convertir DI en 0. Cero cálculos.

import { ArrowUpRight, CircleHelp } from 'lucide-react'
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
      <div className="competencia__heading"><span className="competencia__index" aria-hidden="true">{String(competencia.nivel || '—').padStart(2, '0')}</span><h3 className="competencia__nombre">{nombre}</h3></div>
      {sinDatos ? (
        <div className="competencia__state"><p className="competencia__nivel competencia__nivel--di">— Datos insuficientes</p><p className="competencia__ayuda">Aún no hay suficiente evidencia registrada para calcular este indicador.</p></div>
      ) : (
        <div className="competencia__reading"><p className="competencia__nivel">{competencia.nivel} · {competencia.etiqueta}</p><div className="competencia__track" aria-hidden="true"><i style={{ '--nivel': competencia.nivel }} /></div></div>
      )}
      <div className="competencia__evidence"><span>Evidencia</span><ResumenEvidencia evidencia={competencia.evidencia} /></div>
      <a className="competencia__como" href="#como-se-obtienen"><CircleHelp aria-hidden="true" /> ¿Cómo se obtiene? <ArrowUpRight aria-hidden="true" /></a>
    </article>
  )
}
