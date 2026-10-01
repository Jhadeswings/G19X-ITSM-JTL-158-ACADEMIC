// Sección Empleado → Mis capacitaciones (PRD §21.4; Style Guide §19, §21, §31,
// §33). La API se mockea: sin llamadas reales al backend.
//
// Qué se verifica aquí y NO debe romperse con cambios de diseño:
// - la tarea principal "Registrar capacitación" con EXACTAMENTE tres campos;
// - el payload del POST limitado al contrato (nombre, fecha, completado);
// - los estados de carga, vacío, error con reintento y éxito;
// - la paginación calculada con `total`, no con `items.length`;
// - el 401 delegando en `alSesionExpirada`;
// - la ausencia de edición, eliminación, gráficas y puntuaciones.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  POR_PAGINA_DEFECTO,
  crearCapacitacion,
  listarCapacitaciones,
} from '../../api/capacitaciones.js'
import MisCapacitaciones from '../MisCapacitaciones.jsx'

vi.mock('../../api/capacitaciones.js', async () => {
  const original = await vi.importActual('../../api/capacitaciones.js')
  return { ...original, listarCapacitaciones: vi.fn(), crearCapacitacion: vi.fn() }
})

/** Ítem fiel a CapacitacionOut del backend. */
function item(over = {}) {
  return {
    id: 9,
    empleado_id: 7,
    nombre: 'Curso de Python',
    fecha: '2026-03-10',
    completado: true,
    created_at: '2026-03-11T09:00:00',
    updated_at: '2026-03-11T09:00:00',
    ...over,
  }
}

/** Página fiel a CapacitacionPageOut. */
function pagina(items, { total = items.length, pagina = 1, porPagina = POR_PAGINA_DEFECTO } = {}) {
  return { total, pagina, por_pagina: porPagina, items }
}

const CAPACITACIONES = [
  item({ id: 9, nombre: 'Curso de Python', fecha: '2026-03-10', completado: true }),
  item({ id: 8, nombre: ' taller de SQL', fecha: '2026-02-01', completado: false }),
]

/** Último payload enviado al cliente de creación. */
function ultimoPayload() {
  return vi.mocked(crearCapacitacion).mock.calls.at(-1)[1]
}

/** Rellena el formulario con los tres campos. */
function rellenar({ nombre = 'Curso de Python', fecha = '2026-03-10', completado } = {}) {
  if (nombre !== undefined) fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: nombre } })
  if (fecha !== undefined) fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: fecha } })
  if (completado !== undefined) {
    fireEvent.click(screen.getByLabelText('Completado'))
  }
}

beforeEach(() => {
  vi.mocked(listarCapacitaciones).mockReset()
  vi.mocked(crearCapacitacion).mockReset()
  vi.mocked(listarCapacitaciones).mockResolvedValue(pagina(CAPACITACIONES))
  vi.mocked(crearCapacitacion).mockResolvedValue(item())
})

