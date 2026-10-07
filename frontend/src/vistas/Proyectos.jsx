// Sección RH → Proyectos (PRD §20.3 y §11.1; Especificación Técnica §6–§8,
// §31; DECISIONES_TECNICAS §15; Style Guide §26 "Proyectos RH", §13 estados).
//
// Catálogo compartido: RH CONSULTA y EDITA proyectos existentes (§20.3).
// NO existe botón «Nuevo proyecto» (PRD §20.3/§11.1): la creación pertenece
// al flujo del Empleado («Mis proyectos», con búsqueda obligatoria previa)
// y esta vista no duplica nada de ese flujo — ni búsqueda aproximada, ni
// alta, ni registro de participación.
//
// Contrato real del backend (nada se inventa):
// - GET   /api/v1/rh/projects       → ProyectoPageOut (paginado).
// - GET   /api/v1/rh/projects/{id}  → ProyectoOut; 404 si no existe.
// - PATCH /api/v1/rh/projects/{id}  → ProyectoOut. Editables EXACTAMENTE
//   `nombre`, `area`, `cliente` y `estado` (ProyectoUpdateIn, §31): el
//   backend renormaliza el nombre (§7/§11.2), responde 409 si el nombre ya
//   existe en otro proyecto, 422 si el estado no es oficial y 422 si no
//   viaja ningún campo. `id`, `nombre_normalizado` y las fechas NUNCA se
//   envían: los fija el servidor.
// - PATCH /api/v1/rh/participations/{id} → ParticipacionOut. Corrección
//   administrativa de UNA participación (RH-02.2, PRD §12.2): editables
//   EXACTAMENTE rol, entregables, los cuatro indicadores, horas y el motivo
//   opcional de auditoría (§25). El backend audita quién/qué/cuándo y los
//   valores anteriores/nuevos en la MISMA transacción. Jamás se envían
//   empleado_id, proyecto_id ni fecha_registro (422).
//
// La vista no decide nada de negocio: no normaliza nombres, no valida
// unicidad, no calcula nada. Solo envía los campos del contrato que la
// persona cambió respecto al proyecto consultado. Consultar y editar son
// dos modos explícitos de la misma tarjeta, sin pantallas nuevas ni
// administración pesada (Style Guide §26). 401 → `alSesionExpirada`
// (ET §31/§32); el RBAC lo aplica el backend (require_rh) en cada petición.

