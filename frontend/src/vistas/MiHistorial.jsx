// Sección Empleado → Mi historial (PRD §21.5; Especificación Técnica §21–§24,
// §31; Style Guide §19 Timeline/Evolución, §26, §33).
//
// Rediseño visual Fase 1: composición de ZONAS del boceto
// panel_empleado_v6_zonas(1).html — encabezado sobre el fondo general, zona
// blanca continua (Evolución + Evaluaciones por periodo, con separador fino)
// y zona gris verdosa (Historial de mis participaciones). Solo cambia la
// PRESENTACIÓN; los datos y las reglas de la vista no cambian.
//
// Esta pantalla es de SOLO LECTURA. Las evaluaciones oficiales históricas son
// snapshots inmutables capturados cuando RH genera el periodo (§24, con trigger
// en base de datos): la vista NO las recalcula, NO las edita y NO las borra.
// El contrato `/me/evaluations` es de solo lectura, así que aquí no existe ni un
// botón de acción sobre ellas.
//
// Qué se muestra (y qué NO):
//   - El periodo y la fecha de generación, tal como vienen en el snapshot;
//   - las cinco competencias históricas con su nivel y estado;
//   - NUNCA ejes ni 9-Box: son exclusivos de RH (PRD §10) y el DTO del Empleado
//     ni siquiera los trae, así que no se piden, no se derivan y no se inventan.
//
// La "evolución" es una Timeline (Style Guide §19) que muestra el nivel/estado
// histórico REAL de UNA competencia a la vez, con selector en pestañas de texto
// (PRD §21.5 y Style Guide §19/§26). NO es una gráfica matemática: no hay eje
// de valores, ni delta, ni porcentaje de cambio, ni tendencia, ni flechas, ni
// promedio histórico, ni score acumulado, ni ranking. Cada punto de la Timeline
// ES un dato del snapshot; la Timeline solo los ordena visualmente.
//
// Los segmentos de nivel (pips) son representación VISUAL del `nivel` que ya
// trae el snapshot (cinco segmentos coloreados por rango, estilo boceto v6):
// nunca rellenan un dato ausente. `INSUFFICIENT_DATA` se muestra con línea
// discontinua y el texto `Datos insuficientes`, y NUNCA como nivel 0 ni como
// otra etiqueta (PRD §5, §14).
//
// El nivel se presenta con la etiqueta oficial del PRD §5 (1 Inicial, 2 En
// desarrollo, 3 En crecimiento, 4 Consolidado, 5 Alto). Es un diccionario de
// PRESENTACIÓN sobre un dato que ya viene del backend (`nivel`), no un cálculo:
// aquí no se deriva ningún nivel.
//
// El orden es el que devuelve el backend (periodo DESC): no se reordena en el
// cliente, ni para el historial ni para la evolución.
//
// Autorización: el frontend no decide permisos; un 401 delega en
// `alSesionExpirada` (ET §31/§32, patrón de las demás vistas de Empleado).

import { useCallback, useEffect, useState } from 'react'
import {
  POR_PAGINA_DEFECTO,
  listarEvaluacionesPropias,
} from '../api/evaluaciones.js'
import CorreccionesParticipaciones from '../componentes/CorreccionesParticipaciones.jsx'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import Pagination from '../componentes/ui/Pagination.jsx'
import { NOMBRES_COMPETENCIAS } from '../textos.js'

/** Estado del snapshot de una competencia (contrato `status`). */
const INSUFICIENTE = 'INSUFFICIENT_DATA'

/**
 * Etiquetas OFICIALES de nivel (PRD §5), únicas y fijas para los niveles 1–5.
 * Es un diccionario de presentación: el `nivel` ya viene calculado por el
 * backend en el snapshot. Si el backend devolviera un nivel fuera del rango,
 * se muestra el número tal cual sin inventar una etiqueta.
 */
const ETIQUETAS_NIVEL = {
  1: 'Inicial',
  2: 'En desarrollo',
  3: 'En crecimiento',
  4: 'Consolidado',
  5: 'Alto',
}

/** Texto único para el estado sin evidencia suficiente (PRD §5, §14). */
const TEXTO_DATOS_INSUFICIENTES = 'Datos insuficientes'

/** Estado inicial de la consulta: la misma forma que usan las otras vistas. */
function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

/** Nombre legible de una competencia; si el backend no la conoce, su clave. */
function nombreCompetencia(clave) {
  return NOMBRES_COMPETENCIAS[clave] || clave
}

/**
 * Presenta UNA competencia histórica tal como viene en el snapshot.
 * No calcula, no interpola y no redondea: devuelve el nivel y su etiqueta, o
 * el estado `Datos insuficientes` cuando no hay evidencia mínima.
 */
function lecturaCompetencia(competencia) {
  if (!competencia || competencia.status === INSUFICIENTE || competencia.nivel == null) {
    return { nivel: null, texto: TEXTO_DATOS_INSUFICIENTES }
  }
  return {
    nivel: competencia.nivel,
    texto: ETIQUETAS_NIVEL[competencia.nivel] || `Nivel ${competencia.nivel}`,
  }
}

