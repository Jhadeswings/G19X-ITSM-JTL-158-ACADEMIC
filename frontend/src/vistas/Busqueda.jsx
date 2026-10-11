// Sección RH → Búsqueda de talento (PRD §13.1/§13.3; ET §26/§27; Style Guide §27).
//
// Flujo manual (5B-1):
//   criterios configurados aquí → revisión de RH → ejecutar búsqueda →
//   resultados del backend.
//
// Flujo con interpretación IA (5B-2, ET §27): la necesidad descrita por RH
//   se interpreta con IA → los criterios propuestos se cargan en el MISMO
//   editor para que RH los revise y edite → ejecutar búsqueda manual →
//   resultados. La interpretación NUNCA ejecuta la búsqueda por sí sola.
//
// Reglas que esta vista respeta y no debe romper:
// - la IA SOLO interpreta la intención de RH (PRD §17.3): jamás selecciona
//   empleados, calcula niveles ni decide quién es «mejor»; los criterios
//   los decide RH;
// - 502 de la interpretación es un estado ESPERADO y controlado (la IA es
//   la respuesta): se invita a reintentar o a configurar los criterios
//   manualmente; jamás se inventan criterios ni se ejecuta una búsqueda de
//   emergencia;
// - los criterios se envían TAL CUAL a POST /rh/talent-search/manual:
//   { competencies: [{ code, min_level }] } — el backend decide quién cumple
//   (AND, solo activos, DI no satisface min_level) y en qué orden;
// - NO se recalcula en React promedio, ranking, score ni porcentaje; el
//   orden de los resultados es el del backend y no se reordena;
// - área y puesto son criterios INFORMATIVOS para la revisión (Decisión
//   Técnica #41): el contrato manual los rechaza (extra="forbid"), así que
//   se muestran en la revisión pero NO se envían como filtro;
// - «Datos insuficientes» se presenta tal cual (nivel null, nunca 0);
// - sin «mejor empleado», «top talento», «ganador», 9-Box ni equivalente
//   (PRD §5, §13.2; Style Guide §995);
// - 401 cierra la sesión; 422 y errores muestran mensaje legible con
//   reintento.

import { useState } from 'react'
import { buscarTalento, interpretarBusqueda } from '../api/busqueda.js'
import { NOMBRES_COMPETENCIAS } from '../textos.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import { Button } from '../componentes/ui/Button.jsx'

/** Las cinco competencias oficiales: catálogo cerrado (PRD §16/§13.1). */
const COMPETENCIAS = [
  'desempeno_tecnico',
  'liderazgo',
  'trabajo_equipo',
  'comunicacion',
  'aprendizaje',
]

/** Niveles admitidos por el contrato (min_level entero 1–5, ET §26). */
const NIVELES = [1, 2, 3, 4, 5]

/** Límite del query_text de la interpretación (InterpretacionIn, ET §27.1). */
const MAX_NECESIDAD = 500

/** Estado inicial de la búsqueda: aún no se ha ejecutado. */
function busquedaInicial() {
  return { fase: 'inactiva', datos: null, error: null }
}

/** Estado inicial de la interpretación: aún no se ha interpretado nada. */
function interpretacionInicial() {
  return { fase: 'inactiva', datos: null, error: null }
}

/** Título legible del error de interpretación según el estado HTTP. */
function tituloErrorInterpretacion(error) {
  if (error?.estado === 422) {
    return 'No pudimos interpretar la necesidad: revisa el texto'
  }
  if (error?.estado === 502) {
    return 'La interpretación no está disponible en este momento'
  }
  if (error?.estado === 403) {
    return 'No tienes acceso a la interpretación con IA'
  }
  return 'No pudimos interpretar la necesidad'
}

/** Mensaje legible del error de interpretación (sin detalles técnicos). */
function mensajeErrorInterpretacion(error) {
  if (error?.estado === 403) {
    return (
      'Tu cuenta no tiene permiso para usar la interpretación con IA. ' +
      'La búsqueda manual sigue disponible en esta misma sección.'
    )
  }
  if (error?.estado === 502) {
    // El backend ya envía un mensaje controlado que invita al flujo manual.
    return (
      error.message ||
      'El servicio de IA no respondió correctamente o no está disponible. ' +
        'Puedes reintentar la interpretación o configurar los criterios manualmente.'
    )
  }
  return error?.message
}

