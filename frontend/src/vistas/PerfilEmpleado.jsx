// Perfil individual RH: información básica + resultado actual + última
// evaluación + historial (PRD §20.2; Style Guide §6, §7, §10, §26).
//
// Subvista interna de la sección Empleados, con el mismo patrón listado ↕
// alta: sin ruta nueva ni router. Usa EXCLUSIVAMENTE endpoints existentes:
// - GET /api/v1/rh/employees/{id} → información básica (EmpleadoOut);
// - GET /api/v1/rh/employees/{id}/result → resultado actual vigente
//   (ResultadoActualDTO: cálculo DINÁMICO del estado presente, §18);
// - GET /api/v1/rh/employees/{id}/evaluations?pagina=1&por_pagina=1 →
//   última evaluación oficial (items[0] del historial ordenado por periodo
//   DESC; no existe endpoint `latest`).
//
// "Resultado actual" (dinámico) se presenta ANTES de "Última evaluación"
// (snapshot) para distinguirlos visualmente (PRD §9; ET §42). Las
// competencias y el 9-Box de "Última evaluación" y del historial son los del
// SNAPSHOT histórico (EvaluacionOut): nunca se recalculan en el frontend ni
// se sustituyen por el resultado actual. Mientras los demás bloques del
// perfil no existan, esta sección va después de Información básica (orden
// relativo del PRD §20.2).

import { useCallback, useEffect, useState } from 'react'
import { obtenerEmpleado, obtenerResultadoActual } from '../api/empleados.js'
import {
  listarEvaluacionesEmpleado,
  POR_PAGINA_DEFECTO,
} from '../api/evaluaciones.js'
import { NOMBRES_COMPETENCIAS, ETIQUETAS_EVIDENCIA } from '../textos.js'
import { entradasOrdenadas } from '../componentes/evidenciaCompetencias.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import Badge from '../componentes/ui/Badge.jsx'
import { Button } from '../componentes/ui/Button.jsx'
import Pagination from '../componentes/ui/Pagination.jsx'

/** Texto neutro para datos ausentes: nunca un hueco ni un error. */
const SIN_DATO = '—'

function etiquetaEstado(activo) {
  return activo ? 'Activo' : 'Inactivo'
}

/** Estado inicial de una consulta: la misma forma que usa Empleados. */
function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

/** Estado histórico sin nivel calculable (§14: DI jamás se convierte en 0). */
const DATOS_INSUFICIENTES = 'INSUFFICIENT_DATA'

/** Nombres de mes para lectura humana de fechas (solo presentación). */
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * Fecha legible: "20 de septiembre de 2026" a partir del YYYY-MM-DD del
 * backend (fecha de ingreso o parte fecha del ISO de generación).
 *
 * Solo presentación: se descompone la cadena tal cual, sin zonas horarias
 * ni interpretaciones — el dato recibido no se altera.
 */
function fechaLegible(valor) {
  if (typeof valor !== 'string' || valor.length < 10) return SIN_DATO
  const [anio, mes, dia] = valor.slice(0, 10).split('-').map(Number)
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) {
    return SIN_DATO
  }
  const nombreMes = MESES[mes - 1]
  if (!nombreMes) return SIN_DATO
  return `${dia} de ${nombreMes} de ${anio}`
}

/** Lectura de UNA competencia histórica: nivel exacto o Datos insuficientes. */
function lecturaCompetencia(competencia) {
  if (competencia.status === DATOS_INSUFICIENTES || competencia.nivel == null) {
    return '— Datos insuficientes'
  }
  return `Nivel ${competencia.nivel}`
}

/** Estado calculable del resultado actual (campo `estado` del DTO). */
const CALCULABLE = 'CALCULABLE'

/**
 * Lectura de UNA competencia del RESULTADO ACTUAL: "Nivel X · Etiqueta"
 * o "— Datos insuficientes".
 *
 * Separada de `lecturaCompetencia()` a propósito: el snapshot histórico usa
 * `status` y no trae `etiqueta`, mientras que el ResultadoActualDTO usa
 * `estado` y sí la trae. DI jamás se convierte en 0 ni en error (§14).
 */
