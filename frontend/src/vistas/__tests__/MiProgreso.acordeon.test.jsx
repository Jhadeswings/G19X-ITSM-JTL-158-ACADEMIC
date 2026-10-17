// Tests del ACORDEÓN de "Mi progreso" (rediseño visual Fase 2): estado
// accesible (`aria-expanded` / `aria-controls`), primer bloque abierto,
// conservación de los datos del backend al plegar y desplegable
// «¿Cómo se obtienen?». API mockeada: sin llamadas reales.
//
// El cuerpo plegado se oculta SOLO con CSS: estos tests verifican que los
// datos SIGUEN en el DOM (nivel, etiqueta, evidencia) aunque la fila
// esté cerrada — la vista nunca desmonta ni recalcula nada.

import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerProgreso } from '../../api/progreso.js'
import MiProgreso from '../MiProgreso.jsx'
import { crearRespuesta } from './ayuda.js'

vi.mock('../../api/progreso.js', () => ({
  obtenerProgreso: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(obtenerProgreso).mockReset()
})

async function montar(respuesta = crearRespuesta()) {
  vi.mocked(obtenerProgreso).mockResolvedValue(respuesta)
  render(<MiProgreso token="t" />)
  await screen.findByRole('heading', { name: 'Competencias' })
}

describe('MiProgreso — acordeón de competencias (estado accesible)', () => {
  it('expone un botón por competencia con aria-expanded y aria-controls válido', async () => {
    await montar()

    const botones = document.querySelectorAll('.acordeon__ah')
    expect(botones).toHaveLength(5)
    for (const boton of botones) {
      expect(boton).toHaveAttribute('aria-expanded')
      const objetivo = boton.getAttribute('aria-controls')
      expect(objetivo).toBeTruthy()
      // El objetivo de aria-controls existe en el DOM.
      expect(document.getElementById(objetivo)).not.toBeNull()
    }
  })

  it('la primera competencia empieza abierta y las demás cerradas', async () => {
    await montar()

    const estados = [...document.querySelectorAll('.acordeon__ah')].map((boton) =>
      boton.getAttribute('aria-expanded'),
    )
    expect(estados).toEqual(['true', 'false', 'false', 'false', 'false'])
  })

  it('numera las filas 1–5 por posición, con cinco segmentos por nivel', async () => {
    await montar()

    // El círculo es la POSICIÓN de la competencia (referencia `.bd`),
    // también con DI: nunca el nivel oficial ni un guion.
    const indices = [...document.querySelectorAll('.acordeon__ah')].map(
      (boton) => boton.querySelector('.competencia__index')?.textContent,
    )
    expect(indices).toEqual(['1', '2', '3', '4', '5'])

    // Filas calculables: exactamente cinco segmentos; DI: ninguno.
    for (const fila of document.querySelectorAll('.acordeon__item')) {
      const esDi = fila.classList.contains('acordeon__item--di')
      expect(fila.querySelectorAll('.acordeon__pip')).toHaveLength(esDi ? 0 : 5)
    }
  })

  it('el botón alterna el estado y la visibilidad del cuerpo con el teclado', async () => {
    await montar()

    const [primera] = document.querySelectorAll('.acordeon__ah')
    const cuerpo = document.getElementById(primera.getAttribute('aria-controls'))
    expect(cuerpo).toHaveClass('acordeon__cuerpo--abierto')

    // `<button>` nativo: Enter/Space disparan click sin JS adicional.
    fireEvent.click(primera)
    expect(primera).toHaveAttribute('aria-expanded', 'false')
    expect(cuerpo).not.toHaveClass('acordeon__cuerpo--abierto')

    fireEvent.click(primera)
    expect(primera).toHaveAttribute('aria-expanded', 'true')
    expect(cuerpo).toHaveClass('acordeon__cuerpo--abierto')
  })

  it('al plegar una competencia sus datos del backend siguen en el DOM', async () => {
    await montar()

    // Liderazgo (segunda fila) empieza CERRADA: sus datos deben seguir en
    // el DOM pese a estar ocultos por CSS. Nivel y etiqueta viajan
    // SEPARADOS (columnas propias), nunca concatenados.
    const [, liderazgo] = document.querySelectorAll('.acordeon__ah')
    expect(liderazgo).toHaveAttribute('aria-expanded', 'false')
    expect(liderazgo.querySelector('.acordeon__nu')?.textContent).toBe('5')
    expect(within(liderazgo).getByText('Alto')).toBeInTheDocument()

    // Se despliega: mismo dato, misma evidencia, sin recálculo.
    fireEvent.click(liderazgo)
    expect(liderazgo).toHaveAttribute('aria-expanded', 'true')

    const tarjeta = liderazgo.closest('article')
    expect(within(tarjeta).getByText('Alto')).toBeInTheDocument()
    expect(within(tarjeta).getByText('coordinó tareas')).toBeInTheDocument()
    expect(within(tarjeta).getAllByText('3')).toHaveLength(2)

    // Y al volver a plegar, los datos SIGUEN en el DOM (solo CSS los oculta).
    fireEvent.click(liderazgo)
    expect(liderazgo).toHaveAttribute('aria-expanded', 'false')
    expect(within(tarjeta).getByText('Alto')).toBeInTheDocument()
    expect(within(tarjeta).getByText('coordinó tareas')).toBeInTheDocument()
  })

  it('una competencia DI comunica datos insuficientes sin nivel 0', async () => {
    await montar()

    const di = [...document.querySelectorAll('.acordeon__ah')].find((boton) =>
      boton.textContent.includes('Comunicación'),
    )
    expect(di).toBeDefined()
    expect(within(di).getByText('— Datos insuficientes')).toBeInTheDocument()
    expect(di.textContent).not.toMatch(/0\s*·/)
    expect(di.closest('article')).toHaveClass('acordeon__item--di')
  })
})

describe('MiProgreso — «¿Cómo se obtienen?» desplegable', () => {
  it('expone un toggle cerrado por defecto con aria-controls hacia la lista', async () => {
    await montar()

    const toggle = screen.getByRole('button', {
      name: 'Mostrar u ocultar cómo se obtienen las competencias',
    })
    // Referencia `.como`: la fila llega PLEGADA; el contenido existe.
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'growth-criterios-lista')
    expect(document.getElementById('growth-criterios-lista')).not.toBeNull()
    expect(document.getElementById('growth-criterios-lista')).not.toHaveClass(
      'como-se-obtienen--abierto',
    )
  })

  it('el toggle despliega y vuelve a plegar conservando las cinco filas', async () => {
    await montar()

    const toggle = screen.getByRole('button', {
      name: 'Mostrar u ocultar cómo se obtienen las competencias',
    })
    const lista = document.getElementById('growth-criterios-lista')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // Las filas siguen en el DOM aunque la lista esté plegada.
    expect(lista.querySelectorAll('.como-se-obtienen__fila')).toHaveLength(5)

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(lista).toHaveClass('como-se-obtienen--abierto')
    expect(lista.querySelectorAll('.como-se-obtienen__fila')).toHaveLength(5)

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(lista).not.toHaveClass('como-se-obtienen--abierto')
    expect(lista.querySelectorAll('.como-se-obtienen__fila')).toHaveLength(5)
  })

  it('el enlace «¿Cómo se obtiene?» de una tarjeta despliega la sección', async () => {
    await montar()

    const toggle = screen.getByRole('button', {
      name: 'Mostrar u ocultar cómo se obtienen las competencias',
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // El anclaje sigue siendo un enlace real (href) y además asegura que
    // su destino se muestre al llegar.
    const enlace = document.querySelector('a[href="#como-se-obtienen"]')
    expect(enlace.getAttribute('href')).toBe('#como-se-obtienen')
    fireEvent.click(enlace)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('mantiene el heading visible y los enlaces de las tarjetas', async () => {
    await montar()

    const enlaces = document.querySelectorAll('a[href="#como-se-obtienen"]')
    expect(enlaces.length).toBe(5)
    expect(
      screen.getByRole('heading', { name: '¿Cómo se obtienen?' }),
    ).toBeInTheDocument()
  })
})

describe('MiProgreso — encabezado con datos reales del contrato', () => {
  it('incluye la decoración discreta de ondas y nodos del héroe', async () => {
    await montar()

    // ContextualNetwork reutilizada: misma pieza compartida del sistema,
    // aquí en modo `decorativa` — oculta para lectores de pantalla.
    const red = document.querySelector('.growth-hero .contextual-network')
    expect(red).not.toBeNull()
    expect(red).toHaveAttribute('aria-hidden', 'true')
    expect(red).not.toHaveAttribute('role')
  })

  it('muestra los indicadores contextuales SOLO cuando el backend los envía', async () => {
    await montar()

    const hero = document.querySelector('.growth-hero')
    expect(within(hero).getByText('Antigüedad')).toBeInTheDocument()
    expect(within(hero).getByText('6.00 años')).toBeInTheDocument()
    expect(within(hero).getByText('Proyectos únicos')).toBeInTheDocument()
    expect(within(hero).getByText('5')).toBeInTheDocument()
  })

  it('sin antigüedad en el contrato no se inventa el indicador', async () => {
    const respuesta = crearRespuesta()
    respuesta.resultado_actual.experiencia.anios_antiguedad = null
    await montar(respuesta)

    expect(screen.queryByText('Antigüedad')).not.toBeInTheDocument()
    // Proyectos únicos sigue mostrándose porque el contrato lo trae.
    expect(screen.getByText('Proyectos únicos')).toBeInTheDocument()
  })
})