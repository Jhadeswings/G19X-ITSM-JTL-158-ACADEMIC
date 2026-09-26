// Tabla de datos (Style Guide §14.1). Solo para RH.
//
// Reglas del Style Guide que este componente sostiene:
// - encabezados claros y `<th scope="col">`;
// - el color nunca es la única señal: cada columna expone su encabezado
//   también como `data-label` para la vista de tarjeta en móvil (§7);
// - hover discreto handled por CSS, sin JS.
//
// La tabla no impone cómo se ve cada celda: la vista decide el contenido. Por
// eso `columns` solo describe encabezado y alineación.

/**
 * @param {{columns: Array<{key: string, label: string, align?: 'left'|'right'|'center'}>,
 *          caption?: string, children: React.ReactNode, className?: string,
 *          empty?: React.ReactNode}} props
 */
export default function Table({ columns, caption, children, className = '' }) {
  return (
    <div className="tabla-envoltura">
      <table className={`tabla ${className}`.trim()}>
        {caption && <caption className="visualmente-oculto">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((columna) => (
              <th
                key={columna.key}
                scope="col"
                className={columna.align ? `tabla__th tabla__th--${columna.align}` : 'tabla__th'}
              >
                {columna.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
