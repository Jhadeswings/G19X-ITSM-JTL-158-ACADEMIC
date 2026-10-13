// Sección RH → Evaluaciones (PRD §20.8; Especificación Técnica §22–§24, §31;
// Style Guide §13 estados, §24 densidad RH, §26, §33).
//
// Flujo de la sección (PRD §20.8), SIN nada fuera del contrato:
//
//   Periodo vigente → Generación → Fotografía histórica → Historial
//
// - Periodo vigente: lo resuelve SIEMPRE el backend con su fecha de negocio
//   America/Mexico_City (ET §22, DECISIONES §31). Aquí no se calcula el
//   trimestre en React ni se envía ningún periodo al generar: la respuesta de
//   `POST /rh/evaluations/generate` trae el `periodo` oficial y se presenta.
// - Generación: única acción de la vista, SIEMPRE precedida de una
//   confirmación EN LÍNEA (Style Guide §26): el primer clic NO llama a la
//   API; solo «Confirmar generación» dispara el POST y «Cancelar» cierra
//   sin generar nada. La confirmación explica que la fotografía será
//   histórica e inmutable y que no podrá editarse ni eliminarse.
//   201/200 con `total_generadas`
//   (0 = sin empleados activos, no se inventa nada); 409 = periodo ya
//   generado (DECISIONES §34). Tras un éxito se recarga el historial.
// - Fotografía histórica / Historial: `GET /rh/evaluations` paginado con el
//   filtro opcional `periodo` (`YYYY-QN`, patrón del backend). Cada entrada
//   es un snapshot INMUTABLE (§24): la vista lo presenta tal cual —cinco
//   competencias con nivel/estado y el 9-Box oficial de RH (PRD §10)— y NO
//   ofrece editar, eliminar ni regenerar: no existen PATCH ni DELETE (§24).
//   RH-01.1: la identificación (nombre, puesto, área) también viene del
//   snapshot —capturada al generar en backend—; la vista NUNCA consulta el
//   empleado actual, así que jamás mezcla una evaluación histórica con el
//   puesto o área de hoy.
//
// Lo que esta vista NO hace (reglas críticas del bloque):
// - NO calcula competencias, niveles, ejes, celdas 9-Box, promedios, deltas
//   ni rankings: todo llega del DTO y se pinta tal cual;
// - NO agrega gráficas, tendencias ni métricas nuevas, ni score global;
// - NO usa IA;
// - "Datos insuficientes" se conserva como estado válido (PRD §5/§14):
//   jamás se convierte en 0 ni en un error.
//
// Estados: carga, vacío, error con reintento y 401 → `alSesionExpirada`
// (ET §31/§32, patrón de las demás vistas RH). El frontend no decide
// permisos: `require_rh` lo aplica el backend en cada petición.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PATRON_PERIODO,
  POR_PAGINA_DEFECTO,
  generarEvaluaciones,
  listarEvaluaciones,
} from '../api/evaluaciones.js'
import { NOMBRES_COMPETENCIAS } from '../textos.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import Alert from '../componentes/ui/Alert.jsx'
import Badge from '../componentes/ui/Badge.jsx'
import { Button } from '../componentes/ui/Button.jsx'
import Pagination from '../componentes/ui/Pagination.jsx'

/** Estado del snapshot de una competencia (contrato `status`). */
const INSUFICIENTE = 'INSUFFICIENT_DATA'

/**
 * Etiquetas OFICIALES de nivel (PRD §5), únicas y fijas para los niveles 1–5.
 * Diccionario de PRESENTACIÓN sobre el `nivel` que ya trae el snapshot: aquí
 * no se deriva ningún nivel. Si el backend enviara un nivel fuera del rango,
 * se muestra el número tal cual.
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

/** Texto neutro para datos ausentes: nunca un hueco ni un error. */
const SIN_DATO = '—'

