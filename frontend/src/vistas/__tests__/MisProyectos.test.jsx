// Vista "Mis proyectos" del Empleado (PRD §11/§12/§21.3; Style Guide §26,
// §18.2 ProjectSearch, §18.3 ParticipationForm, §18.4 StepIndicator).
// La API se mockea: sin llamadas reales al backend.
//
// Se verifica el flujo MB-5A —buscar obligatoriamente y, si el backend no
// devuelve coincidencia exacta, crear el proyecto— el flujo MB-5B-1
// —seleccionar la coincidencia exacta y registrar la participación inicial—
// más los estados de la vista. Los fixtures son fieles a los DTO reales
// (`ResultadoBusquedaOut`, `ProyectoOut` y `ParticipacionOut`): la coincidencia
// se decide SIEMPRE por lo que envía el backend, nunca se recalcula en la
// vista, y las sugerencias aproximadas siguen siendo informativas y NO
// seleccionables (Style Guide §18.2).

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  actualizarParticipacion,
  crearParticipacion,
  listarParticipaciones,
} from '../../api/participaciones.js'
import { buscarProyectos, crearProyecto, listarMisProyectos } from '../../api/proyectos.js'
import MisProyectos from '../MisProyectos.jsx'

vi.mock('../../api/participaciones.js', () => ({
  actualizarParticipacion: vi.fn(),
  crearParticipacion: vi.fn(),
  listarParticipaciones: vi.fn(),
}))
vi.mock('../../api/proyectos.js', () => ({
  buscarProyectos: vi.fn(),
  crearProyecto: vi.fn(),
  listarMisProyectos: vi.fn(),
}))

const EXACTA = {
  id: 3,
  nombre: 'Proyecto ÁRBOL',
  nombre_normalizado: 'proyecto arbol',
  area: 'Operaciones',
  cliente: 'Cliente interno',
  estado: 'EN_PROCESO',
  created_at: '2026-06-01T10:00:00',
  updated_at: '2026-06-01T10:00:00',
}

/** ResultadoBusquedaOut con coincidencia exacta (proyecto ya existente). */
function conExacta() {
  return { consulta_normalizada: 'proyecto arbol', coincidencia_exacta: EXACTA, sugerencias: [] }
}

/** ResultadoBusquedaOut sin coincidencia exacta y con N sugerencias. */
function conSugerencias(cantidad = 3) {
  return {
    consulta_normalizada: 'proyecto arbol',
    coincidencia_exacta: null,
    sugerencias: Array.from({ length: cantidad }, (_, indice) => ({
      proyecto: {
        id: 100 + indice,
        nombre: `Proyecto aproximado ${indice + 1}`,
        nombre_normalizado: `proyecto aproximado ${indice + 1}`,
        area: null,
        cliente: null,
        estado: 'COMPLETADO',
        created_at: '2026-05-01T10:00:00',
        updated_at: '2026-06-01T10:00:00',
      },
      similitud: Number((0.7 - indice * 0.05).toFixed(2)),
    })),
  }
}

/** Sin coincidencia exacta ni sugerencias: el catálogo no tiene nada parecido. */
const SIN_RESULTADOS = {
  consulta_normalizada: 'proyecto arbol',
  coincidencia_exacta: null,
  sugerencias: [],
}

/** ProyectoOut que devuelve el POST (201): siempre inicia EN_PROCESO (§6). */
const CREADO = {
  id: 12,
  nombre: 'Proyecto Roble',
  nombre_normalizado: 'proyecto roble',
  area: 'TI',
  cliente: null,
  estado: 'EN_PROCESO',
  created_at: '2026-09-30T09:00:00',
  updated_at: '2026-09-30T09:00:00',
}

/** ParticipacionOut del registro inicial (201). `proyecto` viene en null a
 *  propósito: la confirmación del flujo NUNCA depende de esa relación. */
const PARTICIPACION = {
  id: 21,
  empleado_id: 7,
  proyecto_id: 3,
  rol: 'Desarrollador',
  entregables: null,
  en_equipo: true,
  coordino_tareas: true,
  explico_a_publico_distinto: false,
  resolvio_problema: true,
  horas: 120,
  fecha_registro: '2026-09-30',
  proyecto: null,
  created_at: '2026-09-30T09:00:00',
  updated_at: '2026-09-30T09:00:00',
}

/** La misma participación con el proyecto embebido (joinedload real). */
const PARTICIPACION_CON_PROYECTO = { ...PARTICIPACION, proyecto: EXACTA }

/** Participación propia en OTRO proyecto (id 99) para paginación. */
const PARTICIPACION_AJENA_A_PAGINA = { ...PARTICIPACION, id: 22, proyecto_id: 99 }

/** ParticipacionPageOut sin registros: NO es un error, permite registrar. */
const SIN_PARTICIPACIONES = { total: 0, pagina: 1, por_pagina: 100, items: [] }

function errorDe(estado, mensaje = 'detalle') {
  return Object.assign(new Error(mensaje), { estado })
}

let respuestaBusqueda = () => Promise.resolve(conSugerencias())
let respuestaAlta = () => Promise.resolve(CREADO)
let respuestaRegistro = () => Promise.resolve(PARTICIPACION)
let respuestaParticipaciones = () => Promise.resolve(SIN_PARTICIPACIONES)
let respuestaEdicion = () => Promise.resolve(PARTICIPACION)

beforeEach(() => {
  respuestaBusqueda = () => Promise.resolve(conSugerencias())
  respuestaAlta = () => Promise.resolve(CREADO)
  respuestaRegistro = () => Promise.resolve(PARTICIPACION)
  respuestaParticipaciones = () => Promise.resolve(SIN_PARTICIPACIONES)
  vi.mocked(buscarProyectos).mockReset()
  vi.mocked(buscarProyectos).mockImplementation(() => respuestaBusqueda())
  vi.mocked(crearProyecto).mockReset()
  vi.mocked(crearProyecto).mockImplementation(() => respuestaAlta())
  vi.mocked(crearParticipacion).mockReset()
  vi.mocked(crearParticipacion).mockImplementation(() => respuestaRegistro())
  vi.mocked(listarParticipaciones).mockReset()
  vi.mocked(listarParticipaciones).mockImplementation((token, opciones) =>
    respuestaParticipaciones(opciones),
  )
  vi.mocked(actualizarParticipacion).mockReset()
  vi.mocked(actualizarParticipacion).mockImplementation(() => respuestaEdicion())
})

function montar(alSesionExpirada = vi.fn()) {
  render(<MisProyectos token="token-empleado" alSesionExpirada={alSesionExpirada} />)
  // Ajuste de navegación: la entrada normal abre «Registrados»; las pruebas
  // del flujo 01–03 activan su pestaña, como haría quien va a registrar.
  fireEvent.click(
    screen.getByRole('tab', { name: 'Pestaña Registrar participación' }),
  )
  return alSesionExpirada
}

/** Flujo real: escribir el nombre y pulsar el botón de búsqueda. */
function escribirYBuscar(nombre) {
  fireEvent.change(screen.getByLabelText('Nombre del proyecto'), {
    target: { value: nombre },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar proyecto' }))
}

/** Formulario de alta (solo existe cuando el backend no dio coincidencia exacta). */
function formularioAlta() {
  return screen.getByRole('button', { name: 'Crear proyecto' }).closest('form')
}

function enviarAlta({
  nombre = 'Proyecto Roble',
  area = 'TI',
  cliente = 'Interno',
} = {}) {
  const formulario = formularioAlta()
  fireEvent.change(within(formulario).getByLabelText('Nombre'), {
    target: { value: nombre },
  })
  fireEvent.change(within(formulario).getByLabelText('Área'), {
    target: { value: area },
  })
  fireEvent.change(within(formulario).getByLabelText('Cliente'), {
    target: { value: cliente },
  })
  fireEvent.click(within(formulario).getByRole('button', { name: 'Crear proyecto' }))
}

describe('MisProyectos — render inicial y búsqueda obligatoria', () => {
  it('muestra la búsqueda sin consultar la API ni ofrecer el alta', () => {
    montar()

    expect(
      screen.getByRole('heading', { name: /Buscar el proyecto/ }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del proyecto')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buscar proyecto' })).toBeInTheDocument()
    expect(screen.getByText('Todavía no has buscado un proyecto')).toBeInTheDocument()
    // Búsqueda obligatoria: sin búsqueda no hay alta ni datos simulados.
    expect(
      screen.queryByRole('button', { name: 'Crear proyecto' }),
    ).not.toBeInTheDocument()
    expect(buscarProyectos).not.toHaveBeenCalled()
    expect(crearProyecto).not.toHaveBeenCalled()
  })

  it('no busca con el campo vacío: avisa y no llama a la API', () => {
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Buscar proyecto' }))

    expect(
      screen.getByText('Escribe el nombre del proyecto para buscarlo.'),
    ).toBeInTheDocument()
    expect(buscarProyectos).not.toHaveBeenCalled()
  })

  it('no busca con solo espacios (el contrato exige `nombre`)', () => {
    montar()

    escribirYBuscar('   ')

    expect(
      screen.getByText('Escribe el nombre del proyecto para buscarlo.'),
    ).toBeInTheDocument()
    expect(buscarProyectos).not.toHaveBeenCalled()
  })

  it('muestra su estado de carga mientras consulta', () => {
    respuestaBusqueda = () => new Promise(() => {})
    montar()

    escribirYBuscar('Proyecto nuevo')

    expect(screen.getByText('Buscando en el catálogo…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buscando…' })).toBeInTheDocument()
  })

  it('envía el nombre recortado con el token de la sesión', async () => {
    montar()

    escribirYBuscar('  Proyecto nuevo  ')

    expect(buscarProyectos).toHaveBeenCalledTimes(1)
    expect(buscarProyectos).toHaveBeenCalledWith('token-empleado', 'Proyecto nuevo')
    // Se espera la respuesta para que el cierre del estado ocurra dentro de
    // `act` (sin avisos de React en la salida de los tests).
    // Copy literal del Style Guide §18.2 para la aproximada.
    expect(
      await screen.findByText('¿Tal vez buscas uno de estos proyectos?'),
    ).toBeInTheDocument()
  })
})