describe('MisCapacitaciones — carga y listado', () => {
  it('muestra el encabezado de la sección', async () => {
    render(<MisCapacitaciones token="token-empleado" />)

    expect(
      screen.getByRole('heading', { name: 'Mis capacitaciones', level: 1 }),
    ).toBeInTheDocument()
    await screen.findByText('Curso de Python')
  })

  it('consulta las capacitaciones con el token al abrir la sección', async () => {
    render(<MisCapacitaciones token="token-empleado" />)

    await waitFor(() => expect(listarCapacitaciones).toHaveBeenCalledTimes(1))
    const [token, opciones] = vi.mocked(listarCapacitaciones).mock.calls[0]
    expect(token).toBe('token-empleado')
    expect(opciones.pagina).toBe(1)
    expect(opciones.porPagina).toBe(POR_PAGINA_DEFECTO)
  })

  it('muestra un estado de carga antes de resolver la consulta', async () => {
    render(<MisCapacitaciones token="token-empleado" />)

    expect(screen.getByText('Cargando capacitaciones…')).toBeInTheDocument()
    await screen.findByText('Curso de Python')
  })

  it('muestra nombre, fecha y estado de completado de cada capacitación', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    const tarjetas = document.querySelectorAll('.capacitacion-card')
    expect(tarjetas).toHaveLength(2)

    // Nombre, fecha y estado en texto: nunca solo color.
    expect(within(tarjetas[0]).getByText('Curso de Python')).toBeInTheDocument()
    expect(within(tarjetas[0]).getByText('2026-03-10')).toBeInTheDocument()
    expect(within(tarjetas[0]).getByText('Completado')).toBeInTheDocument()

    expect(within(tarjetas[1]).getByText('taller de SQL')).toBeInTheDocument()
    expect(within(tarjetas[1]).getByText('2026-02-01')).toBeInTheDocument()
    expect(within(tarjetas[1]).getByText('En proceso')).toBeInTheDocument()
  })

  it('respeta el orden que devuelve el backend, sin reordenar', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    const nombres = [...document.querySelectorAll('.capacitacion-card__nombre')].map(
      (nodo) => nodo.textContent,
    )
    expect(nombres).toEqual(CAPACITACIONES.map((c) => c.nombre))
  })

  it('muestra el estado vacío cuando no hay capacitaciones', async () => {
    vi.mocked(listarCapacitaciones).mockResolvedValue(pagina([]))

    render(<MisCapacitaciones token="token-empleado" />)

    expect(
      await screen.findByText('Todavía no has registrado capacitaciones.'),
    ).toBeInTheDocument()
  })

  it('el estado vacío se decide por total = 0, no por una página vacía', async () => {
    // Página 2 vacía pero con total > 0: hay registros, no es un estado vacío.
    vi.mocked(listarCapacitaciones).mockResolvedValue(
      pagina([], { total: 25, pagina: 2, porPagina: 20 }),
    )

    render(<MisCapacitaciones token="token-empleado" />)

    // Con total > 0 hay paginación aunque esta página venga sin ítems.
    expect(
      await screen.findByRole('navigation', { name: 'Paginación de capacitaciones' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Todavía no has registrado capacitaciones.'),
    ).not.toBeInTheDocument()
  })

  it('muestra error de carga y reintenta al pulsar "Intentar de nuevo"', async () => {
    vi.mocked(listarCapacitaciones).mockRejectedValueOnce(
      Object.assign(new Error('Fallo'), { estado: 500 }),
    )

    render(<MisCapacitaciones token="token-empleado" />)

    expect(
      await screen.findByText('No pudimos cargar tus capacitaciones'),
    ).toBeInTheDocument()

    await waitFor(() => expect(listarCapacitaciones).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    await waitFor(() => expect(listarCapacitaciones).toHaveBeenCalledTimes(2))
    await screen.findByText('Curso de Python')
  })

  it('el 401 al listar delega en alSesionExpirada', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(listarCapacitaciones).mockRejectedValue(
      Object.assign(new Error('Sesión inválida'), { estado: 401 }),
    )

    render(<MisCapacitaciones token="token-empleado" alSesionExpirada={alSesionExpirada} />)

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('No pudimos cargar tus capacitaciones'),
    ).not.toBeInTheDocument()
  })
})

