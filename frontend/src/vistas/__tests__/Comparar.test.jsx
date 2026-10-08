// Sección RH → Comparar (PRD §20.5; SG §27/§995). APIs mockeadas.
//
// Qué se verifica aquí y NO debe romperse:
// - catálogo de SOLO activos con búsqueda q y paginación del contrato;
// - selección sin duplicados, conservada al paginar/buscar, sin tope máximo;
// - barra contextual SOLO con selección y botón habilitado con >= 2;
// - POST exacto con employee_ids en el orden de selección;
// - resultados fieles: cinco competencias con valor y etiqueta, DI tal cual,
//   experiencia como contexto separada, orden del backend sin reordenar;
// - sin 9-Box, ganador, ranking ni promedios;
// - 404/422 = rechazo completo legible; 401 cierra la sesión.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Comparar from '../Comparar.jsx'
import { compararEmpleados } from '../../api/comparacion.js'
import { listarEmpleados, POR_PAGINA_DEFECTO } from '../../api/empleados.js'

vi.mock('../../api/comparacion.js', () => ({
  compararEmpleados: vi.fn(),
}))

vi.mock('../../api/empleados.js', async () => {
  const original = await vi.importActual('../../api/empleados.js')
  return { ...original, listarEmpleados: vi.fn() }
})

const ACTIVOS = [
  { id: 1, nombre: 'Ana López', puesto: 'Analista de datos', area: 'TI', activo: true },
  { id: 2, nombre: 'Luis Pérez', puesto: 'Desarrollador', area: null, activo: true },
  { id: 3, nombre: 'Sara Ruiz', puesto: null, area: 'Datos', activo: true },
]

function pagina(items, { total = items.length, pagina: pag = 1 } = {}) {
  return { total, pagina: pag, por_pagina: POR_PAGINA_DEFECTO, items }
}

/** EmpleadoComparadoOut fiel al contrato (una competencia en DI a propósito). */
function comparado(id, nombre, sobre = {}) {
  return {
    empleado_id: id,
    nombre,
    puesto: 'Analista',
    area: 'TI',
    competencias: [
      { clave: 'desempeno_tecnico', estado: 'CALCULABLE', nivel: 4, valor: '72.50', etiqueta: 'Consolidado' },
      { clave: 'liderazgo', estado: 'CALCULABLE', nivel: 3, valor: '61.25', etiqueta: 'En crecimiento' },
      { clave: 'trabajo_equipo', estado: 'CALCULABLE', nivel: 5, valor: '88.00', etiqueta: 'Alto' },
      { clave: 'comunicacion', estado: 'INSUFFICIENT_DATA', nivel: null, valor: null, etiqueta: null },
      { clave: 'aprendizaje', estado: 'CALCULABLE', nivel: 2, valor: '45.10', etiqueta: 'En desarrollo' },
    ],
    experiencia: { fecha_ingreso: '2024-03-01', anios_antiguedad: '2.55', proyectos_unicos: 3 },
    ...sobre,
  }
}

const COMPARACION = {
  total: 2,
  items: [comparado(2, 'Luis Pérez'), comparado(1, 'Ana López')],
}

function ultimaConsulta() {
  return vi.mocked(listarEmpleados).mock.calls.at(-1)
}

beforeEach(() => {
  vi.mocked(listarEmpleados).mockReset()
  vi.mocked(compararEmpleados).mockReset()
  vi.mocked(listarEmpleados).mockResolvedValue(pagina(ACTIVOS))
  vi.mocked(compararEmpleados).mockResolvedValue(COMPARACION)
})

