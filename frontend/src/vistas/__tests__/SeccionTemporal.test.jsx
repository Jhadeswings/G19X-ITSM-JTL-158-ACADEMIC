// Estado temporal de las secciones no implementadas: neutro y sin datos
// (Style Guide §13.4/§28; PRD §21).

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SeccionTemporal from '../SeccionTemporal.jsx'

describe('SeccionTemporal', () => {
  it('nombra la sección y explica en qué estado está', () => {
    render(<SeccionTemporal titulo="Mis proyectos" />)

    expect(
      screen.getByText('«Mis proyectos» todavía no está disponible'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/se implementará en una etapa posterior/),
    ).toBeInTheDocument()
  })

  it('no inventa datos, métricas ni clasificaciones', () => {
    const { container } = render(<SeccionTemporal titulo="Mi historial" />)

    expect(container.textContent).not.toMatch(/\d/)
    expect(container.textContent).not.toMatch(
      /nivel|9-box|promedio|score|ranking|alto potencial/i,
    )
  })
})
