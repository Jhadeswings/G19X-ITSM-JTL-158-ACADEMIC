// App raíz: sesión, enrutamiento por rol y navegación
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
//   3. rol RH → shell con las ocho secciones del Style Guide §10; "Empleados"
//      es un catálogo con el alta integrada como subvista interna
//      (listado ↕ alta, PRD §20.1 + §3.3);
//   4. Empleado con contraseña definitiva → shell de Empleado con las seis
//      secciones del Style Guide §10; "Mi progreso" (§21.2), "Mis proyectos"
//      (§21.3), "Mis capacitaciones" (§21.4) y "Mi historial" (§21.5) son
//      funcionales, el resto reutiliza SeccionTemporal.

import { useCallback, useEffect, useState } from 'react'
import {
  actualizarSesion,
  guardarSesion,
  limpiarSesion,
  obtenerSesion,
} from './api/autenticacion.js'
import { obtenerCuenta } from './api/cuenta.js'
import CambioContrasena from './componentes/CambioContrasena.jsx'
import InicioSesion from './componentes/InicioSesion.jsx'
import Layout from './componentes/Layout.jsx'
import {
  SECCIONES_EMPLEADO,
  SECCIONES_RH,
  SECCION_INICIAL,
  SECCION_RH_INICIAL,
} from './navegacion.js'
import InicioRH from './vistas/InicioRH.jsx'
import Empleados from './vistas/Empleados.jsx'
import MiHistorial from './vistas/MiHistorial.jsx'
import MiProgreso from './vistas/MiProgreso.jsx'
import MisCapacitaciones from './vistas/MisCapacitaciones.jsx'
import MisProyectos from './vistas/MisProyectos.jsx'
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

  // PRD §3.1: el backend solo emite los roles RH y EMPLEADO. El rol RH
  // recibe su propio shell con la navegación del Style Guide §10; el estado
  // `seccion` compartido puede venir de otra vista, así que se resuelve
  // contra SECCIONES_RH con la sección inicial como respaldo.
  if (sesion.rol !== 'EMPLEADO') {
    const activaRh =
      SECCIONES_RH.find((item) => item.id === seccion) ||
      SECCIONES_RH.find((item) => item.id === SECCION_RH_INICIAL)

    return (
      <Layout
        titulo={activaRh.titulo}
        rol="RH"
        secciones={SECCIONES_RH}
        activa={activaRh.id}
        onSeleccionar={setSeccion}
        onCerrarSesion={cerrarSesion}
      >
        {activaRh.id === 'inicio' ? (
          <InicioRH
            token={sesion.token}
            onSesionExpirada={cerrarSesion}
            onVerEmpleados={() => setSeccion('empleados')}
          />
        ) : activaRh.id === 'empleados' ? (
          <Empleados token={sesion.token} alSesionExpirada={cerrarSesion} />
        ) : (
          <SeccionTemporal titulo={activaRh.titulo} />
        )}
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
      rol="EMPLEADO"
      secciones={SECCIONES_EMPLEADO}
      activa={seccion}
      onSeleccionar={setSeccion}
      onCerrarSesion={cerrarSesion}
    >
      {seccion === 'mi-progreso' ? (
        <MiProgreso token={sesion.token} alSesionExpirada={cerrarSesion} />
      ) : seccion === 'mis-proyectos' ? (
        <MisProyectos token={sesion.token} alSesionExpirada={cerrarSesion} />
      ) : seccion === 'mis-capacitaciones' ? (
        <MisCapacitaciones token={sesion.token} alSesionExpirada={cerrarSesion} />
      ) : seccion === 'mi-historial' ? (
        <MiHistorial token={sesion.token} alSesionExpirada={cerrarSesion} />
      ) : (
        <SeccionTemporal titulo={activa.titulo} />
      )}
    </Layout>
  )
}

export default App
