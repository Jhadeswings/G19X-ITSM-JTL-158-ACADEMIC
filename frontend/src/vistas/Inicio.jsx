// Vista "Inicio" del Empleado (PRD §21.1).
//
// Esta etapa es ESTRUCTURA Y COMPOSICIÓN: la vista existe, tiene su jerarquía
// de bloques y se integra en la navegación, pero NO calcula nada.
//
// Orden de composición (el que pide el PRD §21.1):
//   1. Encabezado de sección (SectionHeader).
//   2. Bloque de progreso / estado actual.
//   3. Bloque de proyectos.
//   4. Resumen de competencias.
//   5. Espacio RESERVADO para "Próximo paso" (sin lógica ni texto dinámico).
//   6. Espacio de recomendación IA (desacoplado, sin llamadas nuevas).
//
// Reglas que esta vista respeta (Style Guide §3.6, §15.3; PRD §17.4):
// - No calcula niveles, promedios, fortalezas ni oportunidades: solo presenta
//   lo que envía el backend (`obtenerResultadoActual`).
// - No convierte "datos insuficientes" en 0: `INSUFFICIENT_DATA` se muestra
//   tal cual, con `nivel` nulo.
// - No convierte la experiencia en una sexta competencia: es contexto.
// - No usa `resolvio_problema` como evidencia de competencia.
// - No muestra 9-Box, ranking, score global ni comparación organizacional.
//
// "Próximo paso" es un ESPACIO RESERVADO: no se define aquí su lógica, su
// origen de datos ni su texto dinámico. Solo se marca el lugar que ocupará
// cuando exista su contrato; implementarlo es un bloque posterior.

import { useCallback, useEffect, useState } from 'react'
import { Compass, FolderKanban, Target } from 'lucide-react'
import { obtenerResultadoActual } from '../api/resultado.js'
import { NOMBRES_COMPETENCIAS } from '../textos.js'
import AIRecommendation from '../componentes/AIRecommendation.jsx'
import CompetenciaCard from '../componentes/CompetenciaCard.jsx'
import { Fortalezas } from '../componentes/Categorias.jsx'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import MetricCard from '../componentes/MetricCard.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'

const DI = 'INSUFFICIENT_DATA'

export default function Inicio({ token, alSesionExpirada, onIrAProgreso, onIrAProyectos }) {
  const [fase, setFase] = useState('cargando')
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(() => {
    setFase('cargando')
    setError(null)
    obtenerResultadoActual(token)
      .then((respuesta) => {
        setResultado(respuesta)
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

  if (fase === 'cargando') return <EstadoCarga texto="Cargando tu inicio…" />
  if (fase === 'error') {
    return (
      <EstadoError
        titulo="No pudimos cargar tu inicio"
        mensaje={error?.message}
        onReintentar={cargar}
      />
    )
  }

  const { competencias, experiencia, fortalezas } = resultado
  const conNivel = competencias.filter((competencia) => competencia.estado !== DI)

  return (
    <div className="inicio-empleado">
      {/* 1. Encabezado de sección */}
      <SectionHeader
        eyebrow="Resumen"
        title="Inicio"
        description="Una lectura breve de tu progreso, tus proyectos y tus competencias."
      />

      {/* 2. Bloque de progreso / estado actual */}
      <section className="inicio-bloque" aria-labelledby="inicio-progreso">
        <h2 id="inicio-progreso">Progreso</h2>
        <p className="seccion__intro">
          Estos valores los calcula el sistema a partir de tu evidencia
          registrada. Aquí solo se presentan.
        </p>
        <div className="inicio-metricas">
          <MetricCard
            label="Competencias con evidencia"
            description="De las cinco competencias, estas tienen evidencia suficiente para mostrar un nivel."
          >
            {conNivel.length > 0 ? (
              <ul className="inicio-lista">
                {conNivel.map((competencia) => (
                  <li key={competencia.clave}>
                    {NOMBRES_COMPETENCIAS[competencia.clave] || competencia.clave}
                  </li>
                ))}
              </ul>
            ) : (
              <EstadoVacio
                titulo="Aún no hay evidencia suficiente"
                descripcion="Cuando registres participaciones o capacitaciones, aquí verás el progreso de tus competencias."
              />
            )}
          </MetricCard>

          <MetricCard
            label="Experiencia"
            icon={Compass}
            description="Información contextual: no es una competencia y no modifica tus niveles."
          >
            <p className="contexto__texto">
              Proyectos únicos registrados: {experiencia.proyectos_unicos}.
            </p>
          </MetricCard>

          <MetricCard
            label="Fortalezas"
            description="Capacidades que ya puedes consolidar, según las reglas del sistema."
          >
            <Fortalezas claves={fortalezas} />
          </MetricCard>
        </div>
      </section>

      {/* 3. Bloque de proyectos */}
      <section className="inicio-bloque" aria-labelledby="inicio-proyectos">
        <h2 id="inicio-proyectos">Proyectos</h2>
        <p className="seccion__intro">
          Tus proyectos y participaciones se administran desde su propia sección.
        </p>
        <EstadoVacio
          titulo="Tus proyectos viven en «Mis proyectos»"
          descripcion="Desde esa sección puedes consultar los proyectos del catálogo y registrar tus participaciones."
        />
        {onIrAProyectos && (
          <button type="button" className="boton boton--primario" onClick={onIrAProyectos}>
            <FolderKanban aria-hidden="true" /> Ir a Mis proyectos
          </button>
        )}
      </section>

      {/* 4. Resumen de competencias */}
      <section className="inicio-bloque" aria-labelledby="inicio-competencias">
        <h2 id="inicio-competencias">Resumen de competencias</h2>
        <p className="seccion__intro">
          Las cinco competencias con su nivel y su evidencia. Las que no tienen
          datos suficientes se muestran como tales, nunca como cero.
        </p>
        <div className="competencias">
          {competencias.map((competencia) => (
            <CompetenciaCard key={competencia.clave} competencia={competencia} />
          ))}
        </div>
        {onIrAProgreso && (
          <button type="button" className="boton boton--primario" onClick={onIrAProgreso}>
            Ver el detalle en Mi progreso
          </button>
        )}
      </section>

      {/* 5. ESPACIO RESERVADO para "Próximo paso" (PRD §21.1): sin lógica, sin
          datos y sin texto dinámico. Su contenido se definirá después. */}
      <section className="inicio-bloque inicio-bloque--reservado" aria-labelledby="inicio-proximo-paso">
        <h2 id="inicio-proximo-paso">Próximo paso</h2>
        <EstadoVacio
          titulo="Este espacio está reservado"
          descripcion="Aquí se mostrará tu próximo paso cuando su lógica esté definida."
        />
      </section>

      {/* 6. Espacio de recomendación IA DESACOPLADO: se reutiliza
          `AIRecommendation` en su estado controlado (sin sugerencia) para
          separar visualmente el bloque de IA del dato oficial. Esta vista NO
          llama a ningún proveedor: la sugerencia vive en «Mi progreso». */}
      <section className="inicio-bloque" aria-labelledby="inicio-recomendacion">
        <h2 id="inicio-recomendacion">
          <Target aria-hidden="true" /> Recomendación de desarrollo
        </h2>
        <AIRecommendation recomendacion={null} />
      </section>
    </div>
  )
}
