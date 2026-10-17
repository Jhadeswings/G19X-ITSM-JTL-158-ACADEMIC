// Fortalezas y oportunidades (PRD §17.4).
//
// Las categorías llegan YA calculadas por el backend (niveles 4–5 /
// 1–2 por reglas). Este componente SOLO las presenta: nunca las
// recalcula ni las deduce de los niveles mostrados. El nivel y la
// etiqueta de cada fila también son del contrato: la vista construye
// la prop `niveles` leyendo `resultado_actual.competencias` —
// referencia `.li`: nombre a la izquierda, `4 Consolidado` a la derecha.

import { NOMBRES_COMPETENCIAS } from '../textos.js'
import EstadoVacio from './EstadoVacio.jsx'

function ListaCategorias({ claves, niveles }) {
  if (!claves || claves.length === 0) return null
  return (
    <ul className="categorias__lista">
      {claves.map((clave) => {
        const dato = niveles?.[clave]
        return (
          <li key={clave} className="categorias__item">
            {NOMBRES_COMPETENCIAS[clave] || clave}
            {dato && dato.nivel != null && (
              <span className="categorias__dato">
                <b>{dato.nivel}</b>
                {dato.etiqueta}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function Fortalezas({ claves, niveles }) {
  return (
    <div className="categorias categorias--fortalezas">
      <div className="categorias__heading"><span>Capacidades que ya puedes consolidar</span></div>
      <ListaCategorias claves={claves} niveles={niveles} />
      {(!claves || claves.length === 0) && (
        <EstadoVacio
          titulo="Aún no hay fortalezas calculadas"
          descripcion="Las fortalezas aparecen cuando una competencia alcanza nivel 4 o 5 según las reglas del sistema."
        />
      )}
    </div>
  )
}

export function Oportunidades({ claves, niveles }) {
  return (
    <div className="categorias categorias--oportunidades">
      <div className="categorias__heading"><span>Áreas donde puedes buscar próximos pasos</span></div>
      <ListaCategorias claves={claves} niveles={niveles} />
      {(!claves || claves.length === 0) && (
        <EstadoVacio
          titulo="Aún no hay oportunidades de desarrollo calculadas"
          descripcion="Las oportunidades aparecen cuando una competencia está en nivel 1 o 2 según las reglas del sistema."
        />
      )}
    </div>
  )
}
