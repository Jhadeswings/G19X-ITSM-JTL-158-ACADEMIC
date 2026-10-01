// Shell y navegación del rol Empleado (Style Guide §7, §10, §11; PRD §21).
// La API se mockea: sin llamadas reales al backend.

import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { limpiarSesion, obtenerSesion } from '../api/autenticacion.js'
import { obtenerCuenta } from '../api/cuenta.js'
import { obtenerProgreso } from '../api/progreso.js'
import { obtenerEmpleadosActivos, obtenerProyectosActivos, obtenerAtencionRequerida, obtenerDistribucionCompetencia } from '../api/dashboardRh.js'
import { listarEmpleados, POR_PAGINA_DEFECTO } from '../api/empleados.js'
import App from '../App.jsx'
import { SECCIONES_EMPLEADO, SECCIONES_RH } from '../navegacion.js'
import { crearRespuesta } from '../vistas/__tests__/ayuda.js'

vi.mock('../api/autenticacion.js', () => ({
  actualizarSesion: vi.fn(),
  cambiarPassword: vi.fn(),
  guardarSesion: vi.fn(),
  iniciarSesion: vi.fn(),
  limpiarSesion: vi.fn(),
  obtenerSesion: vi.fn(),
}))

vi.mock('../api/cuenta.js', () => ({ obtenerCuenta: vi.fn() }))
vi.mock('../api/progreso.js', () => ({ obtenerProgreso: vi.fn() }))
vi.mock('../api/dashboardRh.js', () => ({ obtenerAtencionRequerida: vi.fn(), obtenerDistribucionCompetencia: vi.fn(), obtenerEmpleadosActivos: vi.fn(), obtenerProyectosActivos: vi.fn() }))
vi.mock('../api/empleados.js', async () => {
  const original = await vi.importActual('../api/empleados.js')
  return { ...original, listarEmpleados: vi.fn() }
})

const EMPLEADO = { token: 'token-empleado', rol: 'EMPLEADO', mustChangePassword: false }
const EMPLEADO_TEMPORAL = { token: 'token-temporal', rol: 'EMPLEADO', mustChangePassword: true }
const RH = { token: 'token-rh', rol: 'RH', mustChangePassword: false }

beforeEach(() => {
  vi.mocked(obtenerSesion).mockReset()
  vi.mocked(limpiarSesion).mockReset()
  vi.mocked(obtenerCuenta).mockReset()
  vi.mocked(obtenerProgreso).mockReset()
  vi.mocked(obtenerEmpleadosActivos).mockReset()
  vi.mocked(obtenerProyectosActivos).mockReset()
  vi.mocked(obtenerAtencionRequerida).mockReset()
  vi.mocked(obtenerDistribucionCompetencia).mockReset()
  vi.mocked(listarEmpleados).mockReset()
  vi.mocked(listarEmpleados).mockResolvedValue({
    total: 12,
    pagina: 1,
    por_pagina: POR_PAGINA_DEFECTO,
    items: [
      { id: 1, nombre: 'Ana López', puesto: 'Analista', area: 'TI', activo: true },
      { id: 2, nombre: 'Luis Pérez', puesto: 'Desarrollador', area: 'Datos', activo: false },
    ],
  })
  vi.mocked(obtenerCuenta).mockResolvedValue({
    email: 'persona@empresa.dev',
    empleado_nombre: 'Ana López',
  })
  vi.mocked(obtenerProgreso).mockResolvedValue(crearRespuesta())
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
})

function navegacion() {
  return screen.getByRole('navigation', { name: 'Navegación principal' })
}

function abrir(seccion) {
  fireEvent.click(within(navegacion()).getByRole('button', { name: seccion }))
}

