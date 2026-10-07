// Sección RH → Proyectos (PRD §20.3; ET §6–§8, §31; DECISIONES §15).
// La API se mockea: sin llamadas reales al backend.
//
// Qué se verifica aquí y NO debe romperse:
// - render inicial, carga, vacío, error con reintento y listado correcto;
// - selección/consulta de un proyecto (GET /{id}) con todos sus campos;
// - edición SOLO de los campos permitidos (nombre/área/cliente/estado) y
//   envío EXCLUSIVO de los cambios (nunca id, nombre_normalizado ni fechas);
// - PATCH exitoso con confirmación visual y recarga del catálogo;
// - error de PATCH (409/500) legible; 401 → alSesionExpirada;
// - ausencia del botón «Nuevo proyecto» (PRD §20.3/§11.1);
// - Escape: cierra en consulta, y en edición actúa como «Cancelar» (vuelve
//   a la consulta sin PATCH ni cierre del detalle; nunca descarta en silencio).

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  POR_PAGINA_DEFECTO_RH,
  actualizarProyectoRh,
  consultarProyectoRh,
  listarProyectosRh,
} from '../../api/proyectos.js'
import { listarParticipacionesDeProyecto } from '../../api/participaciones.js'
import Proyectos from '../Proyectos.jsx'

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
  return { ...original, listarParticipacionesDeProyecto: vi.fn() }
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

beforeEach(() => {
  vi.mocked(listarProyectosRh).mockReset()
  vi.mocked(consultarProyectoRh).mockReset()
  vi.mocked(actualizarProyectoRh).mockReset()
  vi.mocked(listarParticipacionesDeProyecto).mockReset()
  vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue(PARTICIPANTES_VACIOS)
  vi.mocked(listarProyectosRh).mockResolvedValue(CATALOGO)
  vi.mocked(consultarProyectoRh).mockImplementation((_token, id) =>
    Promise.resolve(CATALOGO.items.find((p) => p.id === Number(id))),
  )
})

/** Espera a que el catálogo deje de estar en carga. */
async function esperarListado() {
  await screen.findByRole('heading', { name: 'Proyectos', level: 1 })
  await waitFor(() => expect(screen.queryByText('Cargando proyectos…')).toBeNull())
}

describe('Proyectos RH — render inicial, carga y estados', () => {
  it('renderiza el encabezado y consulta el catálogo con el token', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()

    expect(listarProyectosRh).toHaveBeenCalledTimes(1)
    const [token, paginacion] = vi.mocked(listarProyectosRh).mock.calls[0]
    expect(token).toBe('token-rh')
    expect(paginacion.pagina).toBe(1)
    expect(paginacion.porPagina).toBe(POR_PAGINA_DEFECTO_RH)
  })

  it('muestra el estado de carga mientras responde el backend', async () => {
    vi.mocked(listarProyectosRh).mockReturnValue(new Promise(() => {}))
    render(<Proyectos token="token-rh" />)

    expect(screen.getByText('Cargando proyectos…')).toBeInTheDocument()
  })

  it('muestra el estado vacío cuando el catálogo no tiene proyectos', async () => {
    vi.mocked(listarProyectosRh).mockResolvedValue({
      total: 0,
      pagina: 1,
      por_pagina: 20,
      items: [],
    })
    render(<Proyectos token="token-rh" />)

    expect(
      await screen.findByText('Todavía no hay proyectos en el catálogo.'),
    ).toBeInTheDocument()
  })

  it('muestra error con reintento y vuelve a consultar', async () => {
    vi.mocked(listarProyectosRh).mockRejectedValueOnce(
      Object.assign(new Error('fallo del servidor'), { estado: 500 }),
    )
    render(<Proyectos token="token-rh" />)

    expect(
      await screen.findByText('No pudimos cargar los proyectos'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    await waitFor(() => expect(listarProyectosRh).toHaveBeenCalledTimes(2))
  })

  it('lista los proyectos con su estado oficial y sus datos', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()

    expect(screen.getByText('Proyecto 1')).toBeInTheDocument()
    expect(screen.getByText('Proyecto 2')).toBeInTheDocument()
    expect(screen.getByText('En proceso')).toBeInTheDocument()
    expect(screen.getByText('Completado')).toBeInTheDocument()
    expect(screen.getByText('Tecnología · Cliente interno')).toBeInTheDocument()
    expect(screen.getByText('Sin área ni cliente registrados')).toBeInTheDocument()
  })

  it('la paginación usa total/por_pagina del backend', async () => {
    vi.mocked(listarProyectosRh).mockResolvedValue({
      total: 42,
      pagina: 1,
      por_pagina: 20,
      items: [proyecto(1)],
    })
    render(<Proyectos token="token-rh" />)
    await esperarListado()

    fireEvent.click(
      screen.getByRole('button', { name: 'Página 2' }),
    )

    await waitFor(() => expect(listarProyectosRh).toHaveBeenCalledTimes(2))
    const [, paginacion] = vi.mocked(listarProyectosRh).mock.calls.at(-1)
    expect(paginacion.pagina).toBe(2)
  })
})

