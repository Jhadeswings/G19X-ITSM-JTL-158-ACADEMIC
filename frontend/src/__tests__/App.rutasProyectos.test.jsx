// RH-02.3 — App con router real: rutas de Proyectos RH (/proyectos,
// /proyectos/:id) dentro del shell RH. La API se mockea: sin llamadas reales
// al backend. La URL se verifica con la History API REAL del entorno (jsdom,
// Back/Forward incluidos) porque <App /> monta su propio BrowserRouter.
//
// Qué se verifica (bloque §19):
// A. ROUTING — /proyectos → catálogo · /proyectos/:id → detalle · el Index
//    no renderiza detalle · el Show no renderiza el catálogo como bloque.
// B. PARAM — el id llega al Show desde la ruta (deep-link incluido).
// D. BACK/FORWARD — navegación correcta del historial.
// E. UI — «Volver al listado» existe; NO existe X ni «Cerrar»; breadcrumb;
//    Editar y Cancelar permanecen en /proyectos/:id.
// F. REGRESIÓN — la corrección administrativa (RH-02.2) sigue funcionando
//    dentro del Show (su suite completa vive en ProyectoDetalle.test.jsx).

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerSesion } from '../api/autenticacion.js'
import { obtenerCuenta } from '../api/cuenta.js'
import {
  obtenerAtencionRequerida,
  obtenerDistribucionCompetencia,
  obtenerEmpleadosActivos,
  obtenerProyectosActivos,
} from '../api/dashboardRh.js'
import {
  actualizarProyectoRh,
  consultarProyectoRh,
  listarProyectosRh,
} from '../api/proyectos.js'
import {
  corregirParticipacion,
  listarParticipacionesDeProyecto,
} from '../api/participaciones.js'
import App from '../App.jsx'

vi.mock('../api/autenticacion.js', () => ({
  actualizarSesion: vi.fn(),
  cambiarPassword: vi.fn(),
  guardarSesion: vi.fn(),
  iniciarSesion: vi.fn(),
  limpiarSesion: vi.fn(),
  obtenerSesion: vi.fn(),
}))
vi.mock('../api/cuenta.js', () => ({ obtenerCuenta: vi.fn() }))
vi.mock('../api/dashboardRh.js', () => ({
  obtenerAtencionRequerida: vi.fn(),
  obtenerDistribucionCompetencia: vi.fn(),
  obtenerEmpleadosActivos: vi.fn(),
  obtenerProyectosActivos: vi.fn(),
}))
vi.mock('../api/proyectos.js', async () => {
  const original = await vi.importActual('../api/proyectos.js')
  return {
    ...original,
    listarProyectosRh: vi.fn(),
    consultarProyectoRh: vi.fn(),
    actualizarProyectoRh: vi.fn(),
  }
})
vi.mock('../api/participaciones.js', async () => {
  const original = await vi.importActual('../api/participaciones.js')
  return {
    ...original,
    listarParticipacionesDeProyecto: vi.fn(),
    corregirParticipacion: vi.fn(),
  }
})

const RH = { token: 'token-rh', rol: 'RH', mustChangePassword: false }

function proyectoRh(id) {
  return {
    id,
    nombre: `Proyecto ${id}`,
    nombre_normalizado: `proyecto ${id}`,
    area: 'Tecnología',
    cliente: 'Cliente interno',
    estado: 'EN_PROCESO',
    created_at: '2026-01-15T10:00:00+00:00',
    updated_at: '2026-01-15T10:00:00+00:00',
  }
}

const CATALOGO = { total: 1, pagina: 1, por_pagina: 20, items: [proyectoRh(12)] }
const PARTICIPANTES_VACIOS = { total: 0, pagina: 1, por_pagina: 20, items: [] }

