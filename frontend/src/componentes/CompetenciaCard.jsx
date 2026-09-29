// CompetencyCard / InsufficientDataCard (Style Guide §15.1/§15.3).
//
// Muestra el nivel EXACTO que envía el backend: nombre, nivel numérico,
// etiqueta textual y evidencia breve. "Datos insuficientes" se presenta
// de forma neutra (sin rojo) y sin convertir DI en 0. Cero cálculos.
//
// Evidencia (solo presentación): los valores se muestran tal cual llegan
// en `competencia.evidencia` con las etiquetas de `ETIQUETAS_EVIDENCIA`.
// El orden es determinista por competencia y NO depende del orden de
// inserción del objeto del backend: principal → secundario → excluido.

import { ArrowUpRight, CircleHelp } from 'lucide-react'
import { NOMBRES_COMPETENCIAS, ETIQUETAS_EVIDENCIA } from '../textos.js'
import { entradasOrdenadas } from './evidenciaCompetencias.js'

const DI = 'INSUFFICIENT_DATA'

/** Evidencia organizada: datos independientes etiqueta → valor destacado.
 *
 * Cada dato es su propio `div` dentro del `<dl>`: nunca se concatenan con
 * `·`. Los valores se muestran tal cual (`0` sigue siendo `0`); solo se
 * ordenan y se subordinan visualmente por grupo. Sin cálculos ni campos
 * nuevos. */
function ResumenEvidencia({ claveCompetencia, evidencia }) {
  const entradas = entradasOrdenadas(claveCompetencia, evidencia)
  if (entradas.length === 0) return null
  const vistos = new Set()
  return (
    <dl className="competencia__evidencia">
      {entradas.map(({ clave, valor, jerarquia }) => {
        const inicioGrupo = !vistos.has(jerarquia)
        vistos.add(jerarquia)
        return (
          <div
            key={clave}
            className={
              `competencia__dato competencia__dato--${jerarquia}` +
              (inicioGrupo && jerarquia !== 'principal'
                ? ' competencia__dato--inicio-grupo'
                : '')
            }
          >
            <dt>{ETIQUETAS_EVIDENCIA[clave]}</dt>
            <dd>{valor}</dd>
          </div>
        )
      })}
    </dl>
  )
}

export default function CompetenciaCard({ competencia }) {
  const nombre = NOMBRES_COMPETENCIAS[competencia.clave] || competencia.clave
  const sinDatos = competencia.estado === DI
  // El relleno `0` es solo para niveles numéricos reales: DI nunca es 0 (§14).
  const indice =
    competencia.nivel == null ? '—' : String(competencia.nivel).padStart(2, '0')

  return (
    <article
      className={`competencia${sinDatos ? ' competencia--di' : ''}`}
      aria-label={`${nombre}${
        sinDatos
          ? ': datos insuficientes'
          : `: nivel ${competencia.nivel}, ${competencia.etiqueta}`
      }`}
    >
      <div className="competencia__heading"><span className="competencia__index" aria-hidden="true">{indice}</span><h3 className="competencia__nombre">{nombre}</h3></div>
      {sinDatos ? (
        <div className="competencia__state"><p className="competencia__nivel competencia__nivel--di">— Datos insuficientes</p><p className="competencia__ayuda">Aún no hay suficiente evidencia registrada para calcular este indicador.</p></div>
      ) : (
        <div className="competencia__reading"><p className="competencia__nivel">{competencia.nivel} · {competencia.etiqueta}</p><div className="competencia__track" aria-hidden="true"><i style={{ '--nivel': competencia.nivel }} /></div></div>
      )}
      <div className="competencia__evidence"><span>Evidencia</span><ResumenEvidencia claveCompetencia={competencia.clave} evidencia={competencia.evidencia} /></div>
      <a className="competencia__como" href="#como-se-obtienen"><CircleHelp aria-hidden="true" /> ¿Cómo se obtiene? <ArrowUpRight aria-hidden="true" /></a>
    </article>
  )
}
