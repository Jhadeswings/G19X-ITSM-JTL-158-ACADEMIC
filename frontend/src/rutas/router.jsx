// RH-02.3 — Rutas reales de la sección Proyectos RH (react-router-dom).
//
// Router declarativo, MÍNIMO y LOCALIZADO: solo las dos rutas de esta
// sección; el resto de la aplicación conserva su arquitectura por secciones
// (bloque §16: no hay migración global).
//
//   /proyectos      → Index: catálogo paginado (PRD §20.3).
//   /proyectos/:id  → Show: PÁGINA real de detalle. La edición es un modo
//                     DENTRO del Show, por eso NO existe /proyectos/:id/edit.
//
// El id del Show vive exclusivamente en la URL (useParams): la página funciona
// con un deep-link directo (/proyectos/3) sin pasar antes por /proyectos.

import { Route, Routes } from 'react-router-dom'
import Proyectos from '../vistas/Proyectos.jsx'
import ProyectoDetalle from '../vistas/ProyectoDetalle.jsx'

/** ¿Es esta pathname alguna ruta de la sección Proyectos? */
export function esRutaProyectos(pathname) {
  return pathname === '/proyectos' || pathname.startsWith('/proyectos/')
}

/** Rutas de Proyectos RH con la sesión activa de RH. */
export function RutasProyectos({ token, alSesionExpirada }) {
  return (
    <Routes>
      <Route
        path="/proyectos"
        element={<Proyectos token={token} alSesionExpirada={alSesionExpirada} />}
      />
      <Route
        path="/proyectos/:id"
        element={
          <ProyectoDetalle token={token} alSesionExpirada={alSesionExpirada} />
        }
      />
    </Routes>
  )
}