describe('Proyectos RH — sin creación (PRD §20.3/§11.1)', () => {
  it('no ofrece ningún botón de nuevo proyecto ni de alta', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()

    expect(
      screen.queryByRole('button', { name: /Nuevo proyecto|Crear proyecto|Registrar proyecto/i }),
    ).toBeNull()
    // El módulo de API jamás expone POST /rh/projects (DECISIONES §15).
    expect(Object.keys(await vi.importActual('../../api/proyectos.js'))).not.toContain(
      'crearProyectoRh',
    )
  })
})

describe('Proyectos RH — selección y consulta', () => {
  it('consulta el proyecto con su id y presenta todos sus campos', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Consultar' })[0],
    )

    expect(
      await screen.findByRole('heading', { name: 'Consultar proyecto' }),
    ).toBeInTheDocument()
    expect(consultarProyectoRh).toHaveBeenCalledWith('token-rh', 1)
    expect(screen.getAllByText('Proyecto 1').length).toBeGreaterThan(0)
    expect(screen.getByText('Tecnología')).toBeInTheDocument()
    expect(screen.getByText('Cliente interno')).toBeInTheDocument()
    expect(screen.getAllByText('En proceso').length).toBeGreaterThan(0)
    expect(screen.getByText('proyecto 1')).toBeInTheDocument()
  })

  it('presenta el neutro "—" cuando área o cliente no existen', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()

    fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[1])

    expect(
      await screen.findByRole('heading', { name: 'Consultar proyecto' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('un fallo al consultar el detalle muestra error con reintento', async () => {
    vi.mocked(consultarProyectoRh).mockRejectedValueOnce(
      Object.assign(new Error('Proyecto no encontrado.'), { estado: 404 }),
    )
    render(<Proyectos token="token-rh" />)
    await esperarListado()

    fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[0])

    expect(
      await screen.findByText('No pudimos cargar el proyecto'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    await waitFor(() => expect(consultarProyectoRh).toHaveBeenCalledTimes(2))
  })
})

/** Abre la edición del proyecto 1 (consulta → editar). */
async function abrirEdicion() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[0])
  await screen.findByRole('heading', { name: 'Consultar proyecto' })
  fireEvent.click(screen.getByRole('button', { name: 'Editar proyecto' }))
  await screen.findByRole('heading', { name: 'Editar proyecto' })
}

