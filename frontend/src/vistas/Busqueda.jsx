// Sección RH → Búsqueda de talento (PRD §13.1; ET §26/§27; Style Guide §27).
//
// Flujo manual (5B-1, SIN interpretación IA):
//   necesidad de RH → criterios configurados aquí → revisión de RH →
//   ejecutar búsqueda → resultados del backend.
//
// Reglas que esta vista respeta y no debe romper:
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
import { buscarTalento } from '../api/busqueda.js'
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

/** Estado inicial de la búsqueda: aún no se ha ejecutado. */
function busquedaInicial() {
  return { fase: 'inactiva', datos: null, error: null }
}

export default function Busqueda({ token, alSesionExpirada }) {
  // Criterios AND construidos por RH: [{ code, min_level }].
  const [criterios, setCriterios] = useState([])
  // Informativos para la revisión: NO se envían (Decisión Técnica #41).
  const [area, setArea] = useState('')
  const [puesto, setPuesto] = useState('')
  const [busqueda, setBusqueda] = useState(busquedaInicial)

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

  return (
    <div className="busqueda">
      <SectionHeader
        eyebrow="Criterios del sistema"
        title="Búsqueda"
        description="Configura los criterios de competencia y nivel mínimo, revísalos y ejecuta la búsqueda: el backend determina qué empleados activos los cumplen."
      />

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

