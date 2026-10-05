// Tests de estructura, contratos y estados de "Inicio" (PRD §21.1, MB-7-2).
//
// Inicio es un RESUMEN: orienta y lleva a la sección del detalle, sin repetir
// "Mi progreso". Estos tests cubren las tres consultas independientes, la
// ausencia de las cinco `CompetenciaCard` completas, la ausencia de IA, el
// recorte de proyectos y los estados por bloque.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerResultadoActual } from '../../api/resultado.js'
import { listarMisProyectos } from '../../api/proyectos.js'
import { listarCapacitaciones } from '../../api/capacitaciones.js'
import Inicio from '../Inicio.jsx'

vi.mock('../../api/resultado.js', () => ({ obtenerResultadoActual: vi.fn() }))
vi.mock('../../api/proyectos.js', () => ({ listarMisProyectos: vi.fn() }))
vi.mock('../../api/capacitaciones.js', () => ({ listarCapacitaciones: vi.fn() }))

const DI = 'INSUFFICIENT_DATA'
const CALC = 'CALCULABLE'

/** Payload fiel al ResultadoActualDTO real de GET /api/v1/me/result. */
function resultado({
  competencias = CINCO,
  fortalezas = ['desempeno_tecnico'],
} = {}) {
  return {
    empleado_id: 7,
    competencias,
    experiencia: {
      fecha_ingreso: '2020-01-01',
      anios_antiguedad: '6.00',
      proyectos_unicos: 5,
    },
    fortalezas,
    oportunidades: ['liderazgo'],
  }
}

const CINCO = [
  ['desempeno_tecnico', CALC, 4, '80.00', { proyectos_completados: 4 }, 'Consolidado'],
  ['liderazgo', DI, null, null, { participaciones: 2 }, null],
  ['trabajo_equipo', DI, null, null, { participaciones: 1 }, null],
  ['comunicacion', DI, null, null, { participaciones: 1 }, null],
  ['aprendizaje', DI, null, null, { capacitaciones_registradas: 1 }, null],
].map(([clave, estado, nivel, valor, evidencia, etiqueta]) => ({
  clave,
  estado,
  nivel,
  valor,
  evidencia,
  etiqueta,
}))

/** Proyecto fiel a `ProyectoOut` (GET /api/v1/me/projects). */
function proyecto(id, nombre, area = 'TI') {
  return {
    id,
    nombre,
    nombre_normalizado: nombre.toLowerCase(),
    area,
    cliente: null,
    estado: 'EN_PROCESO',
    created_at: '2026-06-01T10:00:00',
    updated_at: '2026-06-01T10:00:00',
  }
}

function paginaProyectos(items) {
  return { total: items.length, pagina: 1, por_pagina: 20, items }
}

function paginaCapacitaciones(total) {
  return { total, pagina: 1, por_pagina: 20, items: [] }
}

/** Monta con las tres fuentes resueltas por defecto. */
async function montar({
  resultado: res = resultado(),
  proyectos = paginaProyectos([proyecto(1, 'Proyecto Roble')]),
  capacitaciones = paginaCapacitaciones(2),
} = {}) {
  vi.mocked(obtenerResultadoActual).mockResolvedValue(res)
  vi.mocked(listarMisProyectos).mockResolvedValue(proyectos)
  vi.mocked(listarCapacitaciones).mockResolvedValue(capacitaciones)
  const utils = render(
    <Inicio
      token="token-empleado"
      alSesionExpirada={vi.fn()}
      onIrAProgreso={vi.fn()}
      onIrAProyectos={vi.fn()}
      onIrACapacitaciones={vi.fn()}
    />,
  )
  await screen.findByRole('heading', { name: 'Inicio', level: 1 })
  return utils
}

