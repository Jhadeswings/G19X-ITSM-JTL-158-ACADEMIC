// Sección RH → Proyectos — INDEX /proyectos (RH-02.3; PRD §20.3; ET §6–§8,
// §31; DECISIONES §15). La API se mockea: sin llamadas reales al backend.
//
// Qué se verifica aquí y NO debe romperse:
// - render inicial, carga, vacío, error con reintento y listado correcto;
// - estados oficiales y estructura estable de tres columnas por fila;
// - paginación con el contrato del backend;
// - ausencia del botón «Nuevo proyecto» (PRD §20.3/§11.1);
// - «Consultar» NAVEGA a la página real /proyectos/:id (RH-02.3): el
//   catálogo se desmonta y no renderiza ningún detalle;
// - título de la pestaña del Index.
// La página de detalle (/proyectos/:id) tiene SU archivo de pruebas:
// ProyectoDetalle.test.jsx.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import {
  POR_PAGINA_DEFECTO_RH,
  listarProyectosRh,
} from '../../api/proyectos.js'
import Proyectos from '../Proyectos.jsx'
import { MIN_CARGA_PROYECTOS_MS, crearEsperaMinima } from '../proyectosComun.js'

vi.mock('../../api/proyectos.js', async () => {
  const original = await vi.importActual('../../api/proyectos.js')
  return {
    ...original,
    listarProyectosRh: vi.fn(),
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

/** Sonda de ruta: expone el pathname actual del router en pantalla. */
function Sonda() {
  const { pathname } = useLocation()
  return <p data-testid="sonda-ruta">{pathname}</p>
}

/** Stub del Show: aparece SOLO si el Index navegó a /proyectos/:id. */
function DetalleStub() {
  return <p>Show del proyecto</p>
}

/** Render del Index dentro del router con sus dos rutas reales. */
function renderIndex(props = {}) {
  return render(
    <MemoryRouter initialEntries={['/proyectos']}>
      <Sonda />
      <Routes>
        <Route
          path="/proyectos"
          element={<Proyectos token="token-rh" {...props} />}
        />
        <Route path="/proyectos/:id" element={<DetalleStub />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Espera a que el catálogo deje de estar en carga. */
async function esperarListado() {
  await screen.findByRole('heading', { name: 'Proyectos', level: 1 })
  await waitFor(() => expect(screen.queryByText('Cargando proyectos…')).toBeNull())
}

beforeEach(() => {
  vi.mocked(listarProyectosRh).mockReset()
  vi.mocked(listarProyectosRh).mockResolvedValue(CATALOGO)
})

describe('Proyectos RH (Index /proyectos) — render inicial, carga y estados', () => {
  it('renderiza el encabezado y consulta el catálogo con el token', async () => {
    renderIndex()
    await esperarListado()

    expect(listarProyectosRh).toHaveBeenCalledTimes(1)
    const [token, paginacion] = vi.mocked(listarProyectosRh).mock.calls[0]
    expect(token).toBe('token-rh')
    expect(paginacion.pagina).toBe(1)
    expect(paginacion.porPagina).toBe(POR_PAGINA_DEFECTO_RH)
  })

  it('muestra el estado de carga mientras responde el backend', async () => {
    vi.mocked(listarProyectosRh).mockReturnValue(new Promise(() => {}))
    renderIndex()

    expect(screen.getByText('Cargando proyectos…')).toBeInTheDocument()
  })

  it('muestra el estado vacío cuando el catálogo no tiene proyectos', async () => {
    vi.mocked(listarProyectosRh).mockResolvedValue({
      total: 0,
      pagina: 1,
      por_pagina: 20,
      items: [],
    })
    renderIndex()

    expect(
      await screen.findByText('Todavía no hay proyectos en el catálogo.'),
    ).toBeInTheDocument()
  })

  it('muestra error con reintento y vuelve a consultar', async () => {
    vi.mocked(listarProyectosRh).mockRejectedValueOnce(
      Object.assign(new Error('fallo del servidor'), { estado: 500 }),
    )
    renderIndex()

    expect(
      await screen.findByText('No pudimos cargar los proyectos'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    await waitFor(() => expect(listarProyectosRh).toHaveBeenCalledTimes(2))
  })

  it('lista los proyectos con su estado oficial y sus datos', async () => {
    renderIndex()
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
    renderIndex()
    await esperarListado()

    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }))

    await waitFor(() => expect(listarProyectosRh).toHaveBeenCalledTimes(2))
    const [, paginacion] = vi.mocked(listarProyectosRh).mock.calls.at(-1)
    expect(paginacion.pagina).toBe(2)
  })
})

describe('Proyectos RH (Index /proyectos) — sin creación (PRD §20.3/§11.1)', () => {
  it('no ofrece ningún botón de nuevo proyecto ni de alta', async () => {
    renderIndex()
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

describe('Proyectos RH (Index /proyectos) — navegación al Show (RH-02.3)', () => {
  it('«Consultar» navega a la página real /proyectos/:id y desmonta el catálogo', async () => {
    renderIndex()
    await esperarListado()

    fireEvent.click(screen.getAllByRole('button', { name: 'Consultar' })[0])

    // La URL del router cambió al detalle del proyecto 1.
    await waitFor(() =>
      expect(screen.getByTestId('sonda-ruta').textContent).toBe('/proyectos/1'),
    )
    // El catálogo desapareció: el Show es otra página, no un panel debajo.
    expect(screen.queryByText('Catálogo de proyectos')).toBeNull()
    expect(screen.queryByText('Selecciona un proyecto para consultar su detalle.')).toBeNull()
    expect(screen.getByText('Show del proyecto')).toBeInTheDocument()
  })

  it('el Index NO renderiza ningún detalle (RH-02.3 §19.A)', async () => {
    renderIndex()
    await esperarListado()

    expect(screen.queryByText('Show del proyecto')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Detalle del proyecto' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Volver al listado' })).toBeNull()
    // La ruta sigue siendo la del catálogo.
    expect(screen.getByTestId('sonda-ruta').textContent).toBe('/proyectos')
  })

  it('la fila mantiene la estructura estable de tres columnas', async () => {
    renderIndex()
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
      expect(within(fila).getByRole('button', { name: 'Consultar' })).toBeTruthy()
    }
  })

  it('document.title del Index y restauración al desmontar', async () => {
    const tituloPrevio = document.title
    const { unmount } = renderIndex()
    await esperarListado()

    expect(document.title).toBe('Proyectos | Talento PluriOne')

    unmount()
    expect(document.title).toBe(tituloPrevio)
  })
})

describe('Proyectos RH (Index /proyectos) — presencia mínima del loading (RH-02.3.3)', () => {
  it('una respuesta muy rápida no elimina el loading de inmediato: transición tras el mínimo', async () => {
    renderIndex()
    const inicio = performance.now()

    expect(screen.getByText('Cargando proyectos…')).toBeInTheDocument()
    await new Promise((resolver) => setTimeout(resolver, 150))
    // Dentro del mínimo perceptible: el loading sigue visible.
    expect(screen.getByText('Cargando proyectos…')).toBeInTheDocument()

    // La transición al contenido llega con el mínimo cumplido (450 ms con
    // margen de tolerancia del entorno), nunca con el flash instantáneo.
    await screen.findByText('Proyecto 1')
    expect(performance.now() - inicio).toBeGreaterThanOrEqual(430)
  })

  it('un error del catálogo no espera el mínimo', async () => {
    vi.mocked(listarProyectosRh).mockRejectedValueOnce(
      Object.assign(new Error('Error del servidor'), { estado: 500 }),
    )
    const inicio = performance.now()
    renderIndex()

    expect(
      await screen.findByText('No pudimos cargar los proyectos'),
    ).toBeInTheDocument()
    expect(performance.now() - inicio).toBeLessThan(400)
  })

  it('el 401 sigue subiendo sin esperar el mínimo', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(listarProyectosRh).mockRejectedValueOnce(
      Object.assign(new Error('No autorizado'), { estado: 401 }),
    )
    const inicio = performance.now()
    renderIndex({ alSesionExpirada })

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(performance.now() - inicio).toBeLessThan(400)
    // Sin estado de error visible: el 401 pertenece a la sesión, no al catálogo.
    expect(screen.queryByText('No pudimos cargar los proyectos')).toBeNull()
  })
})

describe('crearEsperaMinima — helper cancelable de la espera mínima (RH-02.3.3)', () => {
  it('esperar() resuelve solo tras el mínimo y cancelar() impide resolver (timers limpios)', async () => {
    const espera = crearEsperaMinima()
    const inicio = performance.now()

    let resuelta = false
    espera.esperar(inicio).then(() => {
      resuelta = true
    })

    // Dentro del mínimo: la espera sigue pendiente.
    await new Promise((resolver) => setTimeout(resolver, 150))
    expect(resuelta).toBe(false)

    // Esperar de nuevo con el MISMO inicio ya no bloquea: el mínimo se mide
    // DESDE EL INICIO DE LA PETICIÓN, no desde cada llamada a esperar().
    await espera.esperar(inicio)
    expect(resuelta).toBe(true)
    expect(performance.now() - inicio).toBeGreaterThanOrEqual(430)

    // Una espera cancelada NUNCA resuelve: desmontaje/limpieza sin setState
    // posterior (los temporizadores pendientes quedan limpios).
    let resueltaCancelada = false
    espera.esperar().then(() => {
      resueltaCancelada = true
    })
    espera.cancelar()
    await new Promise((resolver) =>
      setTimeout(resolver, MIN_CARGA_PROYECTOS_MS + 100),
    )
    expect(resueltaCancelada).toBe(false)
  })
})
