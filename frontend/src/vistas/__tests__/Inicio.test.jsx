// Tests de estructura, contratos y estados de "Inicio" (PRD §21.1, MB-7-2).
//
// Inicio es un RESUMEN: orienta y lleva a la sección del detalle, sin repetir
// "Mi progreso". Estos tests cubren las tres consultas independientes, el
// encabezado de bienvenida del rediseño (Fase 1), el gráfico radial emparejado
// con la lista numerada, la ausencia de las cinco `CompetenciaCard` completas,
// la ausencia de IA, el recorte de proyectos y los estados por bloque.

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
function proyecto(id, nombre, area = 'TI', estado = 'EN_PROCESO') {
  return {
    id,
    nombre,
    nombre_normalizado: nombre.toLowerCase(),
    area,
    cliente: null,
    estado,
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
  // El H1 de la vista es el saludo del héroe (boceto Fase 1).
  await screen.findByRole('heading', { name: /^¡Hola/, level: 1 })
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
  it('muestra el saludo del héroe y consulta las tres fuentes con el token', async () => {
    await montar()

    expect(
      screen.getByRole('heading', { name: /^¡Hola/, level: 1 }),
    ).toBeInTheDocument()
    expect(obtenerResultadoActual).toHaveBeenCalledWith('token-empleado')
    expect(listarMisProyectos).toHaveBeenCalledWith('token-empleado')
    expect(listarCapacitaciones).toHaveBeenCalledWith('token-empleado')
  })

  it('presenta los bloques del resumen en el orden del boceto (Fase 1)', async () => {
    const { container } = await montar()

    // Orden del DOM: fila superior (2 tarjetas `MetricCard`, también h2) →
    // Resumen de competencias → Tus proyectos → Próximo paso.
    const titulos = [...container.querySelectorAll('h2')].map((n) =>
      n.textContent.trim(),
    )
    expect(titulos).toEqual([
      'Proyectos',
      'Capacitaciones',
      'Resumen de competencias',
      'Tus proyectos',
      'Próximo paso',
    ])
  })

  it('la fila superior tiene DOS tarjetas: Proyectos y Capacitaciones', async () => {
    const { container } = await montar()

    const tarjetas = container.querySelectorAll('.inicio-metricas .metric-card')
    expect(tarjetas).toHaveLength(2)
    expect([...tarjetas].map((t) => t.querySelector('h2').textContent.trim())).toEqual([
      'Proyectos',
      'Capacitaciones',
    ])
    // Icono y botón en la misma posición en las dos (`metric-card__action`
    // ancla el botón al pie con `margin-top: auto`).
    expect(container.querySelectorAll('.inicio-metricas .metric-card__icon')).toHaveLength(2)
    expect(container.querySelectorAll('.inicio-metricas .metric-card__action')).toHaveLength(2)
  })

  it('NO existe tarjeta superior de Mi progreso', async () => {
    const { container } = await montar()

    // MB-7-2D: la ficha se eliminó; el acceso a «Mi progreso» queda en el
    // resumen de competencias y en Próximo paso.
    expect(
      within(container.querySelector('.inicio-metricas')).queryByText('Mi progreso'),
    ).not.toBeInTheDocument()
  })

  it('las secciones se apilan a ancho completo, sin columnas angostas', async () => {
    const { container } = await montar()

    // Cada bloque es un panel de ancho completo; NO existe la rejilla de dos
    // columnas externa ni un contenedor que agrupe proyectos y competencias.
    expect(container.querySelectorAll('.inicio-principal')).toHaveLength(0)
    const paneles = container.querySelectorAll('.inicio-panel')
    expect(paneles).toHaveLength(2)
    expect(paneles[0].textContent).toContain('Resumen de competencias')
    expect(paneles[1].textContent).toContain('Tus proyectos')
  })

  it('proyectos usa la franja suave y competencias la zona blanca', async () => {
    const { container } = await montar()

    // Zonas de ancho completo (ajuste Fase 1b): la misma base `.inicio-panel`
    // cambia de fondo con un modificador; ninguna sección es una tarjeta.
    const paneles = container.querySelectorAll('.inicio-panel')
    expect(paneles[0]).not.toHaveClass('inicio-panel--suave')
    expect(paneles[1]).toHaveClass('inicio-panel--suave')
    // Las métricas siguen siendo `metric-card` reutilizado, pero viven sobre
    // la franja `.inicio-metricas`, no como tarjetas independientes.
    expect(
      container.querySelectorAll('.inicio-metricas .metric-card'),
    ).toHaveLength(2)
  })

  it('el botón del resumen ocupa el ancho del bloque', async () => {
    const { container } = await montar()

    // Los tres CTA comparten texto, así que se busca directamente el de ancho
    // completo por su clase.
    const boton = container.querySelector('.inicio-boton-ancho')
    expect(boton).toBeInTheDocument()
    expect(boton).toHaveTextContent('Ver mi progreso')
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
    await screen.findByRole('heading', { name: /^¡Hola/, level: 1 })

    // Acceso a «Mi progreso»: el botón del héroe y el del resumen de
    // competencias comparten texto (boceto Fase 1), así que se pulsan ambos.
    const progreso = screen.getAllByRole('button', { name: 'Ver mi progreso' })
    expect(progreso).toHaveLength(2)
    fireEvent.click(progreso[0])
    fireEvent.click(progreso[1])
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Mis proyectos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Mis capacitaciones' }))

    expect(onIrAProgreso).toHaveBeenCalledTimes(2)
    expect(onIrAProyectos).toHaveBeenCalled()
    expect(onIrACapacitaciones).toHaveBeenCalled()
  })
})