beforeEach(() => {
  vi.mocked(obtenerResultadoActual).mockReset()
  vi.mocked(listarMisProyectos).mockReset()
  vi.mocked(listarCapacitaciones).mockReset()
  // Valores por defecto para que un test que solo configura UNA fuente no
  // provoque un fallo no controlado en las otras dos. Cada test que ejercita
  // un estado concreto sobrescribe explícitamente lo que necesita.
  vi.mocked(listarMisProyectos).mockResolvedValue(paginaProyectos([]))
  vi.mocked(listarCapacitaciones).mockResolvedValue(paginaCapacitaciones(0))
})
describe('Inicio — estructura de la vista (PRD §21.1)', () => {
  it('muestra el encabezado y consulta las tres fuentes con el token', async () => {
    await montar()

    expect(
      screen.getByRole('heading', { name: 'Inicio', level: 1 }),
    ).toBeInTheDocument()
    expect(obtenerResultadoActual).toHaveBeenCalledWith('token-empleado')
    expect(listarMisProyectos).toHaveBeenCalledWith('token-empleado')
    expect(listarCapacitaciones).toHaveBeenCalledWith('token-empleado')
  })

  it('presenta los bloques del resumen en el orden del PRD', async () => {
    const { container } = await montar()

    // Orden del DOM: resumen superior (3 tarjetas `MetricCard`, también h2) →
    // zona principal (2 paneles) → próximo paso.
    const titulos = [...container.querySelectorAll('h2')].map((n) =>
      n.textContent.trim(),
    )
    expect(titulos).toEqual([
      'Mi progreso',
      'Proyectos',
      'Capacitaciones',
      'Tus proyectos',
      'Resumen de competencias',
      'Próximo paso',
    ])
  })

  it('el resumen superior tiene TRES tarjetas de tamaño equivalente', async () => {
    const { container } = await montar()

    const tarjetas = container.querySelectorAll('.inicio-metricas .metric-card')
    expect(tarjetas).toHaveLength(3)
    // Orden exacto de la referencia: Mi progreso, Proyectos, Capacitaciones.
    expect([...tarjetas].map((t) => t.querySelector('h2').textContent.trim())).toEqual([
      'Mi progreso',
      'Proyectos',
      'Capacitaciones',
    ])
    // Cada tarjeta lleva icono, texto y botón en la MISMA posición: el prop
    // `action` de `MetricCard` los ancla al pie en las tres.
    expect(container.querySelectorAll('.inicio-metricas .metric-card__icon')).toHaveLength(3)
    expect(container.querySelectorAll('.inicio-metricas .metric-card__action')).toHaveLength(3)
  })

  it('las secciones se apilan a ancho completo, sin columnas angostas', async () => {
    const { container } = await montar()

    // Cada bloque es un panel de ancho completo; NO existe la rejilla de dos
    // columnas ni un contenedor que agrupe proyectos y competencias.
    expect(container.querySelectorAll('.inicio-principal')).toHaveLength(0)
    const paneles = container.querySelectorAll('.inicio-panel')
    expect(paneles).toHaveLength(2)
    expect(paneles[0].textContent).toContain('Tus proyectos')
    expect(paneles[1].textContent).toContain('Resumen de competencias')
  })

  it('el botón del resumen ocupa el ancho del bloque', async () => {
    const { container } = await montar()

    const boton = screen.getByRole('button', { name: 'Ver detalle en Mi progreso' })
    expect(boton.className).toContain('inicio-boton-ancho')
    expect(boton).toBeInTheDocument()
    expect(container.querySelector('.inicio-boton-ancho')).toBe(boton)
  })

  it('ocupa todo el ancho disponible del shell', async () => {
    const { container } = await montar()

    // Sin max-width propia: la vista se apoya en el ancho de contenido.
    const estilos = container.querySelector('.inicio-empleado')
    expect(estilos.className).toContain('inicio-empleado')
    expect(estilos.style.maxWidth).toBe('')
  })

  it('NO monta el bloque independiente de recomendación IA', async () => {
    await montar()

    // La recomendación vive en «Mi progreso», que es donde tiene contexto.
    expect(
      screen.queryByRole('heading', { name: /Recomendación de desarrollo/ }),
    ).not.toBeInTheDocument()
  })

  it('no depende de IA: solo consulta las tres fuentes sin IA', async () => {
    await montar()

    expect(obtenerResultadoActual).toHaveBeenCalledTimes(1)
    expect(listarMisProyectos).toHaveBeenCalledTimes(1)
    expect(listarCapacitaciones).toHaveBeenCalledTimes(1)
  })

  it('el resumen superior enlaza con las tres secciones', async () => {
    const onIrAProgreso = vi.fn()
    const onIrAProyectos = vi.fn()
    const onIrACapacitaciones = vi.fn()
    vi.mocked(obtenerResultadoActual).mockResolvedValue(resultado())
    vi.mocked(listarMisProyectos).mockResolvedValue(paginaProyectos([]))
    vi.mocked(listarCapacitaciones).mockResolvedValue(paginaCapacitaciones(0))
    render(
      <Inicio
        token="token-empleado"
        alSesionExpirada={vi.fn()}
        onIrAProgreso={onIrAProgreso}
        onIrAProyectos={onIrAProyectos}
        onIrACapacitaciones={onIrACapacitaciones}
      />,
    )
    await screen.findByRole('heading', { name: 'Inicio', level: 1 })

    // Hay dos accesos a Mi progreso (tarjeta del resumen y próximo paso); se
    // dispara el de la tarjeta del resumen.
    fireEvent.click(screen.getAllByRole('button', { name: 'Ir a Mi progreso' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Mis proyectos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Mis capacitaciones' }))

    expect(onIrAProgreso).toHaveBeenCalled()
    expect(onIrAProyectos).toHaveBeenCalled()
    expect(onIrACapacitaciones).toHaveBeenCalled()
  })
})

describe('Inicio — proyectos (GET /me/projects)', () => {
  it('muestra los proyectos propios del empleado', async () => {
    await montar({
      proyectos: paginaProyectos([
        proyecto(1, 'Proyecto Roble'),
        proyecto(2, 'Proyecto Olmo'),
      ]),
    })

    expect(await screen.findByText('Proyecto Roble')).toBeInTheDocument()
    expect(screen.getByText('Proyecto Olmo')).toBeInTheDocument()
  })

  it('muestra como máximo 3 proyectos y avisa del recorte', async () => {
    await montar({
      proyectos: {
        total: 7,
        pagina: 1,
        por_pagina: 20,
        items: [
          proyecto(1, 'Proyecto Uno'),
          proyecto(2, 'Proyecto Dos'),
          proyecto(3, 'Proyecto Tres'),
          proyecto(4, 'Proyecto Cuatro'),
        ],
      },
    })

    expect(screen.getByText('Proyecto Uno')).toBeInTheDocument()
    expect(screen.getByText('Proyecto Tres')).toBeInTheDocument()
    expect(screen.queryByText('Proyecto Cuatro')).not.toBeInTheDocument()
    // El total y el recorte salen del contrato, no de un cálculo propio.
    expect(
      screen.getByText(/Muestras 3 de 7 proyectos registrados/),
    ).toBeInTheDocument()
  })

  it('muestra nombre, área y estado sin inventar métricas', async () => {
    const { container } = await montar({
      proyectos: paginaProyectos([proyecto(1, 'Proyecto Roble', 'Operaciones')]),
    })

    const fila = screen.getByText('Proyecto Roble').closest('li')
    expect(within(fila).getByText('Operaciones')).toBeInTheDocument()
    expect(within(fila).getByText('EN_PROCESO')).toBeInTheDocument()
    const texto = container.textContent.toLowerCase()
    for (const prohibido of ['horas', 'destacado', 'reciente', 'puntaje']) {
      expect(texto).not.toContain(prohibido)
    }
  })

  it('muestra estado vacío sin mensaje motivacional', async () => {
    await montar({ proyectos: paginaProyectos([]) })

    expect(await screen.findByText('Todavía no tienes proyectos')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Ver mis proyectos' }),
    ).toBeInTheDocument()
  })
})

describe('Inicio — resumen de competencias (compacto)', () => {
  it('lista las cinco competencias en el orden oficial del contrato', async () => {
    await montar()

    const resumen = screen
      .getByRole('heading', { name: 'Resumen de competencias', level: 2 })
      .closest('section')
    const filas = within(resumen).getAllByRole('listitem')
    expect(filas).toHaveLength(5)
    expect(filas.map((f) => f.textContent)).toEqual([
      expect.stringContaining('Desempeño técnico'),
      expect.stringContaining('Liderazgo'),
      expect.stringContaining('Trabajo en equipo'),
      expect.stringContaining('Comunicación'),
      expect.stringContaining('Capacidad de aprendizaje'),
    ])
  })

  it('muestra nivel + etiqueta tal cual los devuelve el backend', async () => {
    await montar()

    // `nivel` y `etiqueta` vienen del contrato; no se derivan aquí.
    expect(screen.getByText('4 · Consolidado')).toBeInTheDocument()
  })

  it('presenta DI como "Datos insuficientes", nunca como nivel 0', async () => {
    await montar()

    const resumen = screen
      .getByRole('heading', { name: 'Resumen de competencias', level: 2 })
      .closest('section')
    expect(within(resumen).getAllByText('Datos insuficientes')).toHaveLength(4)
    expect(within(resumen).queryByText(/^0 ·/)).not.toBeInTheDocument()
  })

  it('NO monta las cinco CompetenciaCard completas', async () => {
    const { container } = await montar()

    // Sin `article.competencia`, sin evidencia ni "¿Cómo se obtiene?".
    expect(container.querySelectorAll('.competencia')).toHaveLength(0)
    expect(screen.queryByText('Evidencia')).not.toBeInTheDocument()
    expect(screen.queryByText('¿Cómo se obtiene?')).not.toBeInTheDocument()
  })

  it('NO monta el bloque independiente de Fortalezas', async () => {
    const { container } = await montar()

    // Las fortalezas viven en «Mi progreso» (§21.2).
    expect(container.querySelectorAll('.categorias')).toHaveLength(0)
    expect(
      screen.queryByText(/Capacidades que ya puedes consolidar/),
    ).not.toBeInTheDocument()
  })

  it('no muestra la experiencia como tarjeta propia', async () => {
    await montar()

    // La experiencia es contexto y no tiene bloque en el resumen.
    expect(screen.queryByText('Experiencia')).not.toBeInTheDocument()
  })

  it('enlaza con Mi progreso para el detalle', async () => {
    await montar()

    expect(
      screen.getByRole('button', { name: 'Ver detalle en Mi progreso' }),
    ).toBeInTheDocument()
  })

  it('no inventa métricas: sin score, ranking, 9-Box ni porcentajes', async () => {
    const { container } = await montar()

    const texto = container.textContent.toLowerCase()
    for (const prohibido of ['9-box', 'ranking', 'score', 'promedio', '%', 'tendencia']) {
      expect(texto).not.toContain(prohibido)
    }
  })
})

describe('Inicio — próximo paso honesto (sin regla automática)', () => {
  it('no afirma que el sistema decidió un próximo paso', async () => {
    await montar()

    const bloque = screen
      .getByRole('heading', { name: 'Próximo paso', level: 2 })
      .closest('section')
    expect(
      within(bloque).getByText(/Todavía no hay un próximo paso definido/),
    ).toBeInTheDocument()
    // No elige competencia, proyecto ni capacitación por su cuenta.
    const texto = bloque.textContent.toLowerCase()
    for (const prohibido of ['deberías', 'te recomendamos', 'prioridad', 'urgente']) {
      expect(texto).not.toContain(prohibido)
    }
  })

  it('se presenta como orientación, no como alerta', async () => {
    await montar()

    const bloque = screen
      .getByRole('heading', { name: 'Próximo paso', level: 2 })
      .closest('section')
    expect(bloque.className).toContain('inicio-bloque--reservado')
    expect(bloque).not.toHaveAttribute('role', 'alert')
    expect(
      within(bloque).getByRole('button', { name: 'Ir a Mi progreso' }),
    ).toBeInTheDocument()
  })
})

describe('Inicio — estados de la vista (Style Guide §13)', () => {
  it('muestra carga mientras consulta', async () => {
    let resolver
    vi.mocked(obtenerResultadoActual).mockReturnValue(
      new Promise((r) => {
        resolver = r
      }),
    )
    render(<Inicio token="token-empleado" alSesionExpirada={vi.fn()} />)

    expect(await screen.findByText('Cargando tu inicio…')).toBeInTheDocument()
    resolver(resultado())
    expect(await screen.findByRole('heading', { name: 'Inicio', level: 1 })).toBeInTheDocument()
  })

  it('muestra error con reintento si la consulta falla', async () => {
    vi.mocked(obtenerResultadoActual).mockRejectedValue(
      Object.assign(new Error('Fallo'), { estado: 500 }),
    )
    render(<Inicio token="token-empleado" alSesionExpirada={vi.fn()} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('No pudimos cargar tu inicio')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeInTheDocument()
  })

  it('un 401 de CUALQUIER fuente cierra la sesión', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(obtenerResultadoActual).mockResolvedValue(resultado())
    vi.mocked(listarMisProyectos).mockRejectedValue(
      Object.assign(new Error('Sesión expirada'), { estado: 401 }),
    )
    vi.mocked(listarCapacitaciones).mockResolvedValue(paginaCapacitaciones(0))
    render(<Inicio token="token-empleado" alSesionExpirada={alSesionExpirada} />)

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalled())
  })

  it('si fallan los proyectos NO oculta el resumen de competencias', async () => {
    vi.mocked(obtenerResultadoActual).mockResolvedValue(resultado())
    vi.mocked(listarMisProyectos).mockRejectedValue(
      Object.assign(new Error('Fallo'), { estado: 500 }),
    )
    vi.mocked(listarCapacitaciones).mockResolvedValue(paginaCapacitaciones(1))
    render(
      <Inicio
        token="token-empleado"
        alSesionExpirada={vi.fn()}
        onIrAProgreso={vi.fn()}
        onIrAProyectos={vi.fn()}
      />,
    )

    // El bloque de proyectos falla de forma aislada…
    expect(
      await screen.findByText('No pudimos cargar tus proyectos'),
    ).toBeInTheDocument()
    // …y el resto de la pantalla sigue visible.
    expect(
      screen.getByRole('heading', { name: 'Resumen de competencias', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Datos insuficientes')).toHaveLength(4)
    expect(
      screen.getByRole('button', { name: 'Ver detalle en Mi progreso' }),
    ).toBeInTheDocument()
  })

  it('si fallan las capacitaciones no rompe el resto', async () => {
    vi.mocked(obtenerResultadoActual).mockResolvedValue(resultado())
    vi.mocked(listarMisProyectos).mockResolvedValue(paginaProyectos([]))
    vi.mocked(listarCapacitaciones).mockRejectedValue(
      Object.assign(new Error('Fallo'), { estado: 500 }),
    )
    render(<Inicio token="token-empleado" alSesionExpirada={vi.fn()} />)

    // La tarjeta degrada a "—" sin romper la pantalla.
    expect(
      await screen.findByText('No pudimos consultar el total.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Tus proyectos', level: 2 }),
    ).toBeInTheDocument()
  })

  it('muestra los totales de proyectos y capacitaciones del contrato', async () => {
    await montar({
      proyectos: { total: 4, pagina: 1, por_pagina: 20, items: [proyecto(1, 'Proyecto Roble')] },
      capacitaciones: paginaCapacitaciones(6),
    })

    expect(
      within(screen.getByText('Proyectos').closest('article')).getByText('4'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByText('Capacitaciones').closest('article')).getByText('6'),
    ).toBeInTheDocument()
  })
})