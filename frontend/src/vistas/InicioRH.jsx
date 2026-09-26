import { useCallback, useEffect, useState } from 'react'
import { BriefcaseBusiness, ClipboardCheck, Users } from 'lucide-react'
import { obtenerAtencionRequerida, obtenerDistribucionCompetencia, obtenerEmpleadosActivos, obtenerProyectosActivos } from '../api/dashboardRh.js'
import { NOMBRES_COMPETENCIAS } from '../textos.js'
import MetricCard from '../componentes/MetricCard.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import { Button } from '../componentes/ui/Button.jsx'

const MOTIVOS = {
  PERFIL_INCOMPLETO: 'Perfil incompleto',
  SIN_PARTICIPACION_RECIENTE: 'Sin participación reciente',
}

function MetricaError({ titulo, onReintentar }) {
  return <EstadoError titulo={titulo} onReintentar={onReintentar} />
}

function listaMotivos(motivos = []) {
  return motivos.map((motivo) => MOTIVOS[motivo] || motivo)
}

const COMPETENCIAS_DISTRIBUCION = [
  'desempeno_tecnico',
  'liderazgo',
  'trabajo_equipo',
  'aprendizaje',
  'comunicacion',
]

function formatearPorcentaje(valor) {
  return `${String(valor)} %`
}

