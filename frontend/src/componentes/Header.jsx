// Header del shell (Style Guide §11; componente base §31).
//
// Contiene: acceso al menú en mobile (§7), el título de la sección (responde
// "¿dónde estoy?"), la cuenta autenticada cuando está disponible y la acción
// principal (cerrar sesión). El título es el único <h1> de la pantalla.
//
// Breadcrumb: no se incluye porque la navegación de Empleado es de un solo
// nivel (§10/§11: el breadcrumb aporta en jerarquías del tipo
// "Empleados / Juan Pérez"). Se agregará cuando exista una vista de detalle.
//
// No se inventa identidad: si la cuenta no está disponible, no se muestra.

export default function Header({
  titulo,
  cuenta,
  mostrarMenu = false,
  menuAbierto = false,
  onAlternarMenu,
  onCerrarSesion,
}) {
  return (
    <header className="app__header">
      <div className="app__izquierda">
        {mostrarMenu && (
          <button
            type="button"
            className="boton boton--fantasma layout__menu"
            aria-expanded={menuAbierto}
            aria-controls="navegacion-empleado"
            onClick={onAlternarMenu}
          >
            Menú
          </button>
        )}
        <h1 className="app__titulo">{titulo}</h1>
      </div>
      <div className="app__acciones">
        {cuenta && <span className="app__cuenta">{cuenta}</span>}
        <button
          type="button"
          className="boton boton--fantasma"
          onClick={onCerrarSesion}
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  )
}
