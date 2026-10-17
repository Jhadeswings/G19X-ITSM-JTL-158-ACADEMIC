// Vista "Mi progreso" (PRD §21.2, Style Guide §26) — rediseño visual
// Fase 2 (boceto «Mi progreso» del panel del empleado).
//
// Jerarquía EXACTA del Style Guide (§26), sin cambios:
//   1. ¿Cómo voy?  2. Competencias  3. ¿Cómo se obtienen?
//   4. Fortalezas  5. Oportunidades  6. Recomendación (IA, secundaria)
//   7. Transparencia de datos
//
// Zonas de ancho completo (misma técnica que Inicio): franjas continuas
// separadas por cambios de fondo —verde petróleo, blanco, degradado suave,
// blanco y verde petróleo— sin bordes de tarjeta. El acordeón de
// competencias y el desplegable «¿Cómo se obtienen?» replican la
// referencia: cabecera como `<button>` nativo con `aria-expanded` /
// `aria-controls` (operable con teclado); el cuerpo se oculta SOLO con
// CSS, de modo que los datos del backend siguen siempre en el DOM.
//
// TODO el contenido de negocio llega calculado por el backend
// (ResultadoActual + sugerencia IA). Esta vista no calcula niveles,
// promedios, fortalezas ni oportunidades, y no persiste nada. Los
// indicadores contextuales del encabezado (antigüedad, proyectos únicos)
// muestran SOLO lo que envía `experiencia`; si un valor no viene, su
// indicador no se renderiza (nunca se inventa un dato).

import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ChevronDown, Compass } from 'lucide-react'
import { obtenerProgreso } from '../api/progreso.js'
import { COMO_SE_OBTIENEN, NOMBRES_COMPETENCIAS } from '../textos.js'
import AIRecommendation from '../componentes/AIRecommendation.jsx'
import CompetenciaCard from '../componentes/CompetenciaCard.jsx'
import ContextualNetwork from '../componentes/ContextualNetwork.jsx'
import { Fortalezas, Oportunidades } from '../componentes/Categorias.jsx'
import DataTransparencyPanel from '../componentes/DataTransparencyPanel.jsx'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'