function lecturaResultadoActual(competencia) {
  if (competencia.estado !== CALCULABLE || competencia.nivel == null) {
    return '— Datos insuficientes'
  }
  return `Nivel ${competencia.nivel} · ${competencia.etiqueta}`
}

/**
 * Evidencia breve de UNA competencia del bloque "Competencias" (SG §15.1).
 *
 * Solo presentación: `entradasOrdenadas()` decide qué claves se muestran y en
 * qué jerarquía, y aquí se pinta cada dato con la etiqueta que el sistema ya
 * define en `ETIQUETAS_EVIDENCIA`. No se calculan reglas, no se derivan
 * frases, no se reconstruyen fórmulas y no se inventan mínimos: los valores
 * se muestran tal cual llegan. Los campos sin etiqueta (score, componentes A/B
 * y año calendario) quedan fuera por contrato del módulo compartido.
 */
function EvidenciaCompetencia({ competencia }) {
  const entradas = entradasOrdenadas(competencia.clave, competencia.evidencia)
  if (entradas.length === 0) return null
  return (
    <dl className="perfil-competencia__evidencia">
      {entradas.map(({ clave, valor, jerarquia }) => (
        <div
          key={clave}
          className={
            `perfil-competencia__dato perfil-competencia__dato--${jerarquia}`
          }
        >
          <dt>{ETIQUETAS_EVIDENCIA[clave]}</dt>
          <dd>{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Antigüedad del bloque "Experiencia" (PRD §8; ET §17).
 *
 * El valor se muestra TAL COMO LLEGA del backend (`Decimal` serializado con
 * sus dos decimales): no se redondea, no se recalcula y no se convierte a
 * meses. Solo se añade la unidad en años para que el número sea legible.
 *
 * `null` significa "no hay fecha de ingreso registrada": es un dato ausente,
 * no un cero y no un error, así que se presenta con el texto neutro `SIN_DATO`
 * —nunca "0 años" ni una fila oculta. Un `0.00` real (ingreso hoy o futuro) sí
 * se muestra tal cual.
 */
function lecturaAntiguedad(anios) {
  if (anios == null) return SIN_DATO
  return `${anios} años`
}

/** True cuando el snapshot 9-Box quedó vacío por Datos insuficientes. */
function sinNineBox(nineBox) {
  return (
    !nineBox ||
    (nineBox.performance_axis == null &&
      nineBox.potential_axis == null &&
      nineBox.box_code == null)
  )
}

export default function PerfilEmpleado({ token, empleadoId, alVolver, alSesionExpirada }) {
  const [consulta, setConsulta] = useState(consultaInicial)
  const [resultado, setResultado] = useState(consultaInicial)
  const [evaluacion, setEvaluacion] = useState(consultaInicial)
  const [historial, setHistorial] = useState(consultaInicial)
  const [paginaHistorial, setPaginaHistorial] = useState(1)

  const cargar = useCallback(() => {
    setConsulta(consultaInicial())
    obtenerEmpleado(token, empleadoId)
      .then((datos) => setConsulta({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        // 401: el backend ya decidió que la sesión no sirve (ET §32).
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setConsulta({ fase: 'error', datos: null, error })
      })
  }, [token, empleadoId, alSesionExpirada])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Segunda consulta INDEPENDIENTE (última evaluación): su carga, error o
  // vacío jamás destruyen la información básica ya resuelta.
  const cargarEvaluacion = useCallback(() => {
    setEvaluacion(consultaInicial())
    listarEvaluacionesEmpleado(token, empleadoId, { pagina: 1, porPagina: 1 })
      .then((datos) => setEvaluacion({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setEvaluacion({ fase: 'error', datos: null, error })
      })
  }, [token, empleadoId, alSesionExpirada])

  useEffect(() => {
    cargarEvaluacion()
  }, [cargarEvaluacion])

  // Tercera consulta INDEPENDIENTE (historial paginado): misma ruta, página
  // completa del contrato (POR_PAGINA_DEFECTO). Su carga, error o vacío
  // jamás afectan a las otras dos secciones.
  const cargarHistorial = useCallback(
    (pagina) => {
      setHistorial(consultaInicial())
      listarEvaluacionesEmpleado(token, empleadoId, {
        pagina,
        porPagina: POR_PAGINA_DEFECTO,
      })
        .then((datos) => setHistorial({ fase: 'listo', datos, error: null }))
        .catch((error) => {
          if (error?.estado === 401) {
            alSesionExpirada?.()
            return
          }
          setHistorial({ fase: 'error', datos: null, error })
        })
    },
    [token, empleadoId, alSesionExpirada],
  )

  useEffect(() => {
    setPaginaHistorial(1)
    cargarHistorial(1)
  }, [cargarHistorial])

  // Consulta INDEPENDIENTE (resultado actual): su carga, error o 401 jamás
  // bloquean ni destruyen la información básica, la última evaluación ni el
  // historial. Solo lectura: sin cálculos ni ramas por estado del empleado.
  const cargarResultado = useCallback(() => {
    setResultado(consultaInicial())
    obtenerResultadoActual(token, empleadoId)
      .then((datos) => setResultado({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        // 401: el backend ya decidió que la sesión no sirve (ET §32).
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        // 404 y cualquier otro fallo: error de consulta con reintento propio,
        // sin reglas especiales (el endpoint solo 404 si no existe).
        setResultado({ fase: 'error', datos: null, error })
      })
  }, [token, empleadoId, alSesionExpirada])

  useEffect(() => {
    cargarResultado()
  }, [cargarResultado])

  const { fase, datos, error } = consulta
  const ultima = evaluacion.datos?.items?.[0] ?? null
  const nineBox = ultima?.nine_box ?? null

  return (
    <div className="perfil-empleado">
      <div className="empleados__volver">
        <Button variant="ghost" onClick={alVolver}>
          Volver al listado
        </Button>
      </div>

      {fase === 'cargando' && <EstadoCarga texto="Cargando información del empleado…" />}

      {fase === 'error' && error?.estado === 404 && (
        <>
          <EstadoVacio
            titulo="Este empleado no está disponible."
            descripcion="Es posible que ya no exista o que no se pueda consultar en este momento. Puedes volver al listado para continuar."
          />
          <div className="empleados__volver">
            <Button variant="secondary" onClick={alVolver}>
              Volver al listado
            </Button>
          </div>
        </>
      )}

      {fase === 'error' && error?.estado !== 404 && (
        <EstadoError
          titulo="No pudimos cargar la información del empleado"
          mensaje="Ocurrió un problema al obtener la información básica."
          onReintentar={cargar}
        />
      )}

      {fase === 'listo' && datos && (
        <>
          <SectionHeader
            eyebrow="Perfil del empleado"
            title={datos.nombre}
            description="Información básica registrada."
          />
          <section className="perfil-empleado__basica" aria-labelledby="perfil-basica-titulo">
            <h2 id="perfil-basica-titulo">Información básica</h2>
            {/* Dos columnas equilibradas (Style Guide §24 densidad RH): el
                flujo por renglones deja a la izquierda Nombre, Área, Correo
                y Rol; a la derecha Puesto, Fecha de ingreso y Estado. */}
            <dl className="perfil-empleado__lista">
              <div>
                <dt>Nombre</dt>
                <dd>{datos.nombre || SIN_DATO}</dd>
              </div>
              <div>
                <dt>Puesto</dt>
                <dd>{datos.puesto || SIN_DATO}</dd>
              </div>
              <div>
                <dt>Área</dt>
                <dd>{datos.area || SIN_DATO}</dd>
              </div>
              <div>
                <dt>Fecha de ingreso</dt>
                <dd>{fechaLegible(datos.fecha_ingreso)}</dd>
              </div>
              <div>
                <dt>Correo de acceso</dt>
                <dd>{datos.cuenta?.email || SIN_DATO}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>
                  <Badge tone={datos.activo ? 'success' : 'neutral'}>
                    {etiquetaEstado(datos.activo)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>Rol de cuenta</dt>
                <dd>
                  <Badge tone="outline">{datos.cuenta?.rol || SIN_DATO}</Badge>
                </dd>
              </div>
            </dl>
          </section>

          {/* Resultado actual (PRD §9/§20.2; ET §42): cálculo DINÁMICO del
              estado presente, colocado ANTES de la evaluación histórica.
              Solo nombre + lectura por competencia: sin evidencia, sin
              experiencia, sin 9-Box y sin indicadores nuevos. */}
          <section
            className="perfil-empleado__resultado"
            aria-labelledby="perfil-resultado-titulo"
          >
            <h2 id="perfil-resultado-titulo">Resultado actual</h2>
            <p className="perfil-empleado__nota">
              Cálculo dinámico con el estado actual del empleado. No
              corresponde a un periodo ni se guarda como registro.
            </p>

            {resultado.fase === 'cargando' && (
              <EstadoCarga texto="Cargando resultado actual…" />
            )}

            {resultado.fase === 'error' && (
              <EstadoError
                titulo="No pudimos cargar el resultado actual"
                mensaje="Ocurrió un problema al obtener el resultado vigente del empleado."
                onReintentar={cargarResultado}
              />
            )}

            {resultado.fase === 'listo' && (
              <dl className="perfil-empleado__lista perfil-empleado__lista--resultado">
                {(resultado.datos?.competencias ?? []).map((competencia) => (
                  <div key={competencia.clave}>
                    <dt>
                      {NOMBRES_COMPETENCIAS[competencia.clave] ||
                        competencia.clave}
                    </dt>
                    <dd>{lecturaResultadoActual(competencia)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {/* Competencias (SG §15.1): la EVIDENCIA BREVE que sustenta los
              resultados de "Resultado actual", que muestra el resumen vigente.
              Es una decisión de producto para el MVP, no una frase literal del
              PRD: nombre, nivel/etiqueta y evidencia por competencia.

              Reutiliza el MISMO `resultado` ya cargado por Resultado actual:
              sin consulta, sin carga y sin error propios. Solo se lee
              `competencias[]`: sin experiencia, fortalezas, oportunidades,
              9-Box, IA, score global ni porcentajes. La evidencia se pinta con
              markup propio del Perfil RH (nada de clases `competencia__*` ni
              de `ResumenEvidencia`). */}
          {resultado.fase === 'listo' && (resultado.datos?.competencias ?? []).length > 0 && (
            <section
              className="perfil-empleado__competencias"
              aria-labelledby="perfil-competencias-titulo"
            >
              <h2 id="perfil-competencias-titulo">Competencias</h2>
              <p className="perfil-empleado__nota">
                Evidencia que sustenta cada competencia del resultado actual.
              </p>

              <div className="perfil-competencias">
                {resultado.datos.competencias.map((competencia) => (
                  <article
                    key={competencia.clave}
                    className="perfil-competencia"
                    aria-label={NOMBRES_COMPETENCIAS[competencia.clave] || competencia.clave}
                  >
                    <div className="perfil-competencia__cabecera">
                      <h3 className="perfil-competencia__nombre">
                        {NOMBRES_COMPETENCIAS[competencia.clave] ||
                          competencia.clave}
                      </h3>
                      <p
                        className={
                          'perfil-competencia__nivel' +
                          (competencia.estado === CALCULABLE
                            ? ''
                            : ' perfil-competencia__nivel--di')
                        }
                      >
                        {lecturaResultadoActual(competencia)}
                      </p>
                    </div>
                    <EvidenciaCompetencia competencia={competencia} />
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Experiencia (PRD §8; ET §17): información CONTEXTUAL, nunca una
              competencia ni una evaluación. Solo antigüedad y proyectos únicos.

              Es una decisión de producto para el MVP: la fecha de ingreso NO se
              repite aquí porque ya está en Información básica (y el backend la
              envía dos veces con formatos distintos). Tampoco existe
              ExperienceScore: no hay nivel, porcentaje, barra ni semáforo.

              Reutiliza el MISMO `resultado` ya cargado: sin consulta, sin carga
              ni error propios. `fecha_ingreso` no se pinta; `proyectos_unicos`
              se muestra tal cual, incluido el 0, que es un dato real. */}
          {resultado.fase === 'listo' && resultado.datos?.experiencia && (
            <section
              className="perfil-empleado__experiencia"
              aria-labelledby="perfil-experiencia-titulo"
            >
              <h2 id="perfil-experiencia-titulo">Experiencia</h2>
              <p className="perfil-empleado__nota">
                La experiencia es información contextual: no modifica las
                competencias.
              </p>

              <dl className="perfil-empleado__lista">
                <div>
                  <dt>Antigüedad</dt>
                  <dd>{lecturaAntiguedad(resultado.datos.experiencia.anios_antiguedad)}</dd>
                </div>
                <div>
                  <dt>Proyectos únicos</dt>
                  <dd>{resultado.datos.experiencia.proyectos_unicos ?? SIN_DATO}</dd>
                </div>
              </dl>
            </section>
          )}

          {/* Última evaluación (PRD §20.2): snapshot histórico, read-only. */}
          <section
            className="perfil-empleado__evaluacion"
            aria-labelledby="perfil-evaluacion-titulo"
          >
            <h2 id="perfil-evaluacion-titulo">Última evaluación</h2>
            <p className="perfil-empleado__nota">
              Fotografía histórica oficial del periodo más reciente: no refleja
              cambios registrados después de generarse.
            </p>

            {evaluacion.fase === 'cargando' && (
              <EstadoCarga texto="Cargando última evaluación…" />
            )}

            {evaluacion.fase === 'error' && (
              <EstadoError
                titulo="No pudimos cargar la última evaluación"
                mensaje="Ocurrió un problema al obtener las evaluaciones oficiales."
                onReintentar={cargarEvaluacion}
              />
            )}

            {evaluacion.fase === 'listo' && !ultima && (
              <EstadoVacio
                titulo="Todavía no hay evaluaciones oficiales para este empleado."
                descripcion="Cuando se genere la evaluación de un periodo, la más reciente aparecerá aquí."
              />
            )}

            {evaluacion.fase === 'listo' && ultima && (
              <>
                <dl className="perfil-empleado__lista">
                  <div>
                    <dt>Periodo</dt>
                    <dd>{ultima.periodo || SIN_DATO}</dd>
                  </div>
                  <div>
                    <dt>Generada el</dt>
                    <dd>{fechaLegible(ultima.generado_en)}</dd>
                  </div>
                </dl>

                <h3 className="perfil-empleado__subtitulo">Competencias históricas</h3>
                <dl className="perfil-empleado__lista">
                  {(ultima.competencias ?? []).map((competencia) => (
                    <div key={competencia.clave}>
                      <dt>{NOMBRES_COMPETENCIAS[competencia.clave] || competencia.clave}</dt>
                      <dd>{lecturaCompetencia(competencia)}</dd>
                    </div>
                  ))}
                </dl>

                {/* 9-Box histórico: parte del snapshot, no un bloque actual ni
                    un veredicto (Style Guide §26). */}
                <h3 className="perfil-empleado__subtitulo">9-Box histórico</h3>
                {sinNineBox(nineBox) ? (
                  <p className="perfil-empleado__nota">Datos insuficientes.</p>
                ) : (
                  <dl className="perfil-empleado__lista">
                    <div>
                      <dt>Rendimiento</dt>
                      <dd>
                        {nineBox.performance_axis ?? SIN_DATO} ·{' '}
                        {nineBox.etiqueta_performance ?? SIN_DATO}
                      </dd>
                    </div>
                    <div>
                      <dt>Potencial</dt>
                      <dd>
                        {nineBox.potential_axis ?? SIN_DATO} ·{' '}
                        {nineBox.etiqueta_potencial ?? SIN_DATO}
                      </dd>
                    </div>
                    <div>
                      <dt>Celda</dt>
                      <dd>{nineBox.box_code ?? SIN_DATO}</dd>
                    </div>
                  </dl>
                )}
              </>
            )}
          </section>

          {/* Historial de evaluaciones (Style Guide §19 Timeline: líneas y
              elementos sutiles). Presenta los snapshots TAL CUAL llegan; no
              deduplica la más reciente (Última evaluación es el detalle
              destacado, este es el archivo cronológico). Con total=0 la
              tarjeta no se renderiza: el empty state ya vive en Última
              evaluación. */}
          {historial.fase === 'cargando' && (
            <section
              className="perfil-empleado__historial"
              aria-labelledby="perfil-historial-titulo"
            >
              <h2 id="perfil-historial-titulo">Historial de evaluaciones</h2>
              <EstadoCarga texto="Cargando historial de evaluaciones…" />
            </section>
          )}

          {historial.fase === 'error' && (
            <section
              className="perfil-empleado__historial"
              aria-labelledby="perfil-historial-titulo"
            >
              <h2 id="perfil-historial-titulo">Historial de evaluaciones</h2>
              <EstadoError
                titulo="No pudimos cargar el historial de evaluaciones"
                mensaje="Ocurrió un problema al obtener las evaluaciones oficiales."
                onReintentar={() => cargarHistorial(paginaHistorial)}
              />
            </section>
          )}

          {historial.fase === 'listo' && (historial.datos?.total ?? 0) > 0 && (
            <section
              className="perfil-empleado__historial"
              aria-labelledby="perfil-historial-titulo"
            >
              <h2 id="perfil-historial-titulo">Historial de evaluaciones</h2>
              <p className="perfil-empleado__nota">
                Cada entrada es la fotografía oficial generada en su periodo; no
                se recalcula.
              </p>

              <ol className="perfil-historial">
                {(historial.datos.items ?? []).map((entrada) => (
                  <li key={entrada.id} className="perfil-historial__entrada">
                    <h3 className="perfil-historial__periodo">
                      {entrada.periodo || SIN_DATO}
                    </h3>
                    <p className="perfil-historial__fecha">
                      Generada el {fechaLegible(entrada.generado_en)}
                    </p>
                    <dl className="perfil-empleado__lista">
                      {(entrada.competencias ?? []).map((competencia) => (
                        <div key={competencia.clave}>
                          <dt>
                            {NOMBRES_COMPETENCIAS[competencia.clave] ||
                              competencia.clave}
                          </dt>
                          <dd>{lecturaCompetencia(competencia)}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="perfil-historial__ninebox">
                      {sinNineBox(entrada.nine_box)
                        ? '9-Box — Datos insuficientes.'
                        : `9-Box — Rendimiento ${
                            entrada.nine_box.performance_axis ?? SIN_DATO
                          } · ${entrada.nine_box.etiqueta_performance ?? SIN_DATO} / Potencial ${
                            entrada.nine_box.potential_axis ?? SIN_DATO
                          } · ${entrada.nine_box.etiqueta_potencial ?? SIN_DATO} / Celda ${
                            entrada.nine_box.box_code ?? SIN_DATO
                          }`}
                    </p>
                  </li>
                ))}
              </ol>

              <Pagination
                pagina={historial.datos.pagina ?? paginaHistorial}
                porPagina={historial.datos.por_pagina ?? POR_PAGINA_DEFECTO}
                total={historial.datos.total}
                onCambiarPagina={(nuevaPagina) => {
                  setPaginaHistorial(nuevaPagina)
                  cargarHistorial(nuevaPagina)
                }}
                etiqueta="evaluaciones"
              />
            </section>
          )}
        </>
      )}
    </div>
  )
}