describe('Shell de Empleado — layout', () => {
  it('muestra las seis secciones del Style Guide §10 en orden', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)
    await screen.findByRole('heading', { name: 'Competencias' })

    const etiquetas = within(navegacion())
      .getAllByRole('button')
      .map((boton) => boton.textContent)

    expect(etiquetas).toEqual(SECCIONES_EMPLEADO.map((seccion) => seccion.titulo))
  })

  it('abre Mi progreso por defecto (única vista funcional)', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Competencias' }),
    ).toBeInTheDocument()
    expect(
      within(navegacion()).getByRole('button', { name: 'Mi progreso' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(obtenerProgreso).toHaveBeenCalledWith('token-empleado')
  })

  it('el header muestra el título de la sección y la cuenta autenticada', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mi progreso' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Ana López')).toBeInTheDocument()
    expect(obtenerCuenta).toHaveBeenCalledWith('token-empleado')
  })
})

describe('Shell de Empleado — navegación entre secciones', () => {
  it('las secciones no implementadas muestran un estado temporal neutro', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)
    await screen.findByRole('heading', { name: 'Competencias' })

    abrir('Mis capacitaciones')

    expect(
      await screen.findByText('«Mis capacitaciones» todavía no está disponible'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Competencias' }),
    ).not.toBeInTheDocument()
    // El estado temporal no inventa datos ni vuelve a consultar la API.
    expect(obtenerProgreso).toHaveBeenCalledTimes(1)
  })

  it('Mis proyectos abre su vista real (§21.3), no el estado temporal', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)
    await screen.findByRole('heading', { name: 'Competencias' })

    abrir('Mis proyectos')

    expect(
      await screen.findByRole('heading', { name: /Buscar el proyecto/ }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del proyecto')).toBeInTheDocument()
    // La búsqueda es obligatoria antes de crear: sin resultados todavía no
    // existe ninguna opción de alta ni dato simulado.
    expect(
      screen.queryByRole('button', { name: 'Crear proyecto' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('«Mis proyectos» todavía no está disponible'),
    ).not.toBeInTheDocument()
  })

  it('las cuatro secciones pendientes tienen su propio estado temporal', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)
    await screen.findByRole('heading', { name: 'Competencias' })

    for (const titulo of [
      'Inicio',
      'Mis capacitaciones',
      'Mi historial',
      'Mi cuenta',
    ]) {
      abrir(titulo)
      expect(
        screen.getByText(`«${titulo}» todavía no está disponible`),
      ).toBeInTheDocument()
    }
    expect(obtenerProgreso).toHaveBeenCalledTimes(1)
  })

  it('marca la sección activa y actualiza el título del header', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)
    await screen.findByRole('heading', { name: 'Competencias' })

    abrir('Mi cuenta')

    expect(
      screen.getByRole('heading', { level: 1, name: 'Mi cuenta' }),
    ).toBeInTheDocument()
    expect(
      within(navegacion()).getByRole('button', { name: 'Mi cuenta' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(navegacion()).getByRole('button', { name: 'Mi progreso' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('volver a Mi progreso recupera la vista funcional', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)
    await screen.findByRole('heading', { name: 'Competencias' })

    abrir('Mi historial')
    abrir('Mi progreso')

    expect(
      await screen.findByRole('heading', { name: 'Competencias' }),
    ).toBeInTheDocument()
  })

  it('el cierre de sesión sigue funcionando desde cualquier sección', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    render(<App />)
    await screen.findByRole('heading', { name: 'Competencias' })
    abrir('Mi cuenta')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(
      await screen.findByRole('heading', { name: 'Inicia sesión' }),
    ).toBeInTheDocument()
    expect(limpiarSesion).toHaveBeenCalled()
  })
})

describe('Shell de Empleado — sesión y roles', () => {
  it('el empleado con credencial temporal sigue en el primer acceso, sin shell', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO_TEMPORAL)
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Primer acceso' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(obtenerProgreso).not.toHaveBeenCalled()
  })

  it('RH ve su propio shell, no el del Empleado', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(RH)
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Empleados activos' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Mi progreso' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Las vistas de RH todavía no están disponibles'),
    ).not.toBeInTheDocument()
    expect(obtenerProgreso).not.toHaveBeenCalled()
    expect(obtenerCuenta).not.toHaveBeenCalled()
  })

  it('si la cuenta no está disponible, el header no inventa identidad', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    vi.mocked(obtenerCuenta).mockRejectedValue(
      Object.assign(new Error('sin conexión'), { estado: 0 }),
    )
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Competencias' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Ana López')).not.toBeInTheDocument()
  })

  it('un 401 al consultar la cuenta cierra la sesión', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(EMPLEADO)
    vi.mocked(obtenerCuenta).mockRejectedValue(
      Object.assign(new Error('Credenciales inválidas.'), { estado: 401 }),
    )
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Inicia sesión' }),
    ).toBeInTheDocument()
    expect(limpiarSesion).toHaveBeenCalled()
  })

