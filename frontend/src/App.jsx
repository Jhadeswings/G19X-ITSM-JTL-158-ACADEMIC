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
//      (listado ↕ alta, PRD §20.1 + §3.3), "Evaluaciones" (§20.8) aplica el
//      flujo periodo vigente → generación → historial con los endpoints
//      /rh/evaluations ya implementados y "Proyectos" (§20.3) consulta y
//      edita el catálogo existente (GET/PATCH /rh/projects, sin creación);
//   4. Empleado con contraseña definitiva → shell de Empleado con las seis
//      secciones del Style Guide §10; "Mi progreso" (§21.2), "Mis proyectos"
//      (§21.3), "Mis capacitaciones" (§21.4), "Mi historial" (§21.5) y "Mi
//      cuenta" (§21.6) son funcionales. "Inicio" (§21.1) abre su estructura
//      visual con el orden de bloques del PRD, sin calcular nada.
//      SECCION_INICIAL sigue siendo 'mi-progreso'.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  actualizarSesion,
  guardarSesion,
  limpiarSesion,
  obtenerSesion,
} from './api/autenticacion.js'
import { obtenerCuenta } from './api/cuenta.js'
import CambioContrasena from './componentes/CambioContrasena.jsx'
import InicioSesion from './componentes/InicioSesion.jsx'
import AvisoInactividad from './componentes/AvisoInactividad.jsx'
import useInactividad from './lib/useInactividad.js'
import Layout from './componentes/Layout.jsx'
import {
  SECCIONES_EMPLEADO,
  SECCIONES_RH,
  SECCION_INICIAL,
  SECCION_RH_INICIAL,
} from './navegacion.js'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import { RutasProyectos, esRutaProyectos } from './rutas/router.jsx'
import InicioRH from './vistas/InicioRH.jsx'
import Empleados from './vistas/Empleados.jsx'
import Evaluaciones from './vistas/Evaluaciones.jsx'
import Brechas from './vistas/Brechas.jsx'
import Comparar from './vistas/Comparar.jsx'
import Mentoria from './vistas/Mentoria.jsx'
import Busqueda from './vistas/Busqueda.jsx'
import Inicio from './vistas/Inicio.jsx'
import MiCuenta from './vistas/MiCuenta.jsx'
import MiHistorial from './vistas/MiHistorial.jsx'
import MiProgreso from './vistas/MiProgreso.jsx'
import MisCapacitaciones from './vistas/MisCapacitaciones.jsx'
import MisProyectos from './vistas/MisProyectos.jsx'
import SeccionTemporal from './vistas/SeccionTemporal.jsx'

function App() {
  // Router real (RH-02.3): BrowserRouter vive AQUÍ para que cualquier
  // consumidor de <App /> (main.jsx y los tests) tenga el contexto de
  // navegación sin cambios externos. El resto de la app conserva su
  // arquitectura por secciones; SOLO Proyectos tiene rutas reales.
  return (
    <BrowserRouter>
      <Aplicacion />
    </BrowserRouter>
  )
}

