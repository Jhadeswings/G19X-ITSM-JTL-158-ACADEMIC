// Sección RH → Auditoría (Tarea C; PRD §22; ET §25; Style Guide §13/§14).
// La API se mockea: sin llamadas reales al backend.
//
// Qué se verifica aquí y NO debe romperse:
// - render inicial con el token y estados carga → listo;
// - contrato AuditoriaOut tal cual llega (quién/entidad/operación/motivo y
//   valores anterior → nuevo), sin reordenar ni filtrar en el cliente;
// - vacío sin tabla ni paginación; error con reintento; 401 → alSesionExpirada;
// - paginación con el contrato del backend (solo cuando el volumen justifica);
// - SOLO LECTURA: sin crear, editar ni eliminar registros.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POR_PAGINA_DEFECTO, listarAuditorias } from '../../api/auditorias.js'
import Auditorias from '../Auditorias.jsx'

vi.mock('../../api/auditorias.js', async () => {
  const original = await vi.importActual('../../api/auditorias.js')
  return { ...original, listarAuditorias: vi.fn() }
})

/** Registro fiel a `AuditoriaOut` (§25 + identificación de presentación). */
function registro(id, sobre = {}) {
  return {
    id,
    actor_cuenta_id: 4,
    actor_email: 'rh@empresa.dev',
    entidad: 'participacion',
    entidad_id: id,
    operacion: 'CORRECCION',
    valores_anteriores: { horas: 100 },
    valores_nuevos: { horas: 150 },
    motivo: 'Corrección de horas',
    fecha: '2026-10-01T12:00:00+00:00',
    empleado_nombre: 'Vanesa Gutiérrez Zamora',
    proyecto_nombre: 'Prueba 1',
    ...sobre,
  }
}

/** Página fiel a `AuditoriaPageOut`. */
function pagina(items, { total = items.length, pagina = 1 } = {}) {
  return { total, pagina, por_pagina: POR_PAGINA_DEFECTO, items }
}

const REGISTROS = [registro(1), registro(2, { entidad_id: 9 })]

/** Espera a que la pantalla deje de estar en su carga inicial. */
async function esperarListado() {
  await screen.findByRole('heading', { name: 'Auditoría', level: 1 })
  await waitFor(() =>
    expect(
      screen.queryByText('Cargando auditoría…') ||
        screen.queryByText('No pudimos cargar la auditoría') ||
        screen.queryByText('Todavía no hay correcciones registradas.') ||
        screen.queryByRole('table'),
    ).toBeTruthy(),
  )
}

beforeEach(() => {
  vi.mocked(listarAuditorias).mockReset()
  vi.mocked(listarAuditorias).mockResolvedValue(pagina([]))
})

