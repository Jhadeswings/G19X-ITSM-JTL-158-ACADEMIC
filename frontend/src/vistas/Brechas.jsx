// Sección RH → Brechas (PRD §15 y §20.7; Style Guide §26 y guía de Brechas).
//
// UNA competencia a la vez sobre el resultado ACTUAL: los conteos y
// porcentajes llegan YA calculados por GET /rh/gaps (el mismo contrato del
// panel de distribución del dashboard, reutilizado sin cambios); aquí solo se
// presentan — React no recalcula porcentajes ni deriva nada.
//
// Presentación: cantidad, porcentaje y contexto (Style Guide). Los niveles
// 1–2 NUNCA se pintan en rojo ni como alarma: el porcentaje es una lectura
// operativa. `Datos insuficientes` es un estado válido mostrado POR SEPARADO,
// fuera de los grupos y del denominador (nunca nivel 0). Sin empleados
// individuales, sin ranking y sin score (PRD §15).

import { useCallback, useEffect, useState } from 'react'
import { obtenerDistribucionCompetencia } from '../api/dashboardRh.js'
import { NOMBRES_COMPETENCIAS } from '../textos.js'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'

/** Las cinco competencias oficiales (PRD §15/§16): una por consulta. */
const COMPETENCIAS = [
  'desempeno_tecnico',
  'liderazgo',
  'trabajo_equipo',
  'comunicacion',
  'aprendizaje',
]

/** Estado inicial de la consulta (patrón de las demás vistas RH). */
function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

/** Porcentaje tal cual llega (texto Decimal del backend): solo presentación. */
function formatearPorcentaje(valor) {
  return `${String(valor)} %`
}

export default function Brechas({ token, alSesionExpirada }) {
  const [competencia, setCompetencia] = useState(COMPETENCIAS[0])
  const [consulta, setConsulta] = useState(consultaInicial)

  const cargar = useCallback(
    (codigo) => {
      // Anti-parpadeo (patrón del dashboard): en recargas se conservan los
      // datos anteriores mientras llega la nueva respuesta.
      setConsulta((actual) => ({
        fase: 'cargando',
        datos: actual.datos,
        error: null,
      }))
      obtenerDistribucionCompetencia(token, codigo)
        .then((datos) => setConsulta({ fase: 'listo', datos, error: null }))
        .catch((error) => {
          // 401: el backend ya decidió que la sesión no sirve (ET §32).
          if (error?.estado === 401) {
            alSesionExpirada?.()
            return
          }
          setConsulta((actual) => ({
            fase: 'error',
            datos: actual.datos,
            error,
          }))
        })
    },
    [token, alSesionExpirada],
  )

  useEffect(() => {
    cargar(competencia)
  }, [cargar, competencia])

  const { fase, datos } = consulta
  const nombre = NOMBRES_COMPETENCIAS[competencia] || competencia

  return (
    <div className="brechas">
      <SectionHeader
        eyebrow="Lectura por competencia"
        title="Brechas"
        description="Distribución de niveles de una competencia a la vez, con los valores calculados por el sistema."
      />

      <section className="distribution-panel" aria-labelledby="brechas-titulo">
        <div className="distribution-panel__heading">
          <div>
            <p className="eyebrow">Una competencia a la vez</p>
            <h2 id="brechas-titulo">Distribución de niveles</h2>
            <p className="distribution-panel__description">
              Los porcentajes se calculan únicamente sobre empleados
              evaluables: son una lectura operativa, no una señal de alarma.
            </p>
          </div>
          <label className="distribution-panel__selector">
            <span className="visualmente-oculto">Competencia</span>
            <select
              value={competencia}
              onChange={(evento) => setCompetencia(evento.target.value)}
              aria-label="Competencia"
            >
              {COMPETENCIAS.map((codigo) => (
                <option key={codigo} value={codigo}>
                  {NOMBRES_COMPETENCIAS[codigo] || codigo}
                </option>
              ))}
            </select>
          </label>
        </div>

        {fase === 'cargando' && !datos && (
          <div className="distribution-panel__loading" aria-busy="true">
            Cargando brechas de {nombre.toLowerCase()}…
          </div>
        )}
        {fase === 'cargando' && datos && (
          <span className="visualmente-oculto" role="status">
            Actualizando brechas…
          </span>
        )}

        {fase === 'error' && (
          <EstadoError
            titulo={
              datos
                ? `No pudimos actualizar las brechas de ${nombre.toLowerCase()}`
                : `No pudimos cargar las brechas de ${nombre.toLowerCase()}`
            }
            onReintentar={() => cargar(competencia)}
          />
        )}

        {datos && (
          <div className="distribution-panel__body" aria-busy={fase === 'cargando'}>
            <p className="distribution-panel__evaluables">
              <span className="distribution-panel__evaluables-valor">
                {datos.evaluables}
              </span>
              <span>
                empleados evaluables en{' '}
                {NOMBRES_COMPETENCIAS[datos.competency_code] ||
                  datos.competency_code}
              </span>
            </p>

            {datos.evaluables === 0 ? (
              <EstadoVacio
                titulo="Aún no hay empleados evaluables en esta competencia."
                descripcion="Cuando exista evidencia suficiente, aquí verás la distribución de niveles."
              />
            ) : (
              <dl className="distribution-list">
                <div className="distribution-list__item">
                  <dt>Niveles 1–2</dt>
                  <dd>
                    {datos.nivel_1_2_count} ({formatearPorcentaje(datos.nivel_1_2_percentage)})
                  </dd>
                </div>
                <div className="distribution-list__item">
                  <dt>Niveles 3–5</dt>
                  <dd>
                    {datos.nivel_3_5_count} ({formatearPorcentaje(datos.nivel_3_5_percentage)})
                  </dd>
                </div>
              </dl>
            )}

            <p className="distribution-panel__di">
              Datos insuficientes: {datos.datos_insuficientes} (se muestran por
              separado y no forman parte de los porcentajes).
            </p>

            {/* Contexto (Style Guide): qué significa cada grupo, con las
                etiquetas oficiales de nivel del sistema. Sin métricas nuevas. */}
            <p className="brechas__contexto">
              Contexto: niveles 1–2 agrupa los niveles Inicial y En desarrollo;
              niveles 3–5, En crecimiento, Consolidado y Alto. El porcentaje se
              calcula solo sobre los {datos.evaluables} empleados evaluables.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}