describe('Comparar — selección (paso 1)', () => {
  it('carga el catálogo de SOLO empleados activos al abrir', async () => {
    render(<Comparar token="token-rh" />)

    expect(await screen.findByText('Ana López')).toBeInTheDocument()
    const [token, filtros] = ultimaConsulta()
    expect(token).toBe('token-rh')
    expect(filtros.activo).toBe(true)
    expect(filtros.q).toBe('')
    expect(filtros.pagina).toBe(1)
  })

  it('sin selección no hay barra contextual; con 1 aparece deshabilitada', async () => {
    render(<Comparar token="token-rh" />)
    await screen.findByText('Ana López')

    expect(screen.queryByText(/seleccionad/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Comparar' })).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Ana López' }))

    expect(screen.getByText('1 empleado seleccionado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comparar' })).toBeDisabled()
  })

  it('con 2 o más la barra habilita Comparar y el conteo es plural', async () => {
    render(<Comparar token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Ana López' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Luis Pérez' }))

    expect(screen.getByText('2 empleados seleccionados')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comparar' })).toBeEnabled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Sara Ruiz' }))
    expect(screen.getByText('3 empleados seleccionados')).toBeInTheDocument()
  })

  it('alternar dos veces no duplica: el conteo vuelve al valor real', async () => {
    render(<Comparar token="token-rh" />)
    await screen.findByText('Ana López')

    const ana = screen.getByRole('checkbox', { name: 'Seleccionar a Ana López' })
    fireEvent.click(ana) // selecciona
    fireEvent.click(ana) // deselecciona
    expect(screen.queryByText(/seleccionad/)).toBeNull()

    fireEvent.click(ana) // selecciona de nuevo: sigue siendo 1, no 2
    expect(screen.getByText('1 empleado seleccionado')).toBeInTheDocument()
  })

  it('conserva la selección al paginar y al buscar', async () => {
    vi.mocked(listarEmpleados).mockResolvedValue(pagina(ACTIVOS, { total: 40 }))
    render(<Comparar token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Ana López' }))

    // Página 2: Ana no está en pantalla, pero la selección (y su conteo) viven.
    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }))
    await waitFor(() => expect(ultimaConsulta()[1].pagina).toBe(2))
    expect(screen.getByText('1 empleado seleccionado')).toBeInTheDocument()

    // Búsqueda: la selección sigue viva y la consulta lleva q y página 1.
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'ana' },
    })
    await waitFor(() => {
      expect(ultimaConsulta()[1].q).toBe('ana')
      expect(ultimaConsulta()[1].pagina).toBe(1)
    })
    expect(screen.getByText('1 empleado seleccionado')).toBeInTheDocument()
  })

  it('catálogo vacío por búsqueda muestra vacío diferenciado', async () => {
    render(<Comparar token="token-rh" />)
    await screen.findByText('Ana López')

    vi.mocked(listarEmpleados).mockResolvedValue(pagina([]))
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'noexiste' },
    })

    expect(
      await screen.findByText(
        'No hay empleados activos que coincidan con la búsqueda.',
      ),
    ).toBeInTheDocument()
  })

  it('error del catálogo con reintento, nunca cero registros', async () => {
    vi.mocked(listarEmpleados)
      .mockRejectedValueOnce(new Error('fallo'))
      .mockResolvedValueOnce(pagina(ACTIVOS))
    render(<Comparar token="token-rh" />)

    expect(
      await screen.findByText('No pudimos cargar los empleados activos'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(await screen.findByText('Ana López')).toBeInTheDocument()
  })
})

