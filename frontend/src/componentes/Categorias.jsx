// Fortalezas y oportunidades (PRD §17.4).
//
// Las categorías llegan YA calculadas por el backend (niveles 4–5 /
// 1–2 por reglas). Este componente SOLO las presenta: nunca las
// recalcula ni las deduce de los niveles mostrados.

import { Check, Lightbulb } from 'lucide-react'
import { NOMBRES_COMPETENCIAS } from '../textos.js'
import EstadoVacio from './EstadoVacio.jsx'

function ListaCategorias({ claves }) {
  if (!claves || claves.length === 0) return null
  return (
    <ul className="categorias__lista">
      {claves.map((clave) => (
        <li key={clave} className="categorias__item">
          {NOMBRES_COMPETENCIAS[clave] || clave}
        </li>
      ))}
    </ul>
  )
}

export function Fortalezas({ claves }) {
  return (
    <div className="categorias categorias--fortalezas">
      <div className="categorias__heading"><Check aria-hidden="true" /><span>Capacidades que ya puedes consolidar</span></div>
      <ListaCategorias claves={claves} />
      {(!claves || claves.length === 0) && (
        <EstadoVacio
          titulo="Aún no hay fortalezas calculadas"
          descripcion="Las fortalezas aparecen cuando una competencia alcanza nivel 4 o 5 según las reglas del sistema."
        />
      )}
    </div>
  )
}

export function Oportunidades({ claves }) {
  return (
    <div className="categorias categorias--oportunidades">
      <div className="categorias__heading"><Lightbulb aria-hidden="true" /><span>Áreas donde puedes buscar próximos pasos</span></div>
      <ListaCategorias claves={claves} />
      {(!claves || claves.length === 0) && (
        <EstadoVacio
          titulo="Aún no hay oportunidades de desarrollo calculadas"
          descripcion="Las oportunidades aparecen cuando una competencia está en nivel 1 o 2 según las reglas del sistema."
        />
      )}
    </div>
  )
}
