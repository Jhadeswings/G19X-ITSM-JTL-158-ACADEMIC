// Sección RH → Proyectos — SHOW /proyectos/:id (RH-02.3; PRD §20.3, §12;
// ET §6–§8, §25, §31). La API se mockea: sin llamadas reales al backend.
//
// Qué se verifica aquí y NO debe romperse:
// - el id viene EXCLUSIVAMENTE de la ruta (deep-link directo /proyectos/3);
// - ficha con todos sus campos y neutro «—» para ausentes;
// - «‹ Volver al listado» navega al catálogo; SIN X y SIN «Cerrar»;
// - breadcrumb «Proyectos / nombre» (Style Guide §11);
// - edición SOLO de los campos permitidos, envío EXCLUSIVO de cambios,
//   PATCH exitoso legible y errores 409/500; Escape = Cancelar;
// - participantes (RH-02.1): tabla, expansión, paginación, 401;
// - corrección administrativa de participación (RH-02.2) intacta, con motivo
//   OBLIGATORIO, indicadores alineados y sin referencias «§» visibles
//   (RH-02.3.4);
// - la URL permanece /proyectos/:id al editar/cancelar (no existe /edit).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import {
  actualizarProyectoRh,
  consultarProyectoRh,
  listarProyectosRh,
} from '../../api/proyectos.js'
import {
  corregirParticipacion,
  listarParticipacionesDeProyecto,
} from '../../api/participaciones.js'
import Proyectos from '../Proyectos.jsx'
import ProyectoDetalle from '../ProyectoDetalle.jsx'

vi.mock('../../api/proyectos.js', async () => {
  const original = await vi.importActual('../../api/proyectos.js')
  return {
    ...original,
    listarProyectosRh: vi.fn(),
    consultarProyectoRh: vi.fn(),
    actualizarProyectoRh: vi.fn(),
  }
})

vi.mock('../../api/participaciones.js', async () => {
  const original = await vi.importActual('../../api/participaciones.js')
  return {
    ...original,
    listarParticipacionesDeProyecto: vi.fn(),
    corregirParticipacion: vi.fn(),
  }
})

/** Proyecto fiel a `ProyectoOut`. */
function proyecto(id, sobre = {}) {
  return {
    id,
    nombre: `Proyecto ${id}`,
    nombre_normalizado: `proyecto ${id}`,
    area: 'Tecnología',
    cliente: 'Cliente interno',
    estado: 'EN_PROCESO',
    created_at: '2026-01-15T10:00:00+00:00',
    updated_at: '2026-01-15T10:00:00+00:00',
    ...sobre,
  }
}

const CATALOGO = {
  total: 2,
  pagina: 1,
  por_pagina: 20,
  items: [
    proyecto(1),
    proyecto(2, { estado: 'COMPLETADO', area: null, cliente: null }),
  ],
}

/** Participación fiel a `ParticipacionOut` con identificación RH-02.1. */
function participacion(id, sobre = {}) {
  return {
    id,
    empleado_id: id + 10,
    empleado_nombre: `Ana Ruiz ${id}`,
    empleado_puesto: 'Desarrolladora de software',
    proyecto_id: 1,
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
    ...sobre,
  }
}

const PARTICIPANTES_VACIOS = { total: 0, pagina: 1, por_pagina: 20, items: [] }

/** Sonda de ruta: expone el pathname actual del router en pantalla. */
function Sonda() {
  const { pathname } = useLocation()
  return <p data-testid="sonda-ruta">{pathname}</p>
}

/**
 * Render con las DOS rutas reales: la entrada decide si se monta el Index
 * o el Show. Un deep-link directo (/proyectos/3) monta el Show sin pasar
 * por el catálogo — exactamente el requisito RH-02.3 §13.
 */