/**
 * Título y explicación de un 9-Box con Datos insuficientes (RH-01.1).
 * Describen EXCLUSIVAMENTE reglas que ya existen en el backend
 * (`nine_box.py` §20.1/§20.2): el eje de rendimiento proviene solo del
 * Desempeño técnico; el de potencial, de Liderazgo, Trabajo en equipo,
 * Comunicación y Capacidad de aprendizaje; y DI en cualquiera de las cinco
 * competencias deja ejes y celda en null. No se crea ninguna regla nueva ni
 * se calcula, infiere o inventa nada aquí.
 */
const TITULO_NINE_BOX_DI = `9-Box: ${TEXTO_DATOS_INSUFICIENTES}.`
const EXPLICACION_NINE_BOX_DI =
  'No es posible ubicar al empleado en el 9-Box porque todavía no hay datos ' +
  'suficientes para calcular los ejes requeridos. El eje de rendimiento ' +
  'requiere información de Desempeño técnico y el eje de potencial requiere ' +
  'información suficiente de Liderazgo, Trabajo en equipo, Comunicación y ' +
  'Capacidad de aprendizaje.'
const NOTA_NINE_BOX_DI =
  'No se asigna una posición 9-Box hasta contar con información suficiente.'

/** Estado inicial de la consulta: la misma forma que usan las demás vistas. */
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
 * `Datos insuficientes` cuando no hay evidencia mínima (nunca nivel 0).
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

/** True cuando el snapshot 9-Box llegó vacío por Datos insuficientes (§20.2). */
function sinNineBox(nineBox) {
  return (
    !nineBox ||
    (nineBox.performance_axis == null &&
      nineBox.potential_axis == null &&
      nineBox.box_code == null)
  )
}

/**
 * Línea "puesto · área" del snapshot (RH-01.1). Ambos llegan del histórico:
 * si falta alguno se muestra solo el disponible y si faltan los dos la línea
 * desaparece — nunca se inventan valores ni se consulta el empleado actual.
 */
function lineaPuestoArea(evaluacion) {
  return [evaluacion.empleado_puesto, evaluacion.empleado_area]
    .filter((dato) => typeof dato === 'string' && dato.trim())
    .join(' · ')
}