describe('Inicio — encabezado de bienvenida (boceto Fase 1)', () => {
  /** Monta solo con las fuentes resueltas y props extra a elección. */
  async function montarHero(props = {}) {
    vi.mocked(obtenerResultadoActual).mockResolvedValue(resultado())
    vi.mocked(listarMisProyectos).mockResolvedValue(paginaProyectos([]))
    vi.mocked(listarCapacitaciones).mockResolvedValue(paginaCapacitaciones(0))
    const utils = render(
      <Inicio token="token-empleado" alSesionExpirada={vi.fn()} {...props} />,
    )
    await screen.findByRole('heading', { name: /^¡Hola/, level: 1 })
    return utils
  }

  it('saluda con el nombre de la cuenta cuando llega', async () => {
    await montarHero({ nombreEmpleado: 'Ana Pino' })

    expect(
      screen.getByRole('heading', { name: '¡Hola, Ana Pino!', level: 1 }),
    ).toBeInTheDocument()
  })

  it('sin nombre usa un saludo genérico, sin inventar identidad', async () => {
    await montarHero()

    expect(
      screen.getByRole('heading', { name: '¡Hola!', level: 1 }),
    ).toBeInTheDocument()
  })

  it('el botón del héroe lleva a Mi progreso', async () => {
    const onIrAProgreso = vi.fn()
    await montarHero({ onIrAProgreso })

    // Hay dos «Ver mi progreso» (héroe y resumen de competencias): se pulsa
    // el del héroe, identificado por su clase de bloque.
    const botones = screen.getAllByRole('button', { name: 'Ver mi progreso' })
    const delHeroe = botones.find((boton) =>
      boton.className.includes('inicio-hero__boton'),
    )
    expect(delHeroe).toBeDefined()
    fireEvent.click(delHeroe)
    expect(onIrAProgreso).toHaveBeenCalledTimes(1)
  })

  it('incluye la ilustración decorativa de nodos conectados', async () => {
    const { container } = await montarHero()

    // ContextualNetwork reutilizada: misma pieza que el resto del sistema.
    expect(
      container.querySelector('.inicio-hero .contextual-network'),
    ).not.toBeNull()
  })

  it('no consulta ninguna fuente adicional para el saludo', async () => {
    await montar()

    expect(obtenerResultadoActual).toHaveBeenCalledTimes(1)
    expect(listarMisProyectos).toHaveBeenCalledTimes(1)
    expect(listarCapacitaciones).toHaveBeenCalledTimes(1)
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

    const fila = screen.getByRole('button', { name: /Proyecto Roble/ })
    expect(within(fila).getByText('Operaciones')).toBeInTheDocument()
    // Etiqueta de presentación del §6 (corrección Fase 1), no el valor crudo.
    expect(within(fila).getByText('En proceso')).toBeInTheDocument()
    // Sin etiquetas tipo píldora: el estado es un indicador visual con punto.
    expect(fila.querySelector('.ui-badge, [class*="badge" i]')).toBeNull()
    expect(
      fila.querySelector('.inicio-estado__punto--en-proceso'),
    ).not.toBeNull()
    const texto = container.textContent.toLowerCase()
    for (const prohibido of ['horas', 'destacado', 'reciente', 'puntaje']) {
      expect(texto).not.toContain(prohibido)
    }
  })

  it('la fila reparte: nombre a la izquierda, área y estado a la derecha', async () => {
    await montar({
      proyectos: paginaProyectos([proyecto(1, 'Proyecto Roble', 'Tecnología')]),
    })

    const fila = screen.getByRole('button', { name: /Proyecto Roble/ })
    const nombre = within(fila).getByText('Proyecto Roble')
    const area = within(fila).getByText('Tecnología')
    const estado = within(fila).getByText('En proceso')

    // Estructura (sin depender de clases CSS): área y estado comparten el
    // MISMO bloque derecho, que va después del nombre en el documento.
    const bloqueDerecho = area.parentElement
    expect(bloqueDerecho).toContainElement(estado)
    expect(bloqueDerecho).not.toContainElement(nombre)
    expect(
      nombre.compareDocumentPosition(bloqueDerecho),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('cada estado oficial lleva su color: Completado verde, En proceso ámbar, Cancelado rojo', async () => {
    await montar({
      proyectos: paginaProyectos([
        proyecto(1, 'Proyecto Roble', 'TI', 'COMPLETADO'),
        proyecto(2, 'Proyecto Olmo', 'TI', 'EN_PROCESO'),
        proyecto(3, 'Proyecto Cedro', 'TI', 'CANCELADO'),
      ]),
    })

    // Completado: texto verde oscuro + punto relleno del mismo tono.
    const completado = screen.getByRole('button', { name: /Proyecto Roble/ })
    expect(within(completado).getByText('Completado')).toHaveClass(
      'inicio-proyectos__estado--completado',
    )
    expect(
      completado.querySelector('.inicio-estado__punto--completado'),
    ).not.toBeNull()

    // En proceso: texto ámbar + punto delineado.
    const enProceso = screen.getByRole('button', { name: /Proyecto Olmo/ })
    expect(within(enProceso).getByText('En proceso')).toHaveClass(
      'inicio-proyectos__estado--en-proceso',
    )
    expect(
      enProceso.querySelector('.inicio-estado__punto--en-proceso'),
    ).not.toBeNull()

    // Cancelado: rojo sobrio SOLO en el texto, sin punto ni elementos nuevos.
    const cancelado = screen.getByRole('button', { name: /Proyecto Cedro/ })
    expect(within(cancelado).getByText('Cancelado')).toHaveClass(
      'inicio-proyectos__estado--cancelado',
    )
    expect(cancelado.querySelector('.inicio-estado__punto')).toBeNull()
  })

  it('estados no contemplados quedan neutros, sin variante de color ni punto', async () => {
    await montar({
      proyectos: paginaProyectos([proyecto(2, 'Proyecto Olmo', 'TI', 'PAUSADO')]),
    })

    const neutral = screen.getByRole('button', { name: /Proyecto Olmo/ })
    const etiqueta = within(neutral).getByText('PAUSADO')
    expect(etiqueta.className).not.toMatch(/inicio-proyectos__estado--/)
    expect(neutral.querySelector('.inicio-estado__punto')).toBeNull()
  })

  it('cada fila de proyecto es interactiva y lleva a Mis proyectos', async () => {
    const onIrAProyecto = vi.fn()
    vi.mocked(obtenerResultadoActual).mockResolvedValue(resultado())
    vi.mocked(listarMisProyectos).mockResolvedValue(
      paginaProyectos([proyecto(7, 'Proyecto Roble'), proyecto(8, 'Proyecto Olmo')]),
    )
    vi.mocked(listarCapacitaciones).mockResolvedValue(paginaCapacitaciones(0))
    render(
      <Inicio
        token="token-empleado"
        alSesionExpirada={vi.fn()}
        onIrAProyecto={onIrAProyecto}
      />,
    )
    await screen.findByRole('heading', { name: /^¡Hola/, level: 1 })

    // Semántica de botón nativa: la fila completa es el control.
    const filas = screen.getAllByRole('button', { name: /Proyecto/ })
    expect(filas).toHaveLength(2)
    expect(filas[0]).toHaveClass('inicio-proyectos__item')

    // Solo viaja el identificador del proyecto: ni empleado_id, ni rol, ni
    // datos de la participación.
    fireEvent.click(filas[1])
    expect(onIrAProyecto).toHaveBeenCalledTimes(1)
    expect(onIrAProyecto).toHaveBeenCalledWith(8)
    expect(onIrAProyecto.mock.calls[0]).toHaveLength(1)
  })

  it('NO tiene botón "Ver mis proyectos": el acceso es cada fila', async () => {
    const { container } = await montar()

    expect(screen.queryByText('Ver mis proyectos')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.inicio-proyectos__item')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Proyecto Roble/ })).toBeInTheDocument()
  })

  it('muestra estado vacío sin mensaje motivacional', async () => {
    await montar({ proyectos: paginaProyectos([]) })

    expect(await screen.findByText('Todavía no tienes proyectos')).toBeInTheDocument()
    expect(screen.queryByText('Ver mis proyectos')).not.toBeInTheDocument()
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

  it('la lista numerada empareja cada fila con su eje del gráfico', async () => {
    const { container } = await montar()

    const ejes = [...container.querySelectorAll('.inicio-radial__chip')].map(
      (chip) => chip.textContent,
    )
    const indices = [
      ...container.querySelectorAll('.inicio-competencias__indice'),
    ].map((indice) => indice.textContent)
    expect(ejes).toEqual(['1', '2', '3', '4', '5'])
    expect(indices).toEqual(['1', '2', '3', '4', '5'])
  })

  it('el gráfico marca vértices SOLO en competencias calculables', async () => {
    const { container } = await montar()

    // El contrato de ejemplo trae UNA calculable (nivel 4) y cuatro DI.
    expect(
      container.querySelectorAll('.inicio-radial__vertice'),
    ).toHaveLength(1)
    // Los ejes DI existen (número neutro), pero sin vértice: nunca nivel 0.
    expect(
      container.querySelectorAll('.inicio-radial__chip--di'),
    ).toHaveLength(4)
  })

  it('el gráfico es decorativo: la información accesible vive en la lista', async () => {
    const { container } = await montar()

    expect(container.querySelector('.inicio-radial')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('con una respuesta sin competencias no rompe la vista', async () => {
    await montar({ resultado: resultado({ competencias: [] }) })

    expect(
      screen.getByRole('heading', { name: 'Resumen de competencias', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Datos insuficientes')).not.toBeInTheDocument()
  })

  it('muestra nivel y etiqueta en columnas separadas, sin chip ni punto medio', async () => {
    await montar()

    // Número y etiqueta van en celdas propias: el 4 comparte eje con el resto
    // de niveles y "Consolidado" con el resto de etiquetas.
    const numero = document.querySelector('.inicio-competencias__numero')
    const etiqueta = document.querySelector('.inicio-competencias__etiqueta')
    expect(numero).toHaveTextContent('4')
    expect(etiqueta).toHaveTextContent('Consolidado')
    expect(numero.parentElement).toBe(etiqueta.parentElement)
    // Sin `·` uniendo número y palabra.
    expect(numero.parentElement.textContent).not.toContain('·')
    // Sin apariencia de chip: ni badge, ni fondo, ni borde.
    expect(etiqueta.className).not.toContain('ui-badge')
    expect(document.querySelectorAll('.inicio-competencias .ui-badge')).toHaveLength(0)
  })

  it('presenta DI como "Datos insuficientes", nunca como nivel 0', async () => {
    await montar()

    const resumen = screen
      .getByRole('heading', { name: 'Resumen de competencias', level: 2 })
      .closest('section')
    expect(within(resumen).getAllByText('Datos insuficientes')).toHaveLength(4)
    expect(within(resumen).queryByText('0')).not.toBeInTheDocument()
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

    // Los tres CTA a «Mi progreso» comparten el mismo texto (MB-7-2C), así que se
    // comprueba por el panel que los contiene, no de forma global.
    expect(
      within(
        screen.getByRole('heading', { name: 'Resumen de competencias', level: 2 })
          .closest('section'),
      ).getByRole('button', { name: 'Ver mi progreso' }),
    ).toBeInTheDocument()
  })

  it('la lista conserva número y etiqueta del contrato, sin marcas de nivel', async () => {
    const { container } = await montar()

    // MB-7-2C/2E: el nivel es el número y la etiqueta del contrato, sin
    // barras ni segmentos por competencia (el radial del boceto es una capa
    // decorativa general, no una barra por fila).
    expect(container.querySelectorAll('.inicio-nivel')).toHaveLength(0)
    expect(container.querySelectorAll('.inicio-nivel__paso')).toHaveLength(0)
    expect(document.querySelector('.inicio-competencias__numero')).toHaveTextContent('4')
    expect(document.querySelector('.inicio-competencias__etiqueta')).toBeInTheDocument()
  })

  it('el acceso a Mi progreso vive en el héroe, competencias y Próximo paso', async () => {
    await montar()

    // Dos botones con el mismo texto (héroe y cierre del resumen de
    // competencias): se distinguen por su clase de bloque.
    const botones = screen.getAllByRole('button', { name: 'Ver mi progreso' })
    expect(botones).toHaveLength(2)
    expect(
      botones.some((boton) => boton.className.includes('inicio-hero__boton')),
    ).toBe(true)
    expect(
      botones.some((boton) => boton.className.includes('inicio-boton-ancho')),
    ).toBe(true)
    // Enlace discreto de Próximo paso.
    expect(screen.getByRole('button', { name: 'Mi progreso' })).toBeInTheDocument()
    // No queda copy alternativo de la sección.
    expect(
      screen.queryByRole('button', { name: /Ver detalle en Mi progreso|Ir a Mi progreso/ }),
    ).not.toBeInTheDocument()
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
    // Enlace discreto, sin tarjeta ni panel interior.
    expect(
      within(bloque).getByRole('button', { name: 'Mi progreso' }),
    ).toBeInTheDocument()
    expect(bloque.querySelectorAll('.inicio-panel')).toHaveLength(0)
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
    expect(await screen.findByRole('heading', { name: /^¡Hola/, level: 1 })).toBeInTheDocument()
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
      within(
        screen.getByRole('heading', { name: 'Resumen de competencias', level: 2 })
          .closest('section'),
      ).getByRole('button', { name: 'Ver mi progreso' }),
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