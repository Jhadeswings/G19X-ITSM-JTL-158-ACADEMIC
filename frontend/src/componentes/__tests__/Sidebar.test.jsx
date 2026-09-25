// Sidebar: navegación del Empleado (Style Guide §10 y §22).

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SECCIONES_EMPLEADO } from '../../navegacion.js'
import Sidebar from '../Sidebar.jsx'

describe('Sidebar — navegación', () => {
  it('muestra las seis secciones en el orden del Style Guide §10', () => {
    render(
      <Sidebar
        secciones={SECCIONES_EMPLEADO}
        activa="mi-progreso"
        onSeleccionar={vi.fn()}
      />,
    )

    const navegacion = screen.getByRole('navigation', {
      name: 'Navegación principal',
    })
    const etiquetas = within(navegacion)
      .getAllByRole('button')
      .map((boton) => boton.textContent)

    expect(etiquetas).toEqual([
      'Inicio',
      'Mi progreso',
      'Mis proyectos',
      'Mis capacitaciones',
      'Mi historial',
      'Mi cuenta',
    ])
  })

  it('marca la sección activa con aria-current', () => {
    render(
      <Sidebar
        secciones={SECCIONES_EMPLEADO}
        activa="mi-historial"
        onSeleccionar={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Mi historial' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      screen.getByRole('button', { name: 'Mi progreso' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('avisa qué sección se seleccionó', () => {
    const onSeleccionar = vi.fn()
    render(
      <Sidebar
        secciones={SECCIONES_EMPLEADO}
        activa="mi-progreso"
        onSeleccionar={onSeleccionar}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mis capacitaciones' }))

    expect(onSeleccionar).toHaveBeenCalledWith('mis-capacitaciones')
  })

  it('aplica el estado abierto del drawer (§7)', () => {
    const { container, rerender } = render(
      <Sidebar
        secciones={SECCIONES_EMPLEADO}
        activa="mi-progreso"
        onSeleccionar={vi.fn()}
      />,
    )
    expect(container.firstChild).not.toHaveClass('sidebar--abierto')

    rerender(
      <Sidebar
        secciones={SECCIONES_EMPLEADO}
        activa="mi-progreso"
        onSeleccionar={vi.fn()}
        abierto
      />,
    )

    expect(container.firstChild).toHaveClass('sidebar--abierto')
  })
})
