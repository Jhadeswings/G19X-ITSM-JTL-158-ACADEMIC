// Sidebar de navegación (Style Guide §10; componente base §31).
//
// Presentación pura: recibe las secciones y la activa. No decide permisos ni
// contenido (el enrutamiento de la aplicación vive en App).
//
// Accesibilidad (§22): navegación con etiqueta, lista de botones y
// `aria-current="page"` en la sección activa; el estado activo no depende
// solo del color (§10).
//
// Responsive (§7): en mobile funciona como drawer (lo controla Layout con la
// prop `abierto`). Cuando está cerrado usa `visibility: hidden`, de modo que
// sus controles salen del orden de tabulación.

export default function Sidebar({ secciones, activa, onSeleccionar, abierto }) {
  return (
    <aside className={`sidebar${abierto ? ' sidebar--abierto' : ''}`}>
      <p className="sidebar__marca">Sistema de Talento de Alto Potencial</p>
      <nav id="navegacion-empleado" aria-label="Navegación principal">
        <ul className="sidebar__lista">
          {secciones.map((seccion) => {
            const esActiva = seccion.id === activa
            return (
              <li key={seccion.id}>
                <button
                  type="button"
                  className={`sidebar__enlace${
                    esActiva ? ' sidebar__enlace--activo' : ''
                  }`}
                  aria-current={esActiva ? 'page' : undefined}
                  onClick={() => onSeleccionar(seccion.id)}
                >
                  {seccion.titulo}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