describe('Proyectos RH — edición administrativa (PATCH)', () => {
  it('abre el formulario con los valores actuales del proyecto', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()
    await abrirEdicion()

    expect(screen.getByLabelText('Nombre')).toHaveValue('Proyecto 1')
    expect(screen.getByLabelText('Área')).toHaveValue('Tecnología')
    expect(screen.getByLabelText('Cliente')).toHaveValue('Cliente interno')
    expect(screen.getByLabelText('Estado')).toHaveValue('EN_PROCESO')
  })

  it('envía SOLO los campos modificados y nada fuera del contrato', async () => {
    vi.mocked(actualizarProyectoRh).mockResolvedValue(
      proyecto(1, { nombre: 'Proyecto Renombrado', estado: 'CANCELADO' }),
    )
    render(<Proyectos token="token-rh" />)
    await esperarListado()
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

  it('un PATCH exitoso confirma, vuelve a consulta y recarga el catálogo', async () => {
    vi.mocked(actualizarProyectoRh).mockResolvedValue(
      proyecto(1, { nombre: 'Proyecto Renombrado', estado: 'CANCELADO' }),
    )
    render(<Proyectos token="token-rh" />)
    await esperarListado()
    await abrirEdicion()

    fireEvent.change(screen.getByLabelText('Estado'), {
      target: { value: 'CANCELADO' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Proyecto actualizado')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Consultar proyecto' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Proyecto Renombrado')).toBeInTheDocument()
    await waitFor(() => expect(listarProyectosRh).toHaveBeenCalledTimes(2))
  })

  it('sin cambios no hace ninguna petición PATCH', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()
    await abrirEdicion()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(actualizarProyectoRh).not.toHaveBeenCalled()
  })

  it('un nombre vacío se rechaza en cliente sin llamar al backend', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()
    await abrirEdicion()

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('El nombre del proyecto no puede estar vacío.')
    expect(actualizarProyectoRh).not.toHaveBeenCalled()
  })

  it('cancelar vuelve a la consulta sin enviar nada', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()
    await abrirEdicion()

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Otro nombre' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(
      screen.getByRole('heading', { name: 'Consultar proyecto' }),
    ).toBeInTheDocument()
    expect(actualizarProyectoRh).not.toHaveBeenCalled()
  })

  it('un 409 de nombre duplicado muestra la respuesta del backend', async () => {
    vi.mocked(actualizarProyectoRh).mockRejectedValue(
      Object.assign(new Error('Ya existe otro proyecto con ese nombre.'), {
        estado: 409,
      }),
    )
    render(<Proyectos token="token-rh" />)
    await esperarListado()
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
    render(<Proyectos token="token-rh" />)
    await esperarListado()
    await abrirEdicion()

    fireEvent.change(screen.getByLabelText('Área'), {
      target: { value: 'Operaciones' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('No pudimos guardar los cambios')).toBeInTheDocument()
  })
})

describe('Proyectos RH — participantes en el detalle (RH-02.1)', () => {
  /** Abre la consulta del proyecto 1 y espera los participantes. */
  async function abrirConsulta() {
    render(<Proyectos token="token-rh" />)
    await esperarListado()
    fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[0])
    await screen.findByRole('heading', { name: 'Consultar proyecto' })
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
    render(<Proyectos token="token-rh" alSesionExpirada={alSesionExpirada} />)
    await esperarListado()
    fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[0])

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

  it('el catálogo y la edición de proyecto siguen intactos', async () => {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue({
      total: 1,
      pagina: 1,
      por_pagina: 20,
      items: [participacion(1)],
    })
    await abrirConsulta()

    // El catálogo sigue visible y sin botón de creación.
    expect(screen.getByText('Proyecto 2')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Nuevo proyecto/i }),
    ).toBeNull()
    // La edición del proyecto no se mezcla con la participación: entra en
    // su propio formulario y los participantes desaparecen de la vista.
    fireEvent.click(screen.getByRole('button', { name: 'Editar proyecto' }))
    expect(
      await screen.findByRole('heading', { name: 'Editar proyecto' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Participantes')).toBeNull()
    expect(screen.queryByLabelText('Nombre')).toHaveValue('Proyecto 1')
  })
})

describe('Proyectos RH — refinamiento visual y navegación del detalle (RH-02.1 UX)', () => {
  /** Render + apertura del detalle del proyecto 1. */
  async function abrirDetalle() {
    render(<Proyectos token="token-rh" />)
    await esperarListado()
    fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[0])
    await screen.findByRole('heading', { name: 'Consultar proyecto' })
  }

  it('el listado usa una estructura estable de tres columnas por fila', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()

    const filas = document.querySelectorAll('.proyectos-rh__item')
    expect(filas.length).toBe(2)
    for (const fila of filas) {
      // Columna 1: datos (nombre + área/cliente) | 2: estado | 3: acción.
      const columnas = fila.children
      expect(columnas.length).toBe(3)
      expect(columnas[0]).toHaveClass('proyectos-rh__datos')
      expect(columnas[1]).toHaveClass('proyectos-rh__estado')
      expect(columnas[2]).toHaveClass('proyectos-rh__accion')
      expect(columnas[1].querySelector('.ui-badge')).not.toBeNull()
      expect(within(columnas[2]).getByRole('button', { name: 'Consultar' })).toBeTruthy()
    }
  })

  it('la fila del proyecto abierto queda seleccionada (visual y estructural)', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()

    fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[0])
    await screen.findByRole('heading', { name: 'Consultar proyecto' })

    const filas = document.querySelectorAll('.proyectos-rh__item')
    expect(filas[0]).toHaveClass('proyectos-rh__item--seleccionado')
    expect(filas[1]).not.toHaveClass('proyectos-rh__item--seleccionado')
    // La selección no depende solo del color: aria-current en el botón.
    expect(within(filas[0]).getByRole('button', { name: 'Consultar' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(
      within(filas[1]).getByRole('button', { name: 'Consultar' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('el detalle organiza los datos administrativos en dos columnas y la clave a ancho completo', async () => {
    await abrirDetalle()

    const datos = document.querySelector('.proyectos-rh__datos-admin')
    expect(datos).not.toBeNull()
    expect(within(datos).getAllByRole('term').map((dt) => dt.textContent)).toEqual([
      'Nombre',
      'Área',
      'Cliente',
      'Estado',
      'Clave de comparación',
    ])
    // La clave de comparación es el bloque de ancho completo, con su
    // explicación debajo (misma jerarquía, contenido intacto).
    const clave = datos.querySelector('.proyectos-rh__clave')
    expect(clave).not.toBeNull()
    expect(clave.querySelector('.proyectos-rh__clave-nota')).not.toBeNull()
    expect(screen.getByText('proyecto 1')).toBeInTheDocument()
  })

  it('la tabla de participantes mantiene columnas alineadas y horas/acción a la derecha', async () => {
    vi.mocked(listarParticipacionesDeProyecto).mockResolvedValue({
      total: 1,
      pagina: 1,
      por_pagina: 20,
      items: [participacion(1)],
    })
    await abrirDetalle()
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
    // Horas y Acción alineadas a la derecha (encabezado incluido, §14.1).
    expect(encabezados[3]).toHaveClass('tabla__th--right')
    expect(encabezados[4]).toHaveClass('tabla__th--right')
    const fila = tabla.querySelector('tbody tr')
    expect(fila.querySelectorAll('td[data-label], th[data-label]').length).toBe(5)
    expect(fila.querySelector("td[data-label='Horas']").textContent).toBe('120')
  })

  it('el botón X aparece con el detalle abierto y lo cierra sin recargar el catálogo', async () => {
    await abrirDetalle()

    const cerrar = screen.getByRole('button', { name: 'Cerrar detalle' })
    expect(cerrar).toBeInTheDocument()

    fireEvent.click(cerrar)

    // El detalle desaparece y el catálogo sigue en pantalla.
    expect(screen.queryByRole('heading', { name: 'Consultar proyecto' })).toBeNull()
    expect(screen.getByText('Proyecto 2')).toBeInTheDocument()
    // Sin recarga innecesaria: sigue habiendo UNA sola consulta del catálogo.
    expect(listarProyectosRh).toHaveBeenCalledTimes(1)
  })

  it('Escape cierra el detalle con exactamente el mismo efecto que la X', async () => {
    await abrirDetalle()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('heading', { name: 'Consultar proyecto' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cerrar detalle' })).toBeNull()
    expect(screen.getByText('Proyecto 2')).toBeInTheDocument()
    expect(listarProyectosRh).toHaveBeenCalledTimes(1)
  })

  it('Escape no hace nada específico cuando no hay detalle abierto', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()

    fireEvent.keyDown(document, { key: 'Escape' })

    // El listado sigue igual y no aparece ningún detalle.
    expect(screen.getByText('Proyecto 1')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Consultar proyecto' })).toBeNull()
    expect(listarProyectosRh).toHaveBeenCalledTimes(1)
  })

  it('Escape en modo edición actúa como Cancelar: vuelve a la consulta sin cerrar el detalle ni hacer PATCH', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()
    await abrirEdicion()

    // Cambios sin guardar en el formulario.
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Cambio sin guardar' },
    })
    fireEvent.keyDown(document, { key: 'Escape' })

    // El detalle NO se cierra: se vuelve a la consulta del mismo proyecto.
    expect(
      screen.getByRole('heading', { name: 'Consultar proyecto' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Editar proyecto' }),
    ).toBeNull()
    // El proyecto consultado sigue en pantalla (catálogo y detalle).
    expect(screen.getAllByText('Proyecto 1').length).toBeGreaterThan(0)
    expect(actualizarProyectoRh).not.toHaveBeenCalled()
    expect(listarProyectosRh).toHaveBeenCalledTimes(1)
  })

  it('Escape en modo edición tiene exactamente el mismo efecto que pulsar Cancelar', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()
    await abrirEdicion()

    fireEvent.change(screen.getByLabelText('Área'), {
      target: { value: 'Otra área' },
    })
    fireEvent.keyDown(document, { key: 'Escape' })

    // Mismas garantías que el test de «Cancelar»: consulta del mismo
    // proyecto y nada enviado al backend.
    expect(
      screen.getByRole('heading', { name: 'Consultar proyecto' }),
    ).toBeInTheDocument()
    expect(actualizarProyectoRh).not.toHaveBeenCalled()

    // Y al reentrar en edición, el formulario vuelve a nacer de la
    // consulta: el cambio no guardado no se cuela (igual que Cancelar).
    fireEvent.click(screen.getByRole('button', { name: 'Editar proyecto' }))
    expect(
      await screen.findByRole('heading', { name: 'Editar proyecto' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Área')).toHaveValue('Tecnología')
  })

  it('tras Escape en edición, la X sigue cerrando la consulta sin recargar el catálogo', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()
    await abrirEdicion()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      screen.getByRole('heading', { name: 'Consultar proyecto' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }))

    expect(screen.queryByRole('heading', { name: 'Consultar proyecto' })).toBeNull()
    expect(screen.getByText('Proyecto 2')).toBeInTheDocument()
    expect(listarProyectosRh).toHaveBeenCalledTimes(1)
  })

  it('cerrar el detalle conserva la página de paginación y el estado del listado', async () => {
    vi.mocked(listarProyectosRh).mockResolvedValue({
      total: 42,
      pagina: 1,
      por_pagina: 20,
      items: [proyecto(1), proyecto(2)],
    })
    render(<Proyectos token="token-rh" />)
    await esperarListado()

    // Ir a la página 2 (segunda consulta del catálogo).
    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }))
    await waitFor(() => expect(listarProyectosRh).toHaveBeenCalledTimes(2))

    // Abrir y cerrar el detalle: el listado NO se recarga de nuevo.
    fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[0])
    await screen.findByRole('heading', { name: 'Consultar proyecto' })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }))

    expect(screen.queryByRole('heading', { name: 'Consultar proyecto' })).toBeNull()
    expect(listarProyectosRh).toHaveBeenCalledTimes(2)
    // La paginación sigue presente (misma página, mismo estado).
    expect(
      screen.getByRole('navigation', { name: 'Paginación de proyectos' }),
    ).toBeInTheDocument()
  })

  it('la ayuda contextual aparece sin detalle y desaparece al abrir uno', async () => {
    render(<Proyectos token="token-rh" />)
    await esperarListado()

    expect(
      screen.getByText('Selecciona un proyecto para consultar su detalle.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[0])
    await screen.findByRole('heading', { name: 'Consultar proyecto' })

    expect(
      screen.queryByText('Selecciona un proyecto para consultar su detalle.'),
    ).toBeNull()
  })
})

describe('Proyectos RH — 401 delega en alSesionExpirada (§31/§32)', () => {
  it('un 401 al listar cierra la sesión', async () => {
    vi.mocked(listarProyectosRh).mockRejectedValue(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    const alSesionExpirada = vi.fn()
    render(<Proyectos token="token-rh" alSesionExpirada={alSesionExpirada} />)

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('No pudimos cargar los proyectos')).toBeNull()
  })

  it('un 401 al consultar el detalle cierra la sesión', async () => {
    vi.mocked(consultarProyectoRh).mockRejectedValue(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    const alSesionExpirada = vi.fn()
    render(<Proyectos token="token-rh" alSesionExpirada={alSesionExpirada} />)
    await esperarListado()

    fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[0])

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
  })

  it('un 401 al guardar cierra la sesión', async () => {
    vi.mocked(actualizarProyectoRh).mockRejectedValue(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    const alSesionExpirada = vi.fn()
    render(<Proyectos token="token-rh" alSesionExpirada={alSesionExpirada} />)
    await esperarListado()
    await abrirEdicion()

    fireEvent.change(screen.getByLabelText('Área'), {
      target: { value: 'Operaciones' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('No pudimos guardar los cambios')).toBeNull()
  })
})