describe('Shell de RH — navegación', () => {
  it('muestra las ocho secciones del Style Guide §10 en orden', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(RH)
    render(<App />)
    await screen.findByRole('heading', { name: 'Empleados activos' })

    const etiquetas = within(navegacion())
      .getAllByRole('button')
      .map((boton) => boton.textContent)

    expect(etiquetas).toEqual(SECCIONES_RH.map((seccion) => seccion.titulo))
    expect(etiquetas).toEqual([
      'Inicio',
      'Empleados',
      'Proyectos',
      'Búsqueda',
      'Comparar',
      'Mentoría',
      'Brechas',
      'Evaluaciones',
    ])
  })

  it('abre Inicio por defecto y muestra el Dashboard RH', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(RH)
    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Empleados activos' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Atención requerida' })).toHaveLength(2)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('las secciones no implementadas reutilizan SeccionTemporal', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(RH)
    render(<App />)
    await screen.findByRole('heading', { name: 'Empleados activos' })

    for (const titulo of [
      'Proyectos',
      'Búsqueda',
      'Comparar',
      'Mentoría',
      'Brechas',
      'Evaluaciones',
    ]) {
      abrir(titulo)
      expect(
        screen.getByText(`«${titulo}» todavía no está disponible`),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Crear empleado' }),
      ).not.toBeInTheDocument()
    }
    expect(obtenerProgreso).not.toHaveBeenCalled()
  })

  it('volver a Empleados recupera el catálogo de empleados', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(RH)
    render(<App />)
    await screen.findByRole('heading', { name: 'Empleados activos' })

    abrir('Mentoría')
    abrir('Empleados')

    // La sección ahora es un catálogo: el alta se entra con una acción propia.
    expect(screen.getByRole('button', { name: 'Registrar empleado' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear empleado' })).not.toBeInTheDocument()
    expect(
      within(navegacion()).getByRole('button', { name: 'Empleados' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('"Ver empleados" lleva al listado, no al formulario de alta', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(RH)
    vi.mocked(obtenerAtencionRequerida).mockResolvedValue({
      total: 1,
      items: [{ empleado_id: 1, nombre: 'Ana López', motivos: ['PERFIL_INCOMPLETO'] }],
    })
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Ver empleados' }))

    // El header y el SectionHeader de la vista titulan la sección (mismo
    // patrón que InicioRH), así que se verifican las dos coincidencias.
    expect(
      (await screen.findAllByRole('heading', { level: 1, name: 'Empleados' })).length,
    ).toBeGreaterThan(0)
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar empleado' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear empleado' })).not.toBeInTheDocument()
  })

  it('el cierre de sesión sigue funcionando desde el shell de RH', async () => {
    vi.mocked(obtenerSesion).mockReturnValue(RH)
    render(<App />)
    await screen.findByRole('heading', { name: 'Empleados activos' })

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(
      await screen.findByRole('heading', { name: 'Inicia sesión' }),
    ).toBeInTheDocument()
    expect(limpiarSesion).toHaveBeenCalled()
  })
})

})
