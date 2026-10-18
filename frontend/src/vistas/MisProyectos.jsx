// Vista "Mis proyectos" del rol Empleado (PRD §11, §12, §21.3; Style Guide §26
// "Proyectos Empleado", §18.2 ProjectSearch, §18.3 ParticipationForm, §18.4
// StepIndicator).
//
// Alcance (MB-5A + MB-5B-1): flujo completo 01 Buscar → 02 Crear o seleccionar
// → 03 Registrar la participación (§18.4), TODO dentro de "Mis proyectos":
// no existe una sección de navegación "Mis participaciones" y no se crea.
// - MB-5A: búsqueda obligatoria y alta del proyecto cuando el backend no
//   devuelve coincidencia exacta.
// - MB-5B-1: SOLO la coincidencia exacta puede SELECCIONARSE (§18.2); las
//   sugerencias aproximadas siguen siendo informativas y NO seleccionables.
//   El proyecto recién creado se convierte en el seleccionado y continúa al
//   paso 03, donde se registra la participación inicial (§18.3).
// - MB-5B-3A: antes de abrir el formulario se detecta (GET /me/participations)
//   si el Empleado YA tiene participación en el proyecto seleccionado; en ese
//   caso se muestra un bloque informativo con sus datos y NO hay formulario
//   de alta (la unicidad empleado/proyecto del backend queda como defensa final,
//   no como flujo de UX).
// - MB-5B-2: ese mismo bloque ofrece «Editar participación», que entra en modo
//   edición DENTRO de esta vista (sin pantalla nueva, sin navegación y sin
//   detalle) para corregir SOLO rol, entregables y horas
//   (PATCH /me/participations/{id}). Proyecto, fecha de registro, estado y los
//   cuatro indicadores se muestran como dato bloqueado: nunca son inputs ni se
//   envían.
//
// Contrato real del backend (nada se inventa):
// - GET /api/v1/me/projects/search?nombre= → `coincidencia_exacta` + hasta 5
//   sugerencias aproximadas. La búsqueda es OBLIGATORIA antes de crear
//   (PRD §11.1/§21.3) y la coincidencia aproximada es INFORMATIVA: nunca un
//   error y nunca crea una relación con el proyecto (§8).
// - POST /api/v1/me/projects → crea el proyecto, siempre en EN_PROCESO (§6).
//   El duplicado exacto responde 409 y se muestra como respuesta del backend,
//   no como fallo genérico.
// - NO existe GET /me/projects: el Empleado no tiene listado de proyectos, y
//   la vista no lo simula.
// - POST /api/v1/me/participations → registro inicial (ParticipacionCreateIn,
//   exactamente ocho campos). `empleado_id` lo deriva el backend de la cuenta
//   autenticada (§32), `fecha_registro` la fija el servidor y `estado` no forma
//   parte del contrato: la vista NUNCA los envía. Errores: 401 (sesión),
//   404 (proyecto inexistente), 409 (participación duplicada), 422 (validación).
//
// La vista no decide nada de negocio: no determina si el proyecto existe (lo
// dice el backend), no normaliza nombres, no calcula similitudes y no fija el
// estado. Las decisiones de presentación son las de los documentos: ofrecer el
// alta sin coincidencia exacta (PRD §11.1), no mostrar más de 5 sugerencias
// (PRD §11.3/§8), el copy literal del Style Guide §18.2 y el orden exacto del
// formulario §18.3. La confirmación del registro NUNCA depende de
// `participacion.proyecto`: el nombre mostrado sale del proyecto seleccionado.
//
// Rediseño estructural (encima de TODO lo anterior, sin cambiar contratos):
// - Encabezado PLANO «PROYECTOS / Mis proyectos» (sobretítulo terracota,
//   título oscuro y subtítulo gris, directamente sobre el fondo general,
//   sin banner ni tarjeta) y DOS pestañas funcionales: «Registrados»
//   (consulta, la pestaña inicial de la entrada normal) y «Registrar
//   participación» (el asistente 01–03, intacto).
// - «Registrados»: se consulta al ACTIVAR la pestaña por primera vez (bajo
//   demanda: al montar la vista no ocurre ninguna llamada nueva). Contador
//   real (el `total` del servidor; los registros son 1:1 con proyectos por
//   la unicidad empleado/proyecto), buscador ancho LOCAL que filtra solo lo
//   ya cargado (el endpoint no admite filtro de texto: no se inventa
//   ninguna llamada), filas planas separadas por líneas finas con
//   indicador circular del estado real y acordeón accesible (botón nativo
//   con aria-expanded/aria-controls; el detalle queda montado y se oculta
//   solo con CSS, como el acordeón de «Mi progreso»), ficha técnica con los
//   datos reales de ProyectoOut y ParticipacionOut, y pie «Mostrando X de
//   Y» + «Ver más (N)» que pide la página siguiente y anexa los items.
// - Vistas EXCLUSIVAS por pestaña: solo se renderiza el panel activo
//   (renderizado condicional de React); el estado vive en el componente,
//   así que alternar no pierde el flujo ni los datos ya cargados. Al llegar
//   desde «Inicio» con un proyecto ya elegido, la pestaña del asistente
//   queda activa.

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, ChevronDown, ClipboardCheck, FolderKanban, Pencil, Repeat2, Save, Search } from 'lucide-react'
import {
  actualizarParticipacion,
  crearParticipacion,
  listarParticipaciones,
} from '../api/participaciones.js'
import {
  buscarProyectos,
  crearProyecto,
  listarMisProyectos,
} from '../api/proyectos.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import FormField from '../componentes/FormField.jsx'
import { crearEsperaMinimaCarga } from '../lib/esperaMinimaCarga.js'
import Alert from '../componentes/ui/Alert.jsx'
import Badge from '../componentes/ui/Badge.jsx'
import { Button } from '../componentes/ui/Button.jsx'
import { Input } from '../componentes/ui/Input.jsx'

/** Texto neutro para datos ausentes: nunca un hueco ni un error. */
const SIN_DATO = '—'

/** Máximo de sugerencias aproximadas que el producto permite mostrar (§11.3/§8). */
const SUGERENCIAS_MAXIMAS = 5

/** Tamaño de página de la consulta «Registrados» (contrato: por_pagina 1..100). */
const REGISTRADOS_POR_PAGINA = 100

/** Texto comparable para el filtro LOCAL de «Registrados»: minúsculas y sin
 *  acentos (el backend normaliza los nombres; aquí solo se compara lo ya
 *  cargado, sin llamar a la API). */
