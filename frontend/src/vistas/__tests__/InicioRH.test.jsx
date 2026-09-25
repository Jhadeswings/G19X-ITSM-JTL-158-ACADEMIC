import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InicioRH from '../InicioRH.jsx'
import { obtenerAtencionRequerida, obtenerEmpleadosActivos, obtenerProyectosActivos } from '../../api/dashboardRh.js'

vi.mock('../../api/dashboardRh.js', () => ({ obtenerAtencionRequerida: vi.fn(), obtenerEmpleadosActivos: vi.fn(), obtenerProyectosActivos: vi.fn() }))

beforeEach(() => {
  vi.mocked(obtenerEmpleadosActivos).mockReset()
  vi.mocked(obtenerProyectosActivos).mockReset()
  vi.mocked(obtenerAtencionRequerida).mockReset()
  vi.mocked(obtenerEmpleadosActivos).mockResolvedValue({ total: 12, items: [] })
  vi.mocked(obtenerProyectosActivos).mockResolvedValue({ total: 4, items: [] })
  vi.mocked(obtenerAtencionRequerida).mockResolvedValue({ total: 0, items: [] })
})

describe('InicioRH', () => {
  it('muestra las tres métricas usando los totales del backend', async () => {
    render(<InicioRH token="t" />)
    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('Empleados activos')).toBeInTheDocument()
    expect(screen.getByText('Proyectos activos')).toBeInTheDocument()
    expect(screen.getAllByText('Atención requerida')).toHaveLength(2)
  })

  it('muestra ambos motivos de una persona sin duplicarla', async () => {
    vi.mocked(obtenerAtencionRequerida).mockResolvedValue({ total: 1, items: [{ empleado_id: 1, nombre: 'Ana López', motivos: ['PERFIL_INCOMPLETO', 'SIN_PARTICIPACION_RECIENTE'] }] })
    render(<InicioRH token="t" />)
    expect(await screen.findByText('Ana López')).toBeInTheDocument()
    expect(screen.getByText('Perfil incompleto')).toBeInTheDocument()
    expect(screen.getByText('Sin participación reciente')).toBeInTheDocument()
  })

  it('muestra estado vacío neutral cuando no hay atención', async () => {
    render(<InicioRH token="t" />)
    expect(await screen.findByText('No hay empleados que requieran atención en este momento.')).toBeInTheDocument()
  })

  it('permite reintentar una métrica que falló', async () => {
    vi.mocked(obtenerProyectosActivos).mockRejectedValueOnce(new Error('fallo')).mockResolvedValueOnce({ total: 4, items: [] })
    render(<InicioRH token="t" />)
    expect(await screen.findByText('No pudimos cargar proyectos activos')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument())
  })

  it('navega a Empleados mediante la acción existente', async () => {
    vi.mocked(obtenerAtencionRequerida).mockResolvedValue({ total: 1, items: [{ empleado_id: 1, nombre: 'Ana López', motivos: ['PERFIL_INCOMPLETO'] }] })
    const onVerEmpleados = vi.fn()
    render(<InicioRH token="t" onVerEmpleados={onVerEmpleados} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ver empleados' }))
    expect(onVerEmpleados).toHaveBeenCalledTimes(1)
  })
})
