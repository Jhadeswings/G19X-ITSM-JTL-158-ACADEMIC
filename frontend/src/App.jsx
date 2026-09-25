// App raíz: sesión y enrutamiento por rol y primer acceso
// (PRD §3, §20, §21.2; Especificación Técnica §31/§32).
//
// El estado de sesión (token + rol + must_change_password) SOLO decide qué
// pantalla mostrar; la autorización real la aplica el backend en cada
// petición. Cualquier 401 cierra la sesión y vuelve al inicio de sesión.
//
// Orden de decisión:
//   1. sin sesión → InicioSesion;
//   2. credencial temporal → CambioContrasena (PRD §3.3: el backend bloquea
//      el resto de endpoints mientras must_change_password = true);
//   3. rol sin vista de Empleado (RH) → pantalla temporal mínima;
//   4. Empleado con contraseña definitiva → "Mi progreso".

import { useState } from 'react'
import {
  actualizarSesion,
  guardarSesion,
  limpiarSesion,
  obtenerSesion,
} from './api/autenticacion.js'
import AccesoRh from './componentes/AccesoRh.jsx'
import CambioContrasena from './componentes/CambioContrasena.jsx'
import InicioSesion from './componentes/InicioSesion.jsx'
import MiProgreso from './vistas/MiProgreso.jsx'

/** Marco común (Header + contenido) de las pantallas con sesión. */
function Marco({ titulo, onCerrarSesion, children }) {
  return (
    <div className="app">
      <header className="app__header">
        <span className="app__titulo">{titulo}</span>
        <button
          type="button"
          className="boton boton--fantasma"
          onClick={onCerrarSesion}
        >
          Cerrar sesión
        </button>
      </header>
      <main className="app__contenido">{children}</main>
    </div>
  )
}

function App() {
  const [sesion, setSesion] = useState(obtenerSesion)

  function iniciar(sesionNueva) {
    guardarSesion(sesionNueva)
    setSesion(sesionNueva)
  }

  function cerrarSesion() {
    limpiarSesion()
    setSesion(null)
  }

  function alCambiarPassword() {
    setSesion(actualizarSesion({ mustChangePassword: false }))
  }

  if (!sesion) {
    return <InicioSesion onExito={iniciar} />
  }

  if (sesion.mustChangePassword) {
    return (
      <CambioContrasena
        token={sesion.token}
        alCambiar={alCambiarPassword}
        alCerrarSesion={cerrarSesion}
      />
    )
  }

  // PRD §3.1: el backend solo emite los roles RH y EMPLEADO. Todo lo que no
  // sea Empleado se queda sin vista de Empleado (nunca se muestran datos que
  // correspondan a otro rol).
  if (sesion.rol !== 'EMPLEADO') {
    return (
      <Marco titulo="Acceso RH" onCerrarSesion={cerrarSesion}>
        <AccesoRh />
      </Marco>
    )
  }

  return (
    <Marco titulo="Mi progreso" onCerrarSesion={cerrarSesion}>
      <MiProgreso token={sesion.token} alSesionExpirada={cerrarSesion} />
    </Marco>
  )
}

export default App
