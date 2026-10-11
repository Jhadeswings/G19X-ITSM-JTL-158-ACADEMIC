// Sección RH → Búsqueda de talento manual (PRD §13.1; ET §26; SG §27/§995).
// APIs mockeadas.
//
// Qué se verifica aquí y NO debe romperse:
// - criterios: una o varias competencias oficiales con min_level 1–5, sin
//   duplicados, revisión visible antes de ejecutar;
// - payload EXACTO { competencies: [{ code, min_level }] }; área y puesto se
//   muestran como informativos y NO se envían (DT #41, extra="forbid");
// - resultados fielmente en el orden del backend, con DI tal cual (nunca 0)
//   y «Datos insuficientes.»;
// - estados: sin criterios, loading, cero resultados, 401, 422, error con
//   reintento;
// - sin «mejor», «top», «ranking», «ganador», 9-Box ni score global;
// - editar criterios invalida resultados anteriores.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Busqueda from '../Busqueda.jsx'
import { buscarTalento } from '../../api/busqueda.js'

vi.mock('../../api/busqueda.js', () => ({
  buscarTalento: vi.fn(),
}))

/** Respuesta del backend fiel a BusquedaManualOut. */
function respuesta(items, { total = items.length, criterios } = {}) {
  return {
    total,
    criterios: criterios ?? [{ code: 'liderazgo', min_level: 4 }],
    items,
  }
}

function resultado(id, nombre, sobre = {}) {
  return {
    empleado_id: id,
    nombre,
    area: 'TI',
    competencias: [{ code: 'liderazgo', estado: 'CALCULABLE', nivel: 4 }],
    promedio_seleccionadas: '4.00',
    ...sobre,
  }
}

/** Agrega un criterio (con la competencia por defecto: la primera libre). */
function agregarCriterio() {
  fireEvent.click(screen.getByRole('button', { name: 'Agregar competencia' }))
}

beforeEach(() => {
  vi.mocked(buscarTalento).mockReset()
  vi.mocked(buscarTalento).mockResolvedValue(respuesta([resultado(1, 'Ana López')]))
})

describe('Búsqueda — criterios de competencia', () => {
  it('inicia sin criterios: estado vacío y sin botón de ejecutar', () => {
    render(<Busqueda token="token-rh" />)

    expect(
      screen.getByText('Aún no hay criterios de competencia.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ejecutar búsqueda' })).toBeNull()
    expect(buscarTalento).not.toHaveBeenCalled()
  })

  it('agregar un criterio usa la competencia por defecto con nivel mínimo 4', () => {
    render(<Busqueda token="token-rh" />)
    agregarCriterio()

    expect(screen.getByLabelText('Competencia del criterio 1')).toHaveValue(
      'desempeno_tecnico',
    )
    expect(screen.getByLabelText('Nivel mínimo del criterio 1')).toHaveValue('4')
    expect(
      screen.getByText('Desempeño técnico: nivel mínimo 4'),
    ).toBeInTheDocument()
  })

  it('permite cambiar el nivel mínimo dentro del rango 1–5', () => {
    render(<Busqueda token="token-rh" />)
    agregarCriterio()

    fireEvent.change(screen.getByLabelText('Nivel mínimo del criterio 1'), {
      target: { value: '2' },
    })

    expect(screen.getByLabelText('Nivel mínimo del criterio 1')).toHaveValue('2')
    expect(screen.getByText('Desempeño técnico: nivel mínimo 2')).toBeInTheDocument()
  })

  it('admite varias competencias y las muestra todas en la revisión', () => {
    render(<Busqueda token="token-rh" />)
    agregarCriterio()
    agregarCriterio()
    agregarCriterio()

    // Cada fila propone la siguiente competencia libre (sin duplicados).
    expect(screen.getByLabelText('Competencia del criterio 2')).toHaveValue(
      'liderazgo',
    )
    expect(screen.getByLabelText('Competencia del criterio 3')).toHaveValue(
      'trabajo_equipo',
    )
    expect(screen.getByText('Liderazgo: nivel mínimo 4')).toBeInTheDocument()
    expect(
      screen.getByText('Trabajo en equipo: nivel mínimo 4'),
    ).toBeInTheDocument()
  })

  it('cambiar la competencia de una fila se refleja en la revisión', () => {
    render(<Busqueda token="token-rh" />)
    agregarCriterio()

    fireEvent.change(screen.getByLabelText('Competencia del criterio 1'), {
      target: { value: 'comunicacion' },
    })

    expect(
      screen.getByText('Comunicación: nivel mínimo 4'),
    ).toBeInTheDocument()
  })

  it('quitar un criterio lo elimina de la revisión', () => {
    render(<Busqueda token="token-rh" />)
    agregarCriterio()
    agregarCriterio()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar criterio 1' }))

    // La fila restante se reindexa: queda SOLO Liderazgo (sin duplicados).
    expect(screen.getByLabelText('Competencia del criterio 1')).toHaveValue(
      'liderazgo',
    )
    expect(screen.queryByLabelText('Competencia del criterio 2')).toBeNull()
    expect(
      screen.queryByText('Desempeño técnico: nivel mínimo 4'),
    ).toBeNull()
    expect(screen.getByText('Liderazgo: nivel mínimo 4')).toBeInTheDocument()
  })

  it('área y puesto son informativos: se muestran en la revisión', () => {
    render(<Busqueda token="token-rh" />)
    agregarCriterio()

    fireEvent.change(screen.getByLabelText('Área (informativo)'), {
      target: { value: 'TI' },
    })
    fireEvent.change(screen.getByLabelText('Puesto (informativo)'), {
      target: { value: 'Desarrollador' },
    })

    expect(screen.getByText('Área: TI')).toBeInTheDocument()
    expect(screen.getByText('Puesto: Desarrollador')).toBeInTheDocument()
  })
})


