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
import { buscarProyectos, crearProyecto } from '../../api/proyectos.js'
import MisProyectos from '../MisProyectos.jsx'

vi.mock('../../api/participaciones.js', () => ({
  actualizarParticipacion: vi.fn(),
  crearParticipacion: vi.fn(),
  listarParticipaciones: vi.fn(),
}))
vi.mock('../../api/proyectos.js', () => ({
  buscarProyectos: vi.fn(),
  crearProyecto: vi.fn(),
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
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)
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
    // dentro del mismo flujo de alta NO se consulta el listado.
    expect(listarParticipaciones).not.toHaveBeenCalled()
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
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)
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
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)

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
      return intentos === 1
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
    await waitFor(() => expect(listarParticipaciones).toHaveBeenCalledTimes(2))
  })

  it('cierra la sesión ante un 401 en la consulta de detección', async () => {
    respuestaParticipaciones = () => Promise.reject(errorDe(401, 'Credenciales inválidas.'))
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
    expect(listarParticipaciones).toHaveBeenCalledTimes(2)
    expect(vi.mocked(listarParticipaciones).mock.calls[0][1]).toEqual({
      pagina: 1,
      por_pagina: 100,
    })
    expect(vi.mocked(listarParticipaciones).mock.calls[1][1]).toEqual({
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
    expect(listarParticipaciones).toHaveBeenCalledTimes(2)
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
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)
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
    // Sin recargar la página ni repetir el GET de detección.
    expect(listarParticipaciones).toHaveBeenCalledTimes(1)
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
    expect(listarParticipaciones).not.toHaveBeenCalled()
    expect(crearParticipacion).not.toHaveBeenCalled()
  })
})
