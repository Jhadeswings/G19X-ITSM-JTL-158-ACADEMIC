// Vista "Mi progreso" (PRD §21.2, Style Guide §26).
//
// Jerarquía EXACTA del Style Guide:
//   1. ¿Cómo voy?  2. Competencias  3. ¿Cómo se obtienen?
//   4. Fortalezas  5. Oportunidades  6. Recomendación (IA, secundaria)
//   7. Transparencia de datos
//
// TODO el contenido de negocio llega calculado por el backend
// (ResultadoActual + sugerencia IA). Esta vista no calcula niveles,
// promedios, fortalezas ni oportunidades, y no persiste nada.

import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, Compass } from 'lucide-react'
import { obtenerProgreso } from '../api/progreso.js'
import { COMO_SE_OBTIENEN, NOMBRES_COMPETENCIAS } from '../textos.js'
import AIRecommendation from '../componentes/AIRecommendation.jsx'
import CompetenciaCard from '../componentes/CompetenciaCard.jsx'
import { Fortalezas, Oportunidades } from '../componentes/Categorias.jsx'
import DataTransparencyPanel from '../componentes/DataTransparencyPanel.jsx'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'

export default function MiProgreso({ token, alSesionExpirada }) {
  const [fase, setFase] = useState('cargando')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

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

  return (
    <div className="growth-experience">
      <div className="growth-intro">
        <p className="eyebrow eyebrow--accent">Tu espacio de crecimiento</p>
        <p>Una lectura clara de tu desarrollo, basada en evidencia y explicada con transparencia.</p>
        <a href="#competencias">Explorar competencias <ArrowDown aria-hidden="true" /></a>
      </div>
      <section id="como-voy" className="growth-current" aria-labelledby="t-como-voy">
        <h2 id="t-como-voy">¿Cómo voy?</h2>
        <p className="seccion__intro">
          Este es tu resultado actual: cinco competencias calculadas por el
          sistema a partir de tus participaciones y capacitaciones
          registradas.
        </p>
        <div className="growth-current__context">
          <div className="growth-current__label"><Compass aria-hidden="true" /> Experiencia · información contextual</div>
          <p className="contexto__titulo">Tu experiencia (información contextual)</p>
          <p className="contexto__texto">
            {experiencia.anios_antiguedad !== null &&
              experiencia.anios_antiguedad !== undefined &&
              `Antigüedad: ${experiencia.anios_antiguedad} años. `}
            Proyectos únicos: {experiencia.proyectos_unicos}.
          </p>
          <p className="contexto__nota">
            La experiencia es información contextual: no modifica tus
            competencias.
          </p>
        </div>
      </section>

      {/* 2. Competencias */}
      <section id="competencias" className="growth-section" aria-labelledby="t-competencias">
        <div className="growth-section__heading"><div><p className="eyebrow">Resultado actual</p><h2 id="t-competencias">Competencias</h2></div><p>Cinco lecturas comparables. Cada una conserva su contexto y evidencia.</p></div>
        <div className="competencias">
          {actual.competencias.map((competencia) => (
            <CompetenciaCard key={competencia.clave} competencia={competencia} />
          ))}
        </div>
      </section>

      {/* 3. ¿Cómo se obtienen? */}
      <section
        id="como-se-obtienen"
        className="growth-section growth-section--criteria"
        aria-labelledby="t-como-se-obtienen"
      >
        <h2 id="t-como-se-obtienen">¿Cómo se obtienen?</h2>
        <dl className="como-se-obtienen">
          {actual.competencias.map((competencia) => (
            <div key={competencia.clave} className="como-se-obtienen__fila">
              <dt>{NOMBRES_COMPETENCIAS[competencia.clave] || competencia.clave}</dt>
              <dd>{COMO_SE_OBTIENEN[competencia.clave] || ''}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 4. Fortalezas */}
      <section id="fortalezas" className="growth-section" aria-labelledby="t-fortalezas">
        <h2 id="t-fortalezas">Fortalezas</h2>
        <p className="seccion__intro">
          Competencias con nivel 4 o 5, calculadas por reglas del sistema.
        </p>
        <Fortalezas claves={actual.fortalezas} />
      </section>

      {/* 5. Oportunidades */}
      <section id="oportunidades" className="growth-section" aria-labelledby="t-oportunidades">
        <h2 id="t-oportunidades">Oportunidades de desarrollo</h2>
        <p className="seccion__intro">
          Competencias en nivel 1 o 2, calculadas por reglas del sistema.
        </p>
        <Oportunidades claves={actual.oportunidades} />
      </section>

      {/* 6. Recomendación IA — bloque secundario, separado del dato */}
      <section id="recomendacion" className="growth-section growth-section--ia" aria-labelledby="t-recomendacion">
        <h2 id="t-recomendacion">Recomendación de desarrollo</h2>
        <AIRecommendation recomendacion={ia} />
      </section>

      {/* 7. Transparencia de datos */}
      <section id="transparencia" className="growth-section" aria-labelledby="t-transparencia">
        <h2 id="t-transparencia">Transparencia de datos</h2>
        <DataTransparencyPanel />
      </section>
    </div>
  )
}
