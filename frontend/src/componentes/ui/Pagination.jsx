import { ChevronLeft, ChevronRight } from 'lucide-react'

// Paginación (Style Guide §14.2).
//
// Presenta el patrón de referencia `Mostrando 1–20 de 42  ← 1 2 3 →`. El
// rango se deriva SIEMPRE de `total` y `por_pagina` del backend, nunca de
// `items.length`: la página puede venir incompleta y el total es la verdad.
//
// La ventana de páginas se recorta para no saturar la vista cuando hay muchos
// registros; los extremos siguen siendo accesibles con Anterior/Siguiente.

const MAX_VISIBLES = 5

/** Ventana de páginas centrada en la actual, siempre con 1 y totalPaginas. */
function paginasVisibles(pagina, totalPaginas) {
  if (totalPaginas <= MAX_VISIBLES) {
    return Array.from({ length: totalPaginas }, (_, indice) => indice + 1)
  }
  let inicio = Math.max(1, pagina - Math.floor(MAX_VISIBLES / 2))
  const fin = Math.min(totalPaginas, inicio + MAX_VISIBLES - 1)
  inicio = Math.max(1, fin - MAX_VISIBLES + 1)
  return Array.from({ length: fin - inicio + 1 }, (_, indice) => inicio + indice)
}

/**
 * @param {{pagina: number, porPagina: number, total: number,
 *          onCambiarPagina: (pagina: number) => void, etiqueta?: string}} props
 */
export default function Pagination({
  pagina,
  porPagina,
  total,
  onCambiarPagina,
  etiqueta = 'elementos',
}) {
  // Sin datos (o volumen de una sola página) no se muestra: §14.2 la reserva
  // para cuando el volumen lo justifica.
  if (!total || total <= porPagina) return null

  const totalPaginas = Math.ceil(total / porPagina)
  const paginaActual = Math.min(Math.max(1, pagina), totalPaginas)
  const desde = (paginaActual - 1) * porPagina + 1
  const hasta = Math.min(paginaActual * porPagina, total)
  const hayAnterior = paginaActual > 1
  const haySiguiente = paginaActual < totalPaginas

  return (
    <nav className="paginacion" aria-label={`Paginación de ${etiqueta}`}>
      <p className="paginacion__resumen" aria-live="polite">
        Mostrando <strong>{desde}</strong>–<strong>{hasta}</strong> de{' '}
        <strong>{total}</strong> {etiqueta}
      </p>
      <ul className="paginacion__controles">
        <li>
          <button
            type="button"
            className="paginacion__boton"
            onClick={() => onCambiarPagina(paginaActual - 1)}
            disabled={!hayAnterior}
            aria-label="Página anterior"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
        </li>
        {paginasVisibles(paginaActual, totalPaginas).map((numero) => (
          <li key={numero}>
            <button
              type="button"
              className={
                numero === paginaActual
                  ? 'paginacion__boton paginacion__boton--actual'
                  : 'paginacion__boton'
              }
              onClick={() => onCambiarPagina(numero)}
              aria-label={`Página ${numero}`}
              aria-current={numero === paginaActual ? 'page' : undefined}
            >
              {numero}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="paginacion__boton"
            onClick={() => onCambiarPagina(paginaActual + 1)}
            disabled={!haySiguiente}
            aria-label="Página siguiente"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </li>
      </ul>
    </nav>
  )
}