describe('MisProyectos — resultado de la búsqueda', () => {
  it('identifica la coincidencia exacta y NO ofrece el alta', async () => {
    respuestaBusqueda = () => Promise.resolve(conExacta())
    montar()

    escribirYBuscar('Proyecto ÁRBOL')

    expect(await screen.findByText('Este proyecto ya existe.')).toBeInTheDocument()
    expect(screen.getByText('Proyecto ÁRBOL')).toBeInTheDocument()
    expect(screen.getByText('Operaciones')).toBeInTheDocument()
    expect(screen.getByText('Cliente interno')).toBeInTheDocument()
    // El estado y la clave de comparación llegan del backend (§11.2, §6).
    expect(screen.getByText('En proceso')).toBeInTheDocument()
    expect(screen.getByText('proyecto arbol')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Crear proyecto' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Registrar la participación/ }),
    ).not.toBeInTheDocument()
  })

  it('muestra las sugerencias con su similitud como información, nunca como error', async () => {
    montar()

    escribirYBuscar('Proyecto arbol')

    expect(
      await screen.findByText('¿Tal vez buscas uno de estos proyectos?'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Proyecto aproximado 1')).toBeInTheDocument()
    expect(screen.getByText('0.7')).toBeInTheDocument()
    // Informativa (§8): no hay ninguna alerta y no se identifica como existente.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Este proyecto ya existe.')).not.toBeInTheDocument()
    // El alta se ofrece porque el backend no dio coincidencia exacta (§11.1).
    expect(screen.getByRole('button', { name: 'Crear proyecto' })).toBeInTheDocument()
  })

  it('no muestra más de 5 sugerencias aunque el backend envíe más', async () => {
    respuestaBusqueda = () => Promise.resolve(conSugerencias(7))
    montar()

    escribirYBuscar('Proyecto arbol')

    expect(
      await screen.findByText('¿Tal vez buscas uno de estos proyectos?'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.queryByText('Proyecto aproximado 6')).not.toBeInTheDocument()
  })

  it('muestra un vacío neutro cuando no hay coincidencia ni sugerencias', async () => {
    respuestaBusqueda = () => Promise.resolve(SIN_RESULTADOS)
    montar()

    escribirYBuscar('Proyecto inexistente')

    expect(
      await screen.findByText('Sin coincidencias en el catálogo'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear proyecto' })).toBeInTheDocument()
  })

  it('reintenta la búsqueda tras un error recuperable', async () => {
    respuestaBusqueda = () => Promise.reject(errorDe(500, 'fallo del servidor'))
    montar()

    escribirYBuscar('Proyecto ÁRBOL')

    expect(
      await screen.findByText('No pudimos completar la búsqueda'),
    ).toBeInTheDocument()

    respuestaBusqueda = () => Promise.resolve(conExacta())
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(await screen.findByText('Este proyecto ya existe.')).toBeInTheDocument()
    await waitFor(() => expect(buscarProyectos).toHaveBeenCalledTimes(2))
    expect(buscarProyectos).toHaveBeenLastCalledWith('token-empleado', 'Proyecto ÁRBOL')
  })

  it('cierra la sesión ante un 401 de la búsqueda, sin estado de error', async () => {
    respuestaBusqueda = () => Promise.reject(errorDe(401, 'Credenciales inválidas.'))
    const alSesionExpirada = montar()

    escribirYBuscar('Proyecto ÁRBOL')

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('No pudimos completar la búsqueda'),
    ).not.toBeInTheDocument()
  })
})

describe('MisProyectos — alta del proyecto', () => {
  it('crea el proyecto y confirma con la respuesta del backend', async () => {
    montar()
    escribirYBuscar('Proyecto Roble')
    await screen.findByRole('button', { name: 'Crear proyecto' })

    enviarAlta()

    const creado = await screen.findByLabelText('Proyecto creado')
    expect(crearProyecto).toHaveBeenCalledTimes(1)
    expect(crearProyecto).toHaveBeenCalledWith('token-empleado', {
      nombre: 'Proyecto Roble',
      area: 'TI',
      cliente: 'Interno',
    })
    expect(within(creado).getByText('Proyecto Roble')).toBeInTheDocument()
    expect(within(creado).getByText('12')).toBeInTheDocument()
    expect(within(creado).getByText('proyecto roble')).toBeInTheDocument()
  })

  it('muestra el proyecto creado en estado EN_PROCESO (§6)', async () => {
    montar()
    escribirYBuscar('Proyecto Roble')
    await screen.findByRole('button', { name: 'Crear proyecto' })

    enviarAlta()

    const creado = await screen.findByLabelText('Proyecto creado')
    expect(within(creado).getByText('En proceso')).toBeInTheDocument()
    // El estado lo fija el backend: la vista no lo envía.
    expect(vi.mocked(crearProyecto).mock.calls[0][1].estado).toBeUndefined()
  })

  it('envía null en los opcionales vacíos, según el contrato', async () => {
    montar()
    escribirYBuscar('Proyecto Roble')
    await screen.findByRole('button', { name: 'Crear proyecto' })

    enviarAlta({ nombre: '  Proyecto Roble  ', area: '', cliente: '   ' })

    await waitFor(() => expect(crearProyecto).toHaveBeenCalledTimes(1))
    expect(crearProyecto).toHaveBeenCalledWith('token-empleado', {
      nombre: 'Proyecto Roble',
      area: null,
      cliente: null,
    })
  })

  it('muestra el 409 del backend con su mensaje, no como fallo genérico', async () => {
    respuestaAlta = () =>
      Promise.reject(
        errorDe(409, 'Ya existe un proyecto con ese nombre (coincidencia exacta).'),
      )
    montar()
    escribirYBuscar('Proyecto ÁRBOL')
    await screen.findByRole('button', { name: 'Crear proyecto' })

    enviarAlta({ nombre: 'Proyecto ÁRBOL' })

    expect(
      await screen.findByText(
        'Ya existe un proyecto con ese nombre (coincidencia exacta).',
      ),
    ).toBeInTheDocument()
    // Sigue siendo el formulario con su respuesta: no es un error técnico.
    expect(
      screen.queryByText('No pudimos registrar el proyecto'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear proyecto' })).toBeInTheDocument()
  })

  it('conserva el mensaje del backend en un 422', async () => {
    respuestaAlta = () =>
      Promise.reject(
        errorDe(
          422,
          'Algunos datos enviados no son válidos. Revisa e inténtalo de nuevo.',
        ),
      )
    montar()
    escribirYBuscar('Proyecto Roble')
    await screen.findByRole('button', { name: 'Crear proyecto' })

    enviarAlta()

    expect(
      await screen.findByText(
        'Algunos datos enviados no son válidos. Revisa e inténtalo de nuevo.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('No pudimos registrar el proyecto'),
    ).not.toBeInTheDocument()
  })

  it('reintenta el alta tras un error recuperable', async () => {
    let intentos = 0
    respuestaAlta = () => {
      intentos += 1
      return intentos === 1
        ? Promise.reject(errorDe(500, 'fallo del servidor'))
        : Promise.resolve(CREADO)
    }
    montar()
    escribirYBuscar('Proyecto Roble')
    await screen.findByRole('button', { name: 'Crear proyecto' })

    enviarAlta()

    expect(
      await screen.findByText('No pudimos registrar el proyecto'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(await screen.findByLabelText('Proyecto creado')).toBeInTheDocument()
    await waitFor(() => expect(crearProyecto).toHaveBeenCalledTimes(2))
  })

  it('cierra la sesión ante un 401 del alta, sin estado de error', async () => {
    respuestaAlta = () => Promise.reject(errorDe(401, 'Credenciales inválidas.'))
    const alSesionExpirada = montar()
    escribirYBuscar('Proyecto Roble')
    await screen.findByRole('button', { name: 'Crear proyecto' })

    enviarAlta()

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('No pudimos registrar el proyecto'),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Proyecto creado')).not.toBeInTheDocument()
  })

  it('vuelve al estado inicial con «Buscar otro proyecto»', async () => {
    montar()
    escribirYBuscar('Proyecto Roble')
    await screen.findByRole('button', { name: 'Crear proyecto' })
    enviarAlta()
    await screen.findByLabelText('Proyecto creado')

    fireEvent.click(screen.getByRole('button', { name: 'Buscar otro proyecto' }))

    expect(screen.getByText('Todavía no has buscado un proyecto')).toBeInTheDocument()
    expect(screen.queryByLabelText('Proyecto creado')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del proyecto')).toHaveValue('')
    expect(
      screen.queryByRole('button', { name: 'Crear proyecto' }),
    ).not.toBeInTheDocument()
  })
})

/** Paso 02: selecciona la coincidencia exacta con la acción del Style Guide §18.2. */
async function seleccionarExacta() {
  respuestaBusqueda = () => Promise.resolve(conExacta())
  const alSesionExpirada = montar()
  escribirYBuscar('Proyecto ÁRBOL')
  fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar proyecto' }))
  // MB-5B-3A: la detección resuelve (sin participación) antes del formulario.
  await screen.findByRole('button', { name: 'Registrar participación' })
  return alSesionExpirada
}

/** Rellena el ParticipationForm: rol y horas (obligatorios) y entregables. */
function rellenarParticipacion({
  rol = 'Desarrollador',
  entregables = '',
  horas = '120',
} = {}) {
  fireEvent.change(screen.getByLabelText('Rol'), { target: { value: rol } })
  fireEvent.change(screen.getByLabelText('Entregables'), { target: { value: entregables } })
  fireEvent.change(screen.getByLabelText('Horas'), { target: { value: horas } })
}

/** Marca indicadores objetivos por su etiqueta visible (§18.3). */
function marcarIndicadores(...etiquetas) {
  for (const etiqueta of etiquetas) {
    fireEvent.click(screen.getByLabelText(etiqueta))
  }
}

function enviarRegistro() {
  fireEvent.click(screen.getByRole('button', { name: 'Registrar participación' }))
}

describe('MisProyectos — MB-5B-1: seleccionar proyecto (§18.2)', () => {
  it('no ofrece el paso 03 sin un proyecto seleccionado', () => {
    montar()

    expect(
      screen.queryByRole('heading', { name: /Registrar la participación/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Este dato no modifica tus competencias.'),
    ).not.toBeInTheDocument()
    expect(crearParticipacion).not.toHaveBeenCalled()
  })

  it('ofrece «Seleccionar proyecto» en la coincidencia exacta y abre el paso 03', async () => {
    respuestaBusqueda = () => Promise.resolve(conExacta())
    montar()
    escribirYBuscar('Proyecto ÁRBOL')

    expect(await screen.findByText('Este proyecto ya existe.')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Registrar la participación/ }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar proyecto' }))

    expect(
      await screen.findByRole('heading', { name: /Registrar la participación/ }),
    ).toBeInTheDocument()
    // MB-5B-3A: la detección consulta el listado y, sin participación, abre
    // el formulario exactamente como en MB-5B-1.
    expect(await screen.findByRole('button', { name: 'Registrar participación' })).toBeInTheDocument()
    // Carga inicial de «Registrados» (entrada normal) + detección: dos.
    expect(listarParticipaciones).toHaveBeenCalledTimes(2)
    expect(listarParticipaciones).toHaveBeenCalledWith('token-empleado', {
      pagina: 1,
      por_pagina: 100,
    })
    // La selección ya se hizo: no se puede repetir ni duplicar el paso 03.
    expect(
      screen.queryByRole('button', { name: 'Seleccionar proyecto' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Proyecto seleccionado/)).toBeInTheDocument()
    expect(crearParticipacion).not.toHaveBeenCalled()
  })

  it('las sugerencias aproximadas siguen sin acción de selección', async () => {
    montar()
    escribirYBuscar('Proyecto arbol')

    expect(
      await screen.findByText('¿Tal vez buscas uno de estos proyectos?'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Seleccionar proyecto' }),
    ).not.toBeInTheDocument()
    for (const sugerencia of screen.getAllByRole('listitem')) {
      expect(within(sugerencia).queryByRole('button')).not.toBeInTheDocument()
    }
    expect(
      screen.queryByRole('heading', { name: /Registrar la participación/ }),
    ).not.toBeInTheDocument()
    expect(crearParticipacion).not.toHaveBeenCalled()
  })

  it('el proyecto creado queda seleccionado y continúa al paso 03', async () => {
    montar()
    escribirYBuscar('Proyecto Roble')
    await screen.findByRole('button', { name: 'Crear proyecto' })

    enviarAlta()

    const creado = await screen.findByLabelText('Proyecto creado')
    expect(within(creado).getByText('Proyecto Roble')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: /Registrar la participación/ }),
    ).toBeInTheDocument()
    expect(crearParticipacion).not.toHaveBeenCalled()
    // MB-5B-3A: el proyecto recién creado no puede tener participación previa:
    // dentro del mismo flujo de alta NO se consulta el listado (la única
    // llamada es la carga inicial de la pestaña «Registrados» al montar).
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)
  })
})

describe('MisProyectos — MB-5B-1: ParticipationForm (§18.3)', () => {
  it('respeta el orden exacto de los campos y el dato contextual', async () => {
    await seleccionarExacta()

    const formulario = screen
      .getByRole('button', { name: 'Registrar participación' })
      .closest('form')
    const controles = [...formulario.querySelectorAll('input')].map((input) => input.id)
    expect(controles).toEqual([
      'registro-rol',
      'registro-entregables',
      'registro-en-equipo',
      'registro-coordina',
      'registro-explica',
      'registro-situacion',
      'registro-horas',
    ])
    // entregables es visible pero NO obligatorio; sí lo son rol y horas.
    expect(screen.getByLabelText('Entregables')).toBeInTheDocument()
    // resolvio_problema se presenta como dato contextual, no como palanca.
    expect(
      screen.getByText('Este dato no modifica tus competencias.'),
    ).toBeInTheDocument()
    // El copy de bloqueo aparece SOLO después de registrar (§18.3).
    expect(
      screen.queryByText('Registrado al crear la participación.'),
    ).not.toBeInTheDocument()
  })

  it('no envía el registro con el rol vacío', async () => {
    await seleccionarExacta()
    rellenarParticipacion({ rol: '   ' })

    enviarRegistro()

    expect(
      await screen.findByText('Escribe el rol que desempeñaste en el proyecto.'),
    ).toBeInTheDocument()
    expect(crearParticipacion).not.toHaveBeenCalled()
    expect(screen.queryByText('Participación registrada')).not.toBeInTheDocument()
  })

  it('no envía el registro sin horas', async () => {
    await seleccionarExacta()
    rellenarParticipacion({ horas: '   ' })

    enviarRegistro()

    expect(
      await screen.findByText('Escribe las horas que dedicaste a este proyecto.'),
    ).toBeInTheDocument()
    expect(crearParticipacion).not.toHaveBeenCalled()
  })

  it('no envía el registro con horas que no sean enteras', async () => {
    await seleccionarExacta()
    rellenarParticipacion({ horas: '12.5' })

    enviarRegistro()

    expect(
      await screen.findByText('Las horas deben ser un número entero, por ejemplo 120.'),
    ).toBeInTheDocument()
    expect(crearParticipacion).not.toHaveBeenCalled()
  })

  it('no envía el registro con horas negativas', async () => {
    await seleccionarExacta()
    rellenarParticipacion({ horas: '-5' })

    enviarRegistro()

    expect(await screen.findByText('Las horas no pueden ser negativas.')).toBeInTheDocument()
    expect(crearParticipacion).not.toHaveBeenCalled()
  })
})

describe('MisProyectos — MB-5B-1: registro de la participación', () => {
  it('envía exactamente los ocho campos del contrato, sin campos extra', async () => {
    await seleccionarExacta()
    rellenarParticipacion({ rol: '  Desarrollador  ', entregables: '   ', horas: ' 120 ' })
    marcarIndicadores('Trabajo en equipo', 'Coordinación', 'Situación/problema')

    enviarRegistro()

    expect(await screen.findByText('Participación registrada')).toBeInTheDocument()
    expect(crearParticipacion).toHaveBeenCalledTimes(1)
    const [token, payload] = vi.mocked(crearParticipacion).mock.calls[0]
    expect(token).toBe('token-empleado')
    // Ni un campo fuera de ParticipacionCreateIn (extra="forbid" → 422).
    expect(Object.keys(payload).sort()).toEqual(
      [
        'coordino_tareas',
        'en_equipo',
        'entregables',
        'explico_a_publico_distinto',
        'horas',
        'proyecto_id',
        'resolvio_problema',
        'rol',
      ].sort(),
    )
    expect(payload).toEqual({
      proyecto_id: 3,
      rol: 'Desarrollador',
      entregables: null,
      en_equipo: true,
      coordino_tareas: true,
      explico_a_publico_distinto: false,
      resolvio_problema: true,
      horas: 120,
    })
    // Lo que fija el backend: nunca viaja desde el frontend (§32/§12).
    expect(payload).not.toHaveProperty('empleado_id')
    expect(payload).not.toHaveProperty('fecha_registro')
    expect(payload).not.toHaveProperty('estado')
  })

  it('la confirmación usa el proyecto seleccionado, no participacion.proyecto', async () => {
    await seleccionarExacta()
    rellenarParticipacion()
    marcarIndicadores('Trabajo en equipo')

    enviarRegistro()

    expect(await screen.findByText('Participación registrada')).toBeInTheDocument()
    const paso03 = screen
      .getByRole('heading', { name: /Registrar la participación/ })
      .closest('section')
    // El fixture trae `proyecto: null`: el nombre sale del seleccionado (§02).
    expect(within(paso03).getByText('Proyecto ÁRBOL')).toBeInTheDocument()
    expect(within(paso03).getByText('Desarrollador')).toBeInTheDocument()
    expect(within(paso03).getByText('2026-09-30')).toBeInTheDocument()
    // Indicadores con el copy de §18.3, sin tono punitivo.
    expect(
      within(paso03).getByText('Registrado al crear la participación.'),
    ).toBeInTheDocument()
    expect(within(paso03).getAllByText('Sí')).toHaveLength(3)
    expect(within(paso03).getAllByText('No')).toHaveLength(1)
    // El formulario ya no está: el registro inicial se cerró.
    expect(
      screen.queryByRole('button', { name: 'Registrar participación' }),
    ).not.toBeInTheDocument()
  })
})

describe('MisProyectos — MB-5B-1: errores del registro', () => {
  it('cierra la sesión ante un 401, sin mostrar confirmación', async () => {
    respuestaRegistro = () => Promise.reject(errorDe(401, 'Credenciales inválidas.'))
    const alSesionExpirada = await seleccionarExacta()
    rellenarParticipacion()

    enviarRegistro()

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Participación registrada')).not.toBeInTheDocument()
    expect(screen.queryByText('No pudimos registrar la participación')).not.toBeInTheDocument()
  })

  it('muestra el 409 del backend junto al formulario, no como fallo técnico', async () => {
    respuestaRegistro = () =>
      Promise.reject(
        errorDe(409, 'Ya existe una participación de este empleado en ese proyecto.'),
      )
    await seleccionarExacta()
    rellenarParticipacion()

    enviarRegistro()

    expect(
      await screen.findByText('Ya existe una participación de este empleado en ese proyecto.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar participación' })).toBeInTheDocument()
    expect(screen.queryByText('Participación registrada')).not.toBeInTheDocument()
    expect(
      screen.queryByText('No pudimos registrar la participación'),
    ).not.toBeInTheDocument()
  })

  it('muestra el 422 del backend junto al formulario', async () => {
    respuestaRegistro = () =>
      Promise.reject(
        errorDe(422, 'Algunos datos enviados no son válidos. Revisa e inténtalo de nuevo.'),
      )
    await seleccionarExacta()
    rellenarParticipacion()

    enviarRegistro()

    expect(
      await screen.findByText(
        'Algunos datos enviados no son válidos. Revisa e inténtalo de nuevo.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar participación' })).toBeInTheDocument()
    expect(screen.queryByText('Participación registrada')).not.toBeInTheDocument()
  })

  it('muestra el 404 del backend junto al formulario', async () => {
    respuestaRegistro = () => Promise.reject(errorDe(404, 'Proyecto no encontrado.'))
    await seleccionarExacta()
    rellenarParticipacion()

    enviarRegistro()

    expect(await screen.findByText('Proyecto no encontrado.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar participación' })).toBeInTheDocument()
    expect(screen.queryByText('Participación registrada')).not.toBeInTheDocument()
  })

  it('reintenta el registro tras un error recuperable (500)', async () => {
    let intentos = 0
    respuestaRegistro = () => {
      intentos += 1
      return intentos === 1
        ? Promise.reject(errorDe(500, 'fallo del servidor'))
        : Promise.resolve(PARTICIPACION)
    }
    await seleccionarExacta()
    rellenarParticipacion()

    enviarRegistro()

    expect(await screen.findByText('No pudimos registrar la participación')).toBeInTheDocument()
    expect(screen.queryByText('Participación registrada')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(await screen.findByText('Participación registrada')).toBeInTheDocument()
    await waitFor(() => expect(crearParticipacion).toHaveBeenCalledTimes(2))
  })
})

describe('MisProyectos — MB-5B-3A: participación existente detectada', () => {
  /** Selecciona la coincidencia exacta y dispara la detección (GET). */
  async function abrirSeleccion() {
    respuestaBusqueda = () => Promise.resolve(conExacta())
    const alSesionExpirada = montar()
    escribirYBuscar('Proyecto ÁRBOL')
    fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar proyecto' }))
    return alSesionExpirada
  }

  it('consulta al seleccionar y muestra el formulario cuando NO hay participación', async () => {
    await abrirSeleccion()

    expect(
      await screen.findByRole('button', { name: 'Registrar participación' }),
    ).toBeInTheDocument()
    // Carga inicial de «Registrados» + detección: dos llamadas.
    expect(listarParticipaciones).toHaveBeenCalledTimes(2)
    expect(listarParticipaciones).toHaveBeenCalledWith('token-empleado', {
      pagina: 1,
      por_pagina: 100,
    })
    // "Sin participación" NO es error: simplemente continúa el flujo MB-5B-1.
    expect(
      screen.queryByText('Ya registraste una participación en este proyecto.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('No pudimos consultar tus participaciones')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Rol')).toBeInTheDocument()
  })

  it('muestra estado de carga durante la detección, sin formulario simultáneo', async () => {
    let resolver = null
    respuestaParticipaciones = () =>
      new Promise((resolve) => {
        resolver = resolve
      })
    await abrirSeleccion()

    expect(await screen.findByText('Consultando tus participaciones…')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Registrar participación' }),
    ).not.toBeInTheDocument()

    resolver(SIN_PARTICIPACIONES)

    expect(await screen.findByRole('button', { name: 'Registrar participación' })).toBeInTheDocument()
    expect(screen.queryByText('Consultando tus participaciones…')).not.toBeInTheDocument()
  })

  it('detecta la participación por proyecto_id y ofrece solo «Buscar otro proyecto»', async () => {
    // total > por_pagina: se detiene en la página que contiene la participación.
    respuestaParticipaciones = ({ pagina }) =>
      Promise.resolve({
        total: 150,
        pagina,
        por_pagina: 100,
        items: [PARTICIPACION_CON_PROYECTO],
      })
    await abrirSeleccion()

    expect(
      await screen.findByText('Ya registraste una participación en este proyecto.'),
    ).toBeInTheDocument()
    // Carga inicial de «Registrados» + detección: dos llamadas.
    expect(listarParticipaciones).toHaveBeenCalledTimes(2)

    // Sin ParticipationForm y sin POST: el 409 deja de ser el flujo de UX.
    expect(
      screen.queryByRole('button', { name: 'Registrar participación' }),
    ).not.toBeInTheDocument()
    expect(crearParticipacion).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Rol')).not.toBeInTheDocument()

    // Resumen con datos reales del ParticipacionOut (§18.1, sin periodo inventado).
    const existente = screen
      .getByText('Ya registraste una participación en este proyecto.')
      .closest('div')
    expect(within(existente).getByText('Proyecto ÁRBOL')).toBeInTheDocument()
    expect(within(existente).getByText('Operaciones')).toBeInTheDocument()
    expect(within(existente).getByText('Cliente interno')).toBeInTheDocument()
    expect(within(existente).getByText('En proceso')).toBeInTheDocument()
    expect(within(existente).getByText('Desarrollador')).toBeInTheDocument()
    expect(within(existente).getByText('Fecha de registro')).toBeInTheDocument()
    expect(within(existente).getByText('2026-09-30')).toBeInTheDocument()

    // Sin navegación a un detalle inexistente (§18.1/§28): el bloque solo ofrece
    // la edición controlada (MB-5B-2) y "Buscar otro proyecto".
    expect(
      screen.queryByRole('button', { name: /Ver participación/ }),
    ).not.toBeInTheDocument()
    expect(within(existente).getAllByRole('button')).toHaveLength(2)
    expect(
      within(existente).getByRole('button', { name: 'Editar participación' }),
    ).toBeInTheDocument()
    expect(
      within(existente).getByRole('button', { name: 'Buscar otro proyecto' }),
    ).toBeInTheDocument()
  })

  it('sin proyecto embebido en el DTO, el resumen se apoya en el proyecto seleccionado', async () => {
    respuestaParticipaciones = () =>
      Promise.resolve({ total: 1, pagina: 1, por_pagina: 100, items: [PARTICIPACION] })
    await abrirSeleccion()

    expect(
      await screen.findByText('Ya registraste una participación en este proyecto.'),
    ).toBeInTheDocument()
    const existente = screen
      .getByText('Ya registraste una participación en este proyecto.')
      .closest('div')
    expect(within(existente).getByText('Proyecto ÁRBOL')).toBeInTheDocument()
    expect(within(existente).getByText('Operaciones')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Registrar participación' }),
    ).not.toBeInTheDocument()
    expect(crearParticipacion).not.toHaveBeenCalled()
  })

  it('muestra error recuperable si falla la consulta y permite reintentar', async () => {
    let intentos = 0
    respuestaParticipaciones = () => {
      intentos += 1
      // Los dos primeros llamados (carga inicial de «Registrados» y la
      // detección) fallan; el reintento resuelve.
      return intentos <= 2
        ? Promise.reject(errorDe(500, 'fallo del servidor'))
        : Promise.resolve(SIN_PARTICIPACIONES)
    }
    await abrirSeleccion()

    expect(await screen.findByText('No pudimos consultar tus participaciones')).toBeInTheDocument()
    expect(await screen.findByText('fallo del servidor')).toBeInTheDocument()
    // Nunca formulario de alta y estado de error a la vez.
    expect(
      screen.queryByRole('button', { name: 'Registrar participación' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Rol')).not.toBeInTheDocument()
    expect(screen.queryByText('No pudimos registrar la participación')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(await screen.findByRole('button', { name: 'Registrar participación' })).toBeInTheDocument()
    // Carga inicial + detección fallida + reintento: tres llamadas.
    await waitFor(() => expect(listarParticipaciones).toHaveBeenCalledTimes(3))
  })

  it('cierra la sesión ante un 401 en la consulta de detección', async () => {
    let llamadas = 0
    respuestaParticipaciones = () => {
      llamadas += 1
      // La carga inicial de «Registrados» resuelve; el 401 lo recibe la
      // DETECCIÓN, que es la consulta bajo prueba.
      return llamadas === 1
        ? Promise.resolve(SIN_PARTICIPACIONES)
        : Promise.reject(errorDe(401, 'Credenciales inválidas.'))
    }
    const alSesionExpirada = await abrirSeleccion()

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByRole('button', { name: 'Registrar participación' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Rol')).not.toBeInTheDocument()
    expect(screen.queryByText('No pudimos consultar tus participaciones')).not.toBeInTheDocument()
  })

  it('continúa a la segunda página y se detiene al encontrar la participación', async () => {
    respuestaParticipaciones = ({ pagina }) =>
      Promise.resolve({
        total: 150,
        pagina,
        por_pagina: 100,
        items: pagina === 1 ? [PARTICIPACION_AJENA_A_PAGINA] : [PARTICIPACION_CON_PROYECTO],
      })
    await abrirSeleccion()

    expect(
      await screen.findByText('Ya registraste una participación en este proyecto.'),
    ).toBeInTheDocument()
    // Carga inicial de «Registrados» (página 1) + detección (páginas 1 y 2).
    expect(listarParticipaciones).toHaveBeenCalledTimes(3)
    expect(vi.mocked(listarParticipaciones).mock.calls[1][1]).toEqual({
      pagina: 1,
      por_pagina: 100,
    })
    expect(vi.mocked(listarParticipaciones).mock.calls[2][1]).toEqual({
      pagina: 2,
      por_pagina: 100,
    })
    expect(
      screen.queryByRole('button', { name: 'Registrar participación' }),
    ).not.toBeInTheDocument()
  })

  it('se detiene al cubrir total sin encontrar la participación y permite registrar', async () => {
    // `total` manda (nunca items.length): con 150 registros caben 2 páginas
    // de 100 y el bucle se detiene ahí, aunque el proyecto no aparezca.
    respuestaParticipaciones = ({ pagina }) =>
      Promise.resolve({
        total: 150,
        pagina,
        por_pagina: 100,
        items: [PARTICIPACION_AJENA_A_PAGINA],
      })
    await abrirSeleccion()

    expect(await screen.findByRole('button', { name: 'Registrar participación' })).toBeInTheDocument()
    // Carga inicial de «Registrados» + las dos páginas de la detección.
    expect(listarParticipaciones).toHaveBeenCalledTimes(3)
    expect(screen.queryByText('Ya registraste una participación en este proyecto.')).not.toBeInTheDocument()
    expect(screen.queryByText('No pudimos consultar tus participaciones')).not.toBeInTheDocument()
  })

  it('«Buscar otro proyecto» limpia la selección y permite una nueva búsqueda', async () => {
    respuestaParticipaciones = () =>
      Promise.resolve({ total: 1, pagina: 1, por_pagina: 100, items: [PARTICIPACION_CON_PROYECTO] })
    await abrirSeleccion()
    expect(
      await screen.findByText('Ya registraste una participación en este proyecto.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Buscar otro proyecto' }))

    expect(await screen.findByText('Todavía no has buscado un proyecto')).toBeInTheDocument()
    expect(
      screen.queryByText('Ya registraste una participación en este proyecto.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Registrar la participación/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buscar otro proyecto' })).not.toBeInTheDocument()

    // La sección sigue siendo Mis proyectos: se puede buscar de nuevo.
    escribirYBuscar('Proyecto ÁRBOL')
    expect(await screen.findByText('Este proyecto ya existe.')).toBeInTheDocument()
    // Carga inicial de «Registrados» + detección de la selección: dos. La
    // búsqueda posterior no agrega ninguna llamada de participaciones.
    expect(listarParticipaciones).toHaveBeenCalledTimes(2)
  })

  it('las sugerencias aproximadas no disparan la consulta de detección', async () => {
    montar()
    escribirYBuscar('Proyecto arbol')

    expect(
      await screen.findByText('¿Tal vez buscas uno de estos proyectos?'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Seleccionar proyecto' }),
    ).not.toBeInTheDocument()
// ---------------------------------------------------------------------------
// MB-5B-2 — Edición controlada de la participación propia.
//
// Se verifica SOLO lo que la vista decide: entrar al modo edición desde el
// bloque existente, qué campos son editables, que los datos bloqueados no son
// inputs, que Cancelar no viaja, que el PATCH usa el id de la PARTICIPACIÓN con
// un payload de tres campos, la validación local y el patrón de errores ya
// usado por el registro. Nada de reglas de negocio del backend.
// ---------------------------------------------------------------------------
describe('MisProyectos — MB-5B-2: edición controlada de la participación', () => {
  /** Respuesta del PATCH: la misma participación con otros valores. */
  const EDITADA = {
    ...PARTICIPACION,
    rol: 'Líder técnico',
    entregables: 'API de pagos',
    horas: 150,
    updated_at: '2026-10-01T11:30:00',
  }

  /** Detecta la participación existente (id 21) y abre el resumen. */
  async function abrirResumen() {
    respuestaBusqueda = () => Promise.resolve(conExacta())
    respuestaParticipaciones = () =>
      Promise.resolve({
        total: 1,
        pagina: 1,
        por_pagina: 100,
        items: [PARTICIPACION_CON_PROYECTO],
      })
    const alSesionExpirada = montar()
    escribirYBuscar('Proyecto ÁRBOL')
    fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar proyecto' }))
    await screen.findByText('Ya registraste una participación en este proyecto.')
    return alSesionExpirada
  }

  /** Abre el resumen y pulsa «Editar participación». */
  async function abrirEdicion() {
    const alSesionExpirada = await abrirResumen()
    fireEvent.click(screen.getByRole('button', { name: 'Editar participación' }))
    await screen.findByRole('button', { name: 'Actualizar participación' })
    return alSesionExpirada
  }

  /** Formulario de edición (mismo lenguaje que el de registro). */
  function formularioEdicion() {
    return screen.getByRole('button', { name: 'Actualizar participación' }).closest('form')
  }
  it('ofrece «Editar participación» cuando ya existe la participación', async () => {
    await abrirResumen()

    expect(screen.getByRole('button', { name: 'Editar participación' })).toBeInTheDocument()
    // Sigue sin haber PATCH ni formulario de alta.
    expect(actualizarParticipacion).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: 'Registrar participación' }),
    ).not.toBeInTheDocument()
  })

  it('no ofrece «Editar participación» cuando NO hay participación', async () => {
    respuestaBusqueda = () => Promise.resolve(conExacta())
    montar()
    escribirYBuscar('Proyecto ÁRBOL')
    fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar proyecto' }))

    expect(
      await screen.findByRole('button', { name: 'Registrar participación' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar participación' })).not.toBeInTheDocument()
  })

  it('entra en edición en la MISMA vista y precarga los tres campos', async () => {
    await abrirEdicion()

    const formulario = formularioEdicion()
    expect(within(formulario).getByLabelText('Rol')).toHaveValue('Desarrollador')
    expect(within(formulario).getByLabelText('Entregables')).toHaveValue('')
    expect(within(formulario).getByLabelText('Horas')).toHaveValue(120)

    // Sigue siendo la vista de Mis proyectos: no hay otra pantalla.
    expect(screen.getByRole('heading', { name: 'Mis proyectos' })).toBeInTheDocument()
    expect(
      screen.queryByText('Ya registraste una participación en este proyecto.'),
    ).toBeInTheDocument()
  })
  it('muestra los indicadores objetivos como datos, no como inputs', async () => {
    await abrirEdicion()

    const formulario = formularioEdicion()
    expect(within(formulario).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(formulario).getByText('Trabajo en equipo')).toBeInTheDocument()
    expect(within(formulario).getByText('Sí')).toBeInTheDocument()
    expect(within(formulario).getByText('Coordinación')).toBeInTheDocument()
    expect(within(formulario).getByText('Explicación a públicos distintos')).toBeInTheDocument()
    expect(within(formulario).getByText('Situación/problema')).toBeInTheDocument()
    expect(
      within(formulario).getByText('Registrado al crear la participación.'),
    ).toBeInTheDocument()
  })

  it('el proyecto y la fecha de registro no son editables', async () => {
    await abrirEdicion()

    const formulario = formularioEdicion()
    expect(within(formulario).getByText('Proyecto')).toBeInTheDocument()
    expect(within(formulario).getByText('Fecha de registro')).toBeInTheDocument()
    expect(within(formulario).getByText('2026-09-30')).toBeInTheDocument()
    // Solo tres controles editables en todo el formulario.
    expect(within(formulario).getAllByRole('textbox')).toHaveLength(3)
    expect(within(formulario).queryByLabelText('Fecha de registro')).not.toBeInTheDocument()
    expect(within(formulario).queryByLabelText('Proyecto')).not.toBeInTheDocument()
  })

  it('Cancelar no hace PATCH y descarta los cambios locales', async () => {
    await abrirEdicion()

    const formulario = formularioEdicion()
    fireEvent.change(within(formulario).getByLabelText('Rol'), {
      target: { value: 'Cambio descartado' },
    })
    fireEvent.click(within(formulario).getByRole('button', { name: 'Cancelar' }))

    expect(
      await screen.findByRole('button', { name: 'Editar participación' }),
    ).toBeInTheDocument()
    expect(actualizarParticipacion).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Rol')).not.toBeInTheDocument()
    // Vuelve al resumen con los valores originales, no con el cambio local.
    expect(screen.getByText('Desarrollador')).toBeInTheDocument()
    expect(screen.queryByText('Cambio descartado')).not.toBeInTheDocument()
  })
  it('el PATCH usa el id de la PARTICIPACIÓN detectada (21), no el del proyecto', async () => {
    respuestaEdicion = () => Promise.resolve(EDITADA)
    await abrirEdicion()

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar participación' }))

    await waitFor(() => expect(actualizarParticipacion).toHaveBeenCalledTimes(1))
    const [token, id] = vi.mocked(actualizarParticipacion).mock.calls[0]
    expect(token).toBe('token-empleado')
    expect(id).toBe(21)
    expect(id).not.toBe(3)
  })

  it('envía exactamente rol, entregables y horas, sin ningún otro campo', async () => {
    respuestaEdicion = () => Promise.resolve(EDITADA)
    await abrirEdicion()

    const formulario = formularioEdicion()
    fireEvent.change(within(formulario).getByLabelText('Rol'), {
      target: { value: ' Líder técnico ' },
    })
    fireEvent.change(within(formulario).getByLabelText('Entregables'), {
      target: { value: 'API de pagos' },
    })
    fireEvent.change(within(formulario).getByLabelText('Horas'), {
      target: { value: '150' },
    })
    fireEvent.click(within(formulario).getByRole('button', { name: 'Actualizar participación' }))

    await waitFor(() => expect(actualizarParticipacion).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(actualizarParticipacion).mock.calls[0][2]
    expect(payload).toEqual({ rol: 'Líder técnico', entregables: 'API de pagos', horas: 150 })
    expect(Object.keys(payload)).toEqual(['rol', 'entregables', 'horas'])
    for (const bloqueado of [
      'proyecto_id',
      'empleado_id',
      'fecha_registro',
      'estado',
      'en_equipo',
      'coordino_tareas',
      'explico_a_publico_distinto',
      'resolvio_problema',
    ]) {
      expect(payload).not.toHaveProperty(bloqueado)
    }
  })

  it('los entregables son opcionales: vacío viaja como null', async () => {
    respuestaEdicion = () => Promise.resolve(PARTICIPACION)
    respuestaParticipaciones = () =>
      Promise.resolve({
        total: 1,
        pagina: 1,
        por_pagina: 100,
        items: [{ ...PARTICIPACION_CON_PROYECTO, entregables: 'API de pagos' }],
      })
    respuestaBusqueda = () => Promise.resolve(conExacta())
    montar()
    escribirYBuscar('Proyecto ÁRBOL')
    fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar proyecto' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Editar participación' }))
    const formulario = (await screen.findByRole('button', {
      name: 'Actualizar participación',
    })).closest('form')

    expect(within(formulario).getByLabelText('Entregables')).toHaveValue('API de pagos')
    fireEvent.change(within(formulario).getByLabelText('Entregables'), {
      target: { value: '   ' },
    })
    fireEvent.click(within(formulario).getByRole('button', { name: 'Actualizar participación' }))

    await waitFor(() => expect(actualizarParticipacion).toHaveBeenCalledTimes(1))
    expect(vi.mocked(actualizarParticipacion).mock.calls[0][2]).toEqual({
      rol: 'Desarrollador',
      entregables: null,
      horas: 120,
    })
  })
  it('la validación local bloquea el PATCH cuando el rol está vacío', async () => {
    await abrirEdicion()

    const formulario = formularioEdicion()
    fireEvent.change(within(formulario).getByLabelText('Rol'), { target: { value: '   ' } })
    fireEvent.click(within(formulario).getByRole('button', { name: 'Actualizar participación' }))

    expect(
      await screen.findByText('Escribe el rol que desempeñaste en el proyecto.'),
    ).toBeInTheDocument()
    expect(actualizarParticipacion).not.toHaveBeenCalled()
    // Sigue en modo edición: no sale al resumen.
    expect(screen.getByRole('button', { name: 'Actualizar participación' })).toBeInTheDocument()
  })

  it.each([
    ['vacías', '', 'Escribe las horas que dedicaste a este proyecto.'],
    ['no enteras', '12.5', 'Las horas deben ser un número entero, por ejemplo 120.'],
    ['no numéricas', 'muchas', 'Las horas deben ser un número entero, por ejemplo 120.'],
    ['negativas', '-5', 'Las horas no pueden ser negativas.'],
  ])('la validación local bloquea el PATCH cuando las horas son %s', async (_, valor, aviso) => {
    await abrirEdicion()

    const formulario = formularioEdicion()
    fireEvent.change(within(formulario).getByLabelText('Horas'), { target: { value: valor } })
    fireEvent.click(within(formulario).getByRole('button', { name: 'Actualizar participación' }))

    expect(await screen.findByText(aviso)).toBeInTheDocument()
    expect(actualizarParticipacion).not.toHaveBeenCalled()
  })

  it('el PATCH válido vuelve al resumen con los datos actualizados', async () => {
    respuestaEdicion = () => Promise.resolve(EDITADA)
    await abrirEdicion()

    const formulario = formularioEdicion()
    fireEvent.change(within(formulario).getByLabelText('Rol'), {
      target: { value: 'Líder técnico' },
    })
    fireEvent.change(within(formulario).getByLabelText('Horas'), {
      target: { value: '150' },
    })
    fireEvent.click(within(formulario).getByRole('button', { name: 'Actualizar participación' }))

    // Sale del modo edición y el resumen muestra la respuesta del PATCH.
    expect(
      await screen.findByRole('button', { name: 'Editar participación' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Actualizar participación' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Líder técnico')).toBeInTheDocument()
    expect(screen.getByText('2026-09-30')).toBeInTheDocument()
    // Sin recargar la página ni repetir el GET de detección: quedan solo la
    // carga inicial de «Registrados» y la detección previas al PATCH.
    expect(listarParticipaciones).toHaveBeenCalledTimes(2)
    expect(actualizarParticipacion).toHaveBeenCalledTimes(1)
  })
  it('cierra la sesión ante un 401 del PATCH', async () => {
    respuestaEdicion = () => Promise.reject(errorDe(401, 'Credenciales inválidas.'))
    const alSesionExpirada = await abrirEdicion()

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar participación' }))

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('No pudimos actualizar la participación'),
    ).not.toBeInTheDocument()
  })

  it('muestra el mensaje del backend ante un 404 del PATCH, sin salir de la edición', async () => {
    respuestaEdicion = () => Promise.reject(errorDe(404, 'Participación no encontrada.'))
    await abrirEdicion()

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar participación' }))

    expect(await screen.findByText('Participación no encontrada.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actualizar participación' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar participación' })).not.toBeInTheDocument()
  })

  it('muestra el mensaje del backend ante un 422 del PATCH', async () => {
    respuestaEdicion = () => Promise.reject(errorDe(422, 'Algunos datos enviados no son válidos.'))
    await abrirEdicion()

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar participación' }))

    expect(
      await screen.findByText('Algunos datos enviados no son válidos.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actualizar participación' })).toBeInTheDocument()
  })

  it('muestra error recuperable ante un 500 y permite reintentar', async () => {
    let intentos = 0
    respuestaEdicion = () => {
      intentos += 1
      return intentos === 1
        ? Promise.reject(errorDe(500, 'fallo del servidor'))
        : Promise.resolve(EDITADA)
    }
    await abrirEdicion()

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar participación' }))

    expect(
      await screen.findByText('No pudimos actualizar la participación'),
    ).toBeInTheDocument()
    expect(screen.getByText('fallo del servidor')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(
      await screen.findByRole('button', { name: 'Editar participación' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(actualizarParticipacion).toHaveBeenCalledTimes(2))
  })
})
    // Las sugerencias no disparan la detección: solo queda la carga inicial
    // de la pestaña «Registrados» al montar la vista.
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)
    expect(crearParticipacion).not.toHaveBeenCalled()
  })
})

// --- MB-7-2E: entrada desde Inicio con un proyecto ya elegido -------------
describe('MisProyectos — proyecto recibido desde Inicio', () => {
  const PROYECTO = {
    id: 42,
    nombre: 'Desarrollador móvil',
    nombre_normalizado: 'desarrollador movil',
    area: 'Tecnología',
    cliente: null,
    estado: 'EN_PROCESO',
    created_at: '2026-06-01T10:00:00',
    updated_at: '2026-06-01T10:00:00',
  }

  function pagina(items) {
    return { total: items.length, pagina: 1, por_pagina: 20, items }
  }

  /** Ajuste de navegación: la llegada contextual NO cambia de pestaña;
   *  quien va a registrar abre «Registrar participación» manualmente. */
  function abrirFlujo() {
    fireEvent.click(
      screen.getByRole('tab', { name: 'Pestaña Registrar participación' }),
    )
  }

  beforeEach(() => {
    vi.mocked(listarMisProyectos).mockReset()
    vi.mocked(listarMisProyectos).mockResolvedValue(pagina([PROYECTO]))
    vi.mocked(listarParticipaciones).mockResolvedValue(SIN_PARTICIPACIONES)
  })

  it('selecciona el proyecto recibido y abre el paso 03', async () => {
    render(<MisProyectos token="token-empleado" alSesionExpirada={vi.fn()} proyectoId={42} />)
    // La llegada no cambia de pestaña: se abre el flujo manualmente.
    abrirFlujo()

    // El paso 03 solo existe con proyecto seleccionado, y muestra su nombre.
    const paso = await screen.findByRole('region', { name: /Registrar la participación/ })
    expect(paso).toHaveTextContent(PROYECTO.nombre)
    expect(listarMisProyectos).toHaveBeenCalledWith('token-empleado')
  })

  it('solo transmite el id: la identidad la deriva el token', async () => {
    render(<MisProyectos token="token-empleado" alSesionExpirada={vi.fn()} proyectoId={42} />)
    abrirFlujo()

    await screen.findByRole('region', { name: /Registrar la participación/ })
    // `GET /me/projects` se pide con el token, sin `empleado_id` ni rol.
    expect(listarMisProyectos).toHaveBeenCalledWith('token-empleado')
    expect(listarMisProyectos.mock.calls[0]).toHaveLength(1)
    // La participación se sigue detectando con el endpoint propio, sin filtro.
    await waitFor(() => expect(listarParticipaciones).toHaveBeenCalled())
  })

  it('ignora un proyecto que no pertenece al empleado', async () => {
    vi.mocked(listarMisProyectos).mockResolvedValue(pagina([]))
    render(<MisProyectos token="token-empleado" alSesionExpirada={vi.fn()} proyectoId={99} />)

    await waitFor(() => expect(listarMisProyectos).toHaveBeenCalled())
    // Sin selección, el paso 03 no existe y la vista sigue su flujo normal.
    expect(
      screen.queryByRole('region', { name: /Registrar la participación/ }),
    ).not.toBeInTheDocument()
  })

  it('el paso 02 muestra el proyecto que llegó ya seleccionado', async () => {
    render(<MisProyectos token="token-empleado" alSesionExpirada={vi.fn()} proyectoId={42} />)
    abrirFlujo()

    // El paso 02 existe aunque no haya ninguna búsqueda ejecutada.
    const paso = await screen.findByRole('region', { name: /Crear o seleccionar/ })
    expect(paso).toHaveTextContent('Proyecto seleccionado')
    expect(paso).toHaveTextContent(PROYECTO.nombre)
    expect(paso).toHaveTextContent(PROYECTO.area)
    expect(paso).toHaveTextContent('En proceso')
    // Y el paso 03 sigue debajo con la participación de ESE proyecto.
    const registro = await screen.findByRole('region', { name: /Registrar la participación/ })
    expect(registro).toHaveTextContent(PROYECTO.nombre)
  })

  it('no exige una búsqueda nueva: el proyecto ya está aplicado', async () => {
    render(<MisProyectos token="token-empleado" alSesionExpirada={vi.fn()} proyectoId={42} />)
    abrirFlujo()

    await screen.findByRole('region', { name: /Crear o seleccionar/ })
    // No se llama a la búsqueda: el proyecto llegó ya elegido.
    expect(buscarProyectos).not.toHaveBeenCalled()
    // Y se resuelve UNA sola vez.
    expect(listarMisProyectos).toHaveBeenCalledTimes(1)
  })

  it('buscar después descarta la llegada contextual', async () => {
    render(<MisProyectos token="token-empleado" alSesionExpirada={vi.fn()} proyectoId={42} />)
    abrirFlujo()
    await screen.findByRole('region', { name: /Crear o seleccionar/ })

    // Al buscar, manda el flujo normal: desaparece el bloque de entrada.
    const campo = screen.getByLabelText(/nombre del proyecto/i)
    fireEvent.change(campo, { target: { value: 'proyecto arbol' } })
    fireEvent.click(screen.getByRole('button', { name: /Buscar proyecto/ }))

    await waitFor(() => expect(buscarProyectos).toHaveBeenCalled())
    expect(
      screen.queryByText('Proyecto seleccionado'),
    ).not.toBeInTheDocument()
  })

  it('sin proyectoId no consulta el listado propio', async () => {
    render(<MisProyectos token="token-empleado" alSesionExpirada={vi.fn()} />)

    await screen.findByRole('heading', { name: /Mis proyectos/ })
    expect(listarMisProyectos).not.toHaveBeenCalled()
    // El flujo normal empieza en el paso 01, sin proyecto previo.
    expect(
      screen.queryByRole('region', { name: /Crear o seleccionar/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: /Registrar la participación/ }),
    ).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Tarea B: consulta de proyectos registrados (GET /me/participations con
// `proyecto` incluido en cada item). Pruebas ESTRICTAMENTE aditivas: la
// sección carga BAJO DEMANDA, así que ninguna prueba anterior observa
// llamadas nuevas y ningún flujo existente cambia.
// ---------------------------------------------------------------------------
describe('MisProyectos — consulta de proyectos registrados (Tarea B)', () => {
  const OLMO = {
    id: 5,
    nombre: 'Proyecto Olmo',
    nombre_normalizado: 'proyecto olmo',
    area: null,
    cliente: 'Cliente externo',
    estado: 'COMPLETADO',
    created_at: '2026-01-05T08:00:00',
    updated_at: '2026-07-20T12:00:00',
  }

  const REGISTRADA_OLMO = {
    ...PARTICIPACION,
    id: 23,
    proyecto_id: 5,
    rol: 'QA',
    entregables: 'Plan de pruebas',
    en_equipo: false,
    coordino_tareas: false,
    explico_a_publico_distinto: true,
    resolvio_problema: false,
    horas: 40,
    fecha_registro: '2026-08-15',
    proyecto: OLMO,
    created_at: '2026-08-15T10:00:00',
    updated_at: '2026-09-01T11:00:00',
  }

  const CON_ARBOL = { ...PARTICIPACION, proyecto: EXACTA }

  /** Activa la pestaña «Registrados» (la inicial de la entrada normal). */
  function abrirConsulta() {
    fireEvent.click(screen.getByRole('tab', { name: 'Registrados' }))
  }

  it('la entrada normal abre «Registrados» activa y consulta la lista al montar', () => {
    render(<MisProyectos token="token-empleado" alSesionExpirada={vi.fn()} />)

    expect(screen.getByRole('tab', { name: 'Registrados' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      screen.getByRole('tab', { name: 'Pestaña Registrar participación' }),
    ).toHaveAttribute('aria-selected', 'false')
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)
    expect(listarParticipaciones).toHaveBeenCalledWith('token-empleado', {
      pagina: 1,
      por_pagina: 100,
    })
    // El formulario del flujo NO se renderiza debajo de la lista.
    expect(
      screen.queryByLabelText('Nombre del proyecto'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Buscar el proyecto' }),
    ).not.toBeInTheDocument()
  })

  it('lista los proyectos con participación guardada y sus campos reales', async () => {
    respuestaParticipaciones = () =>
      Promise.resolve({
        total: 2,
        pagina: 1,
        por_pagina: 100,
        items: [CON_ARBOL, REGISTRADA_OLMO],
      })
    montar()

    abrirConsulta()

    const filaArbol = await screen.findByRole('button', { name: /Proyecto ÁRBOL/ })
    expect(within(filaArbol).getByText('Área: Operaciones')).toBeInTheDocument()
    expect(within(filaArbol).getByText('Cliente: Cliente interno')).toBeInTheDocument()
    expect(within(filaArbol).getByText('En proceso')).toBeInTheDocument()
    expect(within(filaArbol).getByText('Registrado: 2026-09-30')).toBeInTheDocument()

    const filaOlmo = screen.getByRole('button', { name: /Proyecto Olmo/ })
    expect(within(filaOlmo).getByText('Área: —')).toBeInTheDocument()
    expect(within(filaOlmo).getByText('Cliente: Cliente externo')).toBeInTheDocument()
    expect(within(filaOlmo).getByText('Completado')).toBeInTheDocument()
    expect(within(filaOlmo).getByText('Registrado: 2026-08-15')).toBeInTheDocument()

    expect(listarParticipaciones).toHaveBeenCalledTimes(1)
    expect(listarParticipaciones).toHaveBeenCalledWith('token-empleado', {
      pagina: 1,
      por_pagina: 100,
    })
  })

  it('muestra el estado vacío cuando no hay participaciones guardadas', async () => {
    montar()

    abrirConsulta()

    expect(
      await screen.findByText('Todavía no hay proyectos registrados'),
    ).toBeInTheDocument()
  })

  it('seleccionar un proyecto muestra todos los campos reales de proyecto y participación', async () => {
    respuestaParticipaciones = () =>
      Promise.resolve({
        total: 1,
        pagina: 1,
        por_pagina: 100,
        items: [CON_ARBOL],
      })
    montar()

    abrirConsulta()
    fireEvent.click(await screen.findByRole('button', { name: /Proyecto ÁRBOL/ }))

    const detalle = await screen.findByRole('group', {
      name: 'Detalle de Proyecto ÁRBOL',
    })

    // Proyecto: los campos reales de ProyectoOut (área/cliente nulos → «—»).
    within(detalle).getByText('Nombre')
    within(detalle).getByText('Área')
    within(detalle).getByText('Cliente')
    within(detalle).getByText('Estado')
    within(detalle).getByText('Creado')
    within(detalle).getByText('Actualizado')
    ;['Proyecto ÁRBOL', 'Operaciones', 'Cliente interno', 'En proceso', '2026-06-01'].forEach(
      (valor) => expect(within(detalle).getAllByText(valor).length).toBeGreaterThan(0),
    )

    // Participación: los campos reales de ParticipacionOut, incluidos los
    // cuatro indicadores, las horas y la fecha de registro.
    within(detalle).getByText('Rol')
    within(detalle).getByText('Entregables')
    within(detalle).getByText('Horas')
    within(detalle).getByText('Fecha de registro')
    within(detalle).getByText('Trabajo en equipo')
    within(detalle).getByText('Coordinación')
    within(detalle).getByText('Explicación a públicos distintos')
    within(detalle).getByText('Situación/problema')
    within(detalle).getByText('Registrada')
    within(detalle).getByText('Última actualización')
    ;['Desarrollador', '120', '2026-09-30', 'Sí', 'No'].forEach((valor) =>
      expect(within(detalle).getAllByText(valor).length).toBeGreaterThan(0),
    )
  })

  it('consultar un proyecto registrado no registra ni modifica la participación', async () => {
    respuestaParticipaciones = () =>
      Promise.resolve({
        total: 1,
        pagina: 1,
        por_pagina: 100,
        items: [CON_ARBOL],
      })
    montar()

    abrirConsulta()
    fireEvent.click(await screen.findByRole('button', { name: /Proyecto ÁRBOL/ }))

    expect(
      await screen.findByRole('group', { name: 'Detalle de Proyecto ÁRBOL' }),
    ).toBeInTheDocument()
    expect(crearParticipacion).not.toHaveBeenCalled()
    expect(actualizarParticipacion).not.toHaveBeenCalled()
    // Solo la consulta de la sección: ni detección ni formulario del asistente.
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)
  })

  it('editar desde la consulta abre el modo de edición sin registrar nada', async () => {
    respuestaParticipaciones = () =>
      Promise.resolve({
        total: 1,
        pagina: 1,
        por_pagina: 100,
        items: [CON_ARBOL],
      })
    montar()

    abrirConsulta()
    fireEvent.click(await screen.findByRole('button', { name: /Proyecto ÁRBOL/ }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar esta participación' }),
    )

    // Transición directa al Paso 03 en modo edición: sin pasos previos.
    expect(
      await screen.findByRole('heading', { name: 'Editar participación' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Buscar el proyecto' }),
    ).not.toBeInTheDocument()
    expect(crearParticipacion).not.toHaveBeenCalled()
    expect(actualizarParticipacion).not.toHaveBeenCalled()
    // Sin detección adicional: la carga inicial de la lista es la única llamada.
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)
  })

  it('un fallo de la consulta muestra error y el reintento funciona', async () => {
    vi.mocked(listarParticipaciones).mockRejectedValueOnce(
      errorDe(500, 'fallo del servidor'),
    )
    montar()

    abrirConsulta()

    expect(
      await screen.findByText('No pudimos cargar tus proyectos registrados'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(
      await screen.findByText('Todavía no hay proyectos registrados'),
    ).toBeInTheDocument()
    expect(listarParticipaciones).toHaveBeenCalledTimes(2)
  })

  it('una respuesta muy rápida mantiene «Consultando tus proyectos…» el mínimo perceptible', async () => {
    montar()
    const inicio = Date.now()

    abrirConsulta()

    expect(screen.getByText('Consultando tus proyectos…')).toBeInTheDocument()
    await screen.findByText('Todavía no hay proyectos registrados')
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(350)
  })

  it('un error de la consulta inicial no espera el mínimo', async () => {
    vi.mocked(listarParticipaciones).mockRejectedValueOnce(
      errorDe(500, 'fallo del servidor'),
    )
    const inicio = Date.now()
    montar()

    abrirConsulta()

    expect(
      await screen.findByText('No pudimos cargar tus proyectos registrados'),
    ).toBeInTheDocument()
    expect(Date.now() - inicio).toBeLessThan(400)
  })
})

// ---------------------------------------------------------------------------
// Rediseño estructural: encabezado «PROYECTOS / Mis proyectos», pestañas
// «Registrados» / «Registrar participación», contador real, acordeón
// accesible (aria-expanded/aria-controls), filtro local y «Ver más».
// Pruebas ESTRICTAMENTE aditivas: la consulta sigue cargando bajo demanda,
// el flujo 01–03 no hace llamadas nuevas y las pestañas son vistas
// EXCLUSIVAS (solo se renderiza el panel activo; el acordeón del listado
// sigue ocultando su detalle con CSS, como el de «Mi progreso»).
// ---------------------------------------------------------------------------
describe('MisProyectos — rediseño: pestañas, acordeón, filtro y «Ver más»', () => {
  const OLMO = {
    id: 5,
    nombre: 'Proyecto Olmo',
    nombre_normalizado: 'proyecto olmo',
    area: null,
    cliente: 'Cliente externo',
    estado: 'COMPLETADO',
    created_at: '2026-01-05T08:00:00',
    updated_at: '2026-07-20T12:00:00',
  }

  const CON_ARBOL = { ...PARTICIPACION, proyecto: EXACTA }
  const REGISTRADA_OLMO = {
    ...PARTICIPACION,
    id: 23,
    proyecto_id: 5,
    rol: 'QA',
    horas: 40,
    fecha_registro: '2026-08-15',
    proyecto: OLMO,
  }
  const REGISTRADA_ROBLE = {
    ...PARTICIPACION,
    id: 24,
    proyecto_id: 12,
    proyecto: CREADO,
  }

  function dosRegistros() {
    return {
      total: 2,
      pagina: 1,
      por_pagina: 100,
      items: [CON_ARBOL, REGISTRADA_OLMO],
    }
  }

  function consultar() {
    fireEvent.click(screen.getByRole('tab', { name: 'Registrados' }))
  }

  it('muestra el encabezado «PROYECTOS / Mis proyectos» y las dos pestañas', () => {
    montar()

    expect(screen.getByText('Proyectos')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Mis proyectos' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    // La pestaña inicial es la del asistente; «Registrados» consulta al
    // activarse (bajo demanda).
    expect(
      screen.getByRole('tab', { name: 'Pestaña Registrar participación' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Registrados' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('cambiar de pestaña alterna aria-selected y renderiza SOLO el panel activo', () => {
    montar()

    // Con el flujo activo, su panel existe y el de consulta NI SIQUIERA
    // está montado: las pestañas son vistas exclusivas.
    expect(
      screen.getByRole('tabpanel', { name: 'Pestaña Registrar participación' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('tabpanel', { name: 'Registrados' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Registrados' }))

    expect(screen.getByRole('tab', { name: 'Registrados' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      screen.getByRole('tab', { name: 'Pestaña Registrar participación' }),
    ).toHaveAttribute('aria-selected', 'false')
    expect(
      screen.getByRole('tabpanel', { name: 'Registrados' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('tabpanel', {
        name: 'Pestaña Registrar participación',
      }),
    ).not.toBeInTheDocument()
    // El paso 01 del flujo ya no está en el DOM (no solo oculto por CSS).
    expect(
      screen.queryByRole('heading', { name: /Buscar el proyecto/ }),
    ).not.toBeInTheDocument()
  })

  it('con «Registrados» activa SOLO existe la consulta: filtro, lista y pie', async () => {
    respuestaParticipaciones = () => Promise.resolve(dosRegistros())
    montar()
    consultar()

    // Contenido REAL de la vista de consulta: filtro, filas y pie del listado.
    expect(
      await screen.findByRole('button', { name: /Proyecto ÁRBOL/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('Buscar en mis proyectos'),
    ).toBeInTheDocument()
    expect(screen.getByText('Mostrando 2 de 2')).toBeInTheDocument()

    // NADA del flujo de registro: pasos 01, 02 y 03 ausentes por completo.
    expect(
      screen.queryByRole('heading', { name: 'Buscar el proyecto' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Crear o seleccionar' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Registrar la participación' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Buscar proyecto' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Nombre del proyecto'),
    ).not.toBeInTheDocument()
  })

  it('con «Registrar participación» activa SOLO existe el flujo 01–03', async () => {
    montar()

    // Paso 01 visible con su búsqueda obligatoria.
    expect(
      screen.getByRole('heading', { name: 'Buscar el proyecto' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Buscar proyecto' }),
    ).toBeInTheDocument()

    // NADA de la vista de registrados: ni filtro, ni filas, ni pie de conteo.
    expect(
      screen.queryByLabelText('Buscar en mis proyectos'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Proyecto ÁRBOL/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/^Mostrando \d+ de \d+$/),
    ).not.toBeInTheDocument()

    // La búsqueda del paso 01 sigue operativa dentro de su pestaña: hace
    // aparecer el paso 02 (coincidencia exacta) sin consultar participaciones.
    respuestaBusqueda = () => Promise.resolve(conExacta())
    escribirYBuscar('Proyecto ÁRBOL')

    expect(
      await screen.findByRole('heading', { name: 'Crear o seleccionar' }),
    ).toBeInTheDocument()
    // La búsqueda del flujo no dispara participaciones: solo queda la carga
    // inicial de «Registrados» al montar.
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByLabelText('Buscar en mis proyectos'),
    ).not.toBeInTheDocument()
  })

  it('la pestaña «Registrados» muestra el contador real tras consultarse', async () => {
    respuestaParticipaciones = () => Promise.resolve(dosRegistros())
    montar()

    const tab = screen.getByRole('tab', { name: 'Registrados' })
    expect(tab).not.toHaveTextContent('2')

    consultar()

    await waitFor(() => expect(tab).toHaveTextContent('2'))
  })

  it('el listado es un acordeón accesible: aria-expanded y aria-controls', async () => {
    respuestaParticipaciones = () => Promise.resolve(dosRegistros())
    montar()
    consultar()

    const fila = await screen.findByRole('button', { name: /Proyecto ÁRBOL/ })
    expect(fila).toHaveAttribute('aria-expanded', 'false')
    const idDetalle = fila.getAttribute('aria-controls')
    expect(document.getElementById(idDetalle)).not.toBeNull()
    expect(document.getElementById(idDetalle).className).toContain(
      'proyectos-registrados__detalle--oculto',
    )

    fireEvent.click(fila)

    expect(fila).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(idDetalle).className).not.toContain(
      'proyectos-registrados__detalle--oculto',
    )
  })

  it('el filtro local estrecha la lista sin llamar a la API', async () => {
    respuestaParticipaciones = () => Promise.resolve(dosRegistros())
    montar()
    consultar()
    await screen.findByRole('button', { name: /Proyecto ÁRBOL/ })

    fireEvent.change(screen.getByLabelText('Buscar en mis proyectos'), {
      target: { value: 'olmo' },
    })

    expect(
      screen.queryByRole('button', { name: /Proyecto ÁRBOL/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Proyecto Olmo/ }),
    ).toBeInTheDocument()
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Buscar en mis proyectos'), {
      target: { value: 'zzz-inexistente' },
    })

    expect(
      screen.getByText('Ningún proyecto coincide con tu búsqueda'),
    ).toBeInTheDocument()
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)
  })

  it('«Ver más» pide la página siguiente y anexa los proyectos', async () => {
    respuestaParticipaciones = ({ pagina }) =>
      Promise.resolve(
        pagina === 1
          ? { total: 3, pagina: 1, por_pagina: 100, items: [CON_ARBOL] }
          : {
              total: 3,
              pagina: 2,
              por_pagina: 100,
              items: [REGISTRADA_OLMO, REGISTRADA_ROBLE],
            },
      )
    montar()
    consultar()
    await screen.findByRole('button', { name: /Proyecto ÁRBOL/ })

    expect(screen.getByText('Mostrando 1 de 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver más (2)' }))

    expect(
      await screen.findByRole('button', { name: /Proyecto Olmo/ }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /Proyecto Roble/ }),
    ).toBeInTheDocument()
    expect(listarParticipaciones).toHaveBeenCalledTimes(2)
    expect(vi.mocked(listarParticipaciones).mock.calls[1][1]).toEqual({
      pagina: 2,
      por_pagina: 100,
    })
    expect(screen.getByText('Mostrando 3 de 3')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ver más' }),
    ).not.toBeInTheDocument()
  })

  it('al llegar desde «Inicio» con un proyecto, la pestaña activa sigue siendo «Registrados»', async () => {
    vi.mocked(listarMisProyectos).mockReset()
    vi.mocked(listarMisProyectos).mockResolvedValue({
      total: 1,
      pagina: 1,
      por_pagina: 20,
      items: [EXACTA],
    })
    render(
      <MisProyectos
        token="token-empleado"
        alSesionExpirada={vi.fn()}
        proyectoId={EXACTA.id}
      />,
    )

    // Ajuste de navegación: la llegada contextual YA NO cambia de pestaña.
    // Al resolver el proyecto, sigue activa «Registrados» y el flujo no
    // está renderizado (quien registra lo abre manualmente).
    await waitFor(() => expect(listarMisProyectos).toHaveBeenCalled())
    expect(
      screen.getByRole('tab', { name: /^Registrados/ }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('tab', { name: 'Pestaña Registrar participación' }),
    ).toHaveAttribute('aria-selected', 'false')
    expect(
      screen.queryByRole('tabpanel', {
        name: 'Pestaña Registrar participación',
      }),
    ).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Ajuste de navegación y edición: edición directa desde «Registrados» (SOLO
// Paso 03 precargado), PATCH existente con regreso automático tras guardar,
// conservación ante fallo y flujo normal restaurado al cancelar.
// ---------------------------------------------------------------------------
describe('MisProyectos — edición directa desde «Registrados»', () => {
  const CON_ARBOL_ACTUALIZADA = {
    ...PARTICIPACION,
    proyecto: EXACTA,
    rol: 'Líder técnico',
    horas: 150,
  }

  /** Entra normalmente (pestaña «Registrados»), expande «Proyecto ÁRBOL» y
   *  pulsa «Editar esta participación»: debe abrirse la edición directa. */
  async function abrirEdicionDirecta() {
    respuestaParticipaciones = () =>
      Promise.resolve({
        total: 1,
        pagina: 1,
        por_pagina: 100,
        items: [PARTICIPACION_CON_PROYECTO],
      })
    render(<MisProyectos token="token-empleado" alSesionExpirada={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /Proyecto ÁRBOL/ }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar esta participación' }),
    )
    return await screen.findByRole('button', { name: 'Actualizar participación' })
  }

  it('abre «Registrar participación» mostrando SOLO el Paso 03 precargado', async () => {
    await abrirEdicionDirecta()

    // Transición de pestaña y modo de edición explícito.
    expect(
      screen.getByRole('tab', { name: 'Pestaña Registrar participación' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('heading', { name: 'Editar participación' }),
    ).toBeInTheDocument()

    // Valores actuales de LA participación pulsada (nada vacío).
    expect(screen.getByLabelText('Rol')).toHaveValue('Desarrollador')
    expect(screen.getByLabelText('Entregables')).toHaveValue('')
    expect(screen.getByLabelText('Horas')).toHaveValue('120')
    // Identidad conservada: proyecto y participación de verdad (el nombre y
    // la fecha aparecen en el resumen y en la ficha del formulario).
    expect(screen.getAllByText('Proyecto ÁRBOL').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2026-09-30').length).toBeGreaterThan(0)

    // Pasos 01 y 02 fuera del render (ni buscador, ni resultados, ni alta).
    expect(
      screen.queryByRole('heading', { name: 'Buscar el proyecto' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Crear o seleccionar' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Nombre del proyecto'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Buscar proyecto' }),
    ).not.toBeInTheDocument()

    // Sin llamadas nuevas: ni búsqueda, ni detección, ni PATCH, ni POST.
    expect(buscarProyectos).not.toHaveBeenCalled()
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)
    expect(actualizarParticipacion).not.toHaveBeenCalled()
    expect(crearParticipacion).not.toHaveBeenCalled()
  })

  it('guardar ejecuta el PATCH existente y vuelve a «Registrados» actualizado', async () => {
    await abrirEdicionDirecta()
    respuestaEdicion = () => Promise.resolve(CON_ARBOL_ACTUALIZADA)
    respuestaParticipaciones = () =>
      Promise.resolve({
        total: 1,
        pagina: 1,
        por_pagina: 100,
        items: [CON_ARBOL_ACTUALIZADA],
      })

    fireEvent.change(screen.getByLabelText('Rol'), {
      target: { value: 'Líder técnico' },
    })
    fireEvent.change(screen.getByLabelText('Horas'), {
      target: { value: '150' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Actualizar participación' }),
    )

    // Operación de ACTUALIZACIÓN (PATCH) con el id del registro existente:
    // nunca una creación nueva.
    await waitFor(() => expect(actualizarParticipacion).toHaveBeenCalledTimes(1))
    expect(actualizarParticipacion).toHaveBeenCalledWith('token-empleado', 21, {
      rol: 'Líder técnico',
      entregables: null,
      horas: 150,
    })
    expect(crearParticipacion).not.toHaveBeenCalled()

    // Solo tras el éxito: vuelta a «Registrados» con la lista refrescada.
    // (El contador real forma parte del nombre accesible: «Registrados 1».)
    expect(
      await screen.findByRole('tab', { name: /^Registrados/ }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.queryByRole('heading', { name: 'Editar participación' }),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(listarParticipaciones).toHaveBeenCalledTimes(2))

    // El detalle de la lista refleja la participación actualizada.
    fireEvent.click(await screen.findByRole('button', { name: /Proyecto ÁRBOL/ }))
    expect(await screen.findByText('Líder técnico')).toBeInTheDocument()
  })

  it('un fallo del guardado conserva el formulario, los valores y el error', async () => {
    await abrirEdicionDirecta()
    respuestaEdicion = () =>
      Promise.reject(errorDe(422, 'Algunos datos enviados no son válidos.'))

    fireEvent.change(screen.getByLabelText('Rol'), {
      target: { value: 'Líder técnico' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Actualizar participación' }),
    )

    expect(
      await screen.findByText('Algunos datos enviados no son válidos.'),
    ).toBeInTheDocument()
    // Permanece en el modo edición con lo introducido: sin cambio de pestaña.
    expect(screen.getByLabelText('Rol')).toHaveValue('Líder técnico')
    expect(
      screen.getByRole('button', { name: 'Actualizar participación' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Pestaña Registrar participación' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(actualizarParticipacion).toHaveBeenCalledTimes(1)
  })

  it('cancelar restaura el flujo normal: un registro nuevo empieza limpio en el Paso 01', async () => {
    await abrirEdicionDirecta()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    // Vuelve a «Registrados»... (el contador hace el nombre «Registrados 1»).
    expect(
      screen.getByRole('tab', { name: /^Registrados/ }),
    ).toHaveAttribute('aria-selected', 'true')

    // ...y al abrir el flujo, el Paso 01 está limpio: sin heredar la edición.
    fireEvent.click(
      screen.getByRole('tab', { name: 'Pestaña Registrar participación' }),
    )
    expect(
      screen.getByRole('heading', { name: 'Buscar el proyecto' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del proyecto')).toHaveValue('')
    expect(
      screen.queryByRole('heading', { name: 'Editar participación' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Registrar la participación' }),
    ).not.toBeInTheDocument()
    expect(crearParticipacion).not.toHaveBeenCalled()
  })
})
