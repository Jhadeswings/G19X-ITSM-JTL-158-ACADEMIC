import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InicioRH from '../InicioRH.jsx'
import { obtenerAtencionRequerida, obtenerDistribucionCompetencia, obtenerEmpleadosActivos, obtenerProyectosActivos } from '../../api/dashboardRh.js'

vi.mock('../../api/dashboardRh.js', () => ({ obtenerAtencionRequerida: vi.fn(), obtenerDistribucionCompetencia: vi.fn(), obtenerEmpleadosActivos: vi.fn(), obtenerProyectosActivos: vi.fn() }))

beforeEach(() => {
  vi.mocked(obtenerEmpleadosActivos).mockReset()
  vi.mocked(obtenerProyectosActivos).mockReset()
  vi.mocked(obtenerAtencionRequerida).mockReset()
  vi.mocked(obtenerDistribucionCompetencia).mockReset()
  vi.mocked(obtenerEmpleadosActivos).mockResolvedValue({ total: 12, items: [] })
  vi.mocked(obtenerProyectosActivos).mockResolvedValue({ total: 4, items: [] })
  vi.mocked(obtenerAtencionRequerida).mockResolvedValue({ total: 0, items: [] })
  vi.mocked(obtenerDistribucionCompetencia).mockResolvedValue({
    competency_code: 'desempeno_tecnico',
    evaluables: 7,
    datos_insuficientes: 1,
    nivel_1_2_count: 2,
    nivel_1_2_percentage: '28.57',
    nivel_3_5_count: 5,
    nivel_3_5_percentage: '71.43',
  })
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

  it('muestra la distribución de una competencia con conteos y porcentajes del backend', async () => {
    render(<InicioRH token="t" />)
    expect(await screen.findByRole('heading', { name: 'Distribución de competencias' })).toBeInTheDocument()
    expect(await screen.findByText('Niveles 1–2')).toBeInTheDocument()
    expect(screen.getByText('2 (28.57 %)')).toBeInTheDocument()
    expect(screen.getByText('Niveles 3–5')).toBeInTheDocument()
    expect(screen.getByText('5 (71.43 %)')).toBeInTheDocument()
    expect(screen.getByText(/Datos insuficientes: 1/)).toBeInTheDocument()
    expect(obtenerDistribucionCompetencia).toHaveBeenCalledWith('t', 'desempeno_tecnico')
  })

  it('muestra el estado de carga inicial cuando aún no hay datos', async () => {
    let resolverDistribucion
    vi.mocked(obtenerDistribucionCompetencia).mockImplementationOnce(() => new Promise((resolver) => { resolverDistribucion = resolver }))
    render(<InicioRH token="t" />)
    expect(await screen.findByText(/Cargando distribución de/)).toBeInTheDocument()
    expect(screen.queryByText('Niveles 1–2')).not.toBeInTheDocument()
    resolverDistribucion({
      competency_code: 'desempeno_tecnico',
      evaluables: 7,
      datos_insuficientes: 1,
      nivel_1_2_count: 2,
      nivel_1_2_percentage: '28.57',
      nivel_3_5_count: 5,
      nivel_3_5_percentage: '71.43',
    })
    expect(await screen.findByText('Niveles 1–2')).toBeInTheDocument()
  })

  it('conserva la distribución anterior mientras se carga la nueva competencia', async () => {
    render(<InicioRH token="t" />)
    expect(await screen.findByText('2 (28.57 %)')).toBeInTheDocument()
    expect(obtenerDistribucionCompetencia).toHaveBeenCalledTimes(1)
    let resolverNueva
    vi.mocked(obtenerDistribucionCompetencia).mockImplementationOnce(() => new Promise((resolver) => { resolverNueva = resolver }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Competencia' }), { target: { value: 'liderazgo' } })
    expect(await screen.findByRole('status')).toHaveTextContent('Actualizando distribución…')
    // Sin parpadeo: los datos anteriores siguen montados durante la carga.
    expect(screen.getByText('2 (28.57 %)')).toBeInTheDocument()
    expect(screen.getByText('5 (71.43 %)')).toBeInTheDocument()
    expect(screen.queryByText(/Cargando distribución de/)).not.toBeInTheDocument()
    expect(obtenerDistribucionCompetencia).toHaveBeenCalledTimes(2)
    resolverNueva({
      competency_code: 'liderazgo',
      evaluables: 1,
      datos_insuficientes: 0,
      nivel_1_2_count: 0,
      nivel_1_2_percentage: '0.00',
      nivel_3_5_count: 1,
      nivel_3_5_percentage: '100.00',
    })
    expect(await screen.findByText('1 (100.00 %)')).toBeInTheDocument()
    expect(screen.queryByText('2 (28.57 %)')).not.toBeInTheDocument()
  })

  it('cambia de competencia con una sola consulta a la vez', async () => {
    render(<InicioRH token="t" />)
    await screen.findByText('Niveles 1–2')
    expect(obtenerDistribucionCompetencia).toHaveBeenCalledTimes(1)
    expect(obtenerDistribucionCompetencia).toHaveBeenCalledWith('t', 'desempeno_tecnico')
    vi.mocked(obtenerDistribucionCompetencia).mockResolvedValue({
      competency_code: 'liderazgo',
      evaluables: 1,
      datos_insuficientes: 0,
      nivel_1_2_count: 0,
      nivel_1_2_percentage: '0.00',
      nivel_3_5_count: 1,
      nivel_3_5_percentage: '100.00',
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Competencia' }), { target: { value: 'liderazgo' } })
    expect(await screen.findByText('1 (100.00 %)')).toBeInTheDocument()
    expect(obtenerDistribucionCompetencia).toHaveBeenCalledTimes(2)
    expect(obtenerDistribucionCompetencia).toHaveBeenNthCalledWith(1, 't', 'desempeno_tecnico')
    expect(obtenerDistribucionCompetencia).toHaveBeenNthCalledWith(2, 't', 'liderazgo')
  })

  it('maneja cero evaluables sin alarma y con datos insuficientes por separado', async () => {
    vi.mocked(obtenerDistribucionCompetencia).mockResolvedValue({
      competency_code: 'liderazgo',
      evaluables: 0,
      datos_insuficientes: 2,
      nivel_1_2_count: 0,
      nivel_1_2_percentage: '0.00',
      nivel_3_5_count: 0,
      nivel_3_5_percentage: '0.00',
    })
    render(<InicioRH token="t" />)
    expect(await screen.findByText('Aún no hay empleados evaluables en esta competencia.')).toBeInTheDocument()
    expect(screen.getByText(/Datos insuficientes: 2/)).toBeInTheDocument()
  })

  it('permite reintentar la distribución cuando falla', async () => {
    vi.mocked(obtenerDistribucionCompetencia).mockRejectedValueOnce(new Error('fallo'))
    render(<InicioRH token="t" />)
    expect(await screen.findByText('No pudimos cargar la distribución de desempeño técnico')).toBeInTheDocument()
    vi.mocked(obtenerDistribucionCompetencia).mockResolvedValue({
      competency_code: 'desempeno_tecnico',
      evaluables: 1,
      datos_insuficientes: 0,
      nivel_1_2_count: 1,
      nivel_1_2_percentage: '100.00',
      nivel_3_5_count: 0,
      nivel_3_5_percentage: '0.00',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByText('1 (100.00 %)')).toBeInTheDocument()
  })
})
