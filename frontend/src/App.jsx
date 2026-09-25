// App raíz: sesión, enrutamiento por rol y navegación del Empleado
// (PRD §3, §20, §21; Especificación Técnica §31/§32; Style Guide §7, §10, §11).
//
// El estado de sesión (token + rol + must_change_password) SOLO decide qué
// pantalla mostrar; la autorización real la aplica el backend en cada
// petición. Cualquier 401 cierra la sesión y vuelve al inicio de sesión.
//
// Orden de decisión:
//   1. sin sesión → InicioSesion;
//   2. credencial temporal → CambioContrasena (PRD §3.3: el backend bloquea
//      el resto de endpoints mientras must_change_password = true), sin shell;
//   3. rol sin vistas de Empleado (RH) → shell sin navegación + aviso;
//   4. Empleado con contraseña definitiva → shell de Empleado con las seis
//      secciones del Style Guide §10; solo "Mi progreso" es funcional (§21.2).

import { useCallback, useEffect, useState } from 'react'
import {
  actualizarSesion,
  guardarSesion,
  limpiarSesion,
  obtenerSesion,
} from './api/autenticacion.js'
import { obtenerCuenta } from './api/cuenta.js'
import AccesoRh from './componentes/AccesoRh.jsx'
import CambioContrasena from './componentes/CambioContrasena.jsx'
import InicioSesion from './componentes/InicioSesion.jsx'
import Layout from './componentes/Layout.jsx'
import { SECCIONES_EMPLEADO, SECCION_INICIAL } from './navegacion.js'
import MiProgreso from './vistas/MiProgreso.jsx'
import SeccionTemporal from './vistas/SeccionTemporal.jsx'

function App() {
  const [sesion, setSesion] = useState(obtenerSesion)
  const [seccion, setSeccion] = useState(SECCION_INICIAL)
  const [cuenta, setCuenta] = useState(null)

  const esEmpleadoActivo =
    sesion?.rol === 'EMPLEADO' && sesion?.mustChangePassword === false

  const iniciar = useCallback((sesionNueva) => {
    guardarSesion(sesionNueva)
    setSeccion(SECCION_INICIAL)
    setSesion(sesionNueva)
  }, [])

  const cerrarSesion = useCallback(() => {
    limpiarSesion()
    setSeccion(SECCION_INICIAL)
    setSesion(null)
  }, [])

  const alCambiarPassword = useCallback(() => {
    setSesion(actualizarSesion({ mustChangePassword: false }))
  }, [])

  // Cuenta autenticada para el header (§11), desde GET /api/v1/me. Si el
  // backend no la devuelve, el shell sigue funcionando sin mostrar identidad:
  // nunca se inventa la cuenta.
  useEffect(() => {
    if (!esEmpleadoActivo) {
      setCuenta(null)
      return undefined
    }
    let cancelado = false
    obtenerCuenta(sesion.token)
      .then((datos) => {
        if (!cancelado) setCuenta(datos?.empleado_nombre || datos?.email || null)
      })
      .catch((error) => {
        if (cancelado) return
        if (error?.estado === 401) cerrarSesion()
        // Otro fallo: solo se omite la cuenta del header (§13.6).
      })
    return () => {
      cancelado = true
    }
  }, [esEmpleadoActivo, sesion?.token])

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
  // sea Empleado se queda sin navegación ni vistas de Empleado.
  if (sesion.rol !== 'EMPLEADO') {
    return (
      <Layout titulo="Acceso RH" onCerrarSesion={cerrarSesion}>
        <AccesoRh />
      </Layout>
    )
  }

  const activa =
    SECCIONES_EMPLEADO.find((item) => item.id === seccion) ||
    SECCIONES_EMPLEADO[0]

  return (
    <Layout
      titulo={activa.titulo}
      cuenta={cuenta}
      secciones={SECCIONES_EMPLEADO}
      activa={seccion}
      onSeleccionar={setSeccion}
      onCerrarSesion={cerrarSesion}
    >
      {seccion === 'mi-progreso' ? (
        <MiProgreso token={sesion.token} alSesionExpirada={cerrarSesion} />
      ) : (
        <SeccionTemporal titulo={activa.titulo} />
      )}
    </Layout>
  )
}

export default App