export default function Busqueda({ token, alSesionExpirada }) {
  // Criterios AND construidos por RH: [{ code, min_level }].
  const [criterios, setCriterios] = useState([])
  // Informativos para la revisión: NO se envían (Decisión Técnica #41).
  const [area, setArea] = useState('')
  const [puesto, setPuesto] = useState('')
  const [busqueda, setBusqueda] = useState(busquedaInicial)
  // Necesidad descrita por RH (query_text) para la interpretación IA (5B-2).
  const [necesidad, setNecesidad] = useState('')
  const [interpretacion, setInterpretacion] = useState(interpretacionInicial)

  // Editar criterios invalida resultados anteriores: nunca convive un
  // resultado con criterios distintos a los que lo generaron.
  function invalidarResultados() {
    setBusqueda(busquedaInicial())
  }

  function agregarCriterio() {
    // El primer código libre: el backend rechaza duplicados con 422.
    const disponible = COMPETENCIAS.find(
      (codigo) => !criterios.some((criterio) => criterio.code === codigo),
    )
    if (!disponible) return
    setCriterios((actual) => [...actual, { code: disponible, min_level: 4 }])
    invalidarResultados()
  }

  function quitarCriterio(indice) {
    setCriterios((actual) => actual.filter((_, i) => i !== indice))
    invalidarResultados()
  }

  function cambiarCriterio(indice, cambios) {
    setCriterios((actual) =>
      actual.map((criterio, i) => (i === indice ? { ...criterio, ...cambios } : criterio)),
    )
    invalidarResultados()
  }

  function interpretar() {
    // En carga no se acepta una segunda solicitud (prevención de duplicados).
    if (interpretacion.fase === 'cargando') return
    // Validación local del contrato de entrada (InterpretacionIn): texto no
    // vacío tras limpiar espacios y dentro de los 500 caracteres. Si no
    // cumple, ni se envía: el backend respondería 422.
    const texto = necesidad.trim()
    if (!texto || texto.length > MAX_NECESIDAD) return
    setInterpretacion({ fase: 'cargando', datos: null, error: null })
    interpretarBusqueda(token, texto)
      .then((datos) => {
        // La IA SOLO interpreta (PRD §17.3): los criterios propuestos se
        // cargan en el editor para que RH los revise y modifique. NUNCA se
        // ejecuta la búsqueda aquí.
        setCriterios(
          datos.criterios.competencies.map((criterio) => ({
            code: criterio.code,
            min_level: criterio.min_level,
          })),
        )
        // Contexto informativo de la interpretación (DT #41): se muestra en
        // la revisión, pero jamás viaja en el payload manual.
        setArea(datos.criterios.area ?? '')
        setPuesto(datos.criterios.position ?? '')
        invalidarResultados()
        setInterpretacion({ fase: 'listo', datos, error: null })
      })
      .catch((error) => {
        // 401: el backend ya decidió que la sesión no sirve (ET §32).
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setInterpretacion({ fase: 'error', datos: null, error })
      })
  }

  function ejecutar() {
    setBusqueda({ fase: 'cargando', datos: null, error: null })
    buscarTalento(token, criterios)
      .then((datos) => setBusqueda({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        // 401: el backend ya decidió que la sesión no sirve (ET §32).
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setBusqueda({ fase: 'error', datos: null, error })
      })
  }

  const hayCriterios = criterios.length > 0
  const todosSeleccionados = criterios.length >= COMPETENCIAS.length
  const necesidadValida =
    necesidad.trim().length > 0 && necesidad.trim().length <= MAX_NECESIDAD

  return (
    <div className="busqueda">
      <SectionHeader
        eyebrow="Criterios del sistema"
        title="Búsqueda"
        description="Describe tu necesidad para que la IA proponga criterios, o configúralos manualmente. En ambos casos tú los revisas y ejecutas la búsqueda: el backend determina qué empleados activos los cumplen."
      />

      {/* --- Paso 0 (5B-2): describir la necesidad e interpretarla con IA --- */}
      <section
        className="busqueda-necesidad"
        aria-label="Interpretación de la necesidad con IA"
      >
        <div className="busqueda-necesidad__cabecera">
          <h2>Describe tu necesidad</h2>
          <span className="busqueda-necesidad__contador">
            {necesidad.length}/{MAX_NECESIDAD}
          </span>
        </div>
        <label className="form-field__label" htmlFor="busqueda-necesidad">
          Necesidad de RH
        </label>
        <textarea
          id="busqueda-necesidad"
          className="ui-input busqueda-necesidad__texto"
          value={necesidad}
          maxLength={MAX_NECESIDAD}
          placeholder="Ej. Necesito personas con liderazgo y trabajo en equipo fuertes."
          onChange={(evento) =>
            setNecesidad(evento.target.value.slice(0, MAX_NECESIDAD))
          }
        />
        <p className="busqueda-necesidad__ayuda">
          La interpretación con IA solo propone criterios: tú los revisas,
          los ajustas si hace falta y decides cuándo ejecutar la búsqueda.
          También puedes configurar los criterios manualmente en el siguiente
          bloque.
        </p>
        <Button
          variant="secondary"
          onClick={interpretar}
          loading={interpretacion.fase === 'cargando'}
          disabled={!necesidadValida}
        >
          Interpretar necesidad
        </Button>

        {interpretacion.fase === 'listo' && interpretacion.datos && (
          <p className="busqueda-necesidad__origen">
            Criterios propuestos por la interpretación de{' '}
            {interpretacion.datos.proveedor}. Revísalos, edítalos si hace
            falta y ejecuta la búsqueda cuando estén listos.
          </p>
        )}

        {interpretacion.fase === 'cargando' && (
          <EstadoCarga texto="Interpretando tu necesidad con la IA…" />
        )}

        {interpretacion.fase === 'error' && (
          <EstadoError
            titulo={tituloErrorInterpretacion(interpretacion.error)}
            mensaje={mensajeErrorInterpretacion(interpretacion.error)}
            onReintentar={interpretar}
          />
        )}
      </section>

      {/* --- Paso 1: criterios configurados por RH -------------------------- */}
      <section className="busqueda-criterios" aria-label="Criterios de competencia">
        <div className="busqueda-criterios__cabecera">
          <h2>Criterios de competencia</h2>
          <Button
            variant="secondary"
            onClick={agregarCriterio}
            disabled={todosSeleccionados}
          >
            Agregar competencia
          </Button>
        </div>

        {criterios.length === 0 ? (
          <EstadoVacio
            titulo="Aún no hay criterios de competencia."
            descripcion="Agrega al menos una competencia con su nivel mínimo para poder revisarlos y ejecutar la búsqueda."
          />
        ) : (
          <ul className="busqueda-criterios__lista">
            {criterios.map((criterio, indice) => (
              <li key={indice} className="busqueda-criterios__fila">
                <label className="busqueda-criterios__campo">
                  <span className="form-field__label">Competencia</span>
                  <select
                    value={criterio.code}
                    onChange={(evento) =>
                      cambiarCriterio(indice, { code: evento.target.value })
                    }
                    aria-label={`Competencia del criterio ${indice + 1}`}
                  >
                    {COMPETENCIAS.map((codigo) => (
                      <option key={codigo} value={codigo}>
                        {NOMBRES_COMPETENCIAS[codigo] || codigo}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="busqueda-criterios__campo busqueda-criterios__campo--nivel">
                  <span className="form-field__label">Nivel mínimo</span>
                  <select
                    value={criterio.min_level}
                    onChange={(evento) =>
                      cambiarCriterio(indice, { min_level: Number(evento.target.value) })
                    }
                    aria-label={`Nivel mínimo del criterio ${indice + 1}`}
                  >
                    {NIVELES.map((nivel) => (
                      <option key={nivel} value={nivel}>
                        {nivel}
                      </option>
                    ))}
                  </select>
                </label>

                <Button
                  variant="ghost"
                  onClick={() => quitarCriterio(indice)}
                  aria-label={`Quitar criterio ${indice + 1}`}
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Criterios informativos opcionales (NO se envían: DT #41) ------- */}
      <section
        className="busqueda-informativos"
        aria-label="Criterios informativos opcionales"
      >
        <div className="busqueda-informativos__campo">
          <label className="form-field__label" htmlFor="busqueda-area">
            Área (informativo)
          </label>
          <input
            id="busqueda-area"
            className="ui-input"
            type="text"
            value={area}
            placeholder="Ej. TI"
            onChange={(evento) => setArea(evento.target.value)}
          />
        </div>
        <div className="busqueda-informativos__campo">
          <label className="form-field__label" htmlFor="busqueda-puesto">
            Puesto (informativo)
          </label>
          <input
            id="busqueda-puesto"
            className="ui-input"
            type="text"
            value={puesto}
            placeholder="Ej. Desarrollador"
            onChange={(evento) => setPuesto(evento.target.value)}
          />
        </div>
        <p className="busqueda-informativos__nota">
          Área y puesto se muestran como contexto de la revisión; la búsqueda
          actual se ejecuta únicamente sobre los criterios de competencia.
        </p>
      </section>

      {/* --- Paso 2: revisión de RH antes de ejecutar ----------------------- */}
      <section className="busqueda-revision" aria-label="Revisión de criterios">
        <h2>Revisión de RH</h2>
        {hayCriterios ? (
          <>
            <ul className="busqueda-revision__lista">
              {criterios.map((criterio, indice) => (
                <li key={indice}>
                  {NOMBRES_COMPETENCIAS[criterio.code] || criterio.code}: nivel
                  mínimo {criterio.min_level}
                </li>
              ))}
            </ul>
            {area.trim() && <p className="busqueda-revision__contexto">Área: {area.trim()}</p>}
            {puesto.trim() && (
              <p className="busqueda-revision__contexto">Puesto: {puesto.trim()}</p>
            )}
            <p className="busqueda-revision__nota">
              Todos los criterios se exigen a la vez (condición AND) y solo
              aplican a empleados activos.
            </p>
            <Button onClick={ejecutar} loading={busqueda.fase === 'cargando'}>
              Ejecutar búsqueda
            </Button>
          </>
        ) : (
          <p className="busqueda-revision__nota">
            Agrega al menos una competencia para revisar los criterios antes de
            ejecutar.
          </p>
        )}
      </section>

      {/* --- Paso 3: resultados (tal cual llegan del backend, en su orden) -- */}
      {busqueda.fase === 'cargando' && (
        <EstadoCarga texto="Ejecutando la búsqueda en el backend…" />
      )}

      {busqueda.fase === 'error' && (
        <EstadoError
          titulo={
            busqueda.error?.estado === 422
              ? 'No pudimos ejecutar la búsqueda: los criterios ya no son válidos'
              : 'No pudimos ejecutar la búsqueda'
          }
          mensaje={busqueda.error?.message}
          onReintentar={ejecutar}
        />
      )}

      {busqueda.fase === 'listo' && busqueda.datos && (
        <section className="busqueda-resultados" aria-label="Resultados de la búsqueda">
          <div className="busqueda-resultados__cabecera">
            <h2>Resultados</h2>
            <p className="busqueda-resultados__total">
              {busqueda.datos.total === 1
                ? '1 empleado activo cumple los criterios'
                : `${busqueda.datos.total} empleados activos cumplen los criterios`}
            </p>
          </div>

          {/* Eco de criterios del backend: la revisión de RH se apoya en el
              contrato, no en la memoria de la interfaz. */}
          <ul className="busqueda-resultados__criterios">
            {busqueda.datos.criterios.map((criterio) => (
              <li key={criterio.code}>
                {NOMBRES_COMPETENCIAS[criterio.code] || criterio.code}: nivel
                mínimo {criterio.min_level}
              </li>
            ))}
          </ul>

          {busqueda.datos.total === 0 ? (
            <EstadoVacio
              titulo="Ningún empleado activo cumple todos los criterios."
              descripcion="Revisa los niveles mínimos o edita los criterios para ampliar la búsqueda."
            />
          ) : (
            <ul className="busqueda-resultados__lista">
              {busqueda.datos.items.map((empleado) => (
                <li key={empleado.empleado_id} className="busqueda-resultados__empleado">
                  <h3>{empleado.nombre}</h3>
                  <p className="busqueda-resultados__meta">
                    {empleado.area || SIN_DATO}
                  </p>
                  <dl className="busqueda-resultados__competencias">
                    {empleado.competencias.map((competencia) => (
                      <div key={competencia.code}>
                        <dt>
                          {NOMBRES_COMPETENCIAS[competencia.code] || competencia.code}
                        </dt>
                        <dd>
                          {competencia.estado === 'INSUFFICIENT_DATA' ||
                          competencia.nivel === null ||
                          competencia.nivel === undefined
                            ? 'Datos insuficientes.'
                            : competencia.nivel}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {empleado.promedio_seleccionadas !== null &&
                    empleado.promedio_seleccionadas !== undefined && (
                      <p className="busqueda-resultados__promedio">
                        Promedio de las competencias seleccionadas:{' '}
                        {empleado.promedio_seleccionadas} (valor informativo del
                        backend; no constituye una decisión de selección).
                      </p>
                    )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

