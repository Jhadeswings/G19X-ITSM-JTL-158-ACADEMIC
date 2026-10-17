// CompetenciaCard (Style Guide §15.1/§15.3) — fila de ACORDEÓN del rediseño
// visual de "Mi progreso" (Fase 2, boceto «Mi progreso»).
//
// Muestra el nivel EXACTO que envía el backend: nombre, nivel numérico,
// etiqueta textual y evidencia breve. "Datos insuficientes" se presenta
// de forma neutra (sin rojo) y sin convertir DI en 0. Cero cálculos.
//
// Numeración (referencia `.bd`): el círculo de la izquierda es la POSICIÓN
// de la competencia en el contrato (1–5, también con DI) — NO su nivel.
// El nivel oficial se muestra aparte, alineado a la derecha, seguido de
// su etiqueta textual.
//
// Accesibilidad: la cabecera es un `<button>` nativo (operable con teclado
// sin JS adicional) con `aria-expanded` y `aria-controls` hacia el cuerpo.
// El cuerpo se oculta SOLO con CSS (`display:none`): los datos del backend
// siguen en el DOM aunque la fila esté plegada. La primera fila se abre
// por defecto desde la vista; aquí se comporta plegada salvo que se pida
// lo contrario.
//
// Evidencia (solo presentación): los valores se muestran tal cual llegan
// en `competencia.evidencia` con las etiquetas de `ETIQUETAS_EVIDENCIA`.
// El orden es determinista por competencia y NO depende del orden de
// inserción del objeto del backend: principal → secundario → excluido.

import { useId, useState } from 'react'
import { ArrowUpRight, ChevronDown, CircleHelp } from 'lucide-react'
import { NOMBRES_COMPETENCIAS, ETIQUETAS_EVIDENCIA } from '../textos.js'
import { entradasOrdenadas } from './evidenciaCompetencias.js'

const DI = 'INSUFFICIENT_DATA'

/** Escala oficial de niveles del contrato (CompetencyEngine): 1–5. */
const NIVEL_MAXIMO = 5

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

/** Pips del nivel: 5 barritas, las `nivel` primeras rellenas. Es SOLO
 * presentación del nivel que ya trae el backend (decorativo, oculto para
 * lectores de pantalla: el nivel textual siempre acompaña). El color del
 * relleno sigue la lectura del boceto según la etiqueta oficial del
 * nivel: 1 Inicial y 2 En desarrollo → terracota; 3 En crecimiento →
 * verde medio; 4 Consolidado y 5 Alto → verde oscuro. */
function PipsNivel({ nivel }) {
  return (
    <span
      className={`acordeon__pips${nivel ? ` acordeon__pips--n${nivel}` : ''}`}
      aria-hidden="true"
    >
      {Array.from({ length: NIVEL_MAXIMO }, (_, i) => (
        <i key={i} className={`acordeon__pip${i < nivel ? ' acordeon__pip--llena' : ''}`} />
      ))}
    </span>
  )
}

export default function CompetenciaCard({
  competencia,
  indice = 1,
  abiertoPorDefecto = false,
  alAbrirCriterios,
}) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto)
  const idCuerpo = useId()
  const nombre = NOMBRES_COMPETENCIAS[competencia.clave] || competencia.clave
  const sinDatos = competencia.estado === DI

  return (
    <article
      className={`acordeon__item${sinDatos ? ' acordeon__item--di' : ''}`}
      aria-label={`${nombre}${
        sinDatos
          ? ': datos insuficientes'
          : `: nivel ${competencia.nivel}, ${competencia.etiqueta}`
      }`}
    >
      <button
        type="button"
        className="acordeon__ah"
        aria-expanded={abierto}
        aria-controls={idCuerpo}
        onClick={() => setAbierto((valor) => !valor)}
      >
        <span className="competencia__index" aria-hidden="true">{indice}</span>
        <span className="acordeon__nombre">{nombre}</span>
        {/* Medidor (pips + nivel + etiqueta): `display:contents` en
            escritorio lo reparte en columnas propias del grid del botón;
            en móvil se apila (progreso.css). DI conserva los huecos para
            no romper la grilla y jamás muestra nivel 0. */}
        <span className="acordeon__medidor">
          {sinDatos ? (
            <>
              <span className="acordeon__pips" aria-hidden="true" />
              <span className="acordeon__nu" aria-hidden="true" />
              <span className="competencia__nivel competencia__nivel--di">
                — Datos insuficientes
              </span>
            </>
          ) : (
            <>
              <PipsNivel nivel={competencia.nivel} />
              <span className="acordeon__nu" aria-hidden="true">
                {competencia.nivel}
              </span>
              <span className="competencia__nivel competencia__etiqueta">
                {competencia.etiqueta}
              </span>
            </>
          )}
        </span>
        <ChevronDown className="acordeon__flecha" aria-hidden="true" />
      </button>
      <div
        id={idCuerpo}
        className={`acordeon__cuerpo${abierto ? ' acordeon__cuerpo--abierto' : ''}`}
      >
        {sinDatos && (
          <p className="competencia__ayuda">
            Aún no hay suficiente evidencia registrada para calcular este indicador.
          </p>
        )}
        <div className="competencia__evidence">
          <span>Evidencia</span>
          <ResumenEvidencia
            claveCompetencia={competencia.clave}
            evidencia={competencia.evidencia}
          />
        </div>
        <a
          className="competencia__como"
          href="#como-se-obtienen"
          onClick={() => alAbrirCriterios?.()}
        >
          <CircleHelp aria-hidden="true" /> ¿Cómo se obtiene?{' '}
          <ArrowUpRight aria-hidden="true" />
        </a>
      </div>
    </article>
  )
}