export default function MiProgreso({ token, alSesionExpirada }) {
  const [fase, setFase] = useState('cargando')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  // «¿Cómo se obtienen?» es una fila interactiva CERRADA por defecto
  // (referencia `.como`): se despliega con su chevron o al llegar por un
  // enlace `#como-se-obtienen` de las tarjetas — el anclaje nunca lleva
  // a un destino invisible.
  const [criteriosVisibles, setCriteriosVisibles] = useState(false)

  const abrirCriterios = useCallback(() => setCriteriosVisibles(true), [])

  // Sincronía con el hash: entrada directa por URL o navegación interna.
  useEffect(() => {
    const sincronizarConHash = () => {
      if (window.location.hash === '#como-se-obtienen') abrirCriterios()
    }
    sincronizarConHash()
    window.addEventListener('hashchange', sincronizarConHash)
    return () => window.removeEventListener('hashchange', sincronizarConHash)
  }, [abrirCriterios])

  const cargar = useCallback(() => {
    setFase('cargando')
    setError(null)
    obtenerProgreso(token)
      .then((respuesta) => {
        setDatos(respuesta)
        setFase('listo')
      })
      .catch((e) => {
        if (e?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setError(e)
        setFase('error')
      })
  }, [token, alSesionExpirada])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (fase === 'cargando') return <EstadoCarga />
  if (fase === 'error') {
    return (
      <EstadoError
        titulo="No pudimos cargar tu progreso"
        mensaje={error?.message}
        onReintentar={cargar}
      />
    )
  }

  const { resultado_actual: actual, recomendacion_ia: ia } = datos
  const { experiencia } = actual

  // Niveles oficiales por clave para las filas de fortalezas y
  // oportunidades: pura LECTURA del contrato — ninguna regla se calcula
  // en el cliente (§17.4).
  const nivelesPorClave = Object.fromEntries(
    actual.competencias.map((competencia) => [
      competencia.clave,
      { nivel: competencia.nivel, etiqueta: competencia.etiqueta },
    ]),
  )

  // Indicadores contextuales del encabezado: se muestran SOLO si el
  // contrato trae el dato. La experiencia nunca modifica competencias.
  const antiguedadDisponible =
    experiencia.anios_antiguedad !== null &&
    experiencia.anios_antiguedad !== undefined
  const proyectosDisponibles =
    experiencia.proyectos_unicos !== null &&
    experiencia.proyectos_unicos !== undefined

  return (
    <div className="growth-experience">
      {/* 1. Encabezado «¿Cómo voy?» (franja verde petróleo) — título,
          resultado actual y los indicadores contextuales reales del
          contrato. Sin cálculos ni datos de ejemplo. La red de ondas y
          nodos (referencia `hero`) es DECORATIVA: ContextualNetwork en
          modo `decorativa` (aria-hidden), sin anuncio para lectores de
          pantalla porque el encabezado ya se describe a sí mismo. */}
      <header id="como-voy" className="growth-hero" aria-labelledby="t-como-voy">
        <div className="growth-hero__copy">
          <p className="growth-hero__eyebrow">Tu espacio de crecimiento</p>
          <h2 id="t-como-voy">¿Cómo voy?</h2>
          <p className="growth-hero__intro">
            Este es tu resultado actual: cinco competencias calculadas por el
            sistema a partir de tus participaciones y capacitaciones
            registradas.
          </p>
          {(antiguedadDisponible || proyectosDisponibles) && (
            <div className="growth-hero__stats">
              {antiguedadDisponible && (
                <div className="growth-hero__stat">
                  <small>Antigüedad</small>
                  <b>{experiencia.anios_antiguedad} años</b>
                </div>
              )}
              {proyectosDisponibles && (
                <div className="growth-hero__stat">
                  <small>Proyectos únicos</small>
                  <b>{experiencia.proyectos_unicos}</b>
                </div>
              )}
            </div>
          )}
          <p className="growth-hero__nota">
            <Compass aria-hidden="true" />
            La experiencia es información contextual: no modifica tus
            competencias.
          </p>
        </div>
        <a className="growth-hero__ancla" href="#competencias">
          Explorar competencias <ArrowDown aria-hidden="true" />
        </a>
        <ContextualNetwork className="growth-hero__red" decorativa />
      </header>

      {/* 2. Competencias (franja blanca) — acordeón con la evidencia
          plegable por competencia; la primera fila empieza abierta. */}
      <section
        id="competencias"
        className="growth-zone growth-zone--light"
        aria-labelledby="t-competencias"
      >
        <div className="growth-section__heading">
          <div>
            <p className="eyebrow">Resultado actual</p>
            <h2 id="t-competencias">Competencias</h2>
          </div>
          <p>Cinco lecturas comparables. Cada una conserva su contexto y evidencia.</p>
        </div>
        <div className="acordeon">
          {actual.competencias.map((competencia, indice) => (
            <CompetenciaCard
              key={competencia.clave}
              competencia={competencia}
              indice={indice + 1}
              abiertoPorDefecto={indice === 0}
              alAbrirCriterios={abrirCriterios}
            />
          ))}
        </div>

        {/* 3. «¿Cómo se obtienen?» — desplegable con la MISMA lista dl/dt/dd
            de siempre; el contenido NO se calcula ni cambia al plegar. */}
        <div
          id="como-se-obtienen"
          className="growth-criterios"
          aria-labelledby="t-como-se-obtienen"
        >
          <div className="growth-criterios__head">
            <h2 id="t-como-se-obtienen">¿Cómo se obtienen?</h2>
            <button
              type="button"
              className="growth-criterios__toggle"
              aria-expanded={criteriosVisibles}
              aria-controls="growth-criterios-lista"
              onClick={() => setCriteriosVisibles((valor) => !valor)}
            >
              <span className="visualmente-oculto">
                Mostrar u ocultar cómo se obtienen las competencias
              </span>
              <ChevronDown aria-hidden="true" />
            </button>
          </div>
          <dl
            id="growth-criterios-lista"
            className={`como-se-obtienen${
              criteriosVisibles ? ' como-se-obtienen--abierto' : ''
            }`}
          >
            {actual.competencias.map((competencia) => (
              <div key={competencia.clave} className="como-se-obtienen__fila">
                <dt>{NOMBRES_COMPETENCIAS[competencia.clave] || competencia.clave}</dt>
                <dd>{COMO_SE_OBTIENEN[competencia.clave] || ''}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 4+5. Fortalezas y Oportunidades (franja degradada) — DOS
          columnas, con separación clara entre ambas categorías. Cada fila
          muestra el nombre y, a la derecha, el nivel y etiqueta OFICIALES
          del contrato. La MISMA franja suave continúa bajo la
          recomendación (referencia v6): sin franja blanca intermedia. */}
      <div className="growth-zone growth-zone--soft">
        <div className="growth-duo">
          <section id="fortalezas" aria-labelledby="t-fortalezas">
            <h2 id="t-fortalezas">Fortalezas</h2>
            <p className="seccion__intro">
              Competencias con nivel 4 o 5, calculadas por reglas del sistema.
            </p>
            <Fortalezas claves={actual.fortalezas} niveles={nivelesPorClave} />
          </section>
          <section id="oportunidades" aria-labelledby="t-oportunidades">
            <h2 id="t-oportunidades">Oportunidades de desarrollo</h2>
            <p className="seccion__intro">
              Competencias en nivel 1 o 2, calculadas por reglas del sistema.
            </p>
            <Oportunidades
              claves={actual.oportunidades}
              niveles={nivelesPorClave}
            />
          </section>
        </div>

        {/* 6. Recomendación IA — bloque secundario sobre la franja suave,
            en panel claro que lo diferencia del resultado oficial. */}
        <section
          id="recomendacion"
          className="growth-recomendacion"
          aria-labelledby="t-recomendacion"
        >
          <h2 id="t-recomendacion">Recomendación de desarrollo</h2>
          <AIRecommendation recomendacion={ia} />
        </section>
      </div>

      {/* 7. Transparencia de datos (franja verde petróleo) */}
      <section
        id="transparencia"
        className="growth-zone growth-zone--deep"
        aria-labelledby="t-transparencia"
      >
        <h2 id="t-transparencia">Transparencia de datos</h2>
        <DataTransparencyPanel />
      </section>
    </div>
  )
}