function Aplicacion() {
  const [sesion, setSesion] = useState(obtenerSesion)
  const ubicacion = useLocation()
  const navegar = useNavigate()
  const enRutaProyectos = esRutaProyectos(ubicacion.pathname)
  // RH-02.3: una entrada profunda /proyectos[/{id}] con sesión RH reconoce
  // la sección al iniciar; sin esa sesión la ruta queda ignorada (login y
  // 401 conservan su comportamiento actual).
  const [seccion, setSeccion] = useState(() =>
    enRutaProyectos && sesion?.rol === 'RH' ? 'proyectos' : SECCION_INICIAL,
  )
  // Ruta actual legible desde callbacks estables (sin cierres obsoletos).
  const rutaActualRef = useRef(ubicacion.pathname)
  rutaActualRef.current = ubicacion.pathname

  const [cuenta, setCuenta] = useState(null)
  // Proyecto que Inicio pide abrir en «Mis proyectos» (MB-7-2E). Solo el id:
  // la identidad del empleado la sigue derivando el backend del token.
  const [proyectoPendiente, setProyectoPendiente] = useState(null)
  // Motivo del cierre, SOLO para informar en el login. `null` = sin mensaje.
  const [motivoCierre, setMotivoCierre] = useState(null)

  const esEmpleadoActivo =
    sesion?.rol === 'EMPLEADO' && sesion?.mustChangePassword === false

  const iniciar = useCallback((sesionNueva) => {
    guardarSesion(sesionNueva)
    setSeccion(SECCION_INICIAL)
    // RH-02.3: una URL de Proyectos no sobrevive a un inicio de sesión.
    if (esRutaProyectos(rutaActualRef.current)) {
      navegar('/', { replace: true })
    }
    setSesion(sesionNueva)
  }, [navegar])

  const cerrarSesion = useCallback((motivo = 'voluntaria') => {
    // Un solo punto de salida: limpiar storage, reiniciar navegación y sesión.
    limpiarSesion()
    setSeccion(SECCION_INICIAL)
    setProyectoPendiente(null)
    // RH-02.3: una URL de Proyectos no sobrevive a un cierre de sesión.
    if (esRutaProyectos(rutaActualRef.current)) {
      navegar('/', { replace: true })
    }
    setSesion(null)
    // Solo el cierre por INACTIVIDAD deja rastro en el login. El logout manual
    // y el 401 del backend siguen sin mensaje, exactamente como antes.
    setMotivoCierre(motivo === 'inactividad' ? 'inactividad' : null)
  }, [navegar])

  // Sesión por inactividad (Bloque F): renueva mientras hay actividad y, si la
  // hay, cierra la sesión. `cerrarSesion` ya es estable, así que el efecto no
  // se realimenta.
  const { aviso, seguirConectado } = useInactividad({
    token: sesion?.token ?? null,
    onCerrar: cerrarSesion,
    onRenovar: setSesion,
  })

  // --- RH-02.3: «Proyectos» es una RUTA REAL del sidebar ----------------
  // UNA sola entrada (sin «Detalle»): lleva SIEMPRE al Index /proyectos,
  // incluso si se está en /proyectos/{id}. Index/Show los decide el router.
  const seleccionarSeccionRh = useCallback(
    (id) => {
      if (id === 'proyectos') {
        setSeccion('proyectos')
        if (rutaActualRef.current !== '/proyectos') {
          navegar('/proyectos')
        }
        return
      }
      setSeccion(id)
      // Al salir de Proyectos la URL deja de ser de esta sección: se limpia
      // con replace para no inventar entradas de historial de otras secciones.
      if (esRutaProyectos(rutaActualRef.current)) {
        navegar('/', { replace: true })
      }
    },
    [navegar],
  )

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

  // --- RH-02.3: la URL manda en Proyectos (router real) ------------------
  // Back/Forward y deep-links cambian la ubicación; este efecto sincroniza
  // la sección del sidebar SIN escribir la URL (solo lectura → sin bucles).
  // Una entrada fuera de Proyectos (p. ej. '/' al retroceder) devuelve la
  // sección inicial de RH si estábamos en Proyectos.
  useEffect(() => {
    if (sesion?.rol !== 'RH') return undefined
    if (enRutaProyectos) {
      setSeccion((actual) => (actual === 'proyectos' ? actual : 'proyectos'))
    } else {
      setSeccion((actual) =>
        actual === 'proyectos' ? SECCION_RH_INICIAL : actual,
      )
    }
    return undefined
  }, [enRutaProyectos, sesion?.rol])

  // Al desmontar la app, la URL no debe quedar apuntando a Proyectos
  // (cierre de la SPA y limpieza entre pruebas).
  useEffect(
    () => () => {
      if (esRutaProyectos(window.location.pathname)) {
        window.history.replaceState(null, '', '/')
      }
    },
    [],
  )

  if (!sesion) {
    return <InicioSesion onExito={iniciar} motivoCierre={motivoCierre} />
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
      <>
        <Layout
        titulo={activaRh.titulo}
        rol="RH"
        secciones={SECCIONES_RH}
        activa={activaRh.id}
        onSeleccionar={seleccionarSeccionRh}
        onCerrarSesion={() => cerrarSesion('voluntaria')}
      >
        {activaRh.id === 'inicio' ? (
          <InicioRH
            token={sesion.token}
            onSesionExpirada={cerrarSesion}
            onVerEmpleados={() => seleccionarSeccionRh('empleados')}
          />
        ) : activaRh.id === 'empleados' ? (
          <Empleados token={sesion.token} alSesionExpirada={cerrarSesion} />
        ) : activaRh.id === 'proyectos' ? (
          <RutasProyectos token={sesion.token} alSesionExpirada={cerrarSesion} />
        ) : activaRh.id === 'brechas' ? (
          <Brechas token={sesion.token} alSesionExpirada={cerrarSesion} />
        ) : activaRh.id === 'comparar' ? (
          <Comparar token={sesion.token} alSesionExpirada={cerrarSesion} />
        ) : activaRh.id === 'mentoria' ? (
          <Mentoria token={sesion.token} alSesionExpirada={cerrarSesion} />
        ) : activaRh.id === 'busqueda' ? (
          <Busqueda token={sesion.token} alSesionExpirada={cerrarSesion} />
        ) : activaRh.id === 'evaluaciones' ? (
          <Evaluaciones token={sesion.token} alSesionExpirada={cerrarSesion} />
        ) : (
          <SeccionTemporal titulo={activaRh.titulo} />
        )}
      </Layout>
        {aviso !== null && (
          <AvisoInactividad segundos={aviso} alSeguirConectado={seguirConectado} />
        )}
      </>
    )
  }

  const activa =
    SECCIONES_EMPLEADO.find((item) => item.id === seccion) ||
    SECCIONES_EMPLEADO[0]

  return (
    <>
      <Layout
        titulo={activa.titulo}
        cuenta={cuenta}
        rol="EMPLEADO"
        secciones={SECCIONES_EMPLEADO}
        activa={seccion}
        onSeleccionar={setSeccion}
        onCerrarSesion={() => cerrarSesion('voluntaria')}
      >
      {seccion === 'inicio' ? (
        <Inicio
          token={sesion.token}
          alSesionExpirada={cerrarSesion}
          onIrAProgreso={() => setSeccion('mi-progreso')}
          onIrAProyectos={() => setSeccion('mis-proyectos')}
          onIrACapacitaciones={() => setSeccion('mis-capacitaciones')}
          onIrAProyecto={(proyectoId) => {
            setProyectoPendiente(proyectoId)
            setSeccion('mis-proyectos')
          }}
        />
      ) : seccion === 'mi-progreso' ? (
        <MiProgreso token={sesion.token} alSesionExpirada={cerrarSesion} />
      ) : seccion === 'mis-proyectos' ? (
        <MisProyectos
          token={sesion.token}
          alSesionExpirada={cerrarSesion}
          proyectoId={proyectoPendiente}
          alProyectoAplicado={() => setProyectoPendiente(null)}
        />
      ) : seccion === 'mis-capacitaciones' ? (
        <MisCapacitaciones token={sesion.token} alSesionExpirada={cerrarSesion} />
      ) : seccion === 'mi-historial' ? (
        <MiHistorial token={sesion.token} alSesionExpirada={cerrarSesion} />
      ) : seccion === 'mi-cuenta' ? (
        <MiCuenta token={sesion.token} alSesionExpirada={cerrarSesion} />
      ) : (
        <SeccionTemporal titulo={activa.titulo} />
      )}
    </Layout>
      {aviso !== null && (
        <AvisoInactividad segundos={aviso} alSeguirConectado={seguirConectado} />
      )}
    </>
  )
}

export default App
