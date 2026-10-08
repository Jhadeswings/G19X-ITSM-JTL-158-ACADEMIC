// Sección RH → Proyectos — SHOW /proyectos/:id (RH-02.3; PRD §20.3, §11.1,
// §12; ET §6–§8, §25, §31; DECISIONES §15; Style Guide §11, §26).
//
// PÁGINA real de detalle: el id vive EXCLUSIVAMENTE en la ruta (useParams),
// así que un deep-link directo (/proyectos/3) consulta el proyecto 3 sin
// pasar por /proyectos y sin estado previo. NO es modal, NO es drawer y NO
// hay ninguna X de cierre: «‹ Volver al listado» es la navegación primaria
// de regreso al catálogo.
//
// Contrato real del backend (nada se inventa):
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
//   valores anteriores/nuevos en la MISMA transacción.
//
// La EDICIÓN del proyecto es un MODO dentro de esta página (no existe
// /proyectos/:id/edit): la URL no cambia al editar. Los participantes y su
// corrección administrativa permanecen en esta misma página. 401 →
// `alSesionExpirada` (ET §31/§32); el RBAC lo aplica el backend (require_rh).

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Search } from 'lucide-react'
import { actualizarProyectoRh, consultarProyectoRh } from '../api/proyectos.js'
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
import {
  COLUMNAS_PARTICIPANTES,
  ESTADOS_PROYECTO,
  MARCA_TITULO,
  SIN_DATO,
  consultaInicial,
  crearEsperaMinima,
  etiquetaEstado,
  tonoEstado,
} from './proyectosComun.js'