describe('Auditorías RH — consulta y contrato', () => {
  it('renderiza el encabezado y consulta los registros con el token', async () => {
    render(<Auditorias token="token-rh" />)
    await esperarListado()

    expect(listarAuditorias).toHaveBeenCalledTimes(1)
    expect(listarAuditorias).toHaveBeenCalledWith(
      'token-rh',
      expect.objectContaining({ pagina: 1 }),
    )
  })

  it('presenta el contrato tal cual llega, sin reordenar ni filtrar', async () => {
    vi.mocked(listarAuditorias).mockResolvedValue(pagina(REGISTROS))
    render(<Auditorias token="token-rh" />)

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getAllByText('rh@empresa.dev')).toHaveLength(2)
    expect(screen.getAllByText('CORRECCION')).toHaveLength(2)
    expect(
      screen.getByText((_, el) => el?.textContent === 'participacion #1'),
    ).toBeInTheDocument()
    expect(
      screen.getByText((_, el) => el?.textContent === 'participacion #9'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Corrección de horas')).toHaveLength(2)
    expect(screen.getAllByText('horas:').length).toBeGreaterThan(0)
    // Contexto del registro auditado: empleado y proyecto sin buscar el ID.
    expect(screen.getAllByText('Vanesa Gutiérrez Zamora')).toHaveLength(2)
    expect(screen.getAllByText('Prueba 1')).toHaveLength(2)
  })

  it('sin contexto muestra «No disponible», sin inventar nombres', async () => {
    vi.mocked(listarAuditorias).mockResolvedValue(
      pagina([
        registro(5, { empleado_nombre: null, proyecto_nombre: null }),
      ]),
    )
    render(<Auditorias token="token-rh" />)

    await screen.findByRole('table')
    expect(screen.getAllByText('No disponible')).toHaveLength(2)
  })

  it('sin actor_email muestra la cuenta técnica, sin inventar identidad', async () => {
    vi.mocked(listarAuditorias).mockResolvedValue(
      pagina([registro(3, { actor_email: null, actor_cuenta_id: 9 })]),
    )
    render(<Auditorias token="token-rh" />)

    expect(await screen.findByText('Cuenta #9')).toBeInTheDocument()
    expect(screen.queryByText('rh@empresa.dev')).not.toBeInTheDocument()
  })

  it('sin valores ni motivo muestra el marcador neutro, sin romper', async () => {
    vi.mocked(listarAuditorias).mockResolvedValue(
      pagina([
        registro(4, {
          valores_anteriores: null,
          valores_nuevos: null,
          motivo: null,
        }),
      ]),
    )
    render(<Auditorias token="token-rh" />)

    await screen.findByRole('table')
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('no expone creación, edición ni eliminación: solo consulta', async () => {
    vi.mocked(listarAuditorias).mockResolvedValue(pagina(REGISTROS))
    render(<Auditorias token="token-rh" />)
    await screen.findByRole('table')

    expect(screen.queryByRole('button', { name: /crear|nuevo|editar|eliminar/i })).toBeNull()
  })
})

describe('Auditorías RH — estados y paginación', () => {
  it('vacío: mensaje neutro sin tabla ni paginación', async () => {
    render(<Auditorias token="token-rh" />)

    expect(
      await screen.findByText('Todavía no hay correcciones registradas.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Paginación/)).not.toBeInTheDocument()
    expect(listarAuditorias).toHaveBeenCalledTimes(1)
  })

  it('muestra el error con reintento y recupera el listado', async () => {
    vi.mocked(listarAuditorias)
      .mockRejectedValueOnce(new Error('fallo del servidor'))
      .mockResolvedValueOnce(pagina(REGISTROS))
    render(<Auditorias token="token-rh" />)

    expect(
      await screen.findByText('No pudimos cargar la auditoría'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(listarAuditorias).toHaveBeenCalledTimes(2)
  })

  it('un 401 cierra la sesión sin mostrar estado de error', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(listarAuditorias).mockRejectedValueOnce(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    render(<Auditorias token="token-rh" alSesionExpirada={alSesionExpirada} />)

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('No pudimos cargar la auditoría'),
    ).not.toBeInTheDocument()
  })

  it('pagina con el contrato del backend cuando el volumen lo justifica', async () => {
    const total = POR_PAGINA_DEFECTO + 1
    const primera = Array.from({ length: POR_PAGINA_DEFECTO }, (_, i) => registro(i + 1))
    vi.mocked(listarAuditorias).mockResolvedValueOnce(
      pagina(primera, { total, pagina: 1 }),
    )
    render(<Auditorias token="token-rh" />)

    expect(await screen.findByRole('table')).toBeInTheDocument()
    const siguiente = screen.getByRole('button', { name: 'Página siguiente' })
    expect(siguiente).toBeInTheDocument()

    vi.mocked(listarAuditorias).mockResolvedValueOnce(
      pagina([registro(99)], { total, pagina: 2 }),
    )
    fireEvent.click(siguiente)

    await waitFor(() => expect(listarAuditorias).toHaveBeenCalledTimes(2))
    expect(listarAuditorias).toHaveBeenLastCalledWith(
      'token-rh',
      expect.objectContaining({ pagina: 2 }),
    )
  })
})