describe('Comparar — resultados (paso 2)', () => {
  /** Selecciona a Ana (1) y Sara (3), en ese orden, y compara. */
  async function compararAnaSara() {
    render(<Comparar token="token-rh" />)
    await screen.findByText('Ana López')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Ana López' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Sara Ruiz' }))
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }))
    await screen.findByText('Luis Pérez')
  }

  it('envía el POST exacto con employee_ids en el orden de selección', async () => {
    render(<Comparar token="token-rh" />)
    await screen.findByText('Ana López')

    // Orden deliberadamente NO alfabético: 3 primero, luego 1.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Sara Ruiz' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Ana López' }))
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }))

    await waitFor(() => expect(compararEmpleados).toHaveBeenCalledTimes(1))
    expect(compararEmpleados).toHaveBeenCalledWith('token-rh', [3, 1])
  })

  it('muestra las cinco competencias con valores y etiquetas del contrato', async () => {
    await compararAnaSara()

    const tarjeta = screen
      .getByText('Luis Pérez')
      .closest('.comparar-empleado')
    const listaCompetencias = tarjeta.querySelector('.comparar-empleado__competencias')
    const competencias = within(listaCompetencias).getAllByRole('definition')
    expect(competencias.map((dd) => dd.textContent)).toEqual([
      '72.50 · Consolidado',
      '61.25 · En crecimiento',
      '88.00 · Alto',
      'Datos insuficientes.',
      '45.10 · En desarrollo',
    ])
    expect(within(listaCompetencias).getByText('Desempeño técnico')).toBeInTheDocument()
    expect(within(listaCompetencias).getByText('Capacidad de aprendizaje')).toBeInTheDocument()
  })

  it('Datos insuficientes se preserva tal cual: sin nivel 0 y sin hueco', async () => {
    await compararAnaSara()

    expect(screen.getAllByText('Datos insuficientes.')).toHaveLength(2)
    expect(screen.queryByText('0 · ')).toBeNull()
  })

  it('la experiencia aparece SOLO como contexto, separada y con su nota', async () => {
    await compararAnaSara()

    const tarjetas = document.querySelectorAll('.comparar-empleado')
    expect(tarjetas).toHaveLength(2)
    for (const tarjeta of tarjetas) {
      const experiencia = tarjeta.querySelector('.comparar-empleado__experiencia')
      expect(experiencia).not.toBeNull()
      expect(within(experiencia).getByText('Experiencia (contexto)')).toBeInTheDocument()
      expect(within(experiencia).getByText('2.55 años')).toBeInTheDocument()
      expect(within(experiencia).getByText('3')).toBeInTheDocument()
      expect(
        within(experiencia).getByText(/no es una competencia/i),
      ).toBeInTheDocument()
    }
  })

  it('muestra los resultados en el orden del backend, sin reordenar', async () => {
    await compararAnaSara()

    // COMPARACION.items = [Luis (2), Ana (1)]: ese orden se conserva tal cual.
    const nombres = [...document.querySelectorAll('.comparar-empleado h3')].map(
      (h3) => h3.textContent,
    )
    expect(nombres).toEqual(['Luis Pérez', 'Ana López'])
  })

  it('sin 9-Box, sin ganador, sin ranking y sin promedios', async () => {
    await compararAnaSara()

    // La prohibición es sobre los RESULTADOS: ninguna tarjeta introduce
    // 9-Box, veredictos ni agregados que el contrato no define.
    const resultados = document.querySelector('.comparar-resultados')
    expect(resultados).not.toBeNull()
    expect(within(resultados).queryByText(/9-box/i)).toBeNull()
    expect(
      within(resultados).queryByText(/ganador|mejor|top|ranking|promedio|score/i),
    ).toBeNull()
  })

  it('404 rechaza la comparación completa con mensaje legible y reintento', async () => {
    vi.mocked(compararEmpleados)
      .mockRejectedValueOnce(
        Object.assign(new Error('Empleado no encontrado.'), { estado: 404 }),
      )
      .mockResolvedValueOnce(COMPARACION)
    await compararAnaSara().catch(() => {})

    expect(
      await screen.findByText('No pudimos comparar: algún empleado ya no está disponible'),
    ).toBeInTheDocument()
    // Sin resultados parciales: ninguna tarjeta se renderiza.
    expect(document.querySelector('.comparar-empleado')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByText('Luis Pérez')).toBeInTheDocument()
  })

  it('422 por empleado inactivo rechaza la comparación COMPLETA, sin exclusión silenciosa', async () => {
    vi.mocked(compararEmpleados).mockRejectedValue(
      Object.assign(
        new Error('El empleado 3 está inactivo y no puede formar parte de la comparación.'),
        { estado: 422 },
      ),
    )
    await compararAnaSara().catch(() => {})

    expect(
      await screen.findByText('No pudimos comparar: la selección dejó de ser válida'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'El empleado 3 está inactivo y no puede formar parte de la comparación.',
      ),
    ).toBeInTheDocument()
    expect(document.querySelector('.comparar-empleado')).toBeNull()

    // Volver a la selección conserva la posibilidad de corregirla.
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar selección' }))
    expect(await screen.findByText('Ana López')).toBeInTheDocument()
  })

  it('401 cierra la sesión sin mostrar estado de error', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(compararEmpleados).mockRejectedValueOnce(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    render(<Comparar token="token-rh" alSesionExpirada={alSesionExpirada} />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Ana López' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Luis Pérez' }))
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }))

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/No pudimos comparar/)).toBeNull()
  })
})