export default function ProyectoDetalle({ token, alSesionExpirada }) {
  // El id viene SOLO de la ruta (RH-02.3 §7): la página no depende de ningún
  // estado previo ni de haber visitado antes /proyectos.
  const { id: idParam } = useParams()
  const navegar = useNavigate()
  const idValido = /^\d+$/.test(idParam ?? '')
  const proyectoId = idValido ? Number(idParam) : null

  const [detalle, setDetalle] = useState(consultaInicial)
  // Dos modos explícitos de la misma página: consulta (solo lectura) y
  // edición (formulario administrativo). La URL NO cambia entre ellos.
  const [modo, setModo] = useState('consulta')
  const [formulario, setFormulario] = useState(null)
  const [errorNombre, setErrorNombre] = useState(null)
  const [guardado, setGuardado] = useState({ fase: 'inactivo', error: null })
  // Participantes del proyecto consultado (RH-02.1): solo lectura, jamás
  // mezclados con la edición administrativa del proyecto.
  const [participantes, setParticipantes] = useState(consultaInicial)
  const [participantesPagina, setParticipantesPagina] = useState(1)
  // RH-02.3.1: texto de búsqueda LOCAL del participante (solo presentación,
  // sobre los datos ya cargados; jamás viaja al backend).
  const [busquedaParticipante, setBusquedaParticipante] = useState('')
  const [participacionAbierta, setParticipacionAbierta] = useState(null)
  // Corrección administrativa de UNA participación (RH-02.2, PRD §12.2):
  // formulario propio dentro del detalle expandido del participante,
  // SEPARADO de la edición del proyecto. `{ id, formulario }` o null.
  const [correccion, setCorreccion] = useState(null)
  const [guardadoCorreccion, setGuardadoCorreccion] = useState({
    fase: 'inactivo',
    error: null,
  })
  // RH-02.3.4: el motivo de la corrección es OBLIGATORIO; su error de
  // validación vive JUNTO AL CAMPO (FormField), no en el Alert del guardado.
  const [errorMotivo, setErrorMotivo] = useState(null)
  // RH-02.3.3: espera mínima cancelable compartida por las cargas del Show
  // (proyecto y participantes) y guardas de carrera: solo la ÚLTIMA solicitud
  // de cada tipo puede actualizar el estado (respuestas viejas descartadas).
  const esperaRef = useRef(null)
  if (esperaRef.current === null) esperaRef.current = crearEsperaMinima()
  const espera = esperaRef.current
  const cargaProyectoRef = useRef(0)
  const cargaParticipantesRef = useRef(0)
  useEffect(() => () => espera.cancelar(), [espera])

  // Un id no numérico (/proyectos/abc) se normaliza al Index con replace:
  // la URL queda limpia sin crear una entrada de historial nueva.
  useEffect(() => {
    if (!idValido) {
      navegar('/proyectos', { replace: true })
    }
  }, [idValido, navegar])

  // Carga del proyecto por id de ruta (deep-link incluido). Al cambiar de
  // proyecto (Back/Forward entre dos detalles) el efecto de más abajo
  // reinicia todos los modos: nunca se hereda el formulario ni la corrección
  // del proyecto anterior.
  const cargarProyecto = useCallback(() => {
    const inicio = performance.now()
    const solicitud = ++cargaProyectoRef.current
    setDetalle(consultaInicial())
    consultarProyectoRh(token, proyectoId)
      .then(async (datos) => {
        // RH-02.3.3: presencia mínima del loading del Show (los éxitos
        // esperan; los errores no, para no retrasar estados importantes).
        await espera.esperar(inicio)
        if (solicitud !== cargaProyectoRef.current) return
        setDetalle({ fase: 'listo', datos, error: null })
      })
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        if (solicitud !== cargaProyectoRef.current) return
        setDetalle({ fase: 'error', datos: null, error })
      })
  }, [token, proyectoId, alSesionExpirada, espera])

  useEffect(() => {
    if (!idValido) return undefined
    // RH-02.3.3: al cambiar de proyecto se limpian las esperas del anterior.
    espera.cancelar()
    setModo('consulta')
    setFormulario(null)
    setErrorNombre(null)
    setGuardado({ fase: 'inactivo', error: null })
    setParticipacionAbierta(null)
    setBusquedaParticipante('')
    setCorreccion(null)
    setErrorMotivo(null)
    setGuardadoCorreccion({ fase: 'inactivo', error: null })
    setParticipantesPagina(1)
    cargarProyecto()
    return undefined
  }, [idValido, cargarProyecto])

  // Título dinámico de la pestaña (RH-02.3 §9): el nombre del proyecto con
  // respaldo «Proyecto» mientras no esté disponible. Al desmontar se
  // restaura el título anterior: nunca queda un título incorrecto tras
  // Volver/Back o al salir de la sección.
  const tituloAnteriorRef = useRef(document.title)
  useEffect(() => {
    document.title = detalle.datos?.nombre
      ? `${detalle.datos.nombre} · Proyectos | ${MARCA_TITULO}`
      : `Proyecto | Proyectos | ${MARCA_TITULO}`
    return undefined
  }, [detalle])
  useEffect(
    () => () => {
      document.title = tituloAnteriorRef.current
    },
    [],
  )

  /** Participantes del proyecto consultado (RH-02.1, solo lectura). */
  const cargarParticipantes = useCallback(() => {
    if (!idValido) return undefined
    const inicio = performance.now()
    const solicitud = ++cargaParticipantesRef.current
    setParticipantes(consultaInicial())
    listarParticipacionesDeProyecto(token, proyectoId, {
      pagina: participantesPagina,
      porPagina: POR_PAGINA_PARTICIPACIONES,
    })
      .then(async (datos) => {
        // RH-02.3.3: misma presencia mínima de loading que las demás cargas.
        await espera.esperar(inicio)
        if (solicitud !== cargaParticipantesRef.current) return
        setParticipantes({ fase: 'listo', datos, error: null })
      })
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        if (solicitud !== cargaParticipantesRef.current) return
        setParticipantes({ fase: 'error', datos: null, error })
      })
    return undefined
  }, [token, proyectoId, participantesPagina, alSesionExpirada, idValido, espera])

  useEffect(() => {
    if (idValido) {
      cargarParticipantes()
    }
  }, [cargarParticipantes, idValido])

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
    setErrorMotivo(null)
    setGuardadoCorreccion({ fase: 'inactivo', error: null })
  }, [])

  /**
   * Guarda la corrección administrativa (RH-02.2). Solo viajan los campos
   * del contrato `ParticipacionRhUpdateIn` que CAMBIARON más el motivo de
   * auditoría, OBLIGATORIO desde RH-02.3.4: sin motivo (vacío o solo
   * espacios) no se hace ningún PATCH y el mensaje se muestra junto al
   * campo; sin cambios tampoco se hace ningún PATCH. La validación visible
   * (rol obligatorio, horas enteras ≥ 0, motivo requerido) replica la del
   * backend para evitar un viaje inútil, no para reemplazarla. Tras el
   * éxito se recargan los participantes del proyecto. 401 → alSesionExpirada.
   */
  function guardarCorreccion(evento, participacion) {
    evento.preventDefault()
    const formularioCorreccion = correccion.formulario
    const rol = formularioCorreccion.rol.trim()
    if (!rol) {
      setGuardadoCorreccion({
        fase: 'error',
        error: { message: 'El rol de la participación no puede estar vacío.' },
      })
      return
    }
    const horas = Number(formularioCorreccion.horas)
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
    const entregables = formularioCorreccion.entregables.trim() || null
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
      if (formularioCorreccion[indicador] !== participacion[indicador]) {
        cambios[indicador] = formularioCorreccion[indicador]
      }
    }
    if (Object.keys(cambios).length === 0) {
      setGuardadoCorreccion({
        fase: 'error',
        error: { message: 'No hay cambios que corregir en esta participación.' },
      })
      return
    }
    // RH-02.3.4: el motivo es OBLIGATORIO — sin él no se llama al backend y
    // el mensaje queda junto al campo (la validación del servidor permanece
    // intacta; esto solo evita el viaje inútil). trim(): espacios no cuentan.
    const motivo = formularioCorreccion.motivo.trim()
    if (!motivo) {
      setErrorMotivo('Escribe el motivo de la corrección para continuar.')
      return
    }
    // Con cambios y motivo válido, el motivo SIEMPRE viaja: es la
    // justificación que queda registrada en la auditoría.
    cambios.motivo = motivo

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
    setErrorMotivo(null)
    setGuardadoCorreccion({ fase: 'inactivo', error: null })
  }, [])

  /**
   * Escape depende del estado de la página (RH-02.1/RH-02.2):
   * - EDICIÓN del proyecto: actúa como «Cancelar» — vuelve a la consulta del
   *   MISMO proyecto sin guardar y sin PATCH (la página no se abandona).
   * - CONSULTA + corrección abierta: cancela SOLO la corrección (el resto
   *   se conserva; nunca se descarta en silencio).
   * La página NO se cierra con Escape: es una página real, no un overlay.
   *
   * Listener propio en `document`: no interfiere con el detector de
   * actividad de la sesión (`useInactividad` escucha `keydown` pasivo en
   * `window`), así que Escape sigue contando como interacción.
   */
  useEffect(() => {
    function alPulsarTecla(evento) {
      if (evento.key !== 'Escape') return
      if (modo === 'edicion') cancelarEdicion()
      else if (correccion) cancelarCorreccion()
    }
    document.addEventListener('keydown', alPulsarTecla)
    return () => document.removeEventListener('keydown', alPulsarTecla)
  }, [modo, correccion, cancelarEdicion, cancelarCorreccion])

  function entrarEdicion() {
    const proyecto = detalle.datos
    // La edición del proyecto es EXCLUYENTE con la corrección de una
    // participación (RH-02.2): dos formularios administrativos distintos.
    setCorreccion(null)
    setErrorMotivo(null)
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
    actualizarProyectoRh(token, proyectoId, cambios)
      .then((datos) => {
        setDetalle({ fase: 'listo', datos, error: null })
        setModo('consulta')
        setGuardado({ fase: 'exito', error: null })
        // El catálogo (/proyectos) se vuelve a consultar al regresar: la
        // página se remonta y siempre refleja el backend.
      })
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setGuardado({ fase: 'error', error })
      })
  }

  /** Navegación primaria de regreso (RH-02.3 §9): SIEMPRE al catálogo. */
  const volverAlListado = useCallback(() => {
    navegar('/proyectos')
  }, [navegar])

  const nombreProyecto = detalle.datos?.nombre

  // RH-02.3.1: filtro LOCAL sobre los participantes YA cargados por la
  // página — coincide por nombre, puesto o rol, case-insensitive, sin
  // métricas y sin llamar al backend por tecla. Vacío = todos los cargados.
  const textoBusqueda = busquedaParticipante.trim().toLowerCase()
  const participantesCargados = participantes.datos?.items || []
  const participantesVisibles = textoBusqueda
    ? participantesCargados.filter((participacion) =>
        [
          participacion.empleado_nombre,
          participacion.empleado_puesto,
          participacion.rol,
        ]
          .filter(Boolean)
          .some((campo) => campo.toLowerCase().includes(textoBusqueda)),
      )
    : participantesCargados

  return (
    <div className="proyectos-rh">
      {/* Navegación primaria de regreso (RH-02.3 §9/§20): una página real,
          sin X ni «Cerrar». Lleva SIEMPRE al catálogo con el router. */}
      <Button
        type="button"
        variant="ghost"
        size="small"
        className="proyectos-rh__volver"
        onClick={volverAlListado}
      >
        <ArrowLeft aria-hidden="true" /> Volver al listado
      </Button>

      <SectionHeader
        eyebrow="Proyecto"
        title={nombreProyecto ?? 'Proyecto'}
        description="Ficha del proyecto y sus participantes."
      />

      {/* RH-02.3 / Style Guide §11: ¿dónde estoy? — «Proyectos» regresa al
          catálogo y el nombre actual queda marcado como página vigente. */}
      <nav className="proyectos-rh__migas" aria-label="Ubicación">
        <button
          type="button"
          className="proyectos-rh__migas-enlace"
          onClick={volverAlListado}
        >
          Proyectos
        </button>
        <span className="proyectos-rh__migas-separador" aria-hidden="true">
          /
        </span>
        <span className="proyectos-rh__migas-actual" aria-current="page">
          {nombreProyecto ?? 'Proyecto'}
        </span>
      </nav>

      {/* --- CARD: Detalle del proyecto (consulta/edición, dos modos) ----- */}
      <section
        className={`proyectos-rh__detalle${
          modo === 'edicion' ? ' proyectos-rh__detalle--edicion' : ''
        }`}
        aria-labelledby="proyectos-rh-detalle-titulo"
      >
        <div
          className={`proyectos-rh__detalle-cabecera${
            modo === 'edicion' ? ' proyectos-rh__detalle-cabecera--edicion' : ''
          }`}
        >
          <h2 id="proyectos-rh-detalle-titulo">
            {modo === 'edicion' ? 'Editar proyecto' : 'Detalle del proyecto'}
          </h2>
          {modo === 'edicion' && (
            <span className="proyectos-rh__edicion--etiqueta">Editando</span>
          )}
        </div>

        {detalle.fase === 'cargando' && <EstadoCarga texto="Cargando proyecto…" />}

        {detalle.fase === 'error' && (
          <EstadoError
            titulo="No pudimos cargar el proyecto"
            mensaje="Ocurrió un problema al obtener el proyecto."
            onReintentar={cargarProyecto}
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
                  sistema. Aquí solo se editan los datos administrativos del
                  proyecto.
                </dd>
              </div>
            </dl>
            <Button variant="secondary" onClick={entrarEdicion}>
              <Pencil aria-hidden="true" /> Editar proyecto
            </Button>
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
                hint="En proceso, Completado o Cancelado."
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
              <Button type="button" variant="secondary" onClick={cancelarEdicion}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={guardado.fase === 'guardando'}>
                Guardar cambios
              </Button>
            </div>
          </form>
        )}

      </section>

      {/* --- CARD: Participantes (RH-02.1, §20.3/§12) — solo lectura dentro
              de la CONSULTA: la edición es del proyecto, jamás de la
              participación. Identificación, puesto, rol y horas vienen del
              contrato; los entregables se despliegan por participante sin
              ensanchar la tabla. La corrección administrativa (RH-02.2)
              permanece en ESTA página, como contenido aprobado. */}
      {detalle.fase === 'listo' && modo === 'consulta' && (
        <section
          className="proyectos-rh__participantes"
          aria-labelledby="proyectos-rh-participantes-titulo"
        >
          <h3 id="proyectos-rh-participantes-titulo">Participantes</h3>

          {/* Resultado de la corrección administrativa (RH-02.2): aquí
              para seguir visible aunque la tabla se recargue. */}
          {guardadoCorreccion.fase === 'exito' && (
            <Alert tone="success" title="Participación corregida">
              La corrección quedó aplicada y auditada.
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
                {/* RH-02.3.1: búsqueda LOCAL del participante ya cargado
                    (nombre/puesto/rol), encima del listado como en la
                    referencia. Sin llamadas al backend por tecla. */}
                <div className="proyectos-rh__busqueda">
                  <Search aria-hidden="true" />
                  <Input
                    id="proyectos-rh-buscar-participante"
                    type="search"
                    autoComplete="off"
                    placeholder="Buscar participante..."
                    aria-label="Buscar participante"
                    value={busquedaParticipante}
                    onChange={(evento) =>
                      setBusquedaParticipante(evento.target.value)
                    }
                  />
                </div>

                {participantesVisibles.length > 0 ? (
                  <Table
                    className="proyectos-rh__participantes-tabla"
                    columns={COLUMNAS_PARTICIPANTES}
                    caption="Participantes del proyecto"
                  >
                    {participantesVisibles.map((participacion) => (
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
                            {/* Datos de la participación (RH-02.1): los
                                entregables abren la fila expandida. */}
                            <dl className="proyectos-datos">
                              <div>
                                <dt>Entregables</dt>
                                <dd>{participacion.entregables ?? SIN_DATO}</dd>
                              </div>
                            </dl>
                            {/* RH-02.3.3: pie de la fila expandida — «Fecha de
                                registro» a la izquierda y la acción
                                administrativa (RH-02.2, PRD §12.2) justificada
                                al borde derecho de la tarjeta; en viewport
                                pequeño se apilan sin salirse de la card. */}
                            <div className="proyectos-rh__participacion-pie">
                              <p className="proyectos-rh__participacion-fecha">
                                <span className="proyectos-rh__participacion-fecha-etiqueta">
                                  Fecha de registro
                                </span>
                                <span className="proyectos-rh__participacion-fecha-valor">
                                  {participacion.fecha_registro}
                                </span>
                              </p>
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
                            </div>
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
                                  anteriores y nuevos.
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
                                    required
                                    hint="Obligatorio (máx. 512): queda en la auditoría."
                                    error={errorMotivo}
                                  >
                                    <Input
                                      id="correccion-motivo"
                                      autoComplete="off"
                                      maxLength={512}
                                      invalid={Boolean(errorMotivo)}
                                      value={correccion.formulario.motivo}
                                      onChange={(evento) => {
                                        setCorreccion({
                                          ...correccion,
                                          formulario: {
                                            ...correccion.formulario,
                                            motivo: evento.target.value,
                                          },
                                        })
                                        setErrorMotivo(null)
                                      }}
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
                                      checked={correccion.formulario.coordino_tareas}
                                      onChange={(evento) =>
                                        setCorreccion({
                                          ...correccion,
                                          formulario: {
                                            ...correccion.formulario,
                                            coordino_tareas: evento.target.checked,
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
                                      checked={correccion.formulario.resolvio_problema}
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
                ) : (
                  <EstadoVacio
                    titulo="Ningún participante coincide con la búsqueda."
                    descripcion="Revisa el texto escrito o límpialo para volver a ver todos los participantes cargados."
                  />
                )}

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
      )}

    </div>
  )
}