/**
 * Color de los segmentos llenos según el rango del nivel oficial (boceto v6):
 * petróleo (≥4), verde azulado (3) y terracota (<3). Es presentación pura
 * sobre el `nivel` del snapshot; no convierte la ausencia de dato en color.
 */
function colorSegmento(nivel) {
  if (nivel >= 4) return '#234B4A'
  if (nivel === 3) return '#4F7F7B'
  return '#D99A7C'
}

/**
 * Cinco segmentos que REPRESENTAN el nivel real (1–5) del snapshot.
 * Decorativos (aria-hidden): la etiqueta textual del nivel es la fuente
 * accesible. Solo se pinta cuando hay nivel; nunca se rellena un nivel
 * ausente.
 */
function Segmentos({ nivel }) {
  return (
    <span className="historial-segmentos" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((posicion) => {
        const lleno = posicion <= nivel
        return (
          <span
            key={posicion}
            className={`historial-segmento${lleno ? ' historial-segmento--lleno' : ''}`}
            style={
              lleno
                ? { background: colorSegmento(nivel), animationDelay: `${posicion * 0.07}s` }
                : undefined
            }
          />
        )
      })}
    </span>
  )
}
export default function MiHistorial({ token, alSesionExpirada }) {
  const [pagina, setPagina] = useState(1)
  const [consulta, setConsulta] = useState(consultaInicial)
  // Competencia seleccionada en la evolución. Empieza en la primera que llegue
  // del snapshot; la vista inicial muestra SIEMPRE una sola competencia (§21.5).
  const [competenciaActiva, setCompetenciaActiva] = useState(null)

  const cargar = useCallback(() => {
    setConsulta(consultaInicial())
    listarEvaluacionesPropias(token, { pagina, porPagina: POR_PAGINA_DEFECTO })
      .then((datos) => {
        setConsulta({ fase: 'listo', datos, error: null })
        // Primera competencia disponible en el snapshot: si ninguna viene
        // seleccionada, se elige la del primer periodo sin alterar los datos.
        setCompetenciaActiva(
          (actual) => actual ?? datos?.items?.[0]?.competencias?.[0]?.clave ?? null,
        )
      })
      .catch((error) => {
        // 401: el backend ya decidió que la sesión no sirve (§32).
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        // Cualquier otro fallo es estado explícito con reintento: nunca se
        // convierte en "sin evaluaciones" (§13.6).
        setConsulta({ fase: 'error', datos: null, error })
      })
  }, [token, pagina, alSesionExpirada])

  useEffect(() => {
    cargar()
  }, [cargar])

  const { fase, datos } = consulta
  const items = fase === 'listo' ? datos?.items || [] : []
  const total = fase === 'listo' ? datos?.total ?? 0 : 0
  const porPagina =
    fase === 'listo' ? datos?.por_pagina ?? POR_PAGINA_DEFECTO : POR_PAGINA_DEFECTO
  const conDatos = fase === 'listo' && total > 0

  // Claves de competencia del snapshot, en el orden en que las entrega el
  // backend. Se toman del primer periodo: son las cinco del contrato.
  const clavesCompetencia = items[0]?.competencias?.map((c) => c.clave) ?? []

  return (
    <div className="mi-historial">
      {/* Zona 1 — encabezado sobre el fondo general, sin tarjeta ni banner. */}
      <SectionHeader
        eyebrow="Tu desarrollo"
        title="Mi historial"
        description="Tus evaluaciones oficiales históricas y las correcciones administrativas que RH aplicó sobre tus participaciones. Cada apartado es de solo consulta."
      />

      {fase === 'cargando' && <EstadoCarga texto="Cargando tu historial…" />}

      {fase === 'error' && (
        <EstadoError
          titulo="No pudimos cargar tu historial"
          mensaje="Ocurrió un problema al obtener tus evaluaciones históricas."
          onReintentar={cargar}
        />
      )}

      {/* Sin ninguna evaluación oficial generada todavía (total === 0). */}
      {fase === 'listo' && total === 0 && (
        <EstadoVacio
          titulo="Todavía no tienes evaluaciones oficiales."
          descripcion="Cuando RH genere tu primera evaluación del periodo, aparecerá aquí."
        />
      )}

      {/* Zona 2 — fondo blanco continuo: Evolución + Evaluaciones por periodo.
          Visible siempre que haya evaluaciones (total > 0), aunque esta página
          concreta venga sin ítems. El estado vacío se decide SOLO por
          `total === 0`: una página vacía con total > 0 significa "no estás en
          la página 1", no que no tengas historial. */}
      {conDatos && (
        <div className="historial-zona historial-zona--blanca">
          {items.length > 0 && (
            <>
              {/* Evolución: UNA competencia a la vez (PRD §21.5, §19). */}
              <section
                className="historial-evolucion"
                aria-labelledby="historial-evolucion-titulo"
              >
                <h2 className="historial-evolucion__titulo" id="historial-evolucion-titulo">
                  Evolución de una competencia
                </h2>
                <p className="historial-evolucion__nota">
                  Elige una competencia para ver cómo fue cambiando de periodo en periodo.
                </p>

                {/* Pestañas de texto: semántica de botón y aria-pressed intactos. */}
                <div
                  className="historial-tabs"
                  role="group"
                  aria-label="Elegir competencia"
                >
                  {clavesCompetencia.map((clave) => (
                    <button
                      key={clave}
                      type="button"
                      className="historial-tabs__tab"
                      aria-pressed={clave === competenciaActiva}
                      onClick={() => setCompetenciaActiva(clave)}
                    >
                      {nombreCompetencia(clave)}
                    </button>
                  ))}
                </div>

                {/* Timeline sutil (§19): un punto por evaluación, con el
                    nivel/estado real del snapshot. Sin ejes ni escalas. */}
                <ol className="historial-timeline">
                  {items.map((evaluacion) => {
                    const competencia = evaluacion.competencias?.find(
                      (item) => item.clave === competenciaActiva,
                    )
                    const lectura = lecturaCompetencia(competencia)
                    return (
                      <li key={evaluacion.id} className="historial-timeline__item">
                        <span
                          className={`historial-timeline__punto${
                            lectura.nivel === null
                              ? ''
                              : ' historial-timeline__punto--lleno'
                          }`}
                          aria-hidden="true"
                        />
                        <p className="historial-timeline__contenido">
                          <b className="historial-timeline__periodo">{evaluacion.periodo}</b>
                          {lectura.nivel === null ? (
                            <>
                              <span className="historial-linea-discontinua" aria-hidden="true" />
                              <span className="historial-n0">{TEXTO_DATOS_INSUFICIENTES}</span>
                            </>
                          ) : (
                            <>
                              <Segmentos nivel={lectura.nivel} />
                              <span className="historial-timeline__nivel">{lectura.nivel}</span>
                              <span className="historial-timeline__etiqueta">
                                {lectura.texto}
                              </span>
                            </>
                          )}
                        </p>
                      </li>
                    )
                  })}
                </ol>
              </section>

              {/* Separador fino del boceto entre los dos apartados. */}
              <hr className="historial-separador" />
            </>
          )}

          {/* Historial completo: filas planas por periodo (sin tarjetas).
              Se pinta siempre que total > 0 —aunque esta página concreta venga
              sin ítems— para conservar la paginación del backend: una página
              vacía con total > 0 no es un estado vacío (§13.6). */}
          <section
            className="historial-periodos"
            aria-labelledby="historial-periodos-titulo"
          >
            <h2 className="historial-periodos__titulo" id="historial-periodos-titulo">
              Evaluaciones por periodo
            </h2>

                {items.length > 0 && (
                  <div className="historial-periodos__lista">
                    {items.map((evaluacion) => (
                      <div key={evaluacion.id} className="historial-periodo">
                        <div className="historial-periodo__cabecera">
                          <h3 className="historial-periodo__titulo">
                            {evaluacion.periodo}
                          </h3>
                          {evaluacion.generado_en && (
                            <p className="historial-periodo__fecha">
                              Generada el {evaluacion.generado_en.slice(0, 10)}
                            </p>
                          )}
                        </div>
                        <div className="historial-periodo__competencias">
                          {(evaluacion.competencias || []).map((competencia) => {
                            const lectura = lecturaCompetencia(competencia)
                            return (
                              <div key={competencia.clave} className="historial-competencia">
                                <span className="historial-competencia__nombre">
                                  {nombreCompetencia(competencia.clave)}
                                </span>
                                {lectura.nivel === null ? (
                                  <span
                                    className="historial-linea-discontinua"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Segmentos nivel={lectura.nivel} />
                                )}
                                <span
                                  className={`historial-competencia__nivel${
                                    lectura.nivel === null
                                      ? ' historial-competencia__nivel--sin-datos'
                                      : ''
                                  }`}
                                >
                                  {lectura.texto}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

            <Pagination
              pagina={datos?.pagina ?? pagina}
              porPagina={porPagina}
              total={total}
              onCambiarPagina={setPagina}
              etiqueta="evaluaciones"
            />
          </section>
        </div>
      )}

      {/* Zona 3 — franja gris verdosa: correcciones administrativas de RH y
          modificaciones propias sobre MIS participaciones (GET /me/audits;
          el backend ya filtra por el empleado autenticado). */}
      <div className="historial-zona historial-zona--suave">
        <section
          className="historial-apartado"
          aria-labelledby="historial-correcciones-titulo"
        >
          <h2
            className="historial-periodos__titulo"
            id="historial-correcciones-titulo"
          >
            Historial de mis participaciones
          </h2>
          <CorreccionesParticipaciones
            token={token}
            alSesionExpirada={alSesionExpirada}
          />
        </section>
      </div>
    </div>
  )
}