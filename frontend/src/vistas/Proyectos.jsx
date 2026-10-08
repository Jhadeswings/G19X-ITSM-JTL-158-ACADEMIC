// Sección RH → Proyectos — INDEX /proyectos (PRD §20.3 y §11.1; ET §6–§8,
// §31; DECISIONES §15; Style Guide §26 «Proyectos RH», §13 estados).
//
// Catálogo compartido: RH CONSULTA el catálogo y navega al detalle, que es
// una PÁGINA real en /proyectos/:id (RH-02.3). NO existe botón «Nuevo
// proyecto» (PRD §20.3/§11.1): la creación pertenece al flujo del Empleado
// («Mis proyectos», con búsqueda obligatoria previa) y esta página no
// duplica nada de ese flujo.
//
// Contrato real del backend (nada se inventa):
// - GET /api/v1/rh/projects → ProyectoPageOut (paginado).
//
// «Consultar» NO abre un detalle debajo de la lista: navega con el router a
// /proyectos/{id}. Al regresar al Index la página vuelve a montarse, así
// que el catálogo siempre refleja el backend.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { POR_PAGINA_DEFECTO_RH, listarProyectosRh } from '../api/proyectos.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import Badge from '../componentes/ui/Badge.jsx'
import { Button } from '../componentes/ui/Button.jsx'
import Pagination from '../componentes/ui/Pagination.jsx'
import {
  MARCA_TITULO,
  consultaInicial,
  crearEsperaMinima,
  etiquetaEstado,
  tonoEstado,
} from './proyectosComun.js'

export default function Proyectos({ token, alSesionExpirada }) {
  const navegar = useNavigate()
  const [pagina, setPagina] = useState(1)
  const [listado, setListado] = useState(consultaInicial)

  // RH-02.3.3: espera mínima cancelable del loading (solo esta sección) y
  // guarda de carrera: solo la ÚLTIMA solicitud iniciada puede actualizar el
  // estado (una respuesta vieja se descarta en silencio).
  const esperaRef = useRef(null)
  if (esperaRef.current === null) esperaRef.current = crearEsperaMinima()
  const espera = esperaRef.current
  const cargaActualRef = useRef(0)
  useEffect(() => () => espera.cancelar(), [espera])

  const cargar = useCallback(() => {
    const inicio = performance.now()
    const solicitud = ++cargaActualRef.current
    setListado(consultaInicial())
    listarProyectosRh(token, { pagina, porPagina: POR_PAGINA_DEFECTO_RH })
      .then(async (datos) => {
        // RH-02.3.3: presencia mínima del loading (los éxitos esperan; los
        // errores no, para no retrasar estados importantes).
        await espera.esperar(inicio)
        if (solicitud !== cargaActualRef.current) return
        setListado({ fase: 'listo', datos, error: null })
      })
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        if (solicitud !== cargaActualRef.current) return
        setListado({ fase: 'error', datos: null, error })
      })
  }, [token, pagina, alSesionExpirada, espera])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Título de la pestaña (RH-02.3 §9): el Index titula la sección; al
  // desmontarse (ir al Show o salir) se restaura el título anterior.
  const tituloAnteriorRef = useRef(document.title)
  useEffect(() => {
    document.title = `Proyectos | ${MARCA_TITULO}`
    return undefined
  }, [])
  useEffect(
    () => () => {
      document.title = tituloAnteriorRef.current
    },
    [],
  )

  /** Consultar = navegar a la PÁGINA de detalle (RH-02.3): nada de estado local. */
  const consultar = useCallback(
    (idProyecto) => {
      navegar(`/proyectos/${idProyecto}`)
    },
    [navegar],
  )

  const { fase, datos } = listado
  const items = fase === 'listo' ? datos?.items || [] : []
  const total = fase === 'listo' ? datos?.total ?? 0 : 0
  const porPagina =
    fase === 'listo'
      ? datos?.por_pagina ?? POR_PAGINA_DEFECTO_RH
      : POR_PAGINA_DEFECTO_RH

  return (
    <div className="proyectos-rh">
      <SectionHeader
        eyebrow="Talento"
        title="Proyectos"
        description="Catálogo compartido de proyectos. Consulta y administra los proyectos existentes; los proyectos nuevos se registran desde «Mis proyectos» del empleado."
      />

      {/* --- Catálogo paginado (§20.3) ---------------------------------- */}
      <section
        className="proyectos-rh__catalogo"
        aria-labelledby="proyectos-rh-catalogo-titulo"
      >
        <h2 id="proyectos-rh-catalogo-titulo">Catálogo de proyectos</h2>

        {fase === 'cargando' && <EstadoCarga texto="Cargando proyectos…" />}

        {fase === 'error' && (
          <EstadoError
            titulo="No pudimos cargar los proyectos"
            mensaje="Ocurrió un problema al obtener el catálogo de proyectos."
            onReintentar={cargar}
          />
        )}

        {fase === 'listo' && total === 0 && (
          <EstadoVacio
            titulo="Todavía no hay proyectos en el catálogo."
            descripcion="Los proyectos se registran desde «Mis proyectos» del empleado, con una búsqueda previa para evitar duplicados."
          />
        )}

        {fase === 'listo' && total > 0 && (
          <>
            <ul className="proyectos-rh__lista">
              {items.map((proyecto) => (
                // Tres columnas estables: datos (flexible) | estado | acción.
                <li key={proyecto.id} className="proyectos-rh__item">
                  <div className="proyectos-rh__datos">
                    <p className="proyectos-rh__nombre">{proyecto.nombre}</p>
                    <p className="proyectos-rh__meta">
                      {[proyecto.area, proyecto.cliente].filter(Boolean).join(' · ') ||
                        'Sin área ni cliente registrados'}
                    </p>
                  </div>
                  <div className="proyectos-rh__estado">
                    <Badge tone={tonoEstado(proyecto.estado)}>
                      {etiquetaEstado(proyecto.estado)}
                    </Badge>
                  </div>
                  <div className="proyectos-rh__accion">
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => consultar(proyecto.id)}
                    >
                      Consultar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <Pagination
              pagina={datos?.pagina ?? pagina}
              porPagina={porPagina}
              total={total}
              onCambiarPagina={setPagina}
              etiqueta="proyectos"
            />
          </>
        )}

        {/* Ayuda contextual discreta (Style Guide §13): una línea, sin banner. */}
        {fase === 'listo' && (
          <p className="proyectos-rh__ayuda">
            Selecciona un proyecto para consultar su detalle.
          </p>
        )}
      </section>
    </div>
  )
}