describe('MisCapacitaciones — formulario de registro', () => {
  it('la tarea principal es registrar, con exactamente tres campos', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    expect(screen.getByRole('heading', { name: 'Registrar capacitación' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
    expect(screen.getByLabelText('Completado')).toBeInTheDocument()

    // Solo esos tres: nada más se captura en el formulario.
    const formulario = document.querySelector('form')
    expect(within(formulario).getAllByRole('textbox')).toHaveLength(1)
    expect(formulario.querySelectorAll('input[type="date"]')).toHaveLength(1)
    expect(formulario.querySelectorAll('input[type="checkbox"]')).toHaveLength(1)
  })

  it('exige el nombre antes de enviar', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    rellenar({ nombre: '   ', fecha: '2026-03-10' })
    fireEvent.click(screen.getByRole('button', { name: /Registrar capacitación/ }))

    expect(
      await screen.findByText('Escribe el nombre de la capacitación.'),
    ).toBeInTheDocument()
    expect(crearCapacitacion).not.toHaveBeenCalled()
  })

  it('exige la fecha antes de enviar', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    rellenar({ nombre: 'Curso de Python', fecha: '' })
    fireEvent.click(screen.getByRole('button', { name: /Registrar capacitación/ }))

    expect(
      await screen.findByText('Indica la fecha de la capacitación.'),
    ).toBeInTheDocument()
    expect(crearCapacitacion).not.toHaveBeenCalled()
  })

  it('envía el POST con SOLO nombre, fecha y completado', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    rellenar({ nombre: '  Curso de Python  ', fecha: '2026-03-10', completado: true })
    fireEvent.click(screen.getByRole('button', { name: /Registrar capacitación/ }))

    await waitFor(() => expect(crearCapacitacion).toHaveBeenCalledTimes(1))
    const [token, payload] = vi.mocked(crearCapacitacion).mock.calls[0]
    expect(token).toBe('token-empleado')
    expect(payload).toEqual({
      nombre: 'Curso de Python',
      fecha: '2026-03-10',
      completado: true,
    })
  })

  it('NO envía campos extra: ni id, ni empleado_id, ni created_at/updated_at', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    rellenar({ fecha: '2026-03-10' })
    fireEvent.click(screen.getByRole('button', { name: /Registrar capacitación/ }))

    await waitFor(() => expect(crearCapacitacion).toHaveBeenCalledTimes(1))
    const payload = ultimoPayload()
    expect(Object.keys(payload)).toEqual(['nombre', 'fecha', 'completado'])
    for (const prohibido of ['id', 'empleado_id', 'created_at', 'updated_at']) {
      expect(payload).not.toHaveProperty(prohibido)
    }
  })

  it('completado puede viajar en false sin cambiar nada más', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    expect(screen.getByLabelText('Completado')).not.toBeChecked()
    rellenar({ fecha: '2026-03-10' })
    fireEvent.click(screen.getByRole('button', { name: /Registrar capacitación/ }))

    await waitFor(() => expect(crearCapacitacion).toHaveBeenCalledTimes(1))
    expect(ultimoPayload().completado).toBe(false)
  })

  it('el estado enviando evita un doble envío', async () => {
    let resolver
    vi.mocked(crearCapacitacion).mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve
      }),
    )

    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    rellenar({ fecha: '2026-03-10' })
    const boton = screen.getByRole('button', { name: /Registrar capacitación/ })
    fireEvent.click(boton)

    await waitFor(() => expect(boton).toBeDisabled())
    fireEvent.click(boton)
    expect(crearCapacitacion).toHaveBeenCalledTimes(1)

    resolver(item())
    await waitFor(() => expect(crearCapacitacion).toHaveBeenCalledTimes(1))
  })

  it('confirma el éxito y recarga la lista con el patrón existente', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')
    await waitFor(() => expect(listarCapacitaciones).toHaveBeenCalledTimes(1))

    rellenar({ fecha: '2026-03-10' })
    fireEvent.click(screen.getByRole('button', { name: /Registrar capacitación/ }))

    expect(await screen.findByText('Registramos «Curso de Python».')).toBeInTheDocument()
    // Tras registrar se vuelve a listar: el orden y la paginación son del backend.
    await waitFor(() => expect(listarCapacitaciones).toHaveBeenCalledTimes(2))
  })

  it('limpia el formulario tras registrar correctamente', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    rellenar({ fecha: '2026-03-10' })
    fireEvent.click(screen.getByRole('button', { name: /Registrar capacitación/ }))

    await screen.findByText('Registramos «Curso de Python».')
    expect(screen.getByLabelText('Nombre')).toHaveValue('')
    expect(screen.getByLabelText('Fecha')).toHaveValue('')
  })

  it('muestra el mensaje del backend cuando el registro devuelve 422', async () => {
    vi.mocked(crearCapacitacion).mockRejectedValue(
      Object.assign(new Error('Algunos datos enviados no son válidos.'), { estado: 422 }),
    )

    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    rellenar({ fecha: '2026-03-10' })
    fireEvent.click(screen.getByRole('button', { name: /Registrar capacitación/ }))

    expect(
      await screen.findByText('Algunos datos enviados no son válidos.'),
    ).toBeInTheDocument()
  })

  it('el 401 al registrar delega en alSesionExpirada', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(crearCapacitacion).mockRejectedValue(
      Object.assign(new Error('Sesión inválida'), { estado: 401 }),
    )

    render(
      <MisCapacitaciones token="token-empleado" alSesionExpirada={alSesionExpirada} />,
    )
    await screen.findByText('Curso de Python')

    rellenar({ fecha: '2026-03-10' })
    fireEvent.click(screen.getByRole('button', { name: /Registrar capacitación/ }))

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
  })
})