export default function InicioRH({ token, onSesionExpirada, onVerEmpleados }) {
  const [empleados, setEmpleados] = useState({ fase: 'cargando', total: null, error: null })
  const [proyectos, setProyectos] = useState({ fase: 'cargando', total: null, error: null })
  const [atencion, setAtencion] = useState({ fase: 'cargando', total: null, items: [], error: null })
  const [competencia, setCompetencia] = useState(COMPETENCIAS_DISTRIBUCION[0])
  const [distribucion, setDistribucion] = useState({ fase: 'cargando', datos: null, error: null })

  const manejarError = useCallback((error, setEstado) => {
    if (error?.estado === 401) { onSesionExpirada?.(); return }
    setEstado((actual) => ({ ...actual, fase: 'error', error }))
  }, [onSesionExpirada])

  const cargarEmpleados = useCallback(() => {
    setEmpleados({ fase: 'cargando', total: null, error: null })
    obtenerEmpleadosActivos(token).then((respuesta) => setEmpleados({ fase: 'listo', total: respuesta.total, error: null })).catch((error) => manejarError(error, setEmpleados))
  }, [token, manejarError])

  const cargarProyectos = useCallback(() => {
    setProyectos({ fase: 'cargando', total: null, error: null })
    obtenerProyectosActivos(token).then((respuesta) => setProyectos({ fase: 'listo', total: respuesta.total, error: null })).catch((error) => manejarError(error, setProyectos))
  }, [token, manejarError])

  const cargarAtencion = useCallback(() => {
    setAtencion({ fase: 'cargando', total: null, items: [], error: null })
    obtenerAtencionRequerida(token).then((respuesta) => setAtencion({ fase: 'listo', total: respuesta.total, items: respuesta.items || [], error: null })).catch((error) => manejarError(error, setAtencion))
  }, [token, manejarError])

  const cargarDistribucion = useCallback((codigo) => {
    // Corrección parpadeo: en recargas se conservan los datos anteriores
    // mientras llega la nueva respuesta (no se borran con datos: null).
    setDistribucion((actual) => ({ fase: 'cargando', datos: actual.datos, error: null }))
    // Una sola competencia a la vez: la respuesta llega calculada por
    // backend y el frontend solo la presenta (sin recalcular porcentajes).
    obtenerDistribucionCompetencia(token, codigo)
      .then((respuesta) => setDistribucion({ fase: 'listo', datos: respuesta, error: null }))
      .catch((error) => manejarError(error, setDistribucion))
  }, [token, manejarError])

  const cambiarCompetencia = useCallback((evento) => {
    setCompetencia(evento.target.value)
  }, [])

  const reintentarDistribucion = useCallback(() => {
    cargarDistribucion(competencia)
  }, [cargarDistribucion, competencia])

  useEffect(() => { cargarEmpleados() }, [cargarEmpleados])
  useEffect(() => { cargarProyectos() }, [cargarProyectos])
  useEffect(() => { cargarAtencion() }, [cargarAtencion])
  useEffect(() => { cargarDistribucion(competencia) }, [cargarDistribucion, competencia])

  const metricas = [
    { label: 'Empleados activos', icon: Users, estado: empleados, cargar: cargarEmpleados, descripcion: 'Personas con una cuenta activa en el catálogo.' },
    { label: 'Proyectos activos', icon: BriefcaseBusiness, estado: proyectos, cargar: cargarProyectos, descripcion: 'Proyectos que se encuentran en proceso.' },
    { label: 'Atención requerida', icon: ClipboardCheck, estado: atencion, cargar: cargarAtencion, descripcion: 'Empleados con datos incompletos o sin participación reciente.' },
  ]


  return (
    <div className="dashboard-rh" aria-labelledby="dashboard-rh-title">
      <SectionHeader title="Inicio" eyebrow="Panel de talento" description="Resumen operativo del talento." />
      <section className="dashboard-metrics" aria-labelledby="metricas-rh-title">
        <h2 id="metricas-rh-title" className="visualmente-oculto">Métricas principales</h2>
        <div className="dashboard-metrics__grid">
          {metricas.map(({ label, icon, estado, cargar, descripcion }) => (
            <MetricCard key={label} label={label} icon={icon} description={descripcion} value={estado.fase === 'listo' ? estado.total : undefined} aria-busy={estado.fase === 'cargando'} aria-label={`${label}: ${estado.fase === 'listo' ? estado.total : 'cargando'}`}>
              {estado.fase === 'cargando' && <span className="metric-card__loading" aria-label={`${label} cargando`} />}
              {estado.fase === 'error' && <MetricaError titulo={`No pudimos cargar ${label.toLowerCase()}`} onReintentar={cargar} />}
            </MetricCard>
          ))}
        </div>
      </section>
      <section className="attention-panel" aria-labelledby="atencion-rh-title">
        <div className="attention-panel__heading"><div><p className="eyebrow">Orientación operativa</p><h2 id="atencion-rh-title">Atención requerida</h2></div>{atencion.fase === 'listo' && <span className="attention-panel__total" aria-label={`${atencion.total} empleados requieren atención`}>{atencion.total}</span>}</div>
        {atencion.fase === 'cargando' && <div className="attention-panel__loading" aria-busy="true">Cargando atención requerida…</div>}
        {atencion.fase === 'error' && <EstadoError titulo="No pudimos cargar la atención requerida" onReintentar={cargarAtencion} />}
        {atencion.fase === 'listo' && atencion.total === 0 && <EstadoVacio titulo="No hay empleados que requieran atención en este momento." descripcion="La información disponible no requiere seguimiento operativo en este momento." />}
        {atencion.fase === 'listo' && atencion.total > 0 && <>
          <ul className="attention-list">{atencion.items.slice(0, 6).map((item) => <li key={item.empleado_id}><div><strong>{item.nombre}</strong><div className="attention-list__motivos">{listaMotivos(item.motivos).map((motivo) => <span key={motivo}>{motivo}</span>)}</div></div></li>)}</ul>
          {atencion.total > 6 && <p className="attention-panel__note">Mostrando 6 de {atencion.total} empleados. La consulta completa está disponible en la respuesta de atención requerida.</p>}
          {onVerEmpleados && <Button variant="secondary" onClick={onVerEmpleados}>Ver empleados</Button>}
        </>}
      </section>
      <section className="distribution-panel" aria-labelledby="distribucion-rh-title">
        <div className="distribution-panel__heading">
          <div>
            <p className="eyebrow">Lectura por competencia</p>
            <h2 id="distribucion-rh-title">Distribución de competencias</h2>
            <p className="distribution-panel__description">Una competencia a la vez. Los valores mostrados son los calculados por el sistema.</p>
          </div>
          <label className="distribution-panel__selector">
            <span className="visualmente-oculto">Competencia</span>
            <select value={competencia} onChange={cambiarCompetencia} aria-label="Competencia">
              {COMPETENCIAS_DISTRIBUCION.map((codigo) => (
                <option key={codigo} value={codigo}>{NOMBRES_COMPETENCIAS[codigo] || codigo}</option>
              ))}
            </select>
          </label>
        </div>
        {distribucion.fase === 'cargando' && !distribucion.datos && <div className="distribution-panel__loading" aria-busy="true">Cargando distribución de {NOMBRES_COMPETENCIAS[competencia] || competencia}…</div>}
        {distribucion.fase === 'cargando' && distribucion.datos && <span className="visualmente-oculto" role="status">Actualizando distribución…</span>}
        {distribucion.fase === 'error' && <EstadoError titulo={distribucion.datos ? `No pudimos actualizar la distribución de ${(NOMBRES_COMPETENCIAS[competencia] || competencia).toLowerCase()}` : `No pudimos cargar la distribución de ${(NOMBRES_COMPETENCIAS[competencia] || competencia).toLowerCase()}`} onReintentar={reintentarDistribucion} />}
        {distribucion.datos && (
          <div className="distribution-panel__body" aria-busy={distribucion.fase === 'cargando'}>
            <p className="distribution-panel__evaluables">
              <span className="distribution-panel__evaluables-valor">{distribucion.datos.evaluables}</span>
              <span>empleados evaluables en {NOMBRES_COMPETENCIAS[distribucion.datos.competency_code] || distribucion.datos.competency_code}</span>
            </p>
            {distribucion.datos.evaluables === 0 ? (
              <EstadoVacio titulo="Aún no hay empleados evaluables en esta competencia." descripcion="Cuando exista evidencia suficiente, aquí verás la distribución de niveles." />
            ) : (
              <dl className="distribution-list">
                <div className="distribution-list__item">
                  <dt>Niveles 1–2</dt>
                  <dd>{distribucion.datos.nivel_1_2_count} ({formatearPorcentaje(distribucion.datos.nivel_1_2_percentage)})</dd>
                </div>
                <div className="distribution-list__item">
                  <dt>Niveles 3–5</dt>
                  <dd>{distribucion.datos.nivel_3_5_count} ({formatearPorcentaje(distribucion.datos.nivel_3_5_percentage)})</dd>
                </div>
              </dl>
            )}
            <p className="distribution-panel__di">Datos insuficientes: {distribucion.datos.datos_insuficientes} (se muestran por separado y no forman parte de los porcentajes).</p>
          </div>
        )}
      </section>
    </div>
  )
}