import { Fragment, useCallback, useEffect, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import {
  POR_PAGINA_DEFECTO_RH,
  actualizarProyectoRh,
  consultarProyectoRh,
  listarProyectosRh,
} from '../api/proyectos.js'
import {
  POR_PAGINA_DEFECTO_RH as POR_PAGINA_PARTICIPACIONES,
  corregirParticipacion,
  listarParticipacionesDeProyecto,
} from '../api/participaciones.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import FormField from '../componentes/FormField.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import Alert from '../componentes/ui/Alert.jsx'
import Badge from '../componentes/ui/Badge.jsx'
import { Button } from '../componentes/ui/Button.jsx'
import { Input } from '../componentes/ui/Input.jsx'
import Pagination from '../componentes/ui/Pagination.jsx'
import Table from '../componentes/ui/Table.jsx'

/** Texto neutro para datos ausentes: nunca un hueco ni un error. */
const SIN_DATO = '—'

/** Estados oficiales del proyecto (ET §6; Literal del backend). */
const ESTADOS_PROYECTO = ['EN_PROCESO', 'COMPLETADO', 'CANCELADO']

/** Etiquetas de presentación de los estados oficiales (Style Guide §4.5). */
const ETIQUETAS_ESTADO = {
  EN_PROCESO: 'En proceso',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado',
}

/** Tono del badge (Style Guide §4.5): EN_PROCESO es identidad, NO advertencia. */
const TONOS_ESTADO = {
  EN_PROCESO: 'neutral',
  COMPLETADO: 'success',
  CANCELADO: 'outline',
}

function etiquetaEstado(estado) {
  return ETIQUETAS_ESTADO[estado] ?? estado
}

function tonoEstado(estado) {
  return TONOS_ESTADO[estado] ?? 'neutral'
}

/**
 * Columnas de la tabla de participantes (RH-02.1; Style Guide §14.1): nombre
 * y puesto vienen del backend (identificación de presentación); ni métricas
 * ni ranking — el orden es el cronológico del backend. Horas y acción
 * alineadas a la derecha (§14.1), igual que su encabezado.
 */
const COLUMNAS_PARTICIPANTES = [
  { key: 'empleado', label: 'Empleado' },
  { key: 'puesto', label: 'Puesto' },
  { key: 'rol', label: 'Rol' },
  { key: 'horas', label: 'Horas', align: 'right' },
  { key: 'accion', label: 'Acción', align: 'right' },
]

/** Estado inicial de la consulta: el mismo patrón que las demás vistas RH. */
function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

export default function Proyectos({ token, alSesionExpirada }) {
  const [pagina, setPagina] = useState(1)
  const [listado, setListado] = useState(consultaInicial)
  // Detalle consultado: { id, fase: 'cargando' | 'listo' | 'error', datos, error }.
  const [detalle, setDetalle] = useState(null)
  // Dos modos explícitos de la misma tarjeta: consulta (solo lectura) y
  // edición (formulario administrativo). Nada más.
  const [modo, setModo] = useState('consulta')
  const [formulario, setFormulario] = useState(null)
  const [errorNombre, setErrorNombre] = useState(null)
  const [guardado, setGuardado] = useState({ fase: 'inactivo', error: null })
  // Participantes del proyecto consultado (RH-02.1): solo lectura, jamás
  // mezclados con la edición administrativa del proyecto.
  const [participantes, setParticipantes] = useState(consultaInicial)
  const [participantesPagina, setParticipantesPagina] = useState(1)
  const [participacionAbierta, setParticipacionAbierta] = useState(null)
  // Corrección administrativa de UNA participación (RH-02.2, PRD §12.2):
  // formulario propio dentro del detalle expandido del participante,
  // SEPARADO de la edición del proyecto. `{ id, formulario }` o null.
  const [correccion, setCorreccion] = useState(null)
  const [guardadoCorreccion, setGuardadoCorreccion] = useState({
    fase: 'inactivo',
    error: null,
  })

  const cargar = useCallback(() => {
    setListado(consultaInicial())
    listarProyectosRh(token, { pagina, porPagina: POR_PAGINA_DEFECTO_RH })
      .then((datos) => setListado({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setListado({ fase: 'error', datos: null, error })
      })
  }, [token, pagina, alSesionExpirada])

  useEffect(() => {
    cargar()
  }, [cargar])

  /**
   * Cierra el detalle y vuelve al listado SIN recargar el catálogo: la
   * página de paginación y el estado del listado se conservan tal cual
   * (en consulta, mismo efecto que pulsar Escape; la X conserva este
   * comportamiento en ambos modos).
   */
  const cerrarDetalle = useCallback(() => {
    setDetalle(null)
    setModo('consulta')
    setFormulario(null)
    setErrorNombre(null)
    setGuardado({ fase: 'inactivo', error: null })
    setParticipacionAbierta(null)
    setCorreccion(null)
    setGuardadoCorreccion({ fase: 'inactivo', error: null })
  }, [])

  /**
   * Cancela la edición y vuelve a la CONSULTA del mismo proyecto, sin
   * guardar nada: exactamente el efecto del botón «Cancelar» del
   * formulario. Se define como callback (y antes del listener de Escape)
   * porque ese listener la reutiliza como su comportamiento en edición.
   */
  const cancelarEdicion = useCallback(() => {
    setModo('consulta')
    setFormulario(null)
    setErrorNombre(null)
    setGuardado({ fase: 'inactivo', error: null })
  }, [])

  /**
   * Cancela la corrección administrativa abierta: cierra el formulario sin
   * guardar nada (mismo efecto que su botón «Cancelar»). Se define como
   * callback porque el listener de Escape la reutiliza.
   */
  const cancelarCorreccion = useCallback(() => {
    setCorreccion(null)
    setGuardadoCorreccion({ fase: 'inactivo', error: null })
  }, [])

  /**
   * Escape depende del estado del detalle (RH-02.1/RH-02.2):
   * - CONSULTA + corrección abierta: cancela SOLO la corrección (el detalle
   *   y los cambios de contexto se conservan; nunca se descarta en silencio).
   * - CONSULTA: cierra el detalle (mismo efecto que la X).
   * - EDICIÓN del proyecto: actúa como «Cancelar» — vuelve a la consulta del
   *   MISMO proyecto sin cerrar el detalle, sin guardar y sin PATCH.
   *
   * Listener propio en `document`: no interfiere con el detector de
   * actividad de la sesión (`useInactividad` escucha `keydown` pasivo en
   * `window`), así que Escape sigue contando como interacción. Sin detalle
   * abierto no hace nada específico de esta sección.
   */
  useEffect(() => {
    if (!detalle) return undefined
    function alPulsarTecla(evento) {
      if (evento.key === 'Escape') {
        if (modo === 'edicion') cancelarEdicion()
        else if (correccion) cancelarCorreccion()
        else cerrarDetalle()
      }
    }
    document.addEventListener('keydown', alPulsarTecla)
    return () => document.removeEventListener('keydown', alPulsarTecla)
  }, [detalle, modo, correccion, cerrarDetalle, cancelarEdicion, cancelarCorreccion])

  /** Abre la CONSULTA de un proyecto del catálogo (GET /{id}). */
  const abrir = useCallback(
    (proyectoId) => {
      setModo('consulta')
      setGuardado({ fase: 'inactivo', error: null })
      setErrorNombre(null)
      setParticipacionAbierta(null)
      setCorreccion(null)
      setGuardadoCorreccion({ fase: 'inactivo', error: null })
      setParticipantesPagina(1)
      setDetalle({ id: proyectoId, fase: 'cargando', datos: null, error: null })
      consultarProyectoRh(token, proyectoId)
        .then((datos) =>
          setDetalle({ id: datos.id, fase: 'listo', datos, error: null }),
        )
        .catch((error) => {
          if (error?.estado === 401) {
            alSesionExpirada?.()
            return
          }
          setDetalle({ id: proyectoId, fase: 'error', datos: null, error })
        })
    },
    [token, alSesionExpirada],
  )

  /** Participantes del proyecto consultado (RH-02.1, solo lectura). */
  const cargarParticipantes = useCallback(() => {
    if (!detalle?.id) return undefined
    const proyectoId = detalle.id
    setParticipantes(consultaInicial())
    listarParticipacionesDeProyecto(token, proyectoId, {
      pagina: participantesPagina,
      porPagina: POR_PAGINA_PARTICIPACIONES,
    })
      .then((datos) => setParticipantes({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setParticipantes({ fase: 'error', datos: null, error })
      })
    return undefined
  }, [token, detalle?.id, participantesPagina, alSesionExpirada])

  useEffect(() => {
    if (detalle?.id) {
      cargarParticipantes()
    }
  }, [cargarParticipantes])

  /**
   * Cambiar de página de participantes cierra cualquier corrección abierta:
   * el formulario vive en la fila de UNA participación de la página actual.
   */
  const cambiarPaginaParticipantes = useCallback((nuevaPagina) => {
    setParticipantesPagina(nuevaPagina)
    setCorreccion(null)
    setGuardadoCorreccion({ fase: 'inactivo', error: null })
  }, [])

  /**
   * Abre la corrección administrativa de UNA participación (RH-02.2, PRD
   * §12.2) con los valores actuales del contrato. Acción separada de
   * «Editar proyecto»: este formulario jamás toca al proyecto.
   */
  const abrirCorreccion = useCallback((participacion) => {
    setCorreccion({
      id: participacion.id,
      formulario: {
        rol: participacion.rol,
        entregables: participacion.entregables ?? '',
        horas: String(participacion.horas),
        en_equipo: participacion.en_equipo,
        coordino_tareas: participacion.coordino_tareas,
        explico_a_publico_distinto: participacion.explico_a_publico_distinto,
        resolvio_problema: participacion.resolvio_problema,
        motivo: '',
      },
    })
    setGuardadoCorreccion({ fase: 'inactivo', error: null })
  }, [])

  /**
   * Guarda la corrección administrativa (RH-02.2). Solo viajan los campos
   * del contrato `ParticipacionRhUpdateIn` que CAMBIARON (más el motivo de
   * auditoría si se escribió); sin cambios no se hace ningún PATCH. La
   * validación visible (rol obligatorio, horas enteras ≥ 0) replica la del
   * backend para evitar un viaje inútil, no para reemplazarla. Tras el éxito
   * se recargan los participantes del proyecto. 401 → alSesionExpirada.
   */
  function guardarCorreccion(evento, participacion) {
    evento.preventDefault()
    const formulario = correccion.formulario
    const rol = formulario.rol.trim()
    if (!rol) {
      setGuardadoCorreccion({
        fase: 'error',
        error: { message: 'El rol de la participación no puede estar vacío.' },
      })
      return
    }
    const horas = Number(formulario.horas)
    if (!Number.isInteger(horas) || horas < 0) {
      setGuardadoCorreccion({
        fase: 'error',
        error: {
          message: 'Las horas deben ser un número entero mayor o igual a cero.',
        },
      })
      return
    }

    // ParticipacionRhUpdateIn: exactamente los campos corregidos + motivo.
    const cambios = {}
    if (rol !== participacion.rol) cambios.rol = rol
    const entregables = formulario.entregables.trim() || null
    if (entregables !== (participacion.entregables ?? null)) {
      cambios.entregables = entregables
    }
    if (horas !== participacion.horas) cambios.horas = horas
    for (const indicador of [
      'en_equipo',
      'coordino_tareas',
      'explico_a_publico_distinto',
      'resolvio_problema',
    ]) {
      if (formulario[indicador] !== participacion[indicador]) {
        cambios[indicador] = formulario[indicador]
      }
    }
    const motivo = formulario.motivo.trim()
    if (motivo) cambios.motivo = motivo
    if (Object.keys(cambios).length === 0) {
      setGuardadoCorreccion({
        fase: 'error',
        error: { message: 'No hay cambios que corregir en esta participación.' },
      })
      return
    }

    setGuardadoCorreccion({ fase: 'corrigiendo', error: null })
    corregirParticipacion(token, participacion.id, cambios)
      .then(() => {
        setCorreccion(null)
        setGuardadoCorreccion({ fase: 'exito', error: null })
        cargarParticipantes() // los participantes deben reflejar la corrección
      })
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setGuardadoCorreccion({ fase: 'error', error })
      })
  }

  function entrarEdicion() {
    const proyecto = detalle.datos
    // La edición del proyecto es EXCLUYENTE con la corrección de una
    // participación (RH-02.2): dos formularios administrativos distintos.
    setCorreccion(null)
    setGuardadoCorreccion({ fase: 'inactivo', error: null })
    setFormulario({
      nombre: proyecto.nombre,
      area: proyecto.area ?? '',
      cliente: proyecto.cliente ?? '',
      estado: proyecto.estado,
    })
    setErrorNombre(null)
    setGuardado({ fase: 'inactivo', error: null })
    setModo('edicion')
  }

  function guardar(evento) {
    evento.preventDefault()
    const original = detalle.datos
    const nombre = formulario.nombre.trim()
    if (!nombre) {
      setErrorNombre('El nombre del proyecto no puede estar vacío.')
      return
    }

    // Solo viajan los campos del contrato que CAMBIARON: ProyectoUpdateIn es
    // opcional campo a campo y el backend responde 422 sin ninguno. Nunca se
    // envían id, nombre_normalizado ni fechas.
    const cambios = {}
    if (nombre !== original.nombre) cambios.nombre = nombre
    const area = formulario.area.trim() || null
    if (area !== (original.area ?? null)) cambios.area = area
    const cliente = formulario.cliente.trim() || null
    if (cliente !== (original.cliente ?? null)) cambios.cliente = cliente
    if (formulario.estado !== original.estado) cambios.estado = formulario.estado
    if (Object.keys(cambios).length === 0) return

    setGuardado({ fase: 'guardando', error: null })
    actualizarProyectoRh(token, detalle.id, cambios)
      .then((datos) => {
        setDetalle({ id: datos.id, fase: 'listo', datos, error: null })
        setModo('consulta')
        setGuardado({ fase: 'exito', error: null })
        cargar() // el catálogo debe reflejar el cambio
      })
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setGuardado({ fase: 'error', error })
      })
  }

  const { fase, datos } = listado
  const items = fase === 'listo' ? datos?.items || [] : []
  const total = fase === 'listo' ? datos?.total ?? 0 : 0
  const porPagina =
    fase === 'listo'
      ? datos?.por_pagina ?? POR_PAGINA_DEFECTO_RH
      : POR_PAGINA_DEFECTO_RH

  return (
    <div className="proyectos-rh">
      <SectionHeader
        eyebrow="Talento"
        title="Proyectos"
        description="Catálogo compartido de proyectos. Consulta y administra los proyectos existentes; los proyectos nuevos se registran desde «Mis proyectos» del empleado."
      />

      {/* --- Catálogo paginado (§20.3) ---------------------------------- */}
      <section
        className="proyectos-rh__catalogo"
        aria-labelledby="proyectos-rh-catalogo-titulo"
      >
        <h2 id="proyectos-rh-catalogo-titulo">Catálogo de proyectos</h2>

        {fase === 'cargando' && <EstadoCarga texto="Cargando proyectos…" />}

        {fase === 'error' && (
          <EstadoError
            titulo="No pudimos cargar los proyectos"
            mensaje="Ocurrió un problema al obtener el catálogo de proyectos."
            onReintentar={cargar}
          />
        )}

        {fase === 'listo' && total === 0 && (
          <EstadoVacio
            titulo="Todavía no hay proyectos en el catálogo."
            descripcion="Los proyectos se registran desde «Mis proyectos» del empleado, con una búsqueda previa para evitar duplicados."
          />
        )}

        {fase === 'listo' && total > 0 && (
          <>
            <ul className="proyectos-rh__lista">
              {items.map((proyecto) => {
                const seleccionado = detalle?.id === proyecto.id
                return (
                  // Tres columnas estables: datos (flexible) | estado | acción.
                  // La fila abierta se marca con fondo suave + borde primario
                  // Y estructuralmente con aria-current en su botón (la
                  // selección nunca depende solo del color, §3).
                  <li
                    key={proyecto.id}
                    className={
                      seleccionado
                        ? 'proyectos-rh__item proyectos-rh__item--seleccionado'
                        : 'proyectos-rh__item'
                    }
                  >
                    <div className="proyectos-rh__datos">
                      <p className="proyectos-rh__nombre">{proyecto.nombre}</p>
                      <p className="proyectos-rh__meta">
                        {[proyecto.area, proyecto.cliente].filter(Boolean).join(' · ') ||
                          'Sin área ni cliente registrados'}
                      </p>
                    </div>
                    <div className="proyectos-rh__estado">
                      <Badge tone={tonoEstado(proyecto.estado)}>
                        {etiquetaEstado(proyecto.estado)}
                      </Badge>
                    </div>
                    <div className="proyectos-rh__accion">
                      <Button
                        variant="secondary"
                        size="small"
                        aria-current={seleccionado ? 'true' : undefined}
                        onClick={() => abrir(proyecto.id)}
                      >
                        Consultar
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>

            <Pagination
              pagina={datos?.pagina ?? pagina}
              porPagina={porPagina}
              total={total}
              onCambiarPagina={setPagina}
              etiqueta="proyectos"
            />
          </>
        )}

        {/* Ayuda contextual discreta (Style Guide §13): solo cuando no hay
            detalle abierto, sin banner ni tarjeta. */}
        {fase === 'listo' && !detalle && (
          <p className="proyectos-rh__ayuda">
            Selecciona un proyecto para consultar su detalle.
          </p>
        )}
      </section>

      {/* --- Consulta / edición de un proyecto (dos modos explícitos) --- */}
      {detalle && (
        <section
          className="proyectos-rh__detalle"
          aria-labelledby="proyectos-rh-detalle-titulo"
        >
          <div className="proyectos-rh__detalle-cabecera">
            <h2 id="proyectos-rh-detalle-titulo">
              {modo === 'edicion' ? 'Editar proyecto' : 'Consultar proyecto'}
            </h2>
            {/* Cierre del detalle (mismo efecto que Escape): vuelve al
                listado sin recargar el catálogo ni perder la página. No es
                destructivo para el proyecto: solo cierra la consulta. */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Cerrar detalle"
              onClick={cerrarDetalle}
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          {detalle.fase === 'cargando' && <EstadoCarga texto="Cargando proyecto…" />}

          {detalle.fase === 'error' && (
            <EstadoError
              titulo="No pudimos cargar el proyecto"
              mensaje="Ocurrió un problema al obtener el proyecto."
              onReintentar={() => abrir(detalle.id)}
            />
          )}

          {guardado.fase === 'exito' && (
            <Alert tone="success" title="Proyecto actualizado">
              Los cambios se guardaron en el catálogo.
            </Alert>
          )}

          {guardado.fase === 'error' && (
            <Alert tone="error" title="No pudimos guardar los cambios">
              {guardado.error?.message ||
                'Ocurrió un problema al actualizar el proyecto.'}
            </Alert>
          )}

          {detalle.fase === 'listo' && modo === 'consulta' && (
            <>
              {/* Datos administrativos en DOS columnas (Nombre | Área,
                  Cliente | Estado) y la clave de comparación a ancho
                  completo con su explicación. Mobile colapsa a una. */}
              <dl className="proyectos-datos proyectos-rh__datos-admin">
                <div>
                  <dt>Nombre</dt>
                  <dd>{detalle.datos.nombre}</dd>
                </div>
                <div>
                  <dt>Área</dt>
                  <dd>{detalle.datos.area ?? SIN_DATO}</dd>
                </div>
                <div>
                  <dt>Cliente</dt>
                  <dd>{detalle.datos.cliente ?? SIN_DATO}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>
                    <Badge tone={tonoEstado(detalle.datos.estado)}>
                      {etiquetaEstado(detalle.datos.estado)}
                    </Badge>
                  </dd>
                </div>
                <div className="proyectos-rh__clave">
                  <dt>Clave de comparación</dt>
                  <dd>{detalle.datos.nombre_normalizado}</dd>
                  <dd className="proyectos-rh__clave-nota">
                    La clave de comparación y el identificador los mantiene el
                    sistema (§11.2). Aquí solo se editan los datos
                    administrativos del proyecto.
                  </dd>
                </div>
              </dl>
              <Button variant="secondary" onClick={entrarEdicion}>
                <Pencil aria-hidden="true" /> Editar proyecto
              </Button>

              {/* --- Participantes del proyecto (RH-02.1, §20.3/§12) -----
                  Solo lectura dentro de la CONSULTA: la edición es del
                  proyecto, jamás de la participación. Identificación,
                  puesto, rol y horas vienen del contrato; los entregables
                  se despliegan por participante sin ensanchar la tabla. */}
              <section
                className="proyectos-rh__participantes"
                aria-labelledby="proyectos-rh-participantes-titulo"
              >
                <h3 id="proyectos-rh-participantes-titulo">Participantes</h3>

                {/* Resultado de la corrección administrativa (RH-02.2): aquí
                    para seguir visible aunque la tabla se recargue. */}
                {guardadoCorreccion.fase === 'exito' && (
                  <Alert tone="success" title="Participación corregida">
                    La corrección quedó aplicada y auditada (§12.2/§25).
                  </Alert>
                )}
                {guardadoCorreccion.fase === 'error' && (
                  <Alert tone="error" title="No pudimos corregir la participación">
                    {guardadoCorreccion.error?.message ||
                      'Ocurrió un problema al corregir la participación.'}
                  </Alert>
                )}

                {participantes.fase === 'cargando' && (
                  <EstadoCarga texto="Cargando participantes…" />
                )}

                {participantes.fase === 'error' && (
                  <EstadoError
                    titulo="No pudimos cargar los participantes"
                    mensaje="Ocurrió un problema al obtener los participantes del proyecto."
                    onReintentar={cargarParticipantes}
                  />
                )}

                {participantes.fase === 'listo' &&
                  (participantes.datos?.total ?? 0) === 0 && (
                    <EstadoVacio
                      titulo="Nadie ha registrado participación en este proyecto."
                      descripcion="Cada empleado registra su participación desde «Mis proyectos»."
                    />
                  )}

                {participantes.fase === 'listo' &&
                  (participantes.datos?.total ?? 0) > 0 && (
                    <>
                      <Table
                        className="proyectos-rh__participantes-tabla"
                        columns={COLUMNAS_PARTICIPANTES}
                        caption="Participantes del proyecto"
                      >
                        {(participantes.datos?.items || []).map((participacion) => (
                          <Fragment key={participacion.id}>
                            <tr>
                              {/* Nombre del contrato (RH-02.1); el ID técnico
                                  nunca es la identificación principal. */}
                              <th
                                scope="row"
                                className="tabla__th tabla__th--fila"
                                data-label="Empleado"
                              >
                                {participacion.empleado_nombre ??
                                  `Empleado ${participacion.empleado_id}`}
                              </th>
                              <td data-label="Puesto">
                                {participacion.empleado_puesto ?? SIN_DATO}
                              </td>
                              <td data-label="Rol">{participacion.rol}</td>
                              <td data-label="Horas">{participacion.horas}</td>
                              <td data-label="Acción">
                                <Button
                                  variant="ghost"
                                  size="small"
                                  onClick={() =>
                                    setParticipacionAbierta(
                                      participacionAbierta === participacion.id
                                        ? null
                                        : participacion.id,
                                    )
                                  }
                                >
                                  Consultar participación
                                </Button>
                              </td>
                            </tr>
                            {participacionAbierta === participacion.id && (
                              <tr className="proyectos-rh__participacion-detalle">
                                <td colSpan={COLUMNAS_PARTICIPANTES.length}>
                                  <dl className="proyectos-datos">
                                    <div>
                                      <dt>Entregables</dt>
                                      <dd>{participacion.entregables ?? SIN_DATO}</dd>
                                    </div>
                                    <div>
                                      <dt>Fecha de registro</dt>
                                      <dd>{participacion.fecha_registro}</dd>
                                    </div>
                                  </dl>
                                  {/* RH-02.2 (PRD §12.2): corrección
                                      administrativa EXPLÍCITA de esta
                                      participación — separada de «Editar
                                      proyecto», que edita al proyecto y jamás
                                      a una participación. */}
                                  {correccion?.id !== participacion.id && (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="small"
                                      onClick={() => abrirCorreccion(participacion)}
                                    >
                                      Corregir participación
                                    </Button>
                                  )}
                                  {correccion?.id === participacion.id && (
                                    <form
                                      className="proyectos-rh__correccion"
                                      onSubmit={(evento) =>
                                        guardarCorreccion(evento, participacion)
                                      }
                                      noValidate
                                    >
                                      <p className="proyectos-rh__correccion-titulo">
                                        Corrección administrativa
                                      </p>
                                      <p className="proyectos-rh__nota">
                                        Estás corrigiendo administrativamente la
                                        participación de{' '}
                                        {participacion.empleado_nombre ??
                                          `Empleado ${participacion.empleado_id}`}{' '}
                                        en este proyecto. Cada corrección queda
                                        auditada: quién, cuándo y los valores
                                        anteriores y nuevos (§12.2/§25).
                                      </p>
                                      <div className="proyectos-rh__correccion-campos">
                                        <FormField
                                          id="correccion-rol"
                                          label="Rol"
                                          required
                                        >
                                          <Input
                                            id="correccion-rol"
                                            autoComplete="off"
                                            value={correccion.formulario.rol}
                                            onChange={(evento) =>
                                              setCorreccion({
                                                ...correccion,
                                                formulario: {
                                                  ...correccion.formulario,
                                                  rol: evento.target.value,
                                                },
                                              })
                                            }
                                          />
                                        </FormField>
                                        <FormField
                                          id="correccion-entregables"
                                          label="Entregables"
                                        >
                                          <Input
                                            id="correccion-entregables"
                                            autoComplete="off"
                                            value={correccion.formulario.entregables}
                                            onChange={(evento) =>
                                              setCorreccion({
                                                ...correccion,
                                                formulario: {
                                                  ...correccion.formulario,
                                                  entregables: evento.target.value,
                                                },
                                              })
                                            }
                                          />
                                        </FormField>
                                        <FormField
                                          id="correccion-horas"
                                          label="Horas"
                                          required
                                          hint="Número entero de horas (≥ 0)."
                                        >
                                          <Input
                                            id="correccion-horas"
                                            inputMode="numeric"
                                            autoComplete="off"
                                            value={correccion.formulario.horas}
                                            onChange={(evento) =>
                                              setCorreccion({
                                                ...correccion,
                                                formulario: {
                                                  ...correccion.formulario,
                                                  horas: evento.target.value,
                                                },
                                              })
                                            }
                                          />
                                        </FormField>
                                        <FormField
                                          id="correccion-motivo"
                                          label="Motivo"
                                          hint="Opcional (máx. 512): queda en la auditoría."
                                        >
                                          <Input
                                            id="correccion-motivo"
                                            autoComplete="off"
                                            maxLength={512}
                                            value={correccion.formulario.motivo}
                                            onChange={(evento) =>
                                              setCorreccion({
                                                ...correccion,
                                                formulario: {
                                                  ...correccion.formulario,
                                                  motivo: evento.target.value,
                                                },
                                              })
                                            }
                                          />
                                        </FormField>
                                      </div>
                                      <div
                                        className="proyectos-indicadores"
                                        role="group"
                                        aria-labelledby="correccion-indicadores-titulo"
                                      >
                                        <p
                                          className="proyectos-indicadores__titulo"
                                          id="correccion-indicadores-titulo"
                                        >
                                          Indicadores
                                        </p>
                                        <div className="proyectos-indicador">
                                          <input
                                            type="checkbox"
                                            id="correccion-en-equipo"
                                            checked={correccion.formulario.en_equipo}
                                            onChange={(evento) =>
                                              setCorreccion({
                                                ...correccion,
                                                formulario: {
                                                  ...correccion.formulario,
                                                  en_equipo: evento.target.checked,
                                                },
                                              })
                                            }
                                          />
                                          <label htmlFor="correccion-en-equipo">
                                            Trabajo en equipo
                                          </label>
                                        </div>
                                        <div className="proyectos-indicador">
                                          <input
                                            type="checkbox"
                                            id="correccion-coordina"
                                            checked={
                                              correccion.formulario.coordino_tareas
                                            }
                                            onChange={(evento) =>
                                              setCorreccion({
                                                ...correccion,
                                                formulario: {
                                                  ...correccion.formulario,
                                                  coordino_tareas:
                                                    evento.target.checked,
                                                },
                                              })
                                            }
                                          />
                                          <label htmlFor="correccion-coordina">
                                            Coordinación
                                          </label>
                                        </div>
                                        <div className="proyectos-indicador">
                                          <input
                                            type="checkbox"
                                            id="correccion-explica"
                                            checked={
                                              correccion.formulario
                                                .explico_a_publico_distinto
                                            }
                                            onChange={(evento) =>
                                              setCorreccion({
                                                ...correccion,
                                                formulario: {
                                                  ...correccion.formulario,
                                                  explico_a_publico_distinto:
                                                    evento.target.checked,
                                                },
                                              })
                                            }
                                          />
                                          <label htmlFor="correccion-explica">
                                            Explicación a públicos distintos
                                          </label>
                                        </div>
                                        <div className="proyectos-indicador">
                                          <input
                                            type="checkbox"
                                            id="correccion-situacion"
                                            checked={
                                              correccion.formulario.resolvio_problema
                                            }
                                            onChange={(evento) =>
                                              setCorreccion({
                                                ...correccion,
                                                formulario: {
                                                  ...correccion.formulario,
                                                  resolvio_problema:
                                                    evento.target.checked,
                                                },
                                              })
                                            }
                                          />
                                          <label htmlFor="correccion-situacion">
                                            Situación/problema
                                          </label>
                                        </div>
                                      </div>
                                      <div className="proyectos-rh__correccion-acciones">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          onClick={cancelarCorreccion}
                                        >
                                          Cancelar
                                        </Button>
                                        <Button
                                          type="submit"
                                          loading={
                                            guardadoCorreccion.fase === 'corrigiendo'
                                          }
                                        >
                                          Guardar corrección
                                        </Button>
                                      </div>
                                    </form>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </Table>

                      <Pagination
                        pagina={
                          participantes.datos?.pagina ?? participantesPagina
                        }
                        porPagina={
                          participantes.datos?.por_pagina ??
                          POR_PAGINA_PARTICIPACIONES
                        }
                        total={participantes.datos?.total ?? 0}
                        onCambiarPagina={cambiarPaginaParticipantes}
                        etiqueta="participantes"
                      />
                    </>
                  )}
              </section>
            </>
          )}

          {detalle.fase === 'listo' && modo === 'edicion' && (
            <form className="proyectos-rh__formulario" onSubmit={guardar} noValidate>
              <div className="proyectos-rh__campos">
                <FormField
                  id="proyecto-rh-nombre"
                  label="Nombre"
                  required
                  error={errorNombre}
                >
                  <Input
                    id="proyecto-rh-nombre"
                    value={formulario.nombre}
                    invalid={Boolean(errorNombre)}
                    onChange={(evento) => {
                      setFormulario({ ...formulario, nombre: evento.target.value })
                      setErrorNombre(null)
                    }}
                  />
                </FormField>
                <FormField id="proyecto-rh-area" label="Área">
                  <Input
                    id="proyecto-rh-area"
                    value={formulario.area}
                    onChange={(evento) =>
                      setFormulario({ ...formulario, area: evento.target.value })
                    }
                  />
                </FormField>
                <FormField id="proyecto-rh-cliente" label="Cliente">
                  <Input
                    id="proyecto-rh-cliente"
                    value={formulario.cliente}
                    onChange={(evento) =>
                      setFormulario({ ...formulario, cliente: evento.target.value })
                    }
                  />
                </FormField>
                <FormField
                  id="proyecto-rh-estado"
                  label="Estado"
                  hint="En proceso, Completado o Cancelado (ET §6)."
                >
                  <select
                    id="proyecto-rh-estado"
                    className="ui-input"
                    value={formulario.estado}
                    onChange={(evento) =>
                      setFormulario({ ...formulario, estado: evento.target.value })
                    }
                  >
                    {ESTADOS_PROYECTO.map((estado) => (
                      <option key={estado} value={estado}>
                        {etiquetaEstado(estado)}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <div className="proyectos-rh__acciones">
                <Button type="button" variant="ghost" onClick={cancelarEdicion}>
                  Cancelar
                </Button>
                <Button type="submit" loading={guardado.fase === 'guardando'}>
                  Guardar cambios
                </Button>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  )
}
