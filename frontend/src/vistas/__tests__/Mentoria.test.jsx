// Sección RH → Mentoría (PRD §14; ET §29; SG §999). APIs mockeadas.
//
// Qué se verifica aquí y NO debe romperse:
// - catálogo de SOLO activos con búsqueda q y paginación del contrato;
// - POST exacto con EXACTAMENTE { receiver_id, competency_code };
// - cambiar receptor o competencia invalida la sugerencia anterior;
// - resultado fiel: nivel del receptor (DI tal cual, nunca 0), elegibilidad,
//   mentor y `Criterio del sistema` tal cual llegan del backend;
// - casos sin mentor con tono neutro (nivel 5, DI, nadie cumple);
// - sin «mejor empleado», «top mentor», «mejor talento», ranking ni ganador;
// - 404/422 con mensaje legible del backend y reintento; 401 cierra sesión.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Mentoria from '../Mentoria.jsx'
import { sugerirMentor } from '../../api/mentoria.js'
import { listarEmpleados, POR_PAGINA_DEFECTO } from '../../api/empleados.js'

vi.mock('../../api/mentoria.js', () => ({
  sugerirMentor: vi.fn(),
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

/** SugerenciaMentoriaOut con mentor (caso feliz), fiel al contrato. */
function sugerenciaConMentor(sobre = {}) {
  return {
    receiver_id: 1,
    competency_code: 'liderazgo',
    nivel_receiver: 3,
    elegible: true,
    mentor: { empleado_id: 2, nombre: 'Luis Pérez', nivel: 4 },
    criterio_del_sistema:
      'Criterio del sistema: empleado activo con nivel 4 en liderazgo, estrictamente superior al nivel 3 del receptor.',
    ...sobre,
  }
}

function ultimaConsulta() {
  return vi.mocked(listarEmpleados).mock.calls.at(-1)
}

/** Carga el catálogo, elige a Ana como receptor y pulsa «Sugerir mentor». */
async function sugerirParaAna() {
  render(<Mentoria token="token-rh" />)
  await screen.findByText('Ana López')
  fireEvent.click(screen.getByRole('radio', { name: 'Elegir a Ana López como receptor' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sugerir mentor' }))
  await screen.findByText('Sugerencia de mentoría')
}

beforeEach(() => {
  vi.mocked(listarEmpleados).mockReset()
  vi.mocked(sugerirMentor).mockReset()
  vi.mocked(listarEmpleados).mockResolvedValue(pagina(ACTIVOS))
  vi.mocked(sugerirMentor).mockResolvedValue(sugerenciaConMentor())
})

describe('Mentoría — selección de receptor', () => {
  it('carga el catálogo de SOLO empleados activos al abrir', async () => {
    render(<Mentoria token="token-rh" />)

    expect(await screen.findByText('Ana López')).toBeInTheDocument()
    const [token, filtros] = ultimaConsulta()
    expect(token).toBe('token-rh')
    expect(filtros.activo).toBe(true)
    expect(filtros.q).toBe('')
    expect(filtros.pagina).toBe(1)
  })

  it('la búsqueda reinicia a la página 1 y envía q al backend', async () => {
    render(<Mentoria token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'ana' },
    })

    await waitFor(() => {
      expect(ultimaConsulta()[1].q).toBe('ana')
      expect(ultimaConsulta()[1].pagina).toBe(1)
    })
  })

  it('sin receptor elegido el botón «Sugerir mentor» está deshabilitado', async () => {
    render(<Mentoria token="token-rh" />)
    await screen.findByText('Ana López')

    expect(screen.getByRole('button', { name: 'Sugerir mentor' })).toBeDisabled()

    fireEvent.click(screen.getByRole('radio', { name: 'Elegir a Ana López como receptor' }))
    expect(screen.getByRole('button', { name: 'Sugerir mentor' })).toBeEnabled()
  })

  it('el radio es único: elegir a Luis deselecciona a Ana', async () => {
    render(<Mentoria token="token-rh" />)
    await screen.findByText('Ana López')

    const ana = screen.getByRole('radio', { name: 'Elegir a Ana López como receptor' })
    const luis = screen.getByRole('radio', { name: 'Elegir a Luis Pérez como receptor' })
    fireEvent.click(ana)
    fireEvent.click(luis)

    expect(ana).not.toBeChecked()
    expect(luis).toBeChecked()
  })

  it('catálogo vacío por búsqueda muestra vacío diferenciado', async () => {
    render(<Mentoria token="token-rh" />)
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


describe('Mentoría — sugerencia', () => {
  it('envía EXACTAMENTE { receiver_id, competency_code } con la competencia por defecto', async () => {
    await sugerirParaAna()

    await waitFor(() => expect(sugerirMentor).toHaveBeenCalledTimes(1))
    expect(sugerirMentor).toHaveBeenCalledWith('token-rh', {
      receiver_id: 1,
      competency_code: 'desempeno_tecnico',
    })
  })

  it('respeta la competencia objetivo elegida en el POST', async () => {
    render(<Mentoria token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('radio', { name: 'Elegir a Ana López como receptor' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Competencia objetivo' }), {
      target: { value: 'comunicacion' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sugerir mentor' }))

    await waitFor(() => expect(sugerirMentor).toHaveBeenCalledTimes(1))
    expect(sugerirMentor).toHaveBeenCalledWith('token-rh', {
      receiver_id: 1,
      competency_code: 'comunicacion',
    })
  })

  it('muestra el resultado fiel al contrato con Criterio del sistema', async () => {
    await sugerirParaAna()

    // Las consultas se acotan al resultado: la tabla también muestra al receptor.
    const resultado = screen.getByRole('article', { name: 'Sugerencia de mentoría' })
    expect(within(resultado).getByText('Ana López')).toBeInTheDocument()
    expect(within(resultado).getByText('Liderazgo')).toBeInTheDocument()
    expect(within(resultado).getByText('Elegible')).toBeInTheDocument()
    expect(within(resultado).getByText(/Luis Pérez/)).toBeInTheDocument()

    // Etiqueta obligatoria del PRD §14.3 + texto tal cual del backend.
    expect(within(resultado).getByText('Criterio del sistema')).toBeInTheDocument()
    expect(
      within(resultado).getByText(/empleado activo con nivel 4 en liderazgo/),
    ).toBeInTheDocument()
  })

  it('nivel_receiver null se presenta como «Datos insuficientes.», nunca 0', async () => {
    vi.mocked(sugerirMentor).mockResolvedValue(
      sugerenciaConMentor({
        nivel_receiver: null,
        elegible: false,
        mentor: null,
        criterio_del_sistema:
          'Criterio del sistema: la competencia liderazgo del receptor está en Datos insuficientes; no se sugiere mentor.',
      }),
    )
    await sugerirParaAna()

    expect(screen.getByText('Datos insuficientes.')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('receptor nivel 5: no elegible, sin mentor y con tono neutro', async () => {
    vi.mocked(sugerirMentor).mockResolvedValue(
      sugerenciaConMentor({
        nivel_receiver: 5,
        elegible: false,
        mentor: null,
        criterio_del_sistema:
          'Criterio del sistema: el receptor tiene nivel 5 en liderazgo; no se sugiere mentor.',
      }),
    )
    await sugerirParaAna()

    expect(screen.getByText('No elegible')).toBeInTheDocument()
    expect(screen.getByText('Sin mentor sugerido')).toBeInTheDocument()
    expect(screen.getByText(/no es elegible para mentoría/)).toBeInTheDocument()
    expect(screen.queryByText(/mejor|top|ranking|ganador/i)).not.toBeInTheDocument()
  })

  it('elegible sin mentor: nadie cumple los requisitos, tono neutro', async () => {
    vi.mocked(sugerirMentor).mockResolvedValue(
      sugerenciaConMentor({
        mentor: null,
        criterio_del_sistema:
          'Criterio del sistema: ningún empleado activo tiene nivel numérico en liderazgo estrictamente superior al nivel 3 del receptor.',
      }),
    )
    await sugerirParaAna()

    expect(screen.getByText('Elegible')).toBeInTheDocument()
    expect(screen.getByText('Sin mentor sugerido')).toBeInTheDocument()
    expect(
      screen.getByText(/Ningún empleado activo cumple con los requisitos/),
    ).toBeInTheDocument()
  })

  it('sin «mejor empleado», «top mentor» ni «mejor talento» en la respuesta', async () => {
    await sugerirParaAna()

    const resultado = screen.getByRole('article', { name: 'Sugerencia de mentoría' })
    expect(resultado.textContent).not.toMatch(/mejor empleado/i)
    expect(resultado.textContent).not.toMatch(/top mentor/i)
    expect(resultado.textContent).not.toMatch(/mejor talento/i)
    expect(resultado.textContent).not.toMatch(/ganador|ranking/i)
  })

  it('cambiar de competencia invalida la sugerencia anterior', async () => {
    await sugerirParaAna()

    fireEvent.change(screen.getByRole('combobox', { name: 'Competencia objetivo' }), {
      target: { value: 'liderazgo' },
    })

    expect(screen.queryByText('Sugerencia de mentoría')).not.toBeInTheDocument()
    expect(sugerirMentor).toHaveBeenCalledTimes(1)
  })

  it('cambiar de receptor invalida la sugerencia anterior', async () => {
    await sugerirParaAna()

    fireEvent.click(screen.getByRole('radio', { name: 'Elegir a Luis Pérez como receptor' }))

    expect(screen.queryByText('Sugerencia de mentoría')).not.toBeInTheDocument()
    expect(sugerirMentor).toHaveBeenCalledTimes(1)
  })

  it('404 muestra mensaje legible del backend y permite reintentar', async () => {
    vi.mocked(sugerirMentor)
      .mockRejectedValueOnce(
        Object.assign(new Error('Empleado 1 no encontrado.'), { estado: 404 }),
      )
      .mockResolvedValueOnce(sugerenciaConMentor())
    await sugerirParaAna().catch(() => {})

    expect(
      await screen.findByText(
        'No pudimos sugerir el mentor: el receptor ya no está disponible',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Empleado 1 no encontrado.')).toBeInTheDocument()
    expect(screen.queryByText('Sugerencia de mentoría')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByText('Sugerencia de mentoría')).toBeInTheDocument()
  })

  it('422 muestra mensaje legible del backend', async () => {
    vi.mocked(sugerirMentor).mockRejectedValueOnce(
      Object.assign(new Error('Datos de entrada inválidos.'), { estado: 422 }),
    )
    await sugerirParaAna().catch(() => {})

    expect(
      await screen.findByText(
        'No pudimos sugerir el mentor: la selección ya no es válida',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Datos de entrada inválidos.')).toBeInTheDocument()
  })

  it('401 cierra la sesión sin mostrar estado de error', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(sugerirMentor).mockRejectedValueOnce(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    render(<Mentoria token="token-rh" alSesionExpirada={alSesionExpirada} />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('radio', { name: 'Elegir a Ana López como receptor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sugerir mentor' }))

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/No pudimos calcular/)).not.toBeInTheDocument()
  })
})

  it('error del catálogo con reintento, nunca cero registros silenciosos', async () => {
    vi.mocked(listarEmpleados)
      .mockRejectedValueOnce(new Error('fallo'))
      .mockResolvedValueOnce(pagina(ACTIVOS))
    render(<Mentoria token="token-rh" />)

    expect(
      await screen.findByText('No pudimos cargar los empleados activos'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(await screen.findByText('Ana López')).toBeInTheDocument()
  })
})
