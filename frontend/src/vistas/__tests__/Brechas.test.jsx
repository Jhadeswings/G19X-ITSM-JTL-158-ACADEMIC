// Sección RH → Brechas (PRD §15/§20.7). La API se mockea: sin llamadas reales.
//
// Qué se verifica aquí y NO debe romperse:
// - el contrato completo de BrechaOut tal cual llega (cantidad Y porcentaje
//   de niveles 1–2 y 3–5, evaluables y Datos insuficientes por separado);
// - una competencia por consulta y una sola consulta por cambio;
// - los porcentajes se muestran TAL CUAL llegan del backend (sin recálculo);
// - 0 evaluables es un estado neutro, sin alarma y sin nivel 0;
// - estados de carga, error con reintento y 401 (patrón de las vistas RH);
// - sin empleados individuales ni ranking (PRD §15).

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Brechas from '../Brechas.jsx'
import { obtenerDistribucionCompetencia } from '../../api/dashboardRh.js'

vi.mock('../../api/dashboardRh.js', () => ({
  obtenerDistribucionCompetencia: vi.fn(),
}))

/** Brecha fiel a `BrechaOut` (porcentajes deliberadamente NO redondos). */
const BRECHA = {
  competency_code: 'desempeno_tecnico',
  evaluables: 7,
  datos_insuficientes: 1,
  nivel_1_2_count: 2,
  nivel_1_2_percentage: '28.57',
  nivel_3_5_count: 5,
  nivel_3_5_percentage: '71.43',
}

beforeEach(() => {
  vi.mocked(obtenerDistribucionCompetencia).mockReset()
  vi.mocked(obtenerDistribucionCompetencia).mockResolvedValue(BRECHA)
})

describe('Brechas — contrato y consulta', () => {
  it('consulta la primera competencia al abrir y muestra el contrato completo', async () => {
    render(<Brechas token="token-rh" />)

    expect(await screen.findByText('Niveles 1–2')).toBeInTheDocument()
    expect(screen.getByText('2 (28.57 %)')).toBeInTheDocument()
    expect(screen.getByText('Niveles 3–5')).toBeInTheDocument()
    expect(screen.getByText('5 (71.43 %)')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText(/empleados evaluables en Desempeño técnico/)).toBeInTheDocument()
    expect(screen.getByText(/Datos insuficientes: 1/)).toBeInTheDocument()
    expect(obtenerDistribucionCompetencia).toHaveBeenCalledTimes(1)
    expect(obtenerDistribucionCompetencia).toHaveBeenCalledWith(
      'token-rh',
      'desempeno_tecnico',
    )
  })

  it('ofrece exactamente las cinco competencias oficiales en el selector', async () => {
    render(<Brechas token="token-rh" />)
    await screen.findByText('Niveles 1–2')

    const opciones = screen
      .getByRole('combobox')
      .querySelectorAll('option')
    expect([...opciones].map((opcion) => opcion.textContent)).toEqual([
      'Desempeño técnico',
      'Liderazgo',
      'Trabajo en equipo',
      'Comunicación',
      'Capacidad de aprendizaje',
    ])
  })

  it('cambiar de competencia hace exactamente UNA consulta nueva', async () => {
    render(<Brechas token="token-rh" />)
    await screen.findByText('Niveles 1–2')

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'liderazgo' },
    })

    await waitFor(() =>
      expect(obtenerDistribucionCompetencia).toHaveBeenCalledTimes(2),
    )
    expect(obtenerDistribucionCompetencia).toHaveBeenLastCalledWith(
      'token-rh',
      'liderazgo',
    )
  })

  it('conserva la distribución anterior mientras carga la nueva competencia', async () => {
    let resolverSegunda
    vi.mocked(obtenerDistribucionCompetencia)
      .mockResolvedValueOnce(BRECHA)
      .mockImplementationOnce(
        () =>
          new Promise((resolver) => {
            resolverSegunda = resolver
          }),
      )
    render(<Brechas token="token-rh" />)
    expect(await screen.findByText('2 (28.57 %)')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'liderazgo' },
    })

    // La respuesta nueva no llegó: los datos anteriores siguen visibles.
    expect(screen.getByText('2 (28.57 %)')).toBeInTheDocument()
    resolverSegunda?.({ ...BRECHA, competency_code: 'liderazgo' })
    await waitFor(() =>
      expect(obtenerDistribucionCompetencia).toHaveBeenCalledTimes(2),
    )
  })
})

describe('Brechas — presentación y estados', () => {
  it('muestra los porcentajes TAL CUAL llegan del backend, sin recalcularlos', async () => {
    // Porcentaje deliberadamente INCOHERENTE con la aritmética local
    // (2 de 7 sería 28.57): si React recalculase, aquí aparecería otro valor.
    vi.mocked(obtenerDistribucionCompetencia).mockResolvedValue({
      ...BRECHA,
      nivel_1_2_percentage: '33.33',
    })
    render(<Brechas token="token-rh" />)

    expect(await screen.findByText('2 (33.33 %)')).toBeInTheDocument()
    expect(screen.queryByText('2 (28.57 %)')).not.toBeInTheDocument()
  })

  it('0 evaluables es un estado neutro: vacío sin alarma y DI por separado', async () => {
    vi.mocked(obtenerDistribucionCompetencia).mockResolvedValue({
      competency_code: 'liderazgo',
      evaluables: 0,
      datos_insuficientes: 3,
      nivel_1_2_count: 0,
      nivel_1_2_percentage: '0.00',
      nivel_3_5_count: 0,
      nivel_3_5_percentage: '0.00',
    })
    render(<Brechas token="token-rh" />)

    expect(
      await screen.findByText(
        'Aún no hay empleados evaluables en esta competencia.',
      ),
    ).toBeInTheDocument()
    // DI sigue visible por separado y jamás se presenta como nivel 0.
    expect(screen.getByText(/Datos insuficientes: 3/)).toBeInTheDocument()
    expect(screen.queryByText('Niveles 1–2')).not.toBeInTheDocument()
  })

  it('explica el contexto de las cifras con las etiquetas oficiales', async () => {
    render(<Brechas token="token-rh" />)
    await screen.findByText('Niveles 1–2')

    expect(
      screen.getByText(/niveles 1–2 agrupa los niveles Inicial y En desarrollo/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/calcula solo sobre los 7 empleados evaluables/),
    ).toBeInTheDocument()
  })

  it('muestra el error con reintento y recupera la distribución', async () => {
    vi.mocked(obtenerDistribucionCompetencia)
      .mockRejectedValueOnce(new Error('fallo del servidor'))
      .mockResolvedValueOnce(BRECHA)
    render(<Brechas token="token-rh" />)

    expect(
      await screen.findByText('No pudimos cargar las brechas de desempeño técnico'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(await screen.findByText('2 (28.57 %)')).toBeInTheDocument()
  })

  it('un 401 cierra la sesión sin mostrar estado de error', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(obtenerDistribucionCompetencia).mockRejectedValueOnce(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    render(<Brechas token="token-rh" alSesionExpirada={alSesionExpirada} />)

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText(/No pudimos cargar las brechas/),
    ).not.toBeInTheDocument()
  })

  it('no muestra empleados individuales ni listas tipo ranking', async () => {
    render(<Brechas token="token-rh" />)
    await screen.findByText('Niveles 1–2')

    // Sin <ul>/<li>: solo los dos grupos agregados del contrato (dl/div).
    expect(document.querySelector('.brechas ul')).toBeNull()
    expect(document.querySelector('.brechas li')).toBeNull()
    expect(screen.queryByText(/mejor|top|ranking/i)).not.toBeInTheDocument()
  })
})