describe('Búsqueda — ejecución y resultados', () => {
  /** Carga dos criterios y ejecuta la búsqueda. */
  async function ejecutarConDosCriterios() {
    render(<Busqueda token="token-rh" />)
    agregarCriterio()
    agregarCriterio()
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar búsqueda' }))
    await screen.findByText('Resultados')
  }

  it('envía EXACTAMENTE { competencies: [{ code, min_level }] } al backend', async () => {
    render(<Busqueda token="token-rh" />)
    agregarCriterio()
    fireEvent.change(screen.getByLabelText('Nivel mínimo del criterio 1'), {
      target: { value: '5' },
    })
    fireEvent.change(screen.getByLabelText('Área (informativo)'), {
      target: { value: 'TI' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar búsqueda' }))

    await waitFor(() => expect(buscarTalento).toHaveBeenCalledTimes(1))
    expect(buscarTalento).toHaveBeenCalledWith('token-rh', [
      { code: 'desempeno_tecnico', min_level: 5 },
    ])
  })

  it('muestra los resultados en el orden del backend, sin reordenar', async () => {
    vi.mocked(buscarTalento).mockResolvedValue(
      respuesta([resultado(2, 'Luis Pérez'), resultado(1, 'Ana López')]),
    )
    await ejecutarConDosCriterios()

    const nombres = [
      ...document.querySelectorAll('.busqueda-resultados__empleado h3'),
    ].map((h3) => h3.textContent)
    expect(nombres).toEqual(['Luis Pérez', 'Ana López'])
  })

  it('muestra el eco de criterios y el total tal cual los devuelve el backend', async () => {
    vi.mocked(buscarTalento).mockResolvedValue(
      respuesta([resultado(1, 'Ana López')], {
        criterios: [
          { code: 'liderazgo', min_level: 4 },
          { code: 'comunicacion', min_level: 3 },
        ],
      }),
    )
    await ejecutarConDosCriterios()

    expect(
      screen.getByText('1 empleado activo cumple los criterios'),
    ).toBeInTheDocument()
    // El eco se acota a los resultados: la revisión muestra los criterios
    // enviados y el backend devuelve los suyos propios.
    const eco = document.querySelector('.busqueda-resultados__criterios')
    expect(within(eco).getByText('Liderazgo: nivel mínimo 4')).toBeInTheDocument()
    expect(within(eco).getByText('Comunicación: nivel mínimo 3')).toBeInTheDocument()
  })

  it('muestra competencias con «Datos insuficientes.» tal cual, nunca nivel 0', async () => {
    vi.mocked(buscarTalento).mockResolvedValue(
      respuesta([
        resultado(1, 'Ana López', {
          competencias: [
            { code: 'liderazgo', estado: 'CALCULABLE', nivel: 4 },
            { code: 'comunicacion', estado: 'INSUFFICIENT_DATA', nivel: null },
          ],
        }),
      ]),
    )
    await ejecutarConDosCriterios()

    expect(screen.getByText('Datos insuficientes.')).toBeInTheDocument()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('cero resultados muestra el estado vacío con el total en cero', async () => {
    vi.mocked(buscarTalento).mockResolvedValue(respuesta([], { total: 0 }))
    await ejecutarConDosCriterios()

    expect(
      screen.getByText('Ningún empleado activo cumple todos los criterios.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('0 empleados activos cumplen los criterios'),
    ).toBeInTheDocument()
    expect(document.querySelector('.busqueda-resultados__empleado')).toBeNull()
  })


  it('sin lenguaje prohibido: mejor, top, ranking, ganador, 9-Box o score', async () => {
    vi.mocked(buscarTalento).mockResolvedValue(
      respuesta([resultado(1, 'Ana López'), resultado(2, 'Luis Pérez')]),
    )
    await ejecutarConDosCriterios()

    const resultados = document.querySelector('.busqueda-resultados')
    expect(resultados).not.toBeNull()
    expect(resultados.textContent).not.toMatch(/mejor|top |ranking|ganador/i)
    expect(resultados.textContent).not.toMatch(/9-box|score global/i)
  })

  it('editar los criterios invalida los resultados anteriores', async () => {
    await ejecutarConDosCriterios()
    expect(screen.getByText('Resultados')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar competencia' }))

    expect(screen.queryByText('Resultados')).toBeNull()
    expect(buscarTalento).toHaveBeenCalledTimes(1)
  })

  it('422 muestra mensaje legible del backend y permite reintentar', async () => {
    vi.mocked(buscarTalento)
      .mockRejectedValueOnce(
        Object.assign(new Error('No se permiten competencias duplicadas.'), {
          estado: 422,
        }),
      )
      .mockResolvedValueOnce(respuesta([resultado(1, 'Ana López')]))
    render(<Busqueda token="token-rh" />)
    agregarCriterio()
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar búsqueda' }))

    expect(
      await screen.findByText(
        'No pudimos ejecutar la búsqueda: los criterios ya no son válidos',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No se permiten competencias duplicadas.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByText('Resultados')).toBeInTheDocument()
  })

  it('error general con reintento (sin estado específico)', async () => {
    vi.mocked(buscarTalento)
      .mockRejectedValueOnce(new Error('fallo'))
      .mockResolvedValueOnce(respuesta([resultado(1, 'Ana López')]))
    render(<Busqueda token="token-rh" />)
    agregarCriterio()
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar búsqueda' }))

    expect(
      await screen.findByText('No pudimos ejecutar la búsqueda'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(await screen.findByText('Resultados')).toBeInTheDocument()
  })

  it('401 cierra la sesión sin mostrar estado de error', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(buscarTalento).mockRejectedValueOnce(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    render(<Busqueda token="token-rh" alSesionExpirada={alSesionExpirada} />)
    agregarCriterio()
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar búsqueda' }))

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/No pudimos ejecutar/)).toBeNull()
  })
})

