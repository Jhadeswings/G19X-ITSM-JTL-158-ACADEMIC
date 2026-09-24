// App raíz (Fase frontend: vista Empleado "Mi progreso", PRD §21.2).
//
// Sin token → pantalla de inicio de sesión (PRD §3).
// Con token → vista "Mi progreso". La sesión vive en el token de acceso;
// si el backend responde 401, se cierra la sesión y se vuelve a pedir
// credenciales (la identidad SIEMPRE la valida el backend, ET §31).

import { useState } from 'react'
import { limpiarToken, guardarToken, obtenerToken } from './api/autenticacion.js'
import InicioSesion from './componentes/InicioSesion.jsx'
import MiProgreso from './vistas/MiProgreso.jsx'

function App() {
  const [token, setToken] = useState(obtenerToken)

  function iniciar(tokenNuevo) {
    guardarToken(tokenNuevo)
    setToken(tokenNuevo)
  }

  function cerrarSesion() {
    limpiarToken()
    setToken(null)
  }

  if (!token) {
    return <InicioSesion onExito={iniciar} />
  }

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__titulo">Mi progreso</span>
        <button
          type="button"
          className="boton boton--fantasma"
          onClick={cerrarSesion}
        >
          Cerrar sesión
        </button>
      </header>
      <main className="app__contenido">
        <MiProgreso token={token} alSesionExpirada={cerrarSesion} />
      </main>
    </div>
  )
}

export default App