beforeEach(() => {
  vi.mocked(obtenerSesion).mockReturnValue(RH)
  vi.mocked(obtenerCuenta).mockResolvedValue({
    email: 'rh@empresa.dev',
    empleado_nombre: 'Persona RH',
  })
  vi.mocked(obtenerEmpleadosActivos).mockResolvedValue({ total: 12, items: [] })
  vi.mocked(obtenerProyectosActivos).mockResolvedValue({ total: 4, items: [] })
  vi.mocked(obtenerAtencionRequerida).mockResolvedValue({ total: 0, items: [] })
  vi.mocked(obtenerDistribucionCompetencia).mockResolvedValue({
    competency_code: 'desempeno_tecnico',
    evaluables: 0,
    datos_insuficientes: 0,
    nivel_1_2_count: 0,
    nivel_1_2_percentage: '0.00',
    nivel_3_5_count: 0,
    nivel_3_5_percentage: '0.00',
  })
  vi.mocked(listarProyectosRh).mockReset()
  vi.mocked(listarProyectosRh).mockResolvedValue(CATALOGO)
  vi.mocked(consultarProyectoRh).mockReset()
  vi.mocked(consultarProyectoRh).mockImplementation((_token, id) =>
    Promise.resolve(proyectoRh(Number(id))),
  )
  vi.mocked(actualizarProyectoRh).mockReset()
  vi.mocked(listarParticipacionesDeProyecto).mockReset()
  vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue(PARTICIPANTES_VACIOS)
  vi.mocked(corregirParticipacion).mockReset()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

function navegacion() {
  return screen.getByRole('navigation', { name: 'Navegación principal' })
}

function irA(seccion) {
  fireEvent.click(within(navegacion()).getByRole('button', { name: seccion }))
}

/** Dashboard RH listo → sección Proyectos montada y catálogo CARGADO. */
async function irAProyectos() {
  await screen.findByRole('heading', { name: 'Empleados activos' })
  irA('Proyectos')
  await screen.findAllByRole('heading', { name: 'Proyectos', level: 1 })
  // RH-02.3.3: el catálogo tiene presencia mínima de loading; las filas
  // (y su acción «Consultar») solo existen cuando ya cargó.
  await screen.findAllByRole('button', { name: 'Consultar' })
}

/** Index cargado → Show del proyecto 12 con la ficha lista. */
async function abrirProyecto() {
  await irAProyectos()
  fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[0])
  await screen.findByText('Clave de comparación')
}

describe('RH-02.3 — App: rutas reales de Proyectos (/proyectos, /proyectos/:id)', () => {
  it('seleccionar Proyectos en el sidebar lleva a /proyectos (catálogo, sin detalle)', async () => {
    render(<App />)
    await irAProyectos()

    expect(window.location.pathname).toBe('/proyectos')
    // A. El Index no renderiza ningún detalle.
    expect(screen.queryByRole('heading', { name: 'Detalle del proyecto' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Volver al listado' })).toBeNull()
    await waitFor(() => expect(listarProyectosRh).toHaveBeenCalledTimes(1))
  })

  it('consultar un proyecto navega a /proyectos/:id y el catálogo desaparece', async () => {
    render(<App />)
    await abrirProyecto()

    expect(window.location.pathname).toBe('/proyectos/12')
    expect(consultarProyectoRh).toHaveBeenCalledWith('token-rh', 12)
    // A. El Show no renderiza el catálogo como bloque padre.
    expect(screen.queryByText('Catálogo de proyectos')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Consultar' })).toBeNull()
  })

  it('entrada directa (deep-link) a /proyectos/12 abre el Show sin pasar por /proyectos', async () => {
    window.history.replaceState(null, '', '/proyectos/12')
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Detalle del proyecto' }),
    ).toBeInTheDocument()
    expect(consultarProyectoRh).toHaveBeenCalledWith('token-rh', 12)
    expect(window.location.pathname).toBe('/proyectos/12')
    await waitFor(() =>
      expect(document.title).toBe('Proyecto 12 · Proyectos | Talento PluriOne'),
    )
    // La sección activa del shell sigue siendo Proyectos.
    expect(
      within(navegacion()).getByRole('button', { name: 'Proyectos' }),
    ).toHaveAttribute('aria-current', 'page')
    // El catálogo no se consultó: el Show es una página independiente.
    expect(listarProyectosRh).not.toHaveBeenCalled()
  })

  it('desde el Show, elegir Proyectos en el sidebar regresa al Index', async () => {
    render(<App />)
    await abrirProyecto()
    expect(window.location.pathname).toBe('/proyectos/12')

    irA('Proyectos')

    await waitFor(() => expect(window.location.pathname).toBe('/proyectos'))
    expect(screen.queryByRole('heading', { name: 'Detalle del proyecto' })).toBeNull()
    // El sidebar conserva UNA sola entrada «Proyectos» (sin «Detalle»):
    // las nueve entradas del shell RH (ocho §10 + Auditoría, Tarea C).
    expect(within(navegacion()).getAllByRole('button')).toHaveLength(9)
    expect(
      within(navegacion()).getByRole('button', { name: 'Proyectos' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('una ruta de Proyectos no válida se normaliza al Index', async () => {
    window.history.replaceState(null, '', '/proyectos/abc')
    render(<App />)

    await screen.findAllByRole('heading', { name: 'Proyectos', level: 1 })
    await waitFor(() => expect(window.location.pathname).toBe('/proyectos'))
    expect(screen.queryByRole('heading', { name: 'Detalle del proyecto' })).toBeNull()
  })

  it('entrada directa a un proyecto inexistente muestra el error y permite volver', async () => {
    vi.mocked(consultarProyectoRh).mockRejectedValue(
      Object.assign(new Error('Proyecto no encontrado.'), { estado: 404 }),
    )
    window.history.replaceState(null, '', '/proyectos/999')
    render(<App />)

    expect(
      await screen.findByText('No pudimos cargar el proyecto'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Volver al listado' }))
    await waitFor(() => expect(window.location.pathname).toBe('/proyectos'))
    expect(screen.queryByText('No pudimos cargar el proyecto')).toBeNull()
  })

  it('Back del navegador regresa al Index y Forward vuelve al Show', async () => {
    render(<App />)
    await abrirProyecto()
    expect(window.location.pathname).toBe('/proyectos/12')

    window.history.back()

    await waitFor(() => expect(window.location.pathname).toBe('/proyectos'))
    expect(screen.queryByRole('heading', { name: 'Detalle del proyecto' })).toBeNull()
    expect(document.title).toBe('Proyectos | Talento PluriOne')

    window.history.forward()

    await waitFor(() => expect(window.location.pathname).toBe('/proyectos/12'))
    expect(
      await screen.findByRole('heading', { name: 'Detalle del proyecto' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(document.title).toBe('Proyecto 12 · Proyectos | Talento PluriOne'),
    )
  })

  it('Back desde /proyectos hasta la raíz devuelve la sección inicial de RH', async () => {
    render(<App />)
    await irAProyectos()

    window.history.back()

    // La entrada anterior ('/') no es de Proyectos: el dashboard RH vuelve.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Empleados activos' })).toBeInTheDocument(),
    )
    expect(window.location.pathname).toBe('/')
  })

  it('Editar y Cancelar permanecen en /proyectos/:id (no existe /edit)', async () => {
    render(<App />)
    await abrirProyecto()

    fireEvent.click(screen.getByRole('button', { name: 'Editar proyecto' }))
    expect(
      await screen.findByRole('heading', { name: 'Editar proyecto' }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/proyectos/12')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(
      await screen.findByRole('heading', { name: 'Detalle del proyecto' }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/proyectos/12')
  })

  it('la URL de Proyectos no sobrevive al cierre de sesión', async () => {
    render(<App />)
    await abrirProyecto()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(
      await screen.findByRole('heading', { name: 'Inicia sesión' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it('REGRESIÓN (RH-02.2): la corrección administrativa sigue funcionando dentro del Show', async () => {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue({
      total: 1,
      pagina: 1,
      por_pagina: 20,
      items: [
        {
          id: 31,
          empleado_id: 7,
          empleado_nombre: 'Ana Ruiz',
          empleado_puesto: 'Desarrolladora de software',
          proyecto_id: 12,
          rol: 'Desarrollador',
          entregables: 'API de pagos',
          en_equipo: true,
          coordino_tareas: false,
          explico_a_publico_distinto: false,
          resolvio_problema: true,
          horas: 120,
          fecha_registro: '2026-03-02',
          proyecto: null,
          created_at: '2026-03-02T10:00:00+00:00',
          updated_at: '2026-03-02T10:00:00+00:00',
        },
      ],
    })
    vi.mocked(corregirParticipacion).mockResolvedValue({})
    render(<App />)
    await abrirProyecto()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Consultar participación' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Corregir participación' }),
    )
    fireEvent.change(screen.getByLabelText('Horas'), {
      target: { value: '200' },
    })
    fireEvent.change(screen.getByLabelText('Motivo'), {
      target: { value: 'Ajuste verificado con el empleado' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }))

    await waitFor(() => expect(corregirParticipacion).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText('Participación corregida'),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/proyectos/12')
  })
})



