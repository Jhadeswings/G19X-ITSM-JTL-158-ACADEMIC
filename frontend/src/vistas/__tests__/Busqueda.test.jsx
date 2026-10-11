// Sección RH → Búsqueda de talento (PRD §13.1/§13.3; ET §26/§27; SG §27/§995).
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
// - editar criterios invalida resultados anteriores;
// - 5B-2: la IA SOLO interpreta la necesidad ({ query_text } exacto, máx
//   500): carga los criterios propuestos en el editor para revisión de RH y
//   NUNCA ejecuta la búsqueda; 502 es estado esperado con reintento y el
//   flujo manual queda siempre disponible.

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Busqueda from '../Busqueda.jsx'
import { buscarTalento, interpretarBusqueda } from '../../api/busqueda.js'

vi.mock('../../api/busqueda.js', () => ({
  buscarTalento: vi.fn(),
  interpretarBusqueda: vi.fn(),
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

/** Interpretación fiel a InterpretacionOut del backend (5B-2). */
function interpretacion({
  proveedor = 'groq',
  competencias = [{ code: 'liderazgo', min_level: 4 }],
  area = null,
  position = null,
} = {}) {
  return {
    proveedor,
    criterios: { competencies: competencias, area, position },
  }
}

/** Agrega un criterio (con la competencia por defecto: la primera libre). */
function agregarCriterio() {
  fireEvent.click(screen.getByRole('button', { name: 'Agregar competencia' }))
}

beforeEach(() => {
  vi.mocked(buscarTalento).mockReset()
  vi.mocked(buscarTalento).mockResolvedValue(respuesta([resultado(1, 'Ana López')]))
  vi.mocked(interpretarBusqueda).mockReset()
  vi.mocked(interpretarBusqueda).mockResolvedValue(interpretacion())
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

// ---------------------------------------------------------------------------
// 5B-2 — Interpretación de la necesidad con IA (PRD §13.3; ET §27).
//
// La IA SOLO interpreta: carga los criterios propuestos en el editor para
// que RH los revise y edite; NUNCA ejecuta la búsqueda. El 502 es un estado
// esperado (la IA es la respuesta) y el flujo manual queda siempre operativo.
// ---------------------------------------------------------------------------

describe('Búsqueda — interpretación de la necesidad (5B-2)', () => {
  /** Escribe la necesidad en el textarea del paso 0. */
  function escribirNecesidad(texto) {
    fireEvent.change(screen.getByLabelText('Necesidad de RH'), {
      target: { value: texto },
    })
  }

  function interpretarNecesidad() {
    fireEvent.click(screen.getByRole('button', { name: 'Interpretar necesidad' }))
  }

  it('sin texto no se llama a la IA: contador en 0/500 y botón deshabilitado', () => {
    render(<Busqueda token="token-rh" />)

    expect(screen.getByText('0/500')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Interpretar necesidad' }),
    ).toBeDisabled()
    expect(interpretarBusqueda).not.toHaveBeenCalled()
  })

  it('el texto de solo espacios tampoco habilita la interpretación', () => {
    render(<Busqueda token="token-rh" />)

    escribirNecesidad('   ')

    expect(
      screen.getByRole('button', { name: 'Interpretar necesidad' }),
    ).toBeDisabled()
    expect(interpretarBusqueda).not.toHaveBeenCalled()
  })

  it('respeta el límite de 500 caracteres del contrato (InterpretacionIn)', () => {
    render(<Busqueda token="token-rh" />)

    escribirNecesidad('x'.repeat(600))

    expect(screen.getByLabelText('Necesidad de RH')).toHaveValue('x'.repeat(500))
    expect(screen.getByLabelText('Necesidad de RH')).toHaveAttribute(
      'maxlength',
      '500',
    )
    expect(screen.getByText('500/500')).toBeInTheDocument()
  })

  it('envía EXACTAMENTE el texto descrito como query_text', async () => {
    render(<Busqueda token="token-rh" />)
    escribirNecesidad('Necesito personas con liderazgo fuerte')
    interpretarNecesidad()

    await waitFor(() => expect(interpretarBusqueda).toHaveBeenCalledTimes(1))
    expect(interpretarBusqueda).toHaveBeenCalledWith(
      'token-rh',
      'Necesito personas con liderazgo fuerte',
    )
  })

  it('carga los criterios interpretados en el editor y el contexto informativo', async () => {
    vi.mocked(interpretarBusqueda).mockResolvedValue(
      interpretacion({
        proveedor: 'gemini',
        competencias: [
          { code: 'liderazgo', min_level: 4 },
          { code: 'trabajo_equipo', min_level: 3 },
        ],
        area: 'TI',
        position: 'Desarrollador backend',
      }),
    )
    render(<Busqueda token="token-rh" />)
    escribirNecesidad('Liderazgo y trabajo en equipo fuertes en TI')
    interpretarNecesidad()

    expect(
      await screen.findByText(/Criterios propuestos por la interpretación de gemini/),
    ).toBeInTheDocument()

    // Editor: una fila por criterio interpretado, tal cual llegó del backend.
    expect(screen.getByLabelText('Competencia del criterio 1')).toHaveValue('liderazgo')
    expect(screen.getByLabelText('Nivel mínimo del criterio 1')).toHaveValue('4')
    expect(screen.getByLabelText('Competencia del criterio 2')).toHaveValue('trabajo_equipo')
    expect(screen.getByLabelText('Nivel mínimo del criterio 2')).toHaveValue('3')

    // Contexto informativo (DT #41): visible en el editor y en la revisión.
    expect(screen.getByLabelText('Área (informativo)')).toHaveValue('TI')
    expect(screen.getByLabelText('Puesto (informativo)')).toHaveValue(
      'Desarrollador backend',
    )
    expect(screen.getByText('Área: TI')).toBeInTheDocument()
    expect(screen.getByText('Puesto: Desarrollador backend')).toBeInTheDocument()
    expect(screen.getByText('Liderazgo: nivel mínimo 4')).toBeInTheDocument()
    expect(screen.getByText('Trabajo en equipo: nivel mínimo 3')).toBeInTheDocument()
  })

  it('interpretar NUNCA ejecuta la búsqueda automáticamente', async () => {
    render(<Busqueda token="token-rh" />)
    escribirNecesidad('Necesito personas con liderazgo fuerte')
    interpretarNecesidad()

    await screen.findByText(/Criterios propuestos por la interpretación de groq/)

    expect(buscarTalento).not.toHaveBeenCalled()
    expect(screen.queryByText('Resultados')).toBeNull()
  })

  it('RH edita los criterios interpretados y el payload manual sigue exacto', async () => {
    vi.mocked(interpretarBusqueda).mockResolvedValue(
      interpretacion({ competencias: [{ code: 'liderazgo', min_level: 4 }] }),
    )
    render(<Busqueda token="token-rh" />)
    escribirNecesidad('Liderazgo fuerte')
    interpretarNecesidad()
    await screen.findByText(/Criterios propuestos por la interpretación de groq/)

    fireEvent.change(screen.getByLabelText('Nivel mínimo del criterio 1'), {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar búsqueda' }))

    await waitFor(() => expect(buscarTalento).toHaveBeenCalledTimes(1))
    expect(buscarTalento).toHaveBeenCalledWith('token-rh', [
      { code: 'liderazgo', min_level: 5 },
    ])
  })

  it('interpretar invalida los resultados de una búsqueda anterior', async () => {
    render(<Busqueda token="token-rh" />)
    agregarCriterio()
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar búsqueda' }))
    await screen.findByText('Resultados')

    escribirNecesidad('Ahora necesito comunicación alta')
    interpretarNecesidad()

    await screen.findByText(/Criterios propuestos por la interpretación de groq/)
    expect(screen.queryByText('Resultados')).toBeNull()
  })

  it('una interpretación posterior reemplaza los criterios anteriores', async () => {
    render(<Busqueda token="token-rh" />)
    escribirNecesidad('Primera necesidad')
    interpretarNecesidad()
    await screen.findByText(/Criterios propuestos por la interpretación de groq/)

    vi.mocked(interpretarBusqueda).mockResolvedValue(
      interpretacion({
        proveedor: 'gemini',
        competencias: [{ code: 'aprendizaje', min_level: 2 }],
      }),
    )
    escribirNecesidad('Segunda necesidad')
    interpretarNecesidad()

    expect(await screen.findByText(/interpretación de gemini/)).toBeInTheDocument()
    expect(screen.getByLabelText('Competencia del criterio 1')).toHaveValue('aprendizaje')
    expect(screen.getByLabelText('Nivel mínimo del criterio 1')).toHaveValue('2')
    expect(screen.queryByLabelText('Competencia del criterio 2')).toBeNull()
    // Sin contexto interpretado, los informativos quedan vacíos.
    expect(screen.getByLabelText('Área (informativo)')).toHaveValue('')
  })

  it('mientras interpreta no se duplican solicitudes', async () => {
    let resolver
    vi.mocked(interpretarBusqueda).mockImplementationOnce(
      () => new Promise((resuelve) => (resolver = resuelve)),
    )
    render(<Busqueda token="token-rh" />)
    escribirNecesidad('Necesito personas con liderazgo fuerte')

    const boton = screen.getByRole('button', { name: 'Interpretar necesidad' })
    fireEvent.click(boton)
    expect(boton).toBeDisabled()
    fireEvent.click(boton)
    await waitFor(() => expect(interpretarBusqueda).toHaveBeenCalledTimes(1))

    await act(async () => {
      resolver(interpretacion())
    })
    expect(
      await screen.findByText(/Criterios propuestos por la interpretación de groq/),
    ).toBeInTheDocument()
  })

  it('sin lenguaje prohibido en todo el flujo, incluida la interpretación', async () => {
    vi.mocked(interpretarBusqueda).mockResolvedValue(
      interpretacion({ area: 'TI', position: 'Backend' }),
    )
    render(<Busqueda token="token-rh" />)
    escribirNecesidad('Necesito personas con liderazgo fuerte')
    interpretarNecesidad()
    await screen.findByText(/Criterios propuestos por la interpretación de groq/)
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar búsqueda' }))
    await screen.findByText('Resultados')

    const vista = document.querySelector('.busqueda')
    expect(vista.textContent).not.toMatch(/mejor|top |ranking|ganador/i)
    expect(vista.textContent).not.toMatch(/9-box|score global/i)
  })
})

describe('Búsqueda — errores de la interpretación (5B-2)', () => {
  function escribirNecesidad(texto) {
    fireEvent.change(screen.getByLabelText('Necesidad de RH'), {
      target: { value: texto },
    })
  }

  it('422 muestra un error de validación legible y permite reintentar', async () => {
    vi.mocked(interpretarBusqueda)
      .mockRejectedValueOnce(
        Object.assign(
          new Error('El texto de la búsqueda no puede exceder 500 caracteres.'),
          { estado: 422 },
        ),
      )
      .mockResolvedValueOnce(interpretacion())
    render(<Busqueda token="token-rh" />)
    escribirNecesidad('Necesito personas con liderazgo fuerte')
    fireEvent.click(screen.getByRole('button', { name: 'Interpretar necesidad' }))

    expect(
      await screen.findByText('No pudimos interpretar la necesidad: revisa el texto'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('El texto de la búsqueda no puede exceder 500 caracteres.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(
      await screen.findByText(/Criterios propuestos por la interpretación de groq/),
    ).toBeInTheDocument()
  })

  it('502 es un estado esperado: informa y el reintento puede tener éxito', async () => {
    vi.mocked(interpretarBusqueda)
      .mockRejectedValueOnce(
        Object.assign(
          new Error(
            'No fue posible interpretar la búsqueda con los proveedores de IA disponibles. Formule los criterios manualmente e inténtelo de nuevo.',
          ),
          { estado: 502 },
        ),
      )
      .mockResolvedValueOnce(interpretacion())
    render(<Busqueda token="token-rh" />)
    escribirNecesidad('Necesito personas con liderazgo fuerte')
    fireEvent.click(screen.getByRole('button', { name: 'Interpretar necesidad' }))

    expect(
      await screen.findByText('La interpretación no está disponible en este momento'),
    ).toBeInTheDocument()
    // El mensaje del backend guía hacia el flujo manual.
    expect(screen.getByText(/Formule los criterios manualmente/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(
      await screen.findByText(/Criterios propuestos por la interpretación de groq/),
    ).toBeInTheDocument()
  })

  it('tras un 502 no hay criterios inventados y la búsqueda manual sigue disponible', async () => {
    vi.mocked(interpretarBusqueda).mockRejectedValueOnce(
      Object.assign(new Error('proveedores caídos'), { estado: 502 }),
    )
    render(<Busqueda token="token-rh" />)
    escribirNecesidad('Necesito personas con liderazgo fuerte')
    fireEvent.click(screen.getByRole('button', { name: 'Interpretar necesidad' }))
    await screen.findByText('La interpretación no está disponible en este momento')

    // Sin criterios inventados: el editor arranca vacío y el flujo manual
    // de 5B-1 continúa intacto.
    expect(screen.getByText('Aún no hay criterios de competencia.')).toBeInTheDocument()
    agregarCriterio()
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar búsqueda' }))

    await waitFor(() => expect(buscarTalento).toHaveBeenCalledTimes(1))
    expect(buscarTalento).toHaveBeenCalledWith('token-rh', [
      { code: 'desempeno_tecnico', min_level: 4 },
    ])
  })

  it('401 cierra la sesión sin mostrar estado de error', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(interpretarBusqueda).mockRejectedValueOnce(
      Object.assign(new Error('no autorizado'), { estado: 401 }),
    )
    render(<Busqueda token="token-rh" alSesionExpirada={alSesionExpirada} />)
    escribirNecesidad('Necesito personas con liderazgo fuerte')
    fireEvent.click(screen.getByRole('button', { name: 'Interpretar necesidad' }))

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/No pudimos interpretar/)).toBeNull()
  })

  it('403 muestra acceso denegado sin cambiar reglas de autorización', async () => {
    vi.mocked(interpretarBusqueda).mockRejectedValueOnce(
      Object.assign(new Error('Sin permiso de interpretación'), { estado: 403 }),
    )
    render(<Busqueda token="token-rh" />)
    escribirNecesidad('Necesito personas con liderazgo fuerte')
    fireEvent.click(screen.getByRole('button', { name: 'Interpretar necesidad' }))

    expect(
      await screen.findByText('No tienes acceso a la interpretación con IA'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Tu cuenta no tiene permiso para usar la interpretación con IA. La búsqueda manual sigue disponible en esta misma sección.',
      ),
    ).toBeInTheDocument()
  })

  it('error de red muestra mensaje claro y permite reintentar', async () => {
    vi.mocked(interpretarBusqueda)
      .mockRejectedValueOnce(
        Object.assign(
          new Error(
            'No fue posible conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.',
          ),
          { estado: 0 },
        ),
      )
      .mockResolvedValueOnce(interpretacion())
    render(<Busqueda token="token-rh" />)
    escribirNecesidad('Necesito personas con liderazgo fuerte')
    fireEvent.click(screen.getByRole('button', { name: 'Interpretar necesidad' }))

    expect(
      await screen.findByText('No pudimos interpretar la necesidad'),
    ).toBeInTheDocument()
    expect(screen.getByText(/No fue posible conectar con el servidor/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(
      await screen.findByText(/Criterios propuestos por la interpretación de groq/),
    ).toBeInTheDocument()
  })
})