export default function Evaluaciones({ token, alSesionExpirada }) {
  const [pagina, setPagina] = useState(1)
  const [periodoTexto, setPeriodoTexto] = useState('')
  const [periodoAplicado, setPeriodoAplicado] = useState(null)
  const [periodoInvalido, setPeriodoInvalido] = useState(false)
  const [consulta, setConsulta] = useState(consultaInicial)
  // Generación: 'inactiva' | 'confirmacion' | 'generando' | 'resultado' |
  // 'conflicto' | 'error'. 'confirmacion' es la pausa EN LÍNEA (SG §26)
  // previa a cualquier petición: sin ella no se toca el backend.
  const [generacion, setGeneracion] = useState({
    fase: 'inactiva',
    datos: null,
    error: null,
  })
  // Guardia de unicidad: SOLO un POST en vuelo, aunque se pulse dos veces.
  const generandoRef = useRef(false)

  const cargar = useCallback(() => {
    setConsulta(consultaInicial())
    listarEvaluaciones(token, {
      pagina,
      porPagina: POR_PAGINA_DEFECTO,
      periodo: periodoAplicado,
    })
      .then((datos) => setConsulta({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        // 401: el backend ya decidió que la sesión no sirve (§31/§32).
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        // Cualquier otro fallo es estado explícito con reintento: nunca se
        // convierte en "sin evaluaciones" (§13.6).
        setConsulta({ fase: 'error', datos: null, error })
      })
  }, [token, pagina, periodoAplicado, alSesionExpirada])

  useEffect(() => {
    cargar()
  }, [cargar])

  /**
   * Primer paso (SG §26): SOLO abre la confirmación en línea. Aquí NO se
   * ejecuta ninguna petición de generación; el POST ocurre únicamente si RH
   * pulsa «Confirmar generación» (ver `generar`).
   */
  const solicitarGeneracion = useCallback(() => {
    setGeneracion((actual) =>
      actual.fase === 'generando'
        ? actual
        : { fase: 'confirmacion', datos: null, error: null },
    )
  }, [])

  /** Cierra la confirmación en línea sin generar nada. */
  const cancelarGeneracion = useCallback(() => {
    setGeneracion({ fase: 'inactiva', datos: null, error: null })
  }, [])

  /**
   * Genera el periodo vigente. ÚNICO punto que dispara el POST y solo desde
   * «Confirmar generación». El backend resuelve y devuelve el periodo: aquí
   * solo se presenta la respuesta oficial del DTO. La guardia de `generandoRef`
   * evita solicitudes duplicadas mientras la petición está en curso.
   */
  const generar = useCallback(() => {
    if (generandoRef.current) return
    generandoRef.current = true
    setGeneracion({ fase: 'generando', datos: null, error: null })
    generarEvaluaciones(token)
      .then((datos) => {
        setGeneracion({ fase: 'resultado', datos, error: null })
        // La fotografía ya existe: el historial debe reflejarlo.
        cargar()
      })
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        // 409 = el periodo ya fue generado (no es un fallo destructivo).
        if (error?.estado === 409) {
          setGeneracion({ fase: 'conflicto', datos: null, error })
          return
        }
        setGeneracion({ fase: 'error', datos: null, error })
      })
      .finally(() => {
        generandoRef.current = false
      })
  }, [token, cargar, alSesionExpirada])

  /** Aplica el filtro de periodo solo si respeta el patrón del contrato. */
  function filtrarPorPeriodo(evento) {
    evento.preventDefault()
    const valor = periodoTexto.trim()
    if (valor && !PATRON_PERIODO.test(valor)) {
      setPeriodoInvalido(true)
      return
    }
    setPeriodoInvalido(false)
    setPeriodoAplicado(valor || null)
    setPagina(1)
  }

  function limpiarFiltro() {
    setPeriodoTexto('')
    setPeriodoInvalido(false)
    setPeriodoAplicado(null)
    setPagina(1)
  }

  const { fase, datos } = consulta
  const items = fase === 'listo' ? datos?.items || [] : []
  const total = fase === 'listo' ? datos?.total ?? 0 : 0
  const porPagina =
    fase === 'listo' ? datos?.por_pagina ?? POR_PAGINA_DEFECTO : POR_PAGINA_DEFECTO
  const conFiltro = periodoAplicado !== null

  return (
    <div className="evaluaciones">
      <SectionHeader
        eyebrow="Talento"
        title="Evaluaciones"
        description="Del periodo vigente al historial: genera la fotografía oficial de cada empleado y consulta los snapshots históricos, que no cambian con el tiempo."
      />

      {/* --- Periodo vigente + generación (PRD §20.8, ET §23) --------------- */}
      <section
        className="evaluaciones-generacion"
        aria-labelledby="evaluaciones-generacion-titulo"
      >
        <h2 id="evaluaciones-generacion-titulo">Periodo vigente</h2>
        <p className="evaluaciones-generacion__nota">
          El sistema resuelve el periodo vigente con la fecha de negocio y
          genera en un solo paso la fotografía oficial de todos los empleados
          activos. Cada fotografía queda guardada y no vuelve a calcularse.
        </p>

        {/* Confirmación EN LÍNEA antes de generar (SG §26): sin modal. Explica
            que la fotografía será histórica e inmutable y solo entonces —con
            «Confirmar generación»— se dispara la petición. «Cancelar» cierra
            sin generar nada. */}
        {generacion.fase === 'confirmacion' ? (
          <Alert
            tone="info"
            title="¿Generar las evaluaciones del periodo vigente?"
          >
            <p className="evaluaciones-confirmacion__texto">
              Se creará una fotografía histórica e inmutable de todos los
              empleados activos del periodo vigente. Una vez generada, la
              fotografía no podrá editarse ni eliminarse.
            </p>
            <div className="evaluaciones-confirmacion__acciones">
              <Button onClick={generar}>Confirmar generación</Button>
              <Button variant="secondary" onClick={cancelarGeneracion}>
                Cancelar
              </Button>
            </div>
          </Alert>
        ) : (
          <Button
            onClick={solicitarGeneracion}
            loading={generacion.fase === 'generando'}
            disabled={generacion.fase === 'generando'}
          >
            {generacion.fase === 'generando'
              ? 'Generando evaluaciones…'
              : 'Generar evaluaciones del periodo vigente'}
          </Button>
        )}

        {generacion.fase === 'resultado' && (
          <Alert tone="success" title="Evaluaciones generadas">
            {generacion.datos?.total_generadas > 0 ? (
              <>
                Se generaron{' '}
                <strong>{generacion.datos.total_generadas}</strong> evaluaciones
                del periodo <strong>{generacion.datos.periodo}</strong>.
              </>
            ) : (
              <>
                El periodo <strong>{generacion.datos?.periodo}</strong> no tiene
                empleados activos, así que no se generó ninguna evaluación.
              </>
            )}
          </Alert>
        )}

        {generacion.fase === 'conflicto' && (
          <Alert tone="info" title="El periodo ya fue generado">
            {generacion.error?.message ||
              'Este periodo ya cuenta con evaluaciones generadas.'}
          </Alert>
        )}

        {generacion.fase === 'error' && (
          <Alert tone="error" title="No pudimos generar las evaluaciones">
            {generacion.error?.message ||
              'Ocurrió un problema al generar el periodo vigente.'}
          </Alert>
        )}
      </section>



      {/* --- Historial paginado (ET §31/§34) ------------------------------- */}
      <section
        className="evaluaciones-historial"
        aria-labelledby="evaluaciones-historial-titulo"
      >
        <h2 id="evaluaciones-historial-titulo">Historial de evaluaciones</h2>
        <p className="evaluaciones-historial__nota">
          Cada entrada es la fotografía oficial de un empleado en un periodo.
          Son registros de solo lectura: no se editan ni se eliminan.
        </p>

        <form className="evaluaciones-filtro" onSubmit={filtrarPorPeriodo}>
          <div className="evaluaciones-filtro__campo">
            <label className="form-field__label" htmlFor="evaluaciones-filtro-periodo">
              Periodo
            </label>
            <input
              id="evaluaciones-filtro-periodo"
              className={`ui-input${periodoInvalido ? ' ui-input--invalid' : ''}`}
              type="text"
              value={periodoTexto}
              placeholder="Ej. 2026-Q1"
              aria-invalid={periodoInvalido || undefined}
              onChange={(evento) => {
                setPeriodoTexto(evento.target.value)
                setPeriodoInvalido(false)
              }}
            />
            {periodoInvalido && (
              <p className="form-field__error" role="alert">
                Usa el formato del sistema, por ejemplo 2026-Q1.
              </p>
            )}
          </div>
          <Button type="submit" variant="secondary" size="small">
            Consultar
          </Button>
          {conFiltro && (
            <Button type="button" variant="ghost" size="small" onClick={limpiarFiltro}>
              Limpiar filtro
            </Button>
          )}
        </form>

        {conFiltro && (
          <p className="evaluaciones-historial__filtro-activo">
            Filtrando por periodo: <strong>{periodoAplicado}</strong>
          </p>
        )}

        {fase === 'cargando' && <EstadoCarga texto="Cargando evaluaciones…" />}

        {fase === 'error' && (
          <EstadoError
            titulo="No pudimos cargar las evaluaciones"
            mensaje="Ocurrió un problema al obtener el historial de evaluaciones."
            onReintentar={cargar}
          />
        )}

        {fase === 'listo' && total === 0 && (
          <EstadoVacio
            titulo={
              conFiltro
                ? 'No hay evaluaciones para ese periodo.'
                : 'Todavía no hay evaluaciones oficiales.'
            }
            descripcion={
              conFiltro
                ? 'Genera el periodo vigente o limpia el filtro para ver el historial completo.'
                : 'Genera el periodo vigente para crear la primera fotografía histórica de los empleados activos.'
            }
          />
        )}

        {fase === 'listo' && total > 0 && (
          <>
            <ol className="evaluaciones-lista">
              {items.map((evaluacion) => (
                <li key={evaluacion.id} className="evaluaciones-item">
                  <div className="evaluaciones-item__cabecera">
                    <h3 className="evaluaciones-item__periodo">{evaluacion.periodo}</h3>
                    <p className="evaluaciones-item__empleado">
                      {/* RH-01.1: identificación histórica capturada al
                          generar en backend. El ID técnico solo es fallback
                          de snapshots previos a RH-01.1, nunca el
                          identificador principal. */}
                      {evaluacion.empleado_nombre ??
                        `Empleado ${evaluacion.empleado_id}`}
                    </p>
                    {lineaPuestoArea(evaluacion) && (
                      <p className="evaluaciones-item__puesto">
                        {lineaPuestoArea(evaluacion)}
                      </p>
                    )}
                    {evaluacion.generado_en && (
                      <p className="evaluaciones-item__fecha">
                        Generada el {evaluacion.generado_en.slice(0, 10)}
                      </p>
                    )}
                    <Badge tone="outline">Snapshot histórico</Badge>
                  </div>

                  <dl className="evaluaciones-item__competencias">
                    {(evaluacion.competencias || []).map((competencia) => {
                      const lectura = lecturaCompetencia(competencia)
                      return (
                        <div key={competencia.clave} className="evaluaciones-competencia">
                          <dt>{nombreCompetencia(competencia.clave)}</dt>
                          <dd>
                            <Badge tone={lectura.nivel === null ? 'neutral' : 'primary'}>
                              {lectura.texto}
                            </Badge>
                          </dd>
                        </div>
                      )
                    })}
                  </dl>

                  {/* 9-Box del SNAPSHOT, exclusivo de RH (PRD §10). Se pintan
                      los valores oficiales tal cual llegan; si todos vienen
                      nulos es Datos insuficientes (§20.2), nunca una celda
                      inventada. RH-01.1: en ese caso se explica con las reglas
                      OFICIALES del backend (nine_box.py §20.1/§20.2), solo
                      texto — nada se calcula ni infiere aquí. */}
                  {sinNineBox(evaluacion.nine_box) ? (
                    <div className="evaluaciones-item__ninebox-di">
                      <p className="evaluaciones-item__ninebox evaluaciones-item__ninebox--titulo">
                        {TITULO_NINE_BOX_DI}
                      </p>
                      <p className="evaluaciones-item__ninebox-nota">
                        {EXPLICACION_NINE_BOX_DI}
                      </p>
                      <p className="evaluaciones-item__ninebox-nota">
                        {NOTA_NINE_BOX_DI}
                      </p>
                    </div>
                  ) : (
                    <p className="evaluaciones-item__ninebox">
                      {`9-Box — Rendimiento ${
                        evaluacion.nine_box.performance_axis ?? SIN_DATO
                      } · ${
                        evaluacion.nine_box.etiqueta_performance ?? SIN_DATO
                      } / Potencial ${
                        evaluacion.nine_box.potential_axis ?? SIN_DATO
                      } · ${
                        evaluacion.nine_box.etiqueta_potencial ?? SIN_DATO
                      } / Celda ${evaluacion.nine_box.box_code ?? SIN_DATO}`}
                    </p>
                  )}
                </li>
              ))}
            </ol>

            <Pagination
              pagina={datos?.pagina ?? pagina}
              porPagina={porPagina}
              total={total}
              onCambiarPagina={setPagina}
              etiqueta="evaluaciones"
            />
          </>
        )}
      </section>
    </div>
  )
}
