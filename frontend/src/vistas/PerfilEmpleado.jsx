// Perfil individual RH: información básica + última evaluación (PRD §20.2;
// Style Guide §6, §7, §10, §26).
//
// Subvista interna de la sección Empleados, con el mismo patrón listado ↕
// alta: sin ruta nueva ni router. Usa EXCLUSIVAMENTE endpoints existentes:
// - GET /api/v1/rh/employees/{id} → información básica (EmpleadoOut);
// - GET /api/v1/rh/employees/{id}/evaluations?pagina=1&por_pagina=1 →
//   última evaluación oficial (items[0] del historial ordenado por periodo
//   DESC; no existe endpoint `latest`).
//
// Las competencias y el 9-Box mostrados son los del SNAPSHOT histórico
// (EvaluacionOut): nunca se recalculan en el frontend ni se sustituyen por el
// resultado actual. Mientras los demás bloques del perfil no existan, esta
// sección va después de Información básica (orden relativo del PRD §20.2).

import { useCallback, useEffect, useState } from 'react'
import { obtenerEmpleado } from '../api/empleados.js'
import { listarEvaluacionesEmpleado } from '../api/evaluaciones.js'
import { NOMBRES_COMPETENCIAS } from '../textos.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import Badge from '../componentes/ui/Badge.jsx'
import { Button } from '../componentes/ui/Button.jsx'

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
  const [evaluacion, setEvaluacion] = useState(consultaInicial)

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
        </>
      )}
    </div>
  )
}