function renderRuta(entrada = '/proyectos/1', props = {}) {
  return render(
    <MemoryRouter initialEntries={[entrada]}>
      <Sonda />
      <Routes>
        <Route
          path="/proyectos"
          element={<Proyectos token="token-rh" {...props} />}
        />
        <Route
          path="/proyectos/:id"
          element={<ProyectoDetalle token="token-rh" {...props} />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

/** Espera a que la ficha esté realmente CARGADA: el título de la card es
 *  visible desde el montaje, pero la ficha solo aparece con los datos
 *  (RH-02.3.3: el loading del Show tiene presencia mínima). */
async function esperarDetalle() {
  expect(await screen.findByText('Clave de comparación')).toBeInTheDocument()
}

/** Abre la edición del proyecto cargado (consulta → editar). */
async function abrirEdicion() {
  fireEvent.click(screen.getByRole('button', { name: 'Editar proyecto' }))
  await screen.findByRole('heading', { name: 'Editar proyecto' })
}

beforeEach(() => {
  vi.mocked(listarProyectosRh).mockReset()
  vi.mocked(consultarProyectoRh).mockReset()
  vi.mocked(actualizarProyectoRh).mockReset()
  vi.mocked(listarParticipacionesDeProyecto).mockReset()
  vi.mocked(corregirParticipacion).mockReset()
  vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue(PARTICIPANTES_VACIOS)
  vi.mocked(listarProyectosRh).mockResolvedValue(CATALOGO)
  vi.mocked(consultarProyectoRh).mockImplementation((_token, id) => {
    const encontrado = CATALOGO.items.find((p) => p.id === Number(id))
    return Promise.resolve(encontrado ?? proyecto(Number(id)))
  })
})

describe('ProyectoDetalle (/proyectos/:id) — deep link y ficha', () => {
  it('carga el proyecto SOLO desde el parámetro de la ruta, sin pasar por /proyectos', async () => {
    renderRuta('/proyectos/3')
    await esperarDetalle()

    expect(consultarProyectoRh).toHaveBeenCalledWith('token-rh', 3)
    // El catálogo NO se consulta ni se renderiza: el Show es una página.
    expect(listarProyectosRh).not.toHaveBeenCalled()
    expect(screen.queryByText('Catálogo de proyectos')).toBeNull()
    expect(screen.getByText('proyecto 3')).toBeInTheDocument()
    expect(screen.getByText('Tecnología')).toBeInTheDocument()
    expect(screen.getByText('Cliente interno')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Proyecto 3', level: 1 })).toBeInTheDocument()
  })

  it('presenta el neutro «—» cuando área o cliente no existen', async () => {
    renderRuta('/proyectos/2')
    await esperarDetalle()

    expect(consultarProyectoRh).toHaveBeenCalledWith('token-rh', 2)
    // Proyecto 2 sin área ni cliente: neutro, nunca un hueco.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('proyecto 2')).toBeInTheDocument()
    expect(screen.getAllByText('Completado').length).toBeGreaterThan(0)
  })

  it('un fallo al consultar muestra error con reintento', async () => {
    vi.mocked(consultarProyectoRh).mockRejectedValueOnce(
      Object.assign(new Error('Proyecto no encontrado.'), { estado: 404 }),
    )
    renderRuta('/proyectos/1')

    expect(
      await screen.findByText('No pudimos cargar el proyecto'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    await waitFor(() => expect(consultarProyectoRh).toHaveBeenCalledTimes(2))
  })

  it('un 401 al consultar delega en alSesionExpirada', async () => {
    vi.mocked(consultarProyectoRh).mockRejectedValue(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    const alSesionExpirada = vi.fn()
    renderRuta('/proyectos/1', { alSesionExpirada })

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
  })

  it('un id no numérico se normaliza al Index', async () => {
    renderRuta('/proyectos/abc')

    await screen.findAllByRole('heading', { name: 'Proyectos', level: 1 })
    await waitFor(() =>
      expect(screen.getByTestId('sonda-ruta').textContent).toBe('/proyectos'),
    )
    expect(screen.queryByRole('heading', { name: 'Detalle del proyecto' })).toBeNull()
  })

  it('la ficha organiza los datos en dos columnas y la clave a ancho completo', async () => {
    renderRuta('/proyectos/1')
    await esperarDetalle()

    const datos = document.querySelector('.proyectos-rh__datos-admin')
    expect(datos).not.toBeNull()
    expect(within(datos).getAllByRole('term').map((dt) => dt.textContent)).toEqual([
      'Nombre',
      'Área',
      'Cliente',
      'Estado',
      'Clave de comparación',
    ])
    const clave = datos.querySelector('.proyectos-rh__clave')
    expect(clave).not.toBeNull()
    expect(clave.querySelector('.proyectos-rh__clave-nota')).not.toBeNull()
  })
})

describe('ProyectoDetalle (/proyectos/:id) — UI de la página (RH-02.3 §9/§10)', () => {
  it('existe «Volver al listado» arriba y navega al catálogo real', async () => {
    renderRuta('/proyectos/1')
    await esperarDetalle()

    const volver = screen.getByRole('button', { name: 'Volver al listado' })
    expect(volver).toBeInTheDocument()

    fireEvent.click(volver)

    await waitFor(() =>
      expect(screen.getByTestId('sonda-ruta').textContent).toBe('/proyectos'),
    )
    // El catálogo se monta de nuevo y consulta el backend (fresh mount).
    expect(await screen.findByText('Catálogo de proyectos')).toBeInTheDocument()
    await waitFor(() => expect(listarProyectosRh).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('heading', { name: 'Detalle del proyecto' })).toBeNull()
  })

  it('NO existe ni X ni «Cerrar» en el Show', async () => {
    renderRuta('/proyectos/1')
    await esperarDetalle()

    expect(screen.queryByRole('button', { name: 'Cerrar detalle' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull()
    expect(screen.queryByLabelText(/cerrar/i)).toBeNull()
  })

  it('existe el breadcrumb «Proyectos / nombre» y «Proyectos» regresa al catálogo', async () => {
    renderRuta('/proyectos/1')
    await esperarDetalle()

    const migas = screen.getByRole('navigation', { name: 'Ubicación' })
    expect(within(migas).getByRole('button', { name: 'Proyectos' })).toBeInTheDocument()
    expect(within(migas).getByText('Proyecto 1')).toHaveAttribute(
      'aria-current',
      'page',
    )

    fireEvent.click(within(migas).getByRole('button', { name: 'Proyectos' }))
    await waitFor(() =>
      expect(screen.getByTestId('sonda-ruta').textContent).toBe('/proyectos'),
    )
  })

  it('document.title: nombre del Show, título del Index al volver y fallback «Proyecto»', async () => {
    renderRuta('/proyectos/1')
    await esperarDetalle()
    expect(document.title).toBe('Proyecto 1 · Proyectos | Talento PluriOne')

    fireEvent.click(screen.getByRole('button', { name: 'Volver al listado' }))
    await screen.findByText('Catálogo de proyectos')
    expect(document.title).toBe('Proyectos | Talento PluriOne')
  })

  it('document.title y breadcrumb usan «Proyecto» cuando el nombre no está disponible', async () => {
    vi.mocked(consultarProyectoRh).mockResolvedValue(
      proyecto(1, { nombre: null }),
    )
    renderRuta('/proyectos/1')
    await esperarDetalle()

    expect(document.title).toBe('Proyecto | Proyectos | Talento PluriOne')
    const migas = screen.getByRole('navigation', { name: 'Ubicación' })
    expect(within(migas).getByText('Proyecto')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Proyecto', level: 1 })).toBeInTheDocument()
  })
})

describe('ProyectoDetalle (/proyectos/:id) — edición administrativa (PATCH)', () => {
  it('abre el formulario con los valores actuales del proyecto', async () => {
    renderRuta('/proyectos/1')
    await esperarDetalle()
    await abrirEdicion()

    expect(screen.getByLabelText('Nombre')).toHaveValue('Proyecto 1')
    expect(screen.getByLabelText('Área')).toHaveValue('Tecnología')
    expect(screen.getByLabelText('Cliente')).toHaveValue('Cliente interno')
    expect(screen.getByLabelText('Estado')).toHaveValue('EN_PROCESO')
  })

  it('Edit es un modo dentro del Show: la URL no cambia y no usa modal', async () => {
    renderRuta('/proyectos/1')
    await esperarDetalle()
    await abrirEdicion()

    expect(screen.getByTestId('sonda-ruta').textContent).toBe('/proyectos/1')
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(
      await screen.findByRole('heading', { name: 'Detalle del proyecto' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('sonda-ruta').textContent).toBe('/proyectos/1')
  })

  it('entrar en edición muestra la etiqueta «Editando» y la tarjeta con tratamiento de edición', async () => {
    renderRuta('/proyectos/1')
    await esperarDetalle()
    await abrirEdicion()

    const tarjeta = screen.getByRole('region', { name: 'Editar proyecto' })
    expect(tarjeta).toHaveClass('proyectos-rh__detalle--edicion')
    expect(screen.getByText('Editando')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Área')).toBeInTheDocument()
    expect(screen.getByLabelText('Cliente')).toBeInTheDocument()
    expect(screen.getByLabelText('Estado')).toBeInTheDocument()
    expect(screen.getByTestId('sonda-ruta').textContent).toBe('/proyectos/1')
  })

  it('envía SOLO los campos modificados y nada fuera del contrato', async () => {
    vi.mocked(actualizarProyectoRh).mockResolvedValue(
      proyecto(1, { nombre: 'Proyecto Renombrado', estado: 'CANCELADO' }),
    )
    renderRuta('/proyectos/1')
    await esperarDetalle()
    await abrirEdicion()

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Proyecto Renombrado' },
    })
    fireEvent.change(screen.getByLabelText('Estado'), {
      target: { value: 'CANCELADO' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(actualizarProyectoRh).toHaveBeenCalledTimes(1))
    const [token, id, cambios] = vi.mocked(actualizarProyectoRh).mock.calls[0]
    expect(token).toBe('token-rh')
    expect(id).toBe(1)
    // Exactamente los dos campos cambiados: ni área/cliente sin cambio, ni
    // id, ni nombre_normalizado, ni fechas.
    expect(cambios).toEqual({ nombre: 'Proyecto Renombrado', estado: 'CANCELADO' })
  })

  it('un PATCH exitoso confirma, vuelve a consulta y el catálogo refleja el cambio al volver', async () => {
    vi.mocked(actualizarProyectoRh).mockResolvedValue(
      proyecto(1, { nombre: 'Proyecto Renombrado', estado: 'CANCELADO' }),
    )
    renderRuta('/proyectos/1')
    await esperarDetalle()
    await abrirEdicion()

    fireEvent.change(screen.getByLabelText('Estado'), {
      target: { value: 'CANCELADO' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Proyecto actualizado')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Detalle del proyecto' }),
    ).toBeInTheDocument()
    // El nombre actualizado queda en la ficha (el <dd> de datos).
    expect(screen.getByText('Proyecto Renombrado', { selector: 'dd' })).toBeInTheDocument()

    // Al volver, el catálogo se consulta de nuevo (fresh mount del Index).
    fireEvent.click(screen.getByRole('button', { name: 'Volver al listado' }))
    await screen.findByText('Catálogo de proyectos')
    await waitFor(() => expect(listarProyectosRh).toHaveBeenCalledTimes(1))
  })

  it('sin cambios no hace ninguna petición PATCH', async () => {
    renderRuta('/proyectos/1')
    await esperarDetalle()
    await abrirEdicion()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(actualizarProyectoRh).not.toHaveBeenCalled()
  })

  it('un 409 del PATCH se muestra legible', async () => {
    vi.mocked(actualizarProyectoRh).mockRejectedValue(
      Object.assign(new Error('Ya existe otro proyecto con ese nombre.'), {
        estado: 409,
      }),
    )
    renderRuta('/proyectos/1')
    await esperarDetalle()
    await abrirEdicion()

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Proyecto 2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('No pudimos guardar los cambios')).toBeInTheDocument()
    expect(
      screen.getByText('Ya existe otro proyecto con ese nombre.'),
    ).toBeInTheDocument()
  })

  it('un fallo inesperado del PATCH muestra estado de error legible', async () => {
    vi.mocked(actualizarProyectoRh).mockRejectedValue(
      Object.assign(new Error('boom'), { estado: 500 }),
    )
    renderRuta('/proyectos/1')
    await esperarDetalle()
    await abrirEdicion()

    fireEvent.change(screen.getByLabelText('Área'), {
      target: { value: 'Operaciones' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('No pudimos guardar los cambios')).toBeInTheDocument()
  })

  it('un 401 al guardar cierra la sesión', async () => {
    vi.mocked(actualizarProyectoRh).mockRejectedValue(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    const alSesionExpirada = vi.fn()
    renderRuta('/proyectos/1', { alSesionExpirada })
    await esperarDetalle()
    await abrirEdicion()

    fireEvent.change(screen.getByLabelText('Área'), {
      target: { value: 'Operaciones' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
  })

  it('Escape en modo edición actúa como Cancelar: vuelve a la consulta sin PATCH ni salir de la página', async () => {
    renderRuta('/proyectos/1')
    await esperarDetalle()
    await abrirEdicion()

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Cambio sin guardar' },
    })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(
      await screen.findByRole('heading', { name: 'Detalle del proyecto' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Editar proyecto' })).toBeNull()
    expect(actualizarProyectoRh).not.toHaveBeenCalled()
    // La página NO se abandona con Escape: sigue en /proyectos/1.
    expect(screen.getByTestId('sonda-ruta').textContent).toBe('/proyectos/1')

    // Al reentrar en edición, el formulario vuelve a nacer de la consulta:
    // el cambio no guardado no se cuela (igual que Cancelar).
    fireEvent.click(screen.getByRole('button', { name: 'Editar proyecto' }))
    expect(
      await screen.findByRole('heading', { name: 'Editar proyecto' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Proyecto 1')
  })
})


describe('ProyectoDetalle (/proyectos/:id) — participantes en el detalle (RH-02.1)', () => {
  /** Monta el Show del proyecto 1 y espera a que carguen los participantes. */
  async function abrirConsulta() {
    renderRuta('/proyectos/1')
    await esperarDetalle()
    // La card de Participantes se monta con la ficha; se espera su estado
    // terminal (sin loading) antes de continuar.
    await screen.findByRole('heading', { name: 'Participantes' })
    await waitFor(() =>
      expect(screen.queryByText('Cargando participantes…')).toBeNull(),
    )
  }

  it('proyecto sin participantes muestra el estado vacío', async () => {
    await abrirConsulta()

    expect(
      screen.getByText('Nadie ha registrado participación en este proyecto.'),
    ).toBeInTheDocument()
  })

  it('muestra nombre, puesto, rol y horas de cada participante', async () => {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue({
      total: 2,
      pagina: 1,
      por_pagina: 20,
      items: [
        participacion(1),
        participacion(2, {
          empleado_nombre: 'Bo Marín',
          empleado_puesto: null,
          rol: 'QA',
          horas: 40,
        }),
      ],
    })
    await abrirConsulta()

    expect(listarParticipacionesDeProyecto).toHaveBeenCalledWith(
      'token-rh',
      1,
      expect.objectContaining({ pagina: 1 }),
    )
    expect(screen.getByText('Ana Ruiz 1')).toBeInTheDocument()
    expect(screen.getByText('Bo Marín')).toBeInTheDocument()
    expect(screen.getByText('Desarrolladora de software')).toBeInTheDocument()
    // Sin puesto registrado: neutro, no inventado.
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Desarrollador')).toBeInTheDocument()
    expect(screen.getByText('QA')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
  })

  it('no usa el ID técnico como identificación principal', async () => {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue({
      total: 1,
      pagina: 1,
      por_pagina: 20,
      items: [participacion(1)],
    })
    await abrirConsulta()

    expect(screen.queryByText(/^Empleado \d+$/)).toBeNull()
  })

  it('los entregables quedan accesibles al consultar la participación', async () => {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue({
      total: 1,
      pagina: 1,
      por_pagina: 20,
      items: [participacion(1, { entregables: 'Módulo de facturación' })],
    })
    await abrirConsulta()

    // La tabla no ensancha con los entregables: se despliegan al consultar.
    fireEvent.click(
      screen.getByRole('button', { name: 'Consultar participación' }),
    )

    expect(screen.getByText('Módulo de facturación')).toBeInTheDocument()
    expect(screen.getByText('Fecha de registro')).toBeInTheDocument()
    expect(screen.getByText('2026-03-02')).toBeInTheDocument()
  })

  it('un error al cargar participantes ofrece reintento', async () => {
    vi.mocked(listarParticipacionesDeProyecto).mockRejectedValueOnce(
      Object.assign(new Error('fallo del servidor'), { estado: 500 }),
    )
    await abrirConsulta()

    expect(
      await screen.findByText('No pudimos cargar los participantes'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    await waitFor(() =>
      expect(listarParticipacionesDeProyecto).toHaveBeenCalledTimes(2),
    )
  })

  it('un 401 al cargar participantes cierra la sesión', async () => {
    vi.mocked(listarParticipacionesDeProyecto).mockRejectedValue(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    const alSesionExpirada = vi.fn()
    renderRuta('/proyectos/1', { alSesionExpirada })
    await esperarDetalle()

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('No pudimos cargar los participantes')).toBeNull()
  })

  it('la paginación de participantes usa el contrato del backend', async () => {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue({
      total: 25,
      pagina: 1,
      por_pagina: 20,
      items: [participacion(1)],
    })
    await abrirConsulta()

    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }))

    await waitFor(() =>
      expect(listarParticipacionesDeProyecto).toHaveBeenCalledTimes(2),
    )
    const [, , paginacion] = vi.mocked(listarParticipacionesDeProyecto).mock.calls.at(-1)
    expect(paginacion.pagina).toBe(2)
  })

  it('la tabla mantiene columnas alineadas y horas/acción a la derecha', async () => {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue({
      total: 1,
      pagina: 1,
      por_pagina: 20,
      items: [participacion(1)],
    })
    await abrirConsulta()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Consultar participación' })).toBeTruthy(),
    )

    const tabla = document.querySelector('.proyectos-rh__participantes-tabla')
    expect(tabla).not.toBeNull()
    // Encabezado y filas comparten exactamente las cinco columnas.
    const encabezados = [...tabla.querySelectorAll('thead th')]
    expect(encabezados.map((th) => th.textContent)).toEqual([
      'Empleado',
      'Puesto',
      'Rol',
      'Horas',
      'Acción',
    ])
    expect(encabezados[3]).toHaveClass('tabla__th--right')
    expect(encabezados[4]).toHaveClass('tabla__th--right')
    const fila = tabla.querySelector('tbody tr')
    expect(fila.querySelectorAll('td[data-label], th[data-label]').length).toBe(5)
    expect(fila.querySelector("td[data-label='Horas']").textContent).toBe('120')
  })

  it('la edición del proyecto no se mezcla con los participantes', async () => {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue({
      total: 1,
      pagina: 1,
      por_pagina: 20,
      items: [participacion(1)],
    })
    await abrirConsulta()

    fireEvent.click(screen.getByRole('button', { name: 'Editar proyecto' }))
    expect(
      await screen.findByRole('heading', { name: 'Editar proyecto' }),
    ).toBeInTheDocument()
    // Al editar el PROYECTO, los participantes salen de la vista: dos
    // formularios administrativos que nunca se mezclan.
    expect(screen.queryByText('Participantes')).toBeNull()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Proyecto 1')
  })
})


describe('ProyectoDetalle (/proyectos/:id) — corrección administrativa de participación (RH-02.2)', () => {
  const CON_PARTICIPANTE = {
    total: 1,
    pagina: 1,
    por_pagina: 20,
    items: [participacion(1)],
  }

  /** Monta el Show del proyecto 1, espera participantes y abre la participación. */
  async function abrirParticipacion() {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue(CON_PARTICIPANTE)
    renderRuta('/proyectos/1')
    await esperarDetalle()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Consultar participación' }),
    )
  }

  it('abre la corrección desde la participación expandida y es excluyente con la edición', async () => {
    await abrirParticipacion()

    // Ambas acciones existen, cada una con su ámbito: participación vs proyecto.
    expect(
      screen.getByRole('button', { name: 'Corregir participación' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Editar proyecto' }),
    ).toBeInTheDocument()
    // El formulario de corrección NO existe hasta pulsar su acción.
    expect(screen.queryByText('Corrección administrativa')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Corregir participación' }),
    )
    expect(screen.getByText('Corrección administrativa')).toBeInTheDocument()

    // Entrar en la edición del proyecto desmonta participantes y corrección:
    // dos formularios administrativos que nunca se mezclan.
    fireEvent.click(screen.getByRole('button', { name: 'Editar proyecto' }))
    expect(
      await screen.findByRole('heading', { name: 'Editar proyecto' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Corrección administrativa')).toBeNull()
    expect(screen.queryByText('Participantes')).toBeNull()
    expect(actualizarProyectoRh).not.toHaveBeenCalled()
  })

  it('RH corrige: PATCH solo con los campos cambiados y recarga de participantes', async () => {
    vi.mocked(corregirParticipacion).mockResolvedValue(
      participacion(1, { rol: 'QA Lead', en_equipo: false }),
    )
    await abrirParticipacion()
    fireEvent.click(
      screen.getByRole('button', { name: 'Corregir participación' }),
    )

    fireEvent.change(screen.getByLabelText('Rol'), {
      target: { value: 'QA Lead' },
    })
    fireEvent.click(screen.getByLabelText('Trabajo en equipo')) // true → false
    fireEvent.change(screen.getByLabelText('Motivo'), {
      target: { value: 'Solicitado por el empleado' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }))

    await waitFor(() => expect(corregirParticipacion).toHaveBeenCalledTimes(1))
    const [token, id, cambios] = vi.mocked(corregirParticipacion).mock.calls[0]
    expect(token).toBe('token-rh')
    expect(id).toBe(1)
    // Exactamente lo corregido + motivo: ni entregables ni horas sin cambio.
    expect(cambios).toEqual({
      rol: 'QA Lead',
      en_equipo: false,
      motivo: 'Solicitado por el empleado',
    })
    // El proyecto NO se tocó: la corrección es de la participación.
    expect(actualizarProyectoRh).not.toHaveBeenCalled()
    // Los participantes se recargan para reflejar la corrección persistida.
    await waitFor(() =>
      expect(listarParticipacionesDeProyecto).toHaveBeenCalledTimes(2),
    )
    expect(
      await screen.findByText('Participación corregida'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Corrección administrativa')).toBeNull()
  })

  it('cancelar la corrección no hace ningún PATCH y conserva la página', async () => {
    await abrirParticipacion()
    fireEvent.click(
      screen.getByRole('button', { name: 'Corregir participación' }),
    )

    fireEvent.change(screen.getByLabelText('Horas'), {
      target: { value: '200' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByText('Corrección administrativa')).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'Detalle del proyecto' }),
    ).toBeInTheDocument()
    expect(corregirParticipacion).not.toHaveBeenCalled()
    expect(actualizarProyectoRh).not.toHaveBeenCalled()
  })

  it('sin cambios no envía ningún PATCH', async () => {
    await abrirParticipacion()
    fireEvent.click(
      screen.getByRole('button', { name: 'Corregir participación' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }))

    expect(
      await screen.findByText('No pudimos corregir la participación'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No hay cambios que corregir en esta participación.'),
    ).toBeInTheDocument()
    expect(corregirParticipacion).not.toHaveBeenCalled()
  })

  it('un rol vacío se valida en cliente sin llamar al backend', async () => {
    await abrirParticipacion()
    fireEvent.click(
      screen.getByRole('button', { name: 'Corregir participación' }),
    )

    fireEvent.change(screen.getByLabelText('Rol'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }))

    expect(
      await screen.findByText('El rol de la participación no puede estar vacío.'),
    ).toBeInTheDocument()
    expect(corregirParticipacion).not.toHaveBeenCalled()
  })

  it('un fallo del PATCH de corrección se muestra legible', async () => {
    vi.mocked(corregirParticipacion).mockRejectedValue(
      Object.assign(new Error('La participación ya no existe.'), {
        estado: 404,
      }),
    )
    await abrirParticipacion()
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

    expect(
      await screen.findByText('No pudimos corregir la participación'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('La participación ya no existe.'),
    ).toBeInTheDocument()
  })

  it('un 401 al corregir cierra la sesión', async () => {
    vi.mocked(corregirParticipacion).mockRejectedValue(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    const alSesionExpirada = vi.fn()
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue(CON_PARTICIPANTE)
    renderRuta('/proyectos/1', { alSesionExpirada })
    await esperarDetalle()
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

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('No pudimos corregir la participación'),
    ).toBeNull()
  })

  it('Escape con la corrección abierta la cancela sin cerrar la página', async () => {
    await abrirParticipacion()
    fireEvent.click(
      screen.getByRole('button', { name: 'Corregir participación' }),
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByText('Corrección administrativa')).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'Detalle del proyecto' }),
    ).toBeInTheDocument()
    expect(corregirParticipacion).not.toHaveBeenCalled()
    expect(actualizarProyectoRh).not.toHaveBeenCalled()
  })
})






describe('ProyectoDetalle (/proyectos/:id) — búsqueda local de participante (RH-02.3.1)', () => {
  const DOS_PARTICIPANTES = {
    total: 2,
    pagina: 1,
    por_pagina: 20,
    items: [
      participacion(1), // Ana Ruiz 1 · Desarrolladora de software · Desarrollador
      participacion(2, {
        empleado_nombre: 'Bo Marín',
        empleado_puesto: 'QA Engineer',
        rol: 'QA',
        horas: 40,
      }),
    ],
  }

  /** Monta el Show con los DOS participantes cargados y estables. */
  async function abrirConParticipantes() {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue(
      DOS_PARTICIPANTES,
    )
    renderRuta('/proyectos/1')
    await esperarDetalle()
    await screen.findAllByRole('button', { name: 'Consultar participación' })
    return screen.getByPlaceholderText('Buscar participante...')
  }

  it('el campo «Buscar participante...» aparece encima del listado', async () => {
    const campo = await abrirConParticipantes()

    expect(campo).toBeInTheDocument()
    // Está en la card de Participantes, antes de la tabla en el orden del DOM.
    const tabla = document.querySelector('.proyectos-rh__participantes-tabla')
    expect(tabla).not.toBeNull()
    expect(campo.compareDocumentPosition(tabla) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sin texto de búsqueda muestra todos los participantes cargados', async () => {
    await abrirConParticipantes()

    expect(screen.getByText('Ana Ruiz 1')).toBeInTheDocument()
    expect(screen.getByText('Bo Marín')).toBeInTheDocument()
    // Sin llamadas extra al backend por el solo hecho de tener el campo.
    expect(listarParticipacionesDeProyecto).toHaveBeenCalledTimes(1)
  })

  it('buscar por nombre filtra correctamente (case-insensitive)', async () => {
    const campo = await abrirConParticipantes()

    fireEvent.change(campo, { target: { value: 'ana' } })

    expect(screen.getByText('Ana Ruiz 1')).toBeInTheDocument()
    expect(screen.queryByText('Bo Marín')).toBeNull()
    // La búsqueda es local: ningún reintento de carga.
    expect(listarParticipacionesDeProyecto).toHaveBeenCalledTimes(1)
  })

  it('buscar por puesto filtra correctamente', async () => {
    const campo = await abrirConParticipantes()

    fireEvent.change(campo, { target: { value: 'qa engineer' } })

    expect(screen.getByText('Bo Marín')).toBeInTheDocument()
    expect(screen.queryByText('Ana Ruiz 1')).toBeNull()
  })

  it('buscar por rol filtra correctamente', async () => {
    const campo = await abrirConParticipantes()

    fireEvent.change(campo, { target: { value: 'desarrollador' } })

    expect(screen.getByText('Ana Ruiz 1')).toBeInTheDocument()
    expect(screen.queryByText('Bo Marín')).toBeNull()
  })

  it('limpiar la búsqueda restaura todos los participantes', async () => {
    const campo = await abrirConParticipantes()

    fireEvent.change(campo, { target: { value: 'ana' } })
    expect(screen.queryByText('Bo Marín')).toBeNull()

    fireEvent.change(campo, { target: { value: '' } })

    expect(screen.getByText('Ana Ruiz 1')).toBeInTheDocument()
    expect(screen.getByText('Bo Marín')).toBeInTheDocument()
  })

  it('una búsqueda sin coincidencias muestra el estado vacío de búsqueda', async () => {
    const campo = await abrirConParticipantes()

    fireEvent.change(campo, { target: { value: 'noexiste' } })

    expect(
      screen.getByText('Ningún participante coincide con la búsqueda.'),
    ).toBeInTheDocument()
    expect(document.querySelector('.proyectos-rh__participantes-tabla')).toBeNull()
  })

  it('con la búsqueda activa, las acciones de participante siguen funcionando', async () => {
    const campo = await abrirConParticipantes()

    fireEvent.change(campo, { target: { value: 'ana' } })

    // Consulta de la participación filtrada.
    fireEvent.click(screen.getByRole('button', { name: 'Consultar participación' }))
    expect(screen.getByText('API de pagos')).toBeInTheDocument()

    // Corrección administrativa (RH-02.2) sobre la participación filtrada.
    fireEvent.click(screen.getByRole('button', { name: 'Corregir participación' }))
    expect(screen.getByText('Corrección administrativa')).toBeInTheDocument()
    expect(screen.getByLabelText('Rol')).toHaveValue('Desarrollador')
  })
})


describe('ProyectoDetalle — presentación de la corrección administrativa (RH-02.3.3)', () => {
  /** Columnas de la tabla de participantes (RH-02.1): la fila expandida las ocupa todas. */
  const COLUMNAS_ESPERADAS = 5

  /** CSS de la sección, leído como texto (mismo guardarraíl que estilos.test.js):
   *  bajo jsdom `import.meta.url` es `http:` (no `file:`), así que se resuelve
   *  desde la raíz del proyecto, exactamente como hace src/test/estilos.test.js. */
  const urlCssProyectos = new URL('../../estilos/proyectos.css', import.meta.url)
  const cssProyectos = readFileSync(
    urlCssProyectos.protocol === 'file:'
      ? urlCssProyectos
      : resolve(process.cwd(), 'src/estilos/proyectos.css'),
    'utf8',
  )

  /** Monta el Show con UNA participación y abre su fila expandida. */
  async function abrirFilaParticipacion() {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue({
      total: 1,
      pagina: 1,
      por_pagina: 20,
      items: [participacion(1)],
    })
    renderRuta('/proyectos/1')
    await esperarDetalle()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Consultar participación' }),
    )
  }

  it('el pie junta «Fecha de registro» (izquierda) y «Corregir participación» (derecha) en la misma fila', async () => {
    await abrirFilaParticipacion()

    const pie = document.querySelector('.proyectos-rh__participacion-pie')
    expect(pie).not.toBeNull()
    const etiqueta = within(pie).getByText('Fecha de registro')
    const valor = within(pie).getByText('2026-03-02')
    const boton = within(pie).getByRole('button', { name: 'Corregir participación' })
    // El botón es hijo directo del pie (flex con space-between), nunca centrado.
    expect(boton.parentElement).toBe(pie)
    // Recorrido natural izquierda → derecha: etiqueta, valor y acción.
    expect(
      etiqueta.compareDocumentPosition(valor) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      valor.compareDocumentPosition(boton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    // El pie queda DESPUÉS de los entregables: datos arriba, meta+acción abajo.
    const entregables = screen.getByText('Entregables')
    expect(
      entregables.compareDocumentPosition(pie) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('la card de corrección aprovecha el ancho de la fila expandida (sin tope propio)', async () => {
    await abrirFilaParticipacion()
    fireEvent.click(
      screen.getByRole('button', { name: 'Corregir participación' }),
    )

    const formulario = document.querySelector('form.proyectos-rh__correccion')
    expect(formulario).not.toBeNull()
    // Vive dentro de la fila expandida, que ocupa TODAS las columnas de la tabla.
    expect(formulario.closest('td').colSpan).toBe(COLUMNAS_ESPERADAS)
    // Guardarraíl de estilos: la regla no fija un ancho máximo propio y el
    // pie reparte fecha/acción con space-between (RH-02.3.3 §1/§3).
    const reglaCorreccion =
      cssProyectos.match(/\.proyectos-rh__correccion \{[^}]*\}/)?.[0] ?? ''
    expect(reglaCorreccion).not.toContain('max-width')
    expect(cssProyectos).toMatch(
      /\.proyectos-rh__participacion-pie \{[^}]*justify-content: space-between/,
    )
  })

  it('la acción del pie sigue abriendo la corrección y el flujo completo no se rompe', async () => {
    vi.mocked(corregirParticipacion).mockResolvedValue(
      participacion(1, { horas: 200 }),
    )
    await abrirFilaParticipacion()

    fireEvent.click(
      within(document.querySelector('.proyectos-rh__participacion-pie')).getByRole(
        'button',
        { name: 'Corregir participación' },
      ),
    )
    expect(screen.getByText('Corrección administrativa')).toBeInTheDocument()

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
  })
})

describe('ProyectoDetalle — presencia mínima del loading (RH-02.3.3)', () => {
  it('una respuesta muy rápida no elimina el loading de inmediato: transición tras el mínimo', async () => {
    renderRuta('/proyectos/1')
    const inicio = performance.now()

    expect(screen.getByText('Cargando proyecto…')).toBeInTheDocument()
    await new Promise((resolver) => setTimeout(resolver, 150))
    // Dentro del mínimo perceptible: el loading sigue visible.
    expect(screen.getByText('Cargando proyecto…')).toBeInTheDocument()

    await screen.findByText('Clave de comparación')
    expect(performance.now() - inicio).toBeGreaterThanOrEqual(430)
  })

  it('un error del detalle no espera el mínimo', async () => {
    vi.mocked(consultarProyectoRh).mockRejectedValue(
      Object.assign(new Error('Proyecto no encontrado.'), { estado: 404 }),
    )
    const inicio = performance.now()
    renderRuta('/proyectos/1')

    expect(
      await screen.findByText('No pudimos cargar el proyecto'),
    ).toBeInTheDocument()
    expect(performance.now() - inicio).toBeLessThan(400)
  })
})

describe('ProyectoDetalle — motivo obligatorio de la corrección (RH-02.3.4)', () => {
  /** Monta el Show del proyecto 1, abre la participación y su corrección. */
  async function abrirCorreccion() {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue({
      total: 1,
      pagina: 1,
      por_pagina: 20,
      items: [participacion(1)],
    })
    renderRuta('/proyectos/1')
    await esperarDetalle()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Consultar participación' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Corregir participación' }),
    )
    expect(screen.getByText('Corrección administrativa')).toBeInTheDocument()
  }

  it('cambiar un indicador con motivo vacío NO llama al PATCH: mensaje junto al campo y formulario visible', async () => {
    await abrirCorreccion()

    fireEvent.click(screen.getByLabelText('Trabajo en equipo')) // true → false
    fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }))

    expect(corregirParticipacion).not.toHaveBeenCalled()
    expect(
      screen.getByText('Escribe el motivo de la corrección para continuar.'),
    ).toBeInTheDocument()
    // Permanece en el formulario, sin éxito y sin PATCH.
    expect(screen.getByText('Corrección administrativa')).toBeInTheDocument()
    expect(screen.queryByText('Participación corregida')).toBeNull()
  })

  it('un motivo de solo espacios también bloquea el PATCH (trim)', async () => {
    await abrirCorreccion()

    fireEvent.change(screen.getByLabelText('Horas'), {
      target: { value: '200' },
    })
    fireEvent.change(screen.getByLabelText('Motivo'), {
      target: { value: '    ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }))

    expect(corregirParticipacion).not.toHaveBeenCalled()
    expect(
      screen.getByText('Escribe el motivo de la corrección para continuar.'),
    ).toBeInTheDocument()
  })

  it('el mensaje se limpia al escribir el motivo y el campo se presenta como obligatorio', async () => {
    await abrirCorreccion()

    fireEvent.click(screen.getByLabelText('Coordinación')) // false → true
    fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }))
    expect(
      screen.getByText('Escribe el motivo de la corrección para continuar.'),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Motivo'), {
      target: { value: 'Corrección de indicador' },
    })
    expect(
      screen.queryByText('Escribe el motivo de la corrección para continuar.'),
    ).toBeNull()
    // La ayuda del campo anuncia la regla (ya no es opcional).
    expect(
      screen.getByText('Obligatorio (máx. 512): queda en la auditoría.'),
    ).toBeInTheDocument()
  })

  it('con motivo válido el PATCH viaja con el motivo de auditoría incluido (recortado)', async () => {
    vi.mocked(corregirParticipacion).mockResolvedValue(
      participacion(1, { horas: 200 }),
    )
    await abrirCorreccion()

    fireEvent.change(screen.getByLabelText('Horas'), {
      target: { value: '200' },
    })
    fireEvent.change(screen.getByLabelText('Motivo'), {
      target: { value: '  Ajuste de horas verificado con el empleado  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }))

    await waitFor(() => expect(corregirParticipacion).toHaveBeenCalledTimes(1))
    const cambios = vi.mocked(corregirParticipacion).mock.calls[0][2]
    // La auditoría recibe el cambio JUNTO al motivo, ya recortado (trim).
    expect(cambios).toEqual({
      horas: 200,
      motivo: 'Ajuste de horas verificado con el empleado',
    })
    expect(
      await screen.findByText('Participación corregida'),
    ).toBeInTheDocument()
  })
})

describe('ProyectoDetalle — indicadores de la corrección alineados (RH-02.3.4)', () => {
  /** Monta el Show, abre la participación y su corrección. */
  async function abrirCorreccion() {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue({
      total: 1,
      pagina: 1,
      por_pagina: 20,
      items: [participacion(1)],
    })
    renderRuta('/proyectos/1')
    await esperarDetalle()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Consultar participación' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Corregir participación' }),
    )
  }

  it('los cuatro indicadores comparten grupo y estructura uniforme (misma línea de referencia)', async () => {
    await abrirCorreccion()

    const grupo = document.querySelector('.proyectos-indicadores')
    expect(grupo).not.toBeNull()
    // El título es el PRIMER hijo del grupo y cada indicador es un hijo
    // directo hermano: el grid los alinea en filas uniformes sin huecos
    // intermedios que descentren a «Situación/problema».
    const titulo = grupo.querySelector('.proyectos-indicadores__titulo')
    expect(grupo.firstElementChild).toBe(titulo)
    const indicadores = [...grupo.children].filter((hijo) =>
      hijo.classList.contains('proyectos-indicador'),
    )
    expect(indicadores).toHaveLength(4)
    for (const indicador of indicadores) {
      // Estructura idéntica por indicador: un checkbox y su label.
      expect(indicador.children).toHaveLength(2)
      expect(indicador.querySelector('input[type="checkbox"]')).not.toBeNull()
      expect(indicador.querySelector('label')).not.toBeNull()
    }
    const etiquetas = indicadores.map(
      (indicador) => indicador.querySelector('label').textContent.trim(),
    )
    expect(etiquetas).toEqual([
      'Trabajo en equipo',
      'Coordinación',
      'Explicación a públicos distintos',
      'Situación/problema',
    ])
  })

  it('guardarraíl de estilos: el título ocupa la fila completa y el grid alinea al inicio', () => {
    const urlCss = new URL('../../estilos/proyectos.css', import.meta.url)
    const cssProyectos = readFileSync(
      urlCss.protocol === 'file:'
        ? urlCss
        : resolve(process.cwd(), 'src/estilos/proyectos.css'),
      'utf8',
    )
    // El grid responsivo se conserva (auto-fit) y alinea las celdas al inicio.
    expect(cssProyectos).toMatch(
      /\.proyectos-rh__correccion \.proyectos-indicadores \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(220px, 1fr\)\)/,
    )
    expect(cssProyectos).toMatch(
      /\.proyectos-rh__correccion \.proyectos-indicadores \{[^}]*align-items: start/,
    )
    // El título cruza TODAS las columnas: los indicadores arrancan parejos.
    expect(cssProyectos).toMatch(
      /\.proyectos-rh__correccion \.proyectos-indicadores__titulo \{[^}]*grid-column: 1 \/ -1/,
    )
  })
})

describe('ProyectoDetalle — sin referencias documentales visibles (RH-02.3.4)', () => {
  it('ningún estado del Show muestra «§» al usuario', async () => {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue({
      total: 1,
      pagina: 1,
      por_pagina: 20,
      items: [participacion(1)],
    })
    renderRuta('/proyectos/1')
    await esperarDetalle()

    // Consulta + participación expandida + corrección abierta.
    expect(document.body.textContent).not.toContain('§')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Consultar participación' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Corregir participación' }),
    )
    expect(document.body.textContent).not.toContain('§')

    // Modo edición del proyecto (incluye el hint del estado).
    fireEvent.click(screen.getByRole('button', { name: 'Editar proyecto' }))
    expect(
      await screen.findByRole('heading', { name: 'Editar proyecto' }),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('§')
  })
})