function textoLocal(valor) {
  return String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** Fecha corta para consultas: la parte de fecha del valor tal cual llega del
 *  backend (ISO); sin valor → dato ausente. No se inventa ni se reformatea. */
function fechaCorta(valor) {
  return valor ? String(valor).slice(0, 10) : SIN_DATO
}

/** Etiquetas de presentación de los estados oficiales del proyecto (§6). */
const ETIQUETAS_ESTADO = {
  EN_PROCESO: 'En proceso',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado',
}

/** Tono del badge (Style Guide §4.5): EN_PROCESO es identidad, NO advertencia;
 *  CANCELADO tampoco implica error automáticamente. */
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

/** Estado inicial de la consulta (mismo patrón que las demás vistas). */
function consultaInicial() {
  return { fase: 'inicial', datos: null, error: null }
}

/** Payload del contrato: opcionales vacíos → null (nunca string vacío). */
function prepararProyecto({ nombre, area, cliente }) {
  return {
    nombre: nombre.trim(),
    area: area.trim() || null,
    cliente: cliente.trim() || null,
  }
}

/** Estado inicial del ParticipationForm (§18.3): todo vacío, indicadores en false. */
function participacionInicial() {
  return {
    rol: '',
    entregables: '',
    en_equipo: false,
    coordino_tareas: false,
    explico_a_publico_distinto: false,
    resolvio_problema: false,
    horas: '',
  }
}

/** Avisos de validación local (ninguno visible al iniciar). */
function avisosIniciales() {
  return { rol: null, horas: null }
}

/**
 * Validación local ESPEJO del contrato (rol no vacío; horas entero >= 0):
 * evita el viaje cuando el backend ya sabe que rechazaría. NO agrega reglas:
 * ParticipacionCreateIn exige `rol` no vacío y `horas` int ge=0.
 * @returns {{rol: string|null, horas: string|null, valido: boolean}}
 */
function validarParticipacion({ rol, horas }) {
  const avisos = avisosIniciales()
  const rolLimpio = rol.trim()
  const horasLimpias = horas.trim()
  if (!rolLimpio) {
    avisos.rol = 'Escribe el rol que desempeñaste en el proyecto.'
  }
  if (!horasLimpias) {
    avisos.horas = 'Escribe las horas que dedicaste a este proyecto.'
  } else if (!/^-?\d+$/.test(horasLimpias)) {
    avisos.horas = 'Las horas deben ser un número entero, por ejemplo 120.'
  } else if (Number.parseInt(horasLimpias, 10) < 0) {
    avisos.horas = 'Las horas no pueden ser negativas.'
  }
  return { ...avisos, valido: !avisos.rol && !avisos.horas }
}

/** Etiqueta de presentación Sí/No para los indicadores registrados. */
function etiquetaSiNo(valor) {
  return valor ? 'Sí' : 'No'
}

/**
 * MB-5B-2: estado inicial del modo edición. Solo se precargan los TRES campos
 * editables del contrato `ParticipacionEmpleadoUpdateIn`; el resto de la
 * participación se muestra como dato, nunca como input.
 */
function edicionInicial() {
  return { activa: false, fase: 'inactiva', error: null }
}

export default function MisProyectos({
  token,
  alSesionExpirada,
  proyectoId = null,
  alProyectoAplicado,
}) {
  const [nombreEscrito, setNombreEscrito] = useState('')
  const [consultaEjecutada, setConsultaEjecutada] = useState('')
  const [avisoBusqueda, setAvisoBusqueda] = useState(null)
  const [busqueda, setBusqueda] = useState(consultaInicial)
  const [formulario, setFormulario] = useState({ nombre: '', area: '', cliente: '' })
  const [alta, setAlta] = useState({ fase: 'inactiva', datos: null, error: null })
  // Paso 02→03: proyecto seleccionado (coincidencia exacta o recién creado).
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState(null)
  // Proyecto que YA venía elegido al entrar (MB-7-2F): desde «Inicio». Permite
  // mostrar el paso 02 sin buscar, sin alterar el flujo normal de búsqueda.
  const [proyectoDeEntrada, setProyectoDeEntrada] = useState(null)
  // ParticipationForm (§18.3) y su registro (POST /me/participations).
  const [formParticipacion, setFormParticipacion] = useState(participacionInicial)
  const [avisosParticipacion, setAvisosParticipacion] = useState(avisosIniciales)
  const [registro, setRegistro] = useState({ fase: 'inactiva', datos: null, error: null })
  // MB-5B-3A: detección de participación propia para el proyecto seleccionado,
  // resuelta ANTES de mostrar el formulario (el 409 deja de ser el flujo UX).
  const [deteccion, setDeteccion] = useState({
    fase: 'inactiva',
    participacion: null,
    error: null,
  })
  // MB-5B-2: edición controlada dentro de la MISMA vista (no hay pantalla ni
  // detalle nuevo). El formulario guarda solo rol/entregables/horas.
  const [edicion, setEdicion] = useState(edicionInicial)
  const [formEdicion, setFormEdicion] = useState({ rol: '', entregables: '', horas: '' })
  const [avisosEdicion, setAvisosEdicion] = useState(avisosIniciales)
  // Consulta de proyectos registrados (Tarea B): listado de proyectos con
  // participación GUARDADA y su detalle completo, resuelto SOLO con el
  // endpoint real GET /me/participations (ParticipacionOut ya incluye
  // `proyecto`). Se carga BAJO DEMANDA al abrir la sección: el asistente
  // 01–03 no cambia y ninguna llamada nueva ocurre al montar la vista.
  const [registrados, setRegistrados] = useState({
    fase: 'cerrada',
    datos: null,
    error: null,
  })
  const [detalleRegistrado, setDetalleRegistrado] = useState(null)
  // Pestañas «Registrados» / «Registrar participación». La entrada normal
  // abre SIEMPRE «Registrados» (ajuste de navegación); el asistente se
  // activa al pulsarlo o al llegar desde «Inicio» con un proyecto. Vistas
  // exclusivas: solo se renderiza el panel activo; el estado vive en este
  // componente y NO se pierde al alternar.
  const [pestana, setPestana] = useState('registrados')
  // Filtro LOCAL de «Registrados»: se aplica SOLO a los items ya cargados
  // (el endpoint de participaciones no admite filtro de texto) y nunca
  // dispara llamadas al backend.
  const [filtroRegistrados, setFiltroRegistrados] = useState('')
  // Ajuste de edición: participación editada DIRECTAMENTE desde el listado
  // de «Registrados». Mientras esté activo, la pestaña del flujo renderiza
  // SOLO el Paso 03 en modo edición (los pasos 01 y 02 ni se montan) con
  // los datos actuales del item ya descargado. NO es una fase del flujo
  // normal: buscar o reiniciar la desactiva.
  const [edicionDesdeConsulta, setEdicionDesdeConsulta] = useState(false)
  // Espera mínima de la carga INICIAL de «Registrados» + guarda de vigencia:
  // solo la ÚLTIMA apertura actualiza el estado. Se cancela al desmontar
  // para no actualizar un componente inexistente.
  const esperaRegistradosRef = useRef(null)
  if (esperaRegistradosRef.current === null) {
    esperaRegistradosRef.current = crearEsperaMinimaCarga()
  }
  const cargaRegistradosRef = useRef(0)
  useEffect(
    () => () => {
      esperaRegistradosRef.current?.cancelar()
      cargaRegistradosRef.current += 1
    },
    [],
  )

  // --- Entrada desde Inicio (MB-7-2E) -------------------------------------
  // Al llegar desde «Inicio» con el `proyectoId` de una fila pulsada, esta vista
  // lo selecciona y reutiliza su PROPIO flujo (`seleccionarProyecto` →
  // `detectarParticipacion`): el detalle de la participación se muestra aquí, no
  // se duplica en Inicio.
  //
  // Solo se transmite el IDENTIFICADOR del proyecto: nada de `empleado_id`, rol
  // ni datos de la participación. El objeto del proyecto se resuelve con
  // `GET /me/projects` —endpoint de solo lectura ya existente (MB-7-1)— porque
  // el paso 03 necesita su `nombre`, y la identidad del Empleado sigue
  // derivándose del token (§32). No se crea endpoint ni vista nuevos.
  useEffect(() => {
    if (proyectoId === null || proyectoId === undefined) return undefined
    let vigente = true

    listarMisProyectos(token)
      .then((pagina) => {
        const proyecto = pagina?.items?.find((p) => p.id === Number(proyectoId))
        // Si el proyecto no está entre los del empleado, no se selecciona nada:
        // la vista conserva su flujo de búsqueda normal.
        if (vigente && proyecto) {
          // Queda registrado como proyecto de ENTRADA para que el paso 02 lo
          // muestre aunque todavía no haya ninguna búsqueda ejecutada.
          setProyectoDeEntrada(proyecto)
          seleccionarProyecto(proyecto)
          // Ajuste de navegación: la llegada contextual YA NO cambia la
          // pestaña activa (siempre «Registrados» al entrar). El proyecto
          // queda seleccionado para quien abra «Registrar participación», y
          // un registro nuevo nunca hereda una edición anterior.
          setEdicionDesdeConsulta(false)
        }
      })
      .catch(() => {
        // Un fallo al resolver NO interrumpe la vista: el usuario sigue
        // pudiendo buscar y registrar desde el flujo habitual.
      })
      .finally(() => {
        if (vigente) alProyectoAplicado?.()
      })

    return () => {
      vigente = false
    }
  }, [proyectoId])

  // Ajuste de navegación: la entrada normal abre «Registrados», así que la
  // consulta EXISTENTE (GET /me/participations, mismo servicio y contrato)
  // ocurre al montar la vista. Volver a la pestaña NO repite la llamada
  // (guard por fase); el refresco explícito va por abrirRegistrados().
  useEffect(() => {
    if (pestana === 'registrados' && registrados.fase === 'cerrada') {
      abrirRegistrados()
    }
  }, [pestana])

  function buscar(nombre) {
    setConsultaEjecutada(nombre)
    setBusqueda({ fase: 'cargando', datos: null, error: null })
    setAlta({ fase: 'inactiva', datos: null, error: null })
    // Una nueva búsqueda invalida la selección previa: el paso 03 solo existe
    // con un proyecto seleccionado en la consulta actual.
    setProyectoSeleccionado(null)
    // Y deja de aplicar la llegada contextual: a partir de aquí manda la búsqueda.
    setProyectoDeEntrada(null)
    // Un registro nuevo nunca hereda el estado de una edición anterior.
    setEdicionDesdeConsulta(false)
    setFormParticipacion(participacionInicial())
    setAvisosParticipacion(avisosIniciales())
    setRegistro({ fase: 'inactiva', datos: null, error: null })
    setDeteccion({ fase: 'inactiva', participacion: null, error: null })
    setEdicion(edicionInicial())
    setFormEdicion({ rol: '', entregables: '', horas: '' })
    setAvisosEdicion(avisosIniciales())
    buscarProyectos(token, nombre)
      .then((datos) => {
        setBusqueda({ fase: 'listo', datos, error: null })
        // El alta se ofrece SOLO si el backend no encontró coincidencia exacta
        // (PRD §11.1: "Crear nuevo si no existe"). El nombre buscado se
        // prellena por comodidad y sigue siendo editable.
        if (datos?.coincidencia_exacta == null) {
          setFormulario({ nombre, area: '', cliente: '' })
        }
      })
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setBusqueda({ fase: 'error', datos: null, error })
      })
  }

  function manejarBusqueda(evento) {
    evento.preventDefault()
    const nombre = nombreEscrito.trim()
    if (!nombre) {
      // El contrato exige `nombre` (Query(..., min_length=1) → 422): no se
      // dispara una consulta vacía. No es una regla nueva, es el contrato.
      setAvisoBusqueda('Escribe el nombre del proyecto para buscarlo.')
      return
    }
    setAvisoBusqueda(null)
    buscar(nombre)
  }

  async function enviarAlta() {
    setAlta({ fase: 'enviando', datos: null, error: null })
    try {
      const proyecto = await crearProyecto(token, prepararProyecto(formulario))
      setAlta({ fase: 'creado', datos: proyecto, error: null })
      // MB-5B-1: el proyecto recién creado se convierte en el seleccionado y
      // el flujo continúa al paso 03 (decisión confirmada).
      setProyectoSeleccionado(proyecto)
      setFormParticipacion(participacionInicial())
      setAvisosParticipacion(avisosIniciales())
      setRegistro({ fase: 'inactiva', datos: null, error: null })
      // MB-5B-3A: un proyecto recién creado NO puede tener participación
      // previa: no se consulta el listado dentro del mismo flujo de alta.
      setDeteccion({ fase: 'inactiva', participacion: null, error: null })
    } catch (error) {
      if (error?.estado === 401) {
        alSesionExpirada?.()
        return
      }
      // 409 (duplicado exacto) y 422 conservan el mensaje del backend y se
      // muestran junto al formulario: son respuestas del contrato, no fallos.
      if (error?.estado === 409 || error?.estado === 422) {
        setAlta({ fase: 'invalido', datos: null, error })
        return
      }
      setAlta({ fase: 'error', datos: null, error })
    }
  }

  function manejarAlta(evento) {
    evento.preventDefault()
    enviarAlta()
  }

  /** Paso 02: SOLO la coincidencia exacta puede seleccionarse (§18.2). */
  function seleccionarProyecto(proyecto) {
    setProyectoSeleccionado(proyecto)
    setFormParticipacion(participacionInicial())
    setAvisosParticipacion(avisosIniciales())
    setRegistro({ fase: 'inactiva', datos: null, error: null })
    detectarParticipacion(proyecto)
  }

  /**
   * Tarea B: consulta de proyectos registrados. UNA llamada paginada a
   * GET /me/participations (propio, anti-IDOR por el backend) basta: cada
   * item trae la participación completa y su `proyecto`. No hay endpoint
   * nuevo, no se cruzan datos de otros empleados y un proyecto sin
   * participación guardada no puede aparecer (la lista ES la de
   * participaciones).
   *
   * La carga INICIAL de «Registrados» tiene espera mínima cancelable para
   * que «Consultando tus proyectos…» sea perceptible: solo el éxito espera;
   * el error y el 401 llegan de inmediato. «Ver más», búsquedas, altas y
   * detecciones NO esperan.
   */
  async function abrirRegistrados() {
    const inicio = Date.now()
    const solicitud = ++cargaRegistradosRef.current
    setRegistrados({ fase: 'cargando', datos: null, error: null })
    setDetalleRegistrado(null)
    try {
      const respuesta = await listarParticipaciones(token, {
        pagina: 1,
        por_pagina: 100,
      })
      await esperaRegistradosRef.current.esperar(inicio)
      if (solicitud !== cargaRegistradosRef.current) return
      setRegistrados({ fase: 'listo', datos: respuesta, error: null })
    } catch (error) {
      if (solicitud !== cargaRegistradosRef.current) return
      if (error?.estado === 401) {
        alSesionExpirada?.()
        return
      }
      setRegistrados({ fase: 'error', datos: null, error })
    }
  }

  /**
   * «Ver más» (rediseño): paginación progresiva de la MISMA consulta. Pide la
   * página siguiente y ANEXA los items a los ya cargados (`total` sigue
   * mandando: el botón desaparece al cubrirlo). Sin endpoint nuevo; si falla,
   * el reintento reabre la consulta desde la primera página (mismo contrato
   * de errores que abrir).
   */
  async function cargarMasRegistrados() {
    const datos = registrados.datos
    if (!datos) return
    const paginaSiguiente = Number(datos.pagina ?? 1) + 1
    const porPagina = Number(datos.por_pagina ?? REGISTRADOS_POR_PAGINA)
    setRegistrados({ fase: 'cargando-mas', datos, error: null })
    try {
      const respuesta = await listarParticipaciones(token, {
        pagina: paginaSiguiente,
        por_pagina: porPagina,
      })
      setRegistrados({
        fase: 'listo',
        datos: {
          ...respuesta,
          items: [...(datos.items ?? []), ...(respuesta?.items ?? [])],
        },
        error: null,
      })
    } catch (error) {
      if (error?.estado === 401) {
        alSesionExpirada?.()
        return
      }
      setRegistrados({ fase: 'error', datos: null, error })
    }
  }

  /** Detalle del registro pulsado: usa el item YA descargado (sin más llamadas). */
  function alternarDetalleRegistrado(item) {
    setDetalleRegistrado((actual) => (actual?.id === item.id ? null : item))
  }

  /**
   * Ajuste de edición: transición DIRECTA desde «Registrados» al modo de
   * edición. El item YA contiene la participación completa y su `proyecto`,
   * así que no se busca ni se repite la detección (cero llamadas nuevas):
   * se activa la pestaña del flujo renderizando SOLO el Paso 03 con los
   * valores actuales precargados (`abrirEdicion`). NUNCA un formulario de
   * alta, por lo que no puede duplicarse la participación.
   */
  function editarRegistrado(item) {
    setDetalleRegistrado(null)
    setPestana('registro')
    setEdicionDesdeConsulta(true)
    setProyectoSeleccionado(item.proyecto)
    setDeteccion({ fase: 'listo', participacion: item, error: null })
    abrirEdicion(item)
  }

  /**
   * MB-5B-3A: detecta si el Empleado YA tiene participación en el proyecto
   * seleccionado, ANTES de abrir el formulario.
   *
   * Usa EXCLUSIVAMENTE `GET /me/participations` (sin endpoint nuevo): el
   * endpoint no admite filtro por `proyecto_id`, así que se pagina con
   * `por_pagina=100` cubriendo `total` (nunca se usa `items.length` como
   * sustituto de `total`) y se detiene al encontrar la participación o al
   * cubrir el total. El 409 del POST queda como defensa final del backend,
   * no como flujo normal de UX.
   */
  async function detectarParticipacion(proyecto) {
    setDeteccion({ fase: 'cargando', participacion: null, error: null })
    const porPagina = 100
    let pagina = 1
    let total = 0
    let encontrada = null
    try {
      do {
        const respuesta = await listarParticipaciones(token, {
          pagina,
          por_pagina: porPagina,
        })
        total = Number(respuesta?.total ?? 0)
        encontrada = (respuesta?.items ?? []).find(
          (item) => item.proyecto_id === proyecto.id,
        )
        pagina += 1
      } while (!encontrada && (pagina - 1) * porPagina < total)
    } catch (error) {
      if (error?.estado === 401) {
        alSesionExpirada?.()
        return
      }
      setDeteccion({ fase: 'error', participacion: null, error })
      return
    }
    setDeteccion({ fase: 'listo', participacion: encontrada ?? null, error: null })
  }

  async function enviarRegistro() {
    // Validación local espejo del contrato: sin rol o con horas inválidas no
    // se envía el POST (el backend rechazaría igual, pero evitamos el viaje).
    const validacion = validarParticipacion(formParticipacion)
    setAvisosParticipacion(validacion)
    if (!validacion.valido) return

    // Payload EXACTO de ParticipacionCreateIn (ocho campos, ni uno más):
    // sin empleado_id (§32), sin fecha_registro (la fija el servidor) y sin
    // estado (no forma parte del contrato).
    const payload = {
      proyecto_id: proyectoSeleccionado.id,
      rol: formParticipacion.rol.trim(),
      entregables: formParticipacion.entregables.trim() || null,
      en_equipo: formParticipacion.en_equipo,
      coordino_tareas: formParticipacion.coordino_tareas,
      explico_a_publico_distinto: formParticipacion.explico_a_publico_distinto,
      resolvio_problema: formParticipacion.resolvio_problema,
      horas: Number.parseInt(formParticipacion.horas.trim(), 10),
    }

    setRegistro({ fase: 'enviando', datos: null, error: null })
    try {
      const participacion = await crearParticipacion(token, payload)
      setRegistro({ fase: 'registrada', datos: participacion, error: null })
    } catch (error) {
      if (error?.estado === 401) {
        alSesionExpirada?.()
        return
      }
      // 404 (proyecto), 409 (duplicada) y 422 (validación) conservan el
      // mensaje del backend junto al formulario: son respuestas del contrato,
      // no fallos técnicos.
      if ([404, 409, 422].includes(error?.estado)) {
        setRegistro({ fase: 'invalido', datos: null, error })
        return
      }
      setRegistro({ fase: 'error', datos: null, error })
    }
  }

  function manejarRegistro(evento) {
    evento.preventDefault()
    enviarRegistro()
  }

  /**
   * MB-5B-2: entra al modo edición dentro de la misma vista y precarga los tres
   * campos editables con los valores actuales de la participación detectada.
   */
  function abrirEdicion(participacion) {
    setFormEdicion({
      rol: participacion.rol ?? '',
      entregables: participacion.entregables ?? '',
      horas: participacion.horas == null ? '' : String(participacion.horas),
    })
    setAvisosEdicion(avisosIniciales())
    setEdicion({ activa: true, fase: 'inactiva', error: null })
  }

  /** Cancelar NO hace ninguna petición: descarta lo local y vuelve al resumen.
   *  En la edición directa, además, cierra el modo y devuelve a «Registrados»
   *  con el flujo normal restaurado para el próximo registro. */
  function cancelarEdicion() {
    if (edicionDesdeConsulta) {
      setEdicionDesdeConsulta(false)
      reiniciar()
      setPestana('registrados')
      return
    }
    setFormEdicion({ rol: '', entregables: '', horas: '' })
    setAvisosEdicion(avisosIniciales())
    setEdicion(edicionInicial())
  }

  async function enviarEdicion() {
    // Misma validación local espejo del contrato que el registro: sin rol o con
    // horas inválidas no se envía el PATCH (el backend lo rechazaría igual).
    const validacion = validarParticipacion(formEdicion)
    setAvisosEdicion(validacion)
    if (!validacion.valido) return

    // Payload EXACTO de ParticipacionEmpleadoUpdateIn (tres campos, ni uno más):
    // sin proyecto_id, empleado_id, fecha_registro, estado ni los cuatro
    // indicadores, que son datos bloqueados del registro inicial.
    const payload = {
      rol: formEdicion.rol.trim(),
      entregables: formEdicion.entregables.trim() || null,
      horas: Number.parseInt(formEdicion.horas.trim(), 10),
    }

    setEdicion({ activa: true, fase: 'enviando', error: null })
    try {
      // El id es el de la PARTICIPACIÓN (el que entrega la detección), nunca el
      // del proyecto.
      const participacion = await actualizarParticipacion(
        token,
        deteccion.participacion.id,
        payload,
      )
      if (edicionDesdeConsulta) {
        // Éxito de la edición directa: se limpia el modo con seguridad, se
        // vuelve a consultar la lista real y se regresa a «Registrados» para
        // mostrar el proyecto y su participación ya actualizados.
        setEdicionDesdeConsulta(false)
        reiniciar()
        abrirRegistrados()
        setPestana('registrados')
        return
      }
      // La respuesta del PATCH es la fuente de verdad: el resumen local queda
      // actualizado sin volver a consultar el listado.
      setDeteccion({ fase: 'listo', participacion, error: null })
      setEdicion(edicionInicial())
      setFormEdicion({ rol: '', entregables: '', horas: '' })
      setAvisosEdicion(avisosIniciales())
    } catch (error) {
      if (error?.estado === 401) {
        alSesionExpirada?.()
        return
      }
      // 404 (participación ajena o inexistente) y 422 (validación) conservan el
      // mensaje del backend junto al formulario, igual que en el registro.
      if ([404, 422].includes(error?.estado)) {
        setEdicion({ activa: true, fase: 'invalido', error })
        return
      }
      setEdicion({ activa: true, fase: 'error', error })
    }
  }

  function manejarEdicion(evento) {
    evento.preventDefault()
    enviarEdicion()
  }

  /** Vuelve al estado inicial de la sección (sin ningún dato simulado). */
  function reiniciar() {
    setEdicionDesdeConsulta(false)
    setNombreEscrito('')
    setConsultaEjecutada('')
    setAvisoBusqueda(null)
    setBusqueda(consultaInicial())
    setFormulario({ nombre: '', area: '', cliente: '' })
    setAlta({ fase: 'inactiva', datos: null, error: null })
    setProyectoSeleccionado(null)
    setFormParticipacion(participacionInicial())
    setAvisosParticipacion(avisosIniciales())
    setRegistro({ fase: 'inactiva', datos: null, error: null })
    setDeteccion({ fase: 'inactiva', participacion: null, error: null })
    setEdicion(edicionInicial())
    setFormEdicion({ rol: '', entregables: '', horas: '' })
    setAvisosEdicion(avisosIniciales())
  }

  const exacta = busqueda.datos?.coincidencia_exacta ?? null
  // El backend garantiza el máximo (§8); el tope aquí es la regla de
  // presentación del PRD §11.3 ("hasta 5 sugerencias aproximadas").
  const sugerencias = (busqueda.datos?.sugerencias ?? []).slice(0, SUGERENCIAS_MAXIMAS)
  const puedeCrear = busqueda.fase === 'listo' && exacta === null
  // MB-5B-3A: participación propia ya registrada en el proyecto seleccionado.
  // El `proyecto` del item puede venir null en el DTO: como es la misma
  // entidad (coinciden por proyecto_id), se apoya en el proyecto seleccionado.
  const participacionExistente = deteccion.participacion
  const proyectoExistente = participacionExistente?.proyecto ?? proyectoSeleccionado
  // Tarea B: items de la consulta abierta (cada uno = participación + proyecto).
  const registradosItems = registrados.datos?.items ?? []
  const registradosTotal = Number(registrados.datos?.total ?? 0)
  // La pestaña muestra datos tanto en reposo como cargando más: la lista ya
  // descargada no desaparece mientras llega la página siguiente.
  const registradosConDatos =
    registrados.fase === 'listo' || registrados.fase === 'cargando-mas'
  // Filtro LOCAL: se aplica SOLO a los items ya cargados. El endpoint de
  // participaciones no admite filtro de texto, así que no se inventa una
  // llamada: escribir aquí nunca consulta el backend.
  const filtroLimpio = textoLocal(filtroRegistrados)
  const registradosFiltrados = filtroLimpio
    ? registradosItems.filter((item) =>
        [item.proyecto?.nombre, item.proyecto?.area, item.proyecto?.cliente].some(
          (campo) => textoLocal(campo).includes(filtroLimpio),
        ),
      )
    : registradosItems
  return (
    <div className="mis-proyectos">
      {/* Encabezado plano sobre el fondo general (sin banner ni tarjeta):
          sobretítulo terracota en mayúsculas, título oscuro grande y
          subtítulo gris inmediatamente debajo. */}
      <header className="mis-proyectos__cabecera">
        <p className="mis-proyectos__sobretitulo">Proyectos</p>
        <h2 className="mis-proyectos__titulo" id="mis-proyectos-titulo">
          Mis proyectos
        </h2>
        <p className="mis-proyectos__descripcion">
          Busca un proyecto del catálogo compartido y, si todavía no existe,
          regístralo.
        </p>
      </header>

      {/* Pestañas del rediseño: «Registrados» (consulta) y «Registrar
          participación» (flujo 01–03). Vistas mutuamente EXCLUSIVAS: solo
          se renderiza el panel de la pestaña activa (el estado vive en el
          componente, así que alternar no pierde datos del backend). */}
      <div
        className="proyectos-pestanas"
        role="tablist"
        aria-label="Secciones de Mis proyectos"
      >
        <button
          type="button"
          role="tab"
          id="mis-proyectos-tab-registrados"
          className={`proyectos-pestanas__tab${
            pestana === 'registrados' ? ' proyectos-pestanas__tab--activa' : ''
          }`}
          aria-selected={pestana === 'registrados'}
          aria-controls="mis-proyectos-panel-registrados"
          tabIndex={pestana === 'registrados' ? 0 : -1}
          onClick={() => setPestana('registrados')}
        >
          Registrados
          {/* Contador real: el `total` del servidor, visible solo cuando la
              consulta ya se hizo (antes no hay número que mostrar). */}
          {registradosConDatos && (
            <span className="proyectos-pestanas__contador">
              {registradosTotal}
            </span>
          )}
        </button>
        {/* Su nombre accesible se distingue del botón «Registrar
            participación» del formulario para no duplicar nombres. */}
        <button
          type="button"
          role="tab"
          id="mis-proyectos-tab-registro"
          className={`proyectos-pestanas__tab${
            pestana === 'registro' ? ' proyectos-pestanas__tab--activa' : ''
          }`}
          aria-label="Pestaña Registrar participación"
          aria-selected={pestana === 'registro'}
          aria-controls="mis-proyectos-panel-registro"
          tabIndex={pestana === 'registro' ? 0 : -1}
          onClick={() => setPestana('registro')}
        >
          Registrar participación
        </button>
      </div>

      {/* Consulta de proyectos registrados (Tarea B): proyectos con
          participación guardada, cargados bajo demanda con GET
          /me/participations (el DTO incluye `proyecto`). Vistas EXCLUSIVAS:
          este panel solo existe cuando su pestaña está activa (ningún
          elemento del flujo 01–03 se renderiza aquí). */}
      {pestana === 'registrados' && (
      <section
        role="tabpanel"
        id="mis-proyectos-panel-registrados"
        aria-labelledby="mis-proyectos-tab-registrados"
        className="proyectos-registrados"
      >
        {/* Buscador ancho del rediseño (lupa dentro, fondo claro, borde
            fino): filtra lo ya cargado, sin llamadas nuevas (el endpoint de
            participaciones no admite filtro de texto). El listado aparece
            directamente debajo con sus estados de carga y error. */}
        <div className="proyectos-registrados__filtro">
          <label
            className="proyectos-registrados__filtro-etiqueta"
            htmlFor="proyectos-registrados-filtro"
          >
            Buscar en mis proyectos
          </label>
          <div className="proyectos-registrados__barra">
            <Search
              className="proyectos-registrados__lupa"
              aria-hidden="true"
            />
            <input
              id="proyectos-registrados-filtro"
              className="ui-input proyectos-registrados__barra-input"
              type="search"
              autoComplete="off"
              placeholder="Filtrar por nombre"
              value={filtroRegistrados}
              onChange={(evento) => setFiltroRegistrados(evento.target.value)}
            />
          </div>
        </div>

        {registrados.fase === 'cargando' && (
          <EstadoCarga texto="Consultando tus proyectos…" />
        )}

        {registrados.fase === 'error' && (
          <EstadoError
            titulo="No pudimos cargar tus proyectos registrados"
            mensaje="La información no está disponible en este momento."
            onReintentar={abrirRegistrados}
          />
        )}

        {registrados.fase === 'listo' && registradosItems.length === 0 && (
          <EstadoVacio
            titulo="Todavía no hay proyectos registrados"
            descripcion="Registra tu primera participación para comenzar a construir tu historial."
          />
        )}

        {registradosConDatos && registradosItems.length > 0 && (
          <>
            {registradosFiltrados.length === 0 ? (
              <EstadoVacio
                titulo="Ningún proyecto coincide con tu búsqueda"
                descripcion="Prueba con otro nombre, área o cliente, o registra el proyecto en la otra pestaña."
              />
            ) : (
              <ul className="proyectos-registrados__lista">
                {registradosFiltrados.map((item) => {
                const abierto = detalleRegistrado?.id === item.id
                const proyecto = item.proyecto
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="proyectos-registrados__item"
                      aria-expanded={abierto}
                      aria-controls={`proyectos-registrado-detalle-${item.id}`}
                      onClick={() => alternarDetalleRegistrado(item)}
                    >
                      <span className="proyectos-registrados__principal">
                        <span className="proyectos-registrados__nombre">
                          {proyecto?.nombre ?? `Proyecto ${item.proyecto_id}`}
                        </span>
                        <span className="proyectos-registrados__meta">
                          <span>Área: {proyecto?.area ?? SIN_DATO}</span>
                          <span>Cliente: {proyecto?.cliente ?? SIN_DATO}</span>
                          <span>
                            Registrado: {fechaCorta(item.fecha_registro)}
                          </span>
                        </span>
                      </span>
                      {/* Estado real con indicador circular: verde sólido
                          (Completado), aro terracota (En proceso), neutral
                          para el resto. El nombre siempre visible. */}
                      <span className="proyectos-registrados__estado">
                        {proyecto?.estado ? (
                          <>
                            <span
                              className="proyectos-registrados__punto"
                              data-estado={proyecto.estado}
                              aria-hidden="true"
                            />
                            <span className="proyectos-registrados__estado-texto">
                              {etiquetaEstado(proyecto.estado)}
                            </span>
                          </>
                        ) : (
                          <span className="proyectos-registrados__estado-texto">
                            Estado: {SIN_DATO}
                          </span>
                        )}
                        <ChevronDown
                          className="proyectos-registrados__flecha"
                          aria-hidden="true"
                        />
                      </span>
                    </button>

                    {/* Acordeón accesible del rediseño: el detalle queda
                        montado y se oculta SOLO con CSS (aria-controls
                        siempre resuelto), como el acordeón de «Mi progreso». */}
                    <div
                      id={`proyectos-registrado-detalle-${item.id}`}
                      className={`proyectos-registrados__detalle${
                        abierto ? '' : ' proyectos-registrados__detalle--oculto'
                      }`}
                      role="group"
                      aria-label={`Detalle de ${
                        proyecto?.nombre ?? `Proyecto ${item.proyecto_id}`
                      }`}
                    >
                        <h3 className="proyectos-registrados__subtitulo">
                          Proyecto
                        </h3>
                        <dl className="proyectos-datos">
                          <div>
                            <dt>Nombre</dt>
                            <dd>{proyecto?.nombre ?? SIN_DATO}</dd>
                          </div>
                          <div>
                            <dt>Área</dt>
                            <dd>{proyecto?.area ?? SIN_DATO}</dd>
                          </div>
                          <div>
                            <dt>Cliente</dt>
                            <dd>{proyecto?.cliente ?? SIN_DATO}</dd>
                          </div>
                          <div>
                            <dt>Estado</dt>
                            <dd>
                              {proyecto?.estado
                                ? etiquetaEstado(proyecto.estado)
                                : SIN_DATO}
                            </dd>
                          </div>
                          <div>
                            <dt>Creado</dt>
                            <dd>{fechaCorta(proyecto?.created_at)}</dd>
                          </div>
                          <div>
                            <dt>Actualizado</dt>
                            <dd>{fechaCorta(proyecto?.updated_at)}</dd>
                          </div>
                        </dl>

                        <h3 className="proyectos-registrados__subtitulo">
                          Mi participación
                        </h3>
                        <dl className="proyectos-datos">
                          <div>
                            <dt>Rol</dt>
                            <dd>{item.rol}</dd>
                          </div>
                          <div>
                            <dt>Entregables</dt>
                            <dd>{item.entregables ?? SIN_DATO}</dd>
                          </div>
                          <div>
                            <dt>Horas</dt>
                            <dd>{item.horas}</dd>
                          </div>
                          <div>
                            <dt>Fecha de registro</dt>
                            <dd>{fechaCorta(item.fecha_registro)}</dd>
                          </div>
                          <div>
                            <dt>Trabajo en equipo</dt>
                            <dd>{etiquetaSiNo(item.en_equipo)}</dd>
                          </div>
                          <div>
                            <dt>Coordinación</dt>
                            <dd>{etiquetaSiNo(item.coordino_tareas)}</dd>
                          </div>
                          <div>
                            <dt>Explicación a públicos distintos</dt>
                            <dd>
                              {etiquetaSiNo(item.explico_a_publico_distinto)}
                            </dd>
                          </div>
                          <div>
                            <dt>Situación/problema</dt>
                            <dd>{etiquetaSiNo(item.resolvio_problema)}</dd>
                          </div>
                          <div>
                            <dt>Registrada</dt>
                            <dd>{fechaCorta(item.created_at)}</dd>
                          </div>
                          <div>
                            <dt>Última actualización</dt>
                            <dd>{fechaCorta(item.updated_at)}</dd>
                          </div>
                        </dl>

                        {proyecto && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => editarRegistrado(item)}
                          >
                            <Pencil aria-hidden="true" /> Editar esta
                            participación
                          </Button>
                        )}
                      </div>
                  </li>
                )
              })}
            </ul>
            )}
            {/* Pie del listado: «Mostrando X de Y» y «Ver más (N)» como
                texto en negrita (registros 1:1 con proyectos por la unicidad
                empleado/proyecto que garantiza el backend con su 409). */}
            <div className="proyectos-registrados__paginacion">
              <p className="proyectos-registrados__nota">
                Mostrando {registradosItems.length} de {registradosTotal}
              </p>
              {registradosItems.length < registradosTotal && (
                <Button
                  type="button"
                  className="proyectos-registrados__ver-mas"
                  variant="ghost"
                  size="small"
                  loading={registrados.fase === 'cargando-mas'}
                  onClick={cargarMasRegistrados}
                >
                  Ver más ({registradosTotal - registradosItems.length})
                </Button>
              )}
            </div>
          </>
        )}
      </section>
      )}

      {/* Panel del flujo (pestaña «Registrar participación»): asistente
          vertical conectado 01 → 02 → 03. Vistas EXCLUSIVAS: solo se monta
          cuando su pestaña está activa (nada de la consulta aparece aquí). */}
      {pestana === 'registro' && (
      <section
        role="tabpanel"
        id="mis-proyectos-panel-registro"
        aria-labelledby="mis-proyectos-tab-registro"
        className={`proyectos-flujo${
          edicionDesdeConsulta ? ' proyectos-flujo--edicion' : ''
        }`}
      >
      {/* Ajuste de edición: en el modo de edición directa el flujo normal
          (confirmación de creación, pasos 01 y 02 y sus mensajes) NO se
          renderiza; solo existe el Paso 03 con el formulario de edición. */}
      {!edicionDesdeConsulta && (<>
      {/* Confirmación de creación (MB-5A): SOLO con el ProyectoOut del POST.
          En MB-5B-1 deja de ser terminal: el proyecto creado queda seleccionado
          y el flujo continúa en el paso 03. */}
      {alta.fase === 'creado' && (
        <section className="proyectos-creado" aria-label="Proyecto creado">
          <Alert tone="success" title="Proyecto creado">
            Quedó registrado en el catálogo compartido con el estado inicial del producto.
            Ya está seleccionado: continúa con el paso 03.
          </Alert>
          <p className="proyectos-creado__nombre">{alta.datos.nombre}</p>
          <dl className="proyectos-datos">
            <div>
              <dt>Estado</dt>
              <dd>
                <Badge tone={tonoEstado(alta.datos.estado)}>
                  {etiquetaEstado(alta.datos.estado)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt>Área</dt>
              <dd>{alta.datos.area ?? SIN_DATO}</dd>
            </div>
            <div>
              <dt>Cliente</dt>
              <dd>{alta.datos.cliente ?? SIN_DATO}</dd>
            </div>
            <div>
              <dt>Identificador</dt>
              <dd>{alta.datos.id}</dd>
            </div>
            <div>
              <dt>Nombre normalizado</dt>
              <dd>{alta.datos.nombre_normalizado}</dd>
            </div>
          </dl>
          <p className="proyectos-nota">
            Estos datos son la respuesta del servidor para el proyecto registrado: se
            muestran tal cual, sin recalcularlos. «Nombre normalizado» es la forma que el
            backend usa para detectar duplicados exactos.
          </p>
          <Button type="button" variant="secondary" onClick={reiniciar}>
            <Repeat2 aria-hidden="true" /> Buscar otro proyecto
          </Button>
        </section>
      )}

      <section
        className="proyectos-paso"
        aria-labelledby="proyectos-busqueda-titulo"
      >
        <span className="proyectos-paso__numero" aria-hidden="true">
          01
        </span>
        <div className="proyectos-paso__contenido">
          <h2 className="proyectos-paso__titulo" id="proyectos-busqueda-titulo">
            Buscar el proyecto
          </h2>
          <p className="proyectos-paso__nota">
            La búsqueda es obligatoria antes de registrar un proyecto: así se evitan
            duplicados en el catálogo compartido.
          </p>
          <form
            className="proyectos-busqueda"
            onSubmit={manejarBusqueda}
            aria-busy={busqueda.fase === 'cargando'}
          >
            <FormField
              id="proyectos-busqueda-nombre"
              label="Nombre del proyecto"
              error={avisoBusqueda}
            >
              <Input
                id="proyectos-busqueda-nombre"
                autoComplete="off"
                value={nombreEscrito}
                onChange={(evento) => setNombreEscrito(evento.target.value)}
                invalid={Boolean(avisoBusqueda)}
              />
            </FormField>
            {/* Botón alineado con el campo; mientras no hay nombre válido
                se muestra en verde grisáceo claro (solo apariencia: sigue
                operativo y muestra el aviso del contrato si se pulsa). */}
            <Button
              type="submit"
              className={`proyectos-busqueda__accion${
                !nombreEscrito.trim() && busqueda.fase !== 'cargando'
                  ? ' proyectos-busqueda__accion--inactiva'
                  : ''
              }`}
              loading={busqueda.fase === 'cargando'}
            >
              <Search aria-hidden="true" />
              {busqueda.fase === 'cargando' ? 'Buscando…' : 'Buscar proyecto'}
            </Button>
          </form>
          <p className="proyectos-busqueda__ayuda">
            Escríbelo como lo conoces: el sistema compara sin distinguir
            mayúsculas ni acentos.
          </p>
        </div>
      </section>

      {/* Tras crear el proyecto, el resultado de la búsqueda anterior deja de
          interesar: el foco del flujo pasa a la confirmación y al paso 03. */}
      {/* Mensajes del paso 01 (plano: texto normal y borde lateral
          discreto, sin tarjeta decorativa). */}
      {alta.fase !== 'creado' && (
        <div className="proyectos-mensajes" aria-live="polite">
          {busqueda.fase === 'inicial' && (
            <EstadoVacio
              titulo="Todavía no has buscado un proyecto"
              descripcion="Escribe un nombre y usa «Buscar proyecto». Si ya existe, lo verás aquí; si no, podrás registrarlo."
            />
          )}

          {busqueda.fase === 'cargando' && (
            <EstadoCarga texto="Buscando en el catálogo…" />
          )}

          {busqueda.fase === 'error' && (
            <EstadoError
              titulo="No pudimos completar la búsqueda"
              mensaje={busqueda.error?.message}
              onReintentar={() => buscar(consultaEjecutada)}
            />
          )}
        </div>
      )}

      {/* Paso 02 — coincidencia exacta: el backend ya decidió que el
          proyecto existe (PRD §11.1 "Seleccionar existente"). No se calcula
          nada aquí. */}
      {alta.fase !== 'creado' && busqueda.fase === 'listo' && exacta && (
        <section
          className="proyectos-paso"
          aria-labelledby="proyectos-seleccion-titulo"
        >
          <span className="proyectos-paso__numero" aria-hidden="true">
            02
          </span>
          <div className="proyectos-paso__contenido">
            <h2
              className="proyectos-paso__titulo"
              id="proyectos-seleccion-titulo"
            >
              Crear o seleccionar
            </h2>
            <div className="proyectos-coincidencia">
              {/* Copy literal del Style Guide §18.2 (decisión F.3): "Este
                  proyecto ya existe." + acción "Seleccionar proyecto". */}
              <p className="proyectos-coincidencia__etiqueta">
                <CheckCircle2 aria-hidden="true" /> Este proyecto ya existe.
              </p>
            <p className="proyectos-coincidencia__nombre">{exacta.nombre}</p>
            <dl className="proyectos-datos">
              <div>
                <dt>Área</dt>
                <dd>{exacta.area ?? SIN_DATO}</dd>
              </div>
              <div>
                <dt>Cliente</dt>
                <dd>{exacta.cliente ?? SIN_DATO}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>
                  <Badge tone={tonoEstado(exacta.estado)}>
                    {etiquetaEstado(exacta.estado)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>Nombre normalizado</dt>
                <dd>{exacta.nombre_normalizado}</dd>
              </div>
            </dl>
            <p className="proyectos-nota">
              Este proyecto ya existe en el catálogo compartido: no hace falta crearlo de
              nuevo. «Nombre normalizado» es la forma que el backend usa para detectar
              duplicados exactos.
            </p>
            {/* Solo la coincidencia exacta continúa al registro (§18.2):
                las sugerencias aproximadas NO tienen esta acción. */}
              {proyectoSeleccionado?.id === exacta.id ? (
                <p className="proyectos-seleccionado">
                  <CheckCircle2 aria-hidden="true" /> Proyecto seleccionado:
                  continúa con el paso 03.
                </p>
              ) : (
                <Button type="button" onClick={() => seleccionarProyecto(exacta)}>
                  <ArrowRight aria-hidden="true" /> Seleccionar proyecto
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Sin coincidencia exacta: las sugerencias aproximadas son
          INFORMATIVAS (§8). No son un error y no crean ninguna relación. */}
      {alta.fase !== 'creado' && busqueda.fase === 'listo' && !exacta && (
        <div className="proyectos-sugerencias">
            {/* Copy literal del Style Guide §18.2: advertencia informativa,
                NUNCA un error y sin opción de seleccionar. */}
            <p className="proyectos-sugerencias__titulo">
              ¿Tal vez buscas uno de estos proyectos?
            </p>
            <p className="proyectos-sugerencias__nota">
              Ninguna coincide exactamente. Son informativas: no crean ninguna relación con
              el proyecto ni impiden registrar uno nuevo.
            </p>
            {sugerencias.length > 0 ? (
              <ul className="proyectos-sugerencias__lista">
                {sugerencias.map((sugerencia) => (
                  <li className="proyecto-sugerencia" key={sugerencia.proyecto.id}>
                    <p className="proyecto-sugerencia__nombre">
                      {sugerencia.proyecto.nombre}
                    </p>
                    <dl className="proyectos-datos">
                      <div>
                        <dt>Área</dt>
                        <dd>{sugerencia.proyecto.area ?? SIN_DATO}</dd>
                      </div>
                      <div>
                        <dt>Cliente</dt>
                        <dd>{sugerencia.proyecto.cliente ?? SIN_DATO}</dd>
                      </div>
                      <div>
                        <dt>Estado</dt>
                        <dd>
                          <Badge tone={tonoEstado(sugerencia.proyecto.estado)}>
                            {etiquetaEstado(sugerencia.proyecto.estado)}
                          </Badge>
                        </dd>
                      </div>
                      {/* Similitud tal cual llega: sin convertir a porcentaje ni
                          redondear, para no sugerir una calificación. */}
                      <div>
                        <dt>Similitud</dt>
                        <dd>{sugerencia.similitud}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <EstadoVacio
                titulo="Sin coincidencias en el catálogo"
                descripcion="No existe un proyecto con ese nombre ni coincidencias aproximadas. Puedes registrarlo como proyecto nuevo."
              />
            )}
          </div>
      )}

      {/* Alta (PRD §11.1 "Crear nuevo si no existe"): aparece SOLO cuando el
          backend no devolvió coincidencia exacta. El estado EN_PROCESO lo fija
          el backend; aquí no se envía. Tras crear, el proyecto queda seleccionado
          y esta sección se retira a favor del paso 03. */}
      {puedeCrear && alta.fase !== 'creado' && (
        <section
          className="proyectos-paso"
          aria-labelledby="proyectos-alta-titulo"
        >
          <span className="proyectos-paso__numero" aria-hidden="true">
            02
          </span>
          <div className="proyectos-paso__contenido">
            <h2 className="proyectos-paso__titulo" id="proyectos-alta-titulo">
              Crear o seleccionar
            </h2>
          {alta.fase === 'error' ? (
            <EstadoError
              titulo="No pudimos registrar el proyecto"
              mensaje={alta.error?.message}
              onReintentar={enviarAlta}
            />
          ) : (
            <>
              <p className="proyectos-paso__nota">
                No existe un proyecto con ese nombre exacto. Regístralo y el sistema lo
                creará en estado «En proceso».
              </p>
              <form
                className="proyectos-alta"
                onSubmit={manejarAlta}
                aria-busy={alta.fase === 'enviando'}
              >
                <div className="proyectos-alta__campos">
                  <FormField id="proyectos-alta-nombre" label="Nombre" required>
                    <Input
                      id="proyectos-alta-nombre"
                      required
                      value={formulario.nombre}
                      onChange={(evento) =>
                        setFormulario({ ...formulario, nombre: evento.target.value })
                      }
                      invalid={alta.fase === 'invalido'}
                    />
                  </FormField>
                  <FormField id="proyectos-alta-area" label="Área">
                    <Input
                      id="proyectos-alta-area"
                      value={formulario.area}
                      onChange={(evento) =>
                        setFormulario({ ...formulario, area: evento.target.value })
                      }
                    />
                  </FormField>
                  <FormField id="proyectos-alta-cliente" label="Cliente">
                    <Input
                      id="proyectos-alta-cliente"
                      value={formulario.cliente}
                      onChange={(evento) =>
                        setFormulario({ ...formulario, cliente: evento.target.value })
                      }
                    />
                  </FormField>
                </div>
                {/* 409 (duplicado exacto) y 422 se muestran con el mensaje del
                    backend: son respuestas del contrato, no fallos técnicos. */}
                {alta.fase === 'invalido' && (
                  <Alert tone="error">{alta.error?.message}</Alert>
                )}
                <div className="proyectos-alta__acciones">
                  <span>Los campos con * son obligatorios.</span>
                  <Button type="submit" loading={alta.fase === 'enviando'}>
                    <FolderKanban aria-hidden="true" />
                    {alta.fase === 'enviando' ? 'Registrando…' : 'Crear proyecto'}
                  </Button>
                </div>
              </form>
            </>
          )}
          </div>
        </section>
      )}

      {/* Paso 02 de LLEGADA CONTEXTUAL (MB-7-2F): el usuario llega desde «Inicio»
          con un proyecto ya elegido, así que no hay búsqueda que mostrar. Se
          reutilizan las MISMAS clases y el mismo `dl` del bloque de coincidencia
          exacta, para que la vista se lea igual en los dos caminos. No es un
          paso nuevo ni un detalle: es el paso 02 mostrando el proyecto que ya
          está seleccionado. */}
      {proyectoDeEntrada && proyectoDeEntrada.id === proyectoSeleccionado?.id && (
        <section
          className="proyectos-paso"
          aria-labelledby="proyectos-entrada-titulo"
        >
          <span className="proyectos-paso__numero" aria-hidden="true">
            02
          </span>
          <div className="proyectos-paso__contenido">
            <h2
              className="proyectos-paso__titulo"
              id="proyectos-entrada-titulo"
            >
              Crear o seleccionar
            </h2>
            <div className="proyectos-coincidencia">
            <p className="proyectos-coincidencia__etiqueta">
              <CheckCircle2 aria-hidden="true" /> Proyecto seleccionado
            </p>
            <p className="proyectos-coincidencia__nombre">{proyectoDeEntrada.nombre}</p>
            <dl className="proyectos-datos">
              <div>
                <dt>Área</dt>
                <dd>{proyectoDeEntrada.area ?? SIN_DATO}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>
                  <Badge tone={tonoEstado(proyectoDeEntrada.estado)}>
                    {etiquetaEstado(proyectoDeEntrada.estado)}
                  </Badge>
                </dd>
              </div>
            </dl>
            <p className="proyectos-seleccionado">
              <CheckCircle2 aria-hidden="true" /> Ya está seleccionado: puedes ver
              tu participación en el paso 03.
            </p>
            </div>
          </div>
        </section>
      )}

      </>)}

      {/* Paso 03 (MB-5B-1, §18.3/§18.4): ParticipationForm con el orden exacto
          de los documentos. Solo existe con un proyecto seleccionado: la
          coincidencia aproximada jamás llega aquí. En el modo de edición
          directa este es el ÚNICO paso renderizado. */}
      {proyectoSeleccionado && (
        <section
          className="proyectos-paso"
          aria-labelledby="proyectos-registro-titulo"
        >
          <span className="proyectos-paso__numero" aria-hidden="true">
            03
          </span>
          <div className="proyectos-paso__contenido">
          <h2 className="proyectos-paso__titulo" id="proyectos-registro-titulo">
            {edicionDesdeConsulta
              ? 'Editar participación'
              : 'Registrar la participación'}
          </h2>

          {registro.fase === 'registrada' ? (
            <div className="proyectos-confirmacion">
              <Alert tone="success" title="Participación registrada">
                Se guardó con los indicadores que capturaste y la fecha del servidor.
              </Alert>
              {/* El nombre NO proviene de participacion.proyecto (que puede ser
                  null): proviene del proyecto seleccionado en el paso 02. */}
              <p className="proyectos-creado__nombre">{proyectoSeleccionado.nombre}</p>
              <dl className="proyectos-datos">
                <div>
                  <dt>Rol</dt>
                  <dd>{registro.datos.rol}</dd>
                </div>
                <div>
                  <dt>Entregables</dt>
                  <dd>{registro.datos.entregables ?? SIN_DATO}</dd>
                </div>
                <div>
                  <dt>Horas</dt>
                  <dd>{registro.datos.horas}</dd>
                </div>
                <div>
                  <dt>Fecha de registro</dt>
                  <dd>{registro.datos.fecha_registro}</dd>
                </div>
              </dl>
              <div>
                <dl className="proyectos-datos">
                  <div>
                    <dt>Trabajo en equipo</dt>
                    <dd>{etiquetaSiNo(registro.datos.en_equipo)}</dd>
                  </div>
                  <div>
                    <dt>Coordinación</dt>
                    <dd>{etiquetaSiNo(registro.datos.coordino_tareas)}</dd>
                  </div>
                  <div>
                    <dt>Explicación a públicos distintos</dt>
                    <dd>{etiquetaSiNo(registro.datos.explico_a_publico_distinto)}</dd>
                  </div>
                  <div>
                    <dt>Situación/problema</dt>
                    <dd>{etiquetaSiNo(registro.datos.resolvio_problema)}</dd>
                  </div>
                </dl>
                {/* Copy §18.3: el estado posterior no es punitivo, refiere al
                    registro inicial hecho por la propia persona. */}
                <p className="proyectos-nota">Registrado al crear la participación.</p>
              </div>
              <Button type="button" variant="secondary" onClick={reiniciar}>
                <Repeat2 aria-hidden="true" /> Buscar otro proyecto
              </Button>
            </div>
          ) : deteccion.fase === 'cargando' ? (
            <EstadoCarga texto="Consultando tus participaciones…" />
          ) : deteccion.fase === 'error' ? (
            <EstadoError
              titulo="No pudimos consultar tus participaciones"
              mensaje={deteccion.error?.message}
              onReintentar={() => detectarParticipacion(proyectoSeleccionado)}
            />
          ) : participacionExistente ? (
            /* MB-5B-3A: participación ya registrada para este proyecto. Bloque
               informativo (no un error): sin formulario, sin POST y sin
               acciones hacia un detalle que todavía no existe (§18.1/§28). */
            <div className="proyectos-existente">
              <p className="proyectos-existente__mensaje">
                <CheckCircle2 aria-hidden="true" />
                {' '}
                Ya registraste una participación en este proyecto.
              </p>
              <p className="proyectos-existente__nombre">{proyectoExistente.nombre}</p>
{edicion.activa ? (
                /* MB-5B-2: modo edición DENTRO de la misma vista. Solo tres
                   campos editables; el resto se muestra como dato, nunca input. */
                <form
                  className="proyectos-registro"
                  onSubmit={manejarEdicion}
                  aria-busy={edicion.fase === 'enviando'}
                >
                  <p className="proyectos-paso__nota">
                    Puedes actualizar tu rol, tus entregables y tus horas.
                  </p>
                  <FormField
                    id="edicion-rol"
                    label="Rol"
                    required
                    hint="El rol que desempeñaste en este proyecto."
                    error={avisosEdicion.rol}
                  >
                    <Input
                      id="edicion-rol"
                      autoComplete="off"
                      value={formEdicion.rol}
                      onChange={(evento) =>
                        setFormEdicion({ ...formEdicion, rol: evento.target.value })
                      }
                      invalid={Boolean(avisosEdicion.rol)}
                    />
                  </FormField>

                  <FormField
                    id="edicion-entregables"
                    label="Entregables"
                    hint="Opcional: lo que entregaste en este proyecto."
                  >
                    <Input
                      id="edicion-entregables"
                      autoComplete="off"
                      value={formEdicion.entregables}
                      onChange={(evento) =>
                        setFormEdicion({ ...formEdicion, entregables: evento.target.value })
                      }
                    />
                  </FormField>
                  <FormField
                    id="edicion-horas"
                    label="Horas"
                    required
                    hint="Número entero de horas dedicadas, por ejemplo 120."
                    error={avisosEdicion.horas}
                  >
                    <Input
                      id="edicion-horas"
                      inputMode="numeric"
                      autoComplete="off"
                      value={formEdicion.horas}
                      onChange={(evento) =>
                        setFormEdicion({ ...formEdicion, horas: evento.target.value })
                      }
                      invalid={Boolean(avisosEdicion.horas)}
                    />
                  </FormField>

                  {/* El proyecto y la fecha los fija el backend: son datos. */}
                  <dl className="proyectos-datos">
                    <div>
                      <dt>Proyecto</dt>
                      <dd>{proyectoExistente.nombre}</dd>
                    </div>
                    <div>
                      <dt>Fecha de registro</dt>
                      <dd>{participacionExistente.fecha_registro}</dd>
                    </div>
                  </dl>
                  {/* Indicadores objetivos: solo lectura, nunca inputs (extra="forbid"). */}
                  <div
                    className="proyectos-indicadores"
                    role="group"
                    aria-labelledby="proyectos-indicadores-edicion"
                  >
                    <p
                      className="proyectos-indicadores__titulo"
                      id="proyectos-indicadores-edicion"
                    >
                      Indicadores del registro inicial
                    </p>
                    <dl className="proyectos-datos">
                      <div>
                        <dt>Trabajo en equipo</dt>
                        <dd>{etiquetaSiNo(participacionExistente.en_equipo)}</dd>
                      </div>
                      <div>
                        <dt>Coordinación</dt>
                        <dd>{etiquetaSiNo(participacionExistente.coordino_tareas)}</dd>
                      </div>
                      <div>
                        <dt>Explicación a públicos distintos</dt>
                        <dd>
                          {etiquetaSiNo(participacionExistente.explico_a_publico_distinto)}
                        </dd>
                      </div>
                      <div>
                        <dt>Situación/problema</dt>
                        <dd>{etiquetaSiNo(participacionExistente.resolvio_problema)}</dd>
                      </div>
                    </dl>
                    <p className="proyectos-indicador__nota">
                      Registrado al crear la participación.
                    </p>
                  </div>
                  {/* 404 y 422 conservan el mensaje del backend junto al formulario. */}
                  {edicion.fase === 'invalido' && (
                    <Alert tone="error">{edicion.error?.message}</Alert>
                  )}

                  {edicion.fase === 'error' ? (
                    <EstadoError
                      titulo="No pudimos actualizar la participación"
                      mensaje={edicion.error?.message}
                      onReintentar={enviarEdicion}
                    />
                  ) : (
                    <div className="proyectos-registro__acciones">
                      <span>Los campos con * son obligatorios.</span>
                      <Button type="button" variant="secondary" onClick={cancelarEdicion}>
                        Cancelar
                      </Button>
                      <Button type="submit" loading={edicion.fase === 'enviando'}>
                        <Save aria-hidden="true" />
                        {edicion.fase === 'enviando'
                          ? 'Actualizando…'
                          : 'Actualizar participación'}
                      </Button>
                    </div>
                  )}
                </form>
              ) : (
                <dl className="proyectos-datos">
                  <div>
                    <dt>Área</dt>
                    <dd>{proyectoExistente.area ?? SIN_DATO}</dd>
                  </div>
                  <div>
                    <dt>Cliente</dt>
                    <dd>{proyectoExistente.cliente ?? SIN_DATO}</dd>
                  </div>
                  <div>
                    <dt>Estado</dt>
                    <dd>
                      <Badge tone={tonoEstado(proyectoExistente.estado)}>
                        {etiquetaEstado(proyectoExistente.estado)}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt>Rol</dt>
                    <dd>{participacionExistente.rol}</dd>
                  </div>
                  {/* Fecha real de ParticipacionOut: no se inventa periodo. */}
                  <div>
                    <dt>Fecha de registro</dt>
                    <dd>{participacionExistente.fecha_registro}</dd>
                  </div>
                </dl>
              )}
              {/* En la edición directa las acciones del resumen no aplican:
                  el formulario ya trae las suyas (Cancelar/Guardar cambios). */}
              {!edicionDesdeConsulta && (
              <div className="proyectos-edicion__acciones">
                {/* MB-5B-2: entrar al modo edición DENTRO de la misma vista.
                    No es navegación ni un detalle nuevo (§18.1/§28). */}
                {!edicion.activa && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => abrirEdicion(participacionExistente)}
                  >
                    <Pencil aria-hidden="true" /> Editar participación
                  </Button>
                )}
                <Button type="button" variant="secondary" onClick={reiniciar}>
                  <Repeat2 aria-hidden="true" /> Buscar otro proyecto
                </Button>
              </div>
              )}
            </div>
          ) : registro.fase === 'error' ? (
            <EstadoError
              titulo="No pudimos registrar la participación"
              mensaje={registro.error?.message}
              onReintentar={enviarRegistro}
            />
          ) : (
            <>
              <p className="proyectos-paso__nota">
                Estás registrando tu participación en «{proyectoSeleccionado.nombre}».
                La búsqueda y la selección ya quedaron hechas en los pasos 01 y 02.
              </p>
              <form
                className="proyectos-registro"
                onSubmit={manejarRegistro}
                aria-busy={registro.fase === 'enviando'}
              >
                {/* 1. rol (obligatorio) */}
                <FormField
                  id="registro-rol"
                  label="Rol"
                  required
                  hint="El rol que desempeñaste en este proyecto."
                  error={avisosParticipacion.rol}
                >
                  <Input
                    id="registro-rol"
                    autoComplete="off"
                    value={formParticipacion.rol}
                    onChange={(evento) =>
                      setFormParticipacion({ ...formParticipacion, rol: evento.target.value })
                    }
                    invalid={Boolean(avisosParticipacion.rol)}
                  />
                </FormField>

                {/* 2. entregables: visible pero NO obligatorio */}
                <FormField
                  id="registro-entregables"
                  label="Entregables"
                  hint="Opcional: lo que entregaste en este proyecto."
                >
                  <Input
                    id="registro-entregables"
                    autoComplete="off"
                    value={formParticipacion.entregables}
                    onChange={(evento) =>
                      setFormParticipacion({
                        ...formParticipacion,
                        entregables: evento.target.value,
                      })
                    }
                  />
                </FormField>

                {/* 3-6. indicadores objetivos + dato contextual (§18.3) */}
                <div
                  className="proyectos-indicadores"
                  role="group"
                  aria-labelledby="proyectos-indicadores-titulo"
                >
                  <p
                    className="proyectos-indicadores__titulo"
                    id="proyectos-indicadores-titulo"
                  >
                    Indicadores del registro inicial
                  </p>
                  <div className="proyectos-indicador">
                    <input
                      type="checkbox"
                      id="registro-en-equipo"
                      checked={formParticipacion.en_equipo}
                      onChange={(evento) =>
                        setFormParticipacion({
                          ...formParticipacion,
                          en_equipo: evento.target.checked,
                        })
                      }
                    />
                    <label htmlFor="registro-en-equipo">Trabajo en equipo</label>
                  </div>
                  <div className="proyectos-indicador">
                    <input
                      type="checkbox"
                      id="registro-coordina"
                      checked={formParticipacion.coordino_tareas}
                      onChange={(evento) =>
                        setFormParticipacion({
                          ...formParticipacion,
                          coordino_tareas: evento.target.checked,
                        })
                      }
                    />
                    <label htmlFor="registro-coordina">Coordinación</label>
                  </div>
                  <div className="proyectos-indicador">
                    <input
                      type="checkbox"
                      id="registro-explica"
                      checked={formParticipacion.explico_a_publico_distinto}
                      onChange={(evento) =>
                        setFormParticipacion({
                          ...formParticipacion,
                          explico_a_publico_distinto: evento.target.checked,
                        })
                      }
                    />
                    <label htmlFor="registro-explica">
                      Explicación a públicos distintos
                    </label>
                  </div>
                  <div className="proyectos-indicador">
                    <input
                      type="checkbox"
                      id="registro-situacion"
                      checked={formParticipacion.resolvio_problema}
                      onChange={(evento) =>
                        setFormParticipacion({
                          ...formParticipacion,
                          resolvio_problema: evento.target.checked,
                        })
                      }
                    />
                    <label htmlFor="registro-situacion">Situación/problema</label>
                  </div>
                  {/* resolvio_problema es contexto humano (PRD §12.3): dato
                      contextual, nunca una palanca de competencias. */}
                  <p className="proyectos-indicador__nota">
                    Este dato no modifica tus competencias.
                  </p>
                </div>

                {/* 7. horas (obligatorio, entero >= 0) */}
                <FormField
                  id="registro-horas"
                  label="Horas"
                  required
                  hint="Número entero de horas dedicadas, por ejemplo 120."
                  error={avisosParticipacion.horas}
                >
                  <Input
                    id="registro-horas"
                    inputMode="numeric"
                    autoComplete="off"
                    value={formParticipacion.horas}
                    onChange={(evento) =>
                      setFormParticipacion({
                        ...formParticipacion,
                        horas: evento.target.value,
                      })
                    }
                    invalid={Boolean(avisosParticipacion.horas)}
                  />
                </FormField>

                {/* 404 (proyecto), 409 (duplicada) y 422 (validación) se muestran
                    con el mensaje del backend junto al formulario. */}
                {registro.fase === 'invalido' && (
                  <Alert tone="error">{registro.error?.message}</Alert>
                )}

                <div className="proyectos-registro__acciones">
                  <span>Los campos con * son obligatorios.</span>
                  <Button type="submit" loading={registro.fase === 'enviando'}>
                    <ClipboardCheck aria-hidden="true" />
                    {registro.fase === 'enviando'
                      ? 'Registrando…'
                      : 'Registrar participación'}
                  </Button>
                </div>
              </form>
            </>
          )}
            </div>
        </section>
      )}
      </section>
      )}
    </div>
  )
}