describe('MisCapacitaciones — paginación', () => {
  it('no muestra paginación cuando todo cabe en una sola página', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    expect(screen.queryByLabelText('Paginación de capacitaciones')).not.toBeInTheDocument()
  })

  it('el rango se calcula con total y por_pagina, no con items.length', async () => {
    vi.mocked(listarCapacitaciones).mockResolvedValue(
      pagina(CAPACITACIONES, { total: 42, pagina: 1, porPagina: 20 }),
    )

    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    // Solo 2 ítems reales, pero el rango 1–20 de 42 viene del backend.
    const paginacion = screen.getByRole('navigation', { name: 'Paginación de capacitaciones' })
    expect(paginacion).toHaveTextContent('Mostrando')
    expect(paginacion).toHaveTextContent('1')
    expect(paginacion).toHaveTextContent('20')
    expect(paginacion).toHaveTextContent('42')
    expect(document.querySelectorAll('.capacitacion-card')).toHaveLength(2)
  })

  it('cambia de página y vuelve a listar con la nueva página', async () => {
    vi.mocked(listarCapacitaciones).mockResolvedValue(
      pagina(CAPACITACIONES, { total: 42, pagina: 1, porPagina: 20 }),
    )

    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')
    await waitFor(() => expect(listarCapacitaciones).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByLabelText('Página 2'))

    await waitFor(() => expect(listarCapacitaciones).toHaveBeenCalledTimes(2))
    const [, opciones] = vi.mocked(listarCapacitaciones).mock.calls.at(-1)
    expect(opciones.pagina).toBe(2)
    expect(opciones.porPagina).toBe(POR_PAGINA_DEFECTO)
  })

  it('el botón "Página siguiente" también cambia de página', async () => {
    vi.mocked(listarCapacitaciones).mockResolvedValue(
      pagina(CAPACITACIONES, { total: 42, pagina: 1, porPagina: 20 }),
    )

    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    fireEvent.click(screen.getByLabelText('Página siguiente'))

    await waitFor(() => expect(listarCapacitaciones).toHaveBeenCalledTimes(2))
    expect(vi.mocked(listarCapacitaciones).mock.calls.at(-1)[1].pagina).toBe(2)
  })
})

describe('MisCapacitaciones — lo que la vista NO ofrece', () => {
  it('no existe UI de editar una capacitación', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    expect(screen.queryByRole('button', { name: /Editar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Actualizar/i })).not.toBeInTheDocument()
  })

  it('no existe UI de eliminar una capacitación', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    expect(screen.queryByRole('button', { name: /Eliminar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Borrar/i })).not.toBeInTheDocument()
  })

  it('no muestra gráficas, barras, gauges ni puntuaciones', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    // Las TrainingCard son solo texto: ni SVG, ni canvas, ni gauges.
    for (const tarjeta of document.querySelectorAll('.capacitacion-card')) {
      expect(tarjeta.querySelector('svg')).toBeNull()
      expect(tarjeta.querySelector('canvas')).toBeNull()
      expect(tarjeta.querySelector('meter')).toBeNull()
      expect(tarjeta.querySelector('progress')).toBeNull()
      expect(tarjeta.querySelector('[role="img"]')).toBeNull()
      expect(tarjeta.querySelector('style')).toBeNull()
    }

    // El único SVG de la pantalla es el icono decorativo del botón de acción.
    const iconos = document.querySelectorAll('.mis-capacitaciones svg')
    for (const icono of iconos) {
      expect(icono).toHaveAttribute('aria-hidden', 'true')
    }

    // Ningún texto sugiere puntuación, nivel o porcentaje.
    expect(document.body.textContent).not.toMatch(
      /puntaje|porcentaje|nivel|competencia|%/i,
    )
  })

  it('no inventa navegación ni detalle de una capacitación', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container().querySelectorAll('a[href]').length).toBe(0)
  })

  it('no aplica filtro por año: la fecha solo se muestra como dato', async () => {
    render(<MisCapacitaciones token="token-empleado" />)
    await screen.findByText('Curso de Python')

    expect(screen.queryByLabelText(/año/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})

/** Contenedor renderizado en el test anterior. */
function container() {
  return document.body
}




