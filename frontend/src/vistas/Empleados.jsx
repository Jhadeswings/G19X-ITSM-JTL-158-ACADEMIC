// Sección RH → Empleados (PRD §20.1; Style Guide §14.1, §14.2, §14.4, §26;
// Especificación Técnica §31, §40).
//
// La sección tiene TRES subvistas internas —LISTADO, ALTA y PERFIL— y UNA sola entrada
// en la navegación lateral: el Style Guide §10 fija ocho secciones de RH y
// esta es la de Empleados. El alta no abre modal (§21: nada de modales para
// tareas simples realizables en página). El perfil se abre desde una fila del
// listado con el `empleado.id` directo y muestra solo la información básica
// del EmpleadoOut (GET /api/v1/rh/employees/{id}).
//
// Contrato: se usa EXCLUSIVAMENTE GET /api/v1/rh/employees con los parámetros
// que el backend acepta (pagina, por_pagina, activo, area y q). La BÚSQUEDA
// por nombre/puesto (q, PRD §20.1) la ejecuta el backend: aquí no se filtra
// nada en el cliente. El filtro de Área sigue siendo coincidencia EXACTA
// normalizada, y se presenta como tal, no como búsqueda general; la búsqueda
// (q) es parcial y vive separada del filtro. NO hay filtros por competencia
// ni nivel: el contrato no los expone (ET §42).
//
// El total y el rango de la paginación salen de `total`/`por_pagina` del
// backend, nunca de `items.length`.
//
// Autorización: el frontend no decide permisos; el backend aplica `require_rh`
// en cada petición y un 401 cierra la sesión (ET §31/§32, patrón de InicioRH).

import { useCallback, useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { listarEmpleados, POR_PAGINA_DEFECTO } from '../api/empleados.js'
import { NOMBRES_COMPETENCIAS } from '../textos.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import Badge from '../componentes/ui/Badge.jsx'
import { Button } from '../componentes/ui/Button.jsx'
import Pagination from '../componentes/ui/Pagination.jsx'
import Table from '../componentes/ui/Table.jsx'
import AltaEmpleado from './AltaEmpleado.jsx'
import PerfilEmpleado from './PerfilEmpleado.jsx'

// Columnas EXACTAS del PRD §20.1. Las competencias quedan fuera de la tabla
// principal (Style Guide §26) y el correo no es columna principal.
const COLUMNAS = [
  { key: 'empleado', label: 'Empleado' },
  { key: 'puesto', label: 'Puesto' },
  { key: 'area', label: 'Área' },
  { key: 'estado', label: 'Estado' },
]

// Filtro de estado: el backend acepta `activo` booleano o su ausencia.
const OPCIONES_ESTADO = [
  { id: 'todos', label: 'Todos', activo: undefined },
  { id: 'activos', label: 'Activos', activo: true },
  { id: 'inactivos', label: 'Inactivos', activo: false },
]

// Catálogo OFICIAL de competencias (PRD §16): el mismo diccionario que usa
// el resto de la app. Solo presentación: el backend valida el código.
const OPCIONES_COMPETENCIA = Object.entries(NOMBRES_COMPETENCIAS).map(
  ([id, label]) => ({ id, label }),
)

// Criterio de resultado (DECISIONES §54): sin filtro, nivel mínimo o DI.
// Nivel mínimo y DI son EXCLUYENTES: elegir uno restablece al otro.
const OPCIONES_CRITERIO = [
  { id: 'ninguno', label: 'Sin filtro de resultado' },
  { id: 'nivel', label: 'Nivel mínimo' },
  { id: 'di', label: 'Datos insuficientes (DI)' },
]

// Niveles oficiales 1–5 (PRD §5). Solo números: las etiquetas de nivel
// pertenecen a los resultados del backend y aquí no se duplican.
const NIVELES = [1, 2, 3, 4, 5]

/** Texto neutro para datos ausentes: nunca un hueco ni un error. */
const SIN_DATO = '—'

function etiquetaEstado(activo) {
  return activo ? 'Activo' : 'Inactivo'
}

/** Estado inicial de la consulta: la misma forma que usa InicioRH. */
function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

export default function Empleados({ token, alSesionExpirada }) {
  const [vista, setVista] = useState('listado')
  const [empleadoId, setEmpleadoId] = useState(null)
  const [pagina, setPagina] = useState(1)
  const [estado, setEstado] = useState('todos')
  const [area, setArea] = useState('')
  const [busqueda, setBusqueda] = useState('')
  // Filtros por competencia y nivel (DECISIONES §54): la competencia SOLA no
  // filtra; el criterio (nivel mínimo inclusivo o DI) depende de ella.
  const [competencia, setCompetencia] = useState('')
  const [criterio, setCriterio] = useState('ninguno')
  const [nivelMin, setNivelMin] = useState('1')
  const [consulta, setConsulta] = useState(consultaInicial)

  const filtroEstado = OPCIONES_ESTADO.find((opcion) => opcion.id === estado)

  const cargar = useCallback(() => {
    setConsulta(consultaInicial())
    listarEmpleados(token, {
      pagina,
      porPagina: POR_PAGINA_DEFECTO,
      activo: filtroEstado?.activo,
      area,
      q: busqueda,
      // §54: solo viaja un criterio de resultado ACTIVO (competencia +
      // nivel_min, o competencia + solo_di). La competencia sin criterio no
      // filtra y no se envía; nada se calcula ni se filtra en React.
      competencia:
        competencia && criterio !== 'ninguno' ? competencia : undefined,
      nivelMin: competencia && criterio === 'nivel' ? Number(nivelMin) : undefined,
      soloDi: competencia && criterio === 'di' ? true : undefined,
    })
      .then((datos) => setConsulta({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        // 401: el backend ya decidió que la sesión no sirve (ET §32).
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        // Cualquier otro fallo es un estado de error explícito con reintento:
        // NUNCA se convierte en cero registros (§13.6).
        setConsulta({ fase: 'error', datos: null, error })
      })
  }, [
    token,
    pagina,
    filtroEstado,
    area,
    busqueda,
    competencia,
    criterio,
    nivelMin,
    alSesionExpirada,
  ])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Al volver del alta el listado se recarga para que el empleado recién
  // creado sea visible sin que RH tenga que cambiar de sección.
  function abrirAlta() {
    setVista('alta')
  }

  // El perfil se abre con el `empleado.id` directo de la fila: la consulta
  // del detalle vive en PerfilEmpleado (una sola petición por apertura).
  function abrirPerfil(id) {
    setEmpleadoId(id)
    setVista('perfil')
  }

  function volverAlListado() {
    setVista('listado')
    setPagina(1)
    cargar()
  }

  // Volver desde el perfil conserva el listado ya cargado: no se recarga ni
  // se reconstruye la sección, solo se cambia la subvista interna.
  function volverDesdePerfil() {
    setVista('listado')
    setEmpleadoId(null)
  }

  function cambiarEstado(nuevoEstado) {
    setEstado(nuevoEstado)
    setPagina(1)
  }

  // §54: al limpiar o cambiar la competencia, el criterio y su nivel
  // dependiente se restablecen: nunca queda un filtro huérfano de una
  // competencia que ya no es la seleccionada.
  function cambiarCompetencia(nuevaCompetencia) {
    setCompetencia(nuevaCompetencia)
    // §54, regla 5: CAMBIAR (no solo limpiar) la competencia restablece el
    // criterio dependiente y su nivel, para que nunca quede un nivel o un DI
    // huérfanos de la competencia anterior. Hasta que RH vuelva a elegir un
    // criterio no se envía ningún filtro de competencia a la API.
    setCriterio('ninguno')
    setNivelMin('1')
    setPagina(1)
  }

  function cambiarCriterio(nuevoCriterio) {
    setCriterio(nuevoCriterio)
    // Exclusión mutua (§54): al salir de «Nivel mínimo» el nivel vuelve a su
    // valor inicial; con DI ningún nivel se muestra ni se envía.
    if (nuevoCriterio !== 'nivel') {
      setNivelMin('1')
    }
    setPagina(1)
  }

  function cambiarNivel(nuevoNivel) {
    setNivelMin(nuevoNivel)
    setPagina(1)
  }

  function limpiarFiltros() {
    setEstado('todos')
    setArea('')
    setBusqueda('')
    setCompetencia('')
    setCriterio('ninguno')
    setNivelMin('1')
    setPagina(1)
  }


  if (vista === 'perfil' && empleadoId !== null && empleadoId !== undefined) {
    return (
      <div className="empleados">
        <PerfilEmpleado
          token={token}
          empleadoId={empleadoId}
          alVolver={volverDesdePerfil}
          alSesionExpirada={alSesionExpirada}
        />
      </div>
    )
  }

  if (vista === 'alta') {
    return (
      <div className="empleados">
        <div className="empleados__volver">
          <Button variant="ghost" onClick={volverAlListado}>
            Volver al listado
          </Button>
        </div>
        <AltaEmpleado token={token} alSesionExpirada={alSesionExpirada} />
      </div>
    )
  }

  const { fase, datos } = consulta
  const items = fase === 'listo' ? datos?.items || [] : []
  const total = fase === 'listo' ? datos?.total ?? 0 : 0
  const porPagina = fase === 'listo' ? datos?.por_pagina ?? POR_PAGINA_DEFECTO : POR_PAGINA_DEFECTO
  const competenciaSeleccionada = OPCIONES_COMPETENCIA.find(
    (opcion) => opcion.id === competencia,
  )
  const hayFiltros =
    estado !== 'todos' ||
    area.trim().length > 0 ||
    busqueda.trim().length > 0 ||
    Boolean(competencia && criterio !== 'ninguno')

  // Ayuda del criterio (D2; DECISIONES §54, regla 1): con una competencia
  // elegida y SIN criterio, la lista no se filtra. La ayuda solo se renderiza
  // —y solo se referencia con aria-describedby— cuando está visible.
  const ayudaCriterioVisible = Boolean(competencia) && criterio === 'ninguno'

  return (
    <div className="empleados">
      <SectionHeader
        eyebrow="Gestión de personas"
        title="Empleados"
        description="Catálogo de personas registradas. Consulta su situación actual y registra nuevas altas."
        actions={
          <Button onClick={abrirAlta}>
            <UserPlus aria-hidden="true" /> Registrar empleado
          </Button>
        }
      />

      {/* Filtros y búsqueda: solo los que el backend soporta (Style Guide §14.4).
          La búsqueda (q) es parcial por nombre/puesto y la resuelve el
          backend; el Área sigue siendo coincidencia EXACTA (PRD §20.1). */}
      <section className="empleados-filtros" aria-label="Filtros de empleados">
        {/* Grupo estructural 1 — filtros generales (SG §26). «Limpiar filtros»
            cierra este grupo porque limpia TODOS los filtros, también los de
            competencia y resultado. */}
        <div className="empleados-filtros__catalogo">
          <div className="empleados-filtros__busqueda">
            <label className="form-field__label" htmlFor="empleados-busqueda">
              Búsqueda
            </label>
            <input
              id="empleados-busqueda"
              className="ui-input"
              type="search"
              value={busqueda}
              placeholder="Nombre o puesto"
              onChange={(evento) => {
                setBusqueda(evento.target.value)
                setPagina(1)
              }}
            />
          </div>
          <div className="empleados-filtros__grupo" role="group" aria-label="Filtrar por estado">
            {OPCIONES_ESTADO.map((opcion) => (
              <Button
                key={opcion.id}
                size="small"
                variant={estado === opcion.id ? 'primary' : 'secondary'}
                aria-pressed={estado === opcion.id}
                onClick={() => cambiarEstado(opcion.id)}
              >
                {opcion.label}
              </Button>
            ))}
          </div>

          {/* Área: coincidencia EXACTA normalizada en backend, no búsqueda. */}
          <div className="empleados-filtros__area">
            <label className="form-field__label" htmlFor="empleados-filtro-area">
              Área
            </label>
            <input
              id="empleados-filtro-area"
              className="ui-input"
              type="text"
              value={area}
              placeholder="Área exacta"
              onChange={(evento) => {
                setArea(evento.target.value)
                setPagina(1)
              }}
            />
          </div>

          {hayFiltros && (
            <Button variant="ghost" size="small" onClick={limpiarFiltros}>
              Limpiar filtros
            </Button>
          )}
        </div>

        {/* Grupo estructural 2 — filtros de competencia y resultado (DECISIONES
            §54; PRD §20.1). La competencia SOLA no filtra: el criterio (nivel
            mínimo inclusivo o DI) es quien activa el filtro, y ambos dependen
            de ella. Las competencias siguen FUERA de la tabla (SG §26). */}
        <div
          className="empleados-filtros__resultado"
          role="group"
          aria-label="Filtros de competencia y resultado"
        >
          <div className="empleados-filtros__competencia">
            <label
              className="form-field__label"
              htmlFor="empleados-filtro-competencia"
            >
              Competencia
            </label>
            <select
              id="empleados-filtro-competencia"
              className="ui-input"
              value={competencia}
              onChange={(evento) => cambiarCompetencia(evento.target.value)}
            >
              <option value="">Sin competencia seleccionada</option>
              {OPCIONES_COMPETENCIA.map((opcion) => (
                <option key={opcion.id} value={opcion.id}>
                  {opcion.label}
                </option>
              ))}
            </select>
          </div>

          <div className="empleados-filtros__criterio">
            <label
              className="form-field__label"
              htmlFor="empleados-filtro-criterio"
            >
              Resultado
            </label>
            <select
              id="empleados-filtro-criterio"
              className="ui-input"
              value={criterio}
              disabled={!competencia}
              aria-describedby={
                ayudaCriterioVisible ? 'empleados-filtro-criterio-ayuda' : undefined
              }
              onChange={(evento) => cambiarCriterio(evento.target.value)}
            >
              {OPCIONES_CRITERIO.map((opcion) => (
                <option key={opcion.id} value={opcion.id}>
                  {opcion.label}
                </option>
              ))}
            </select>
            {/* Ayuda D2 (SG §26; DECISIONES §54, regla 1): la competencia sola
                no filtra. Texto explicativo que NO cambia el comportamiento ni
                el payload. Solo se renderiza —y solo se referencia con
                aria-describedby— cuando existe. */}
            {ayudaCriterioVisible && (
              <p
                className="form-field__hint"
                id="empleados-filtro-criterio-ayuda"
              >
                Seleccionar solo una competencia no filtra la lista. Elige un criterio: Nivel mínimo o Datos insuficientes.
              </p>
            )}
          </div>

          {competencia && criterio === 'nivel' && (
            <div className="empleados-filtros__nivel">
              <label
                className="form-field__label"
                htmlFor="empleados-filtro-nivel"
              >
                Nivel mínimo
              </label>
              <select
                id="empleados-filtro-nivel"
                className="ui-input"
                value={nivelMin}
                aria-describedby="empleados-filtro-nivel-ayuda"
                onChange={(evento) => cambiarNivel(evento.target.value)}
              >
                {NIVELES.map((nivel) => (
                  <option key={nivel} value={String(nivel)}>
                    {nivel}
                  </option>
                ))}
              </select>
              <p
                className="form-field__hint"
                id="empleados-filtro-nivel-ayuda"
              >
                El mínimo es inclusivo: 3 incluye los niveles 3, 4 y 5.
              </p>
            </div>
          )}
        </div>
      </section>

      {hayFiltros && (
        <p className="empleados-filtros__activos">
          Filtros activos:{' '}
          {busqueda.trim().length > 0 && <span>Búsqueda: {busqueda.trim()}</span>}
          {estado !== 'todos' && <span>{filtroEstado?.label}</span>}
          {area.trim().length > 0 && <span>Área: {area.trim()}</span>}
          {competencia && criterio === 'nivel' && competenciaSeleccionada && (
            <span>
              {competenciaSeleccionada.label}: nivel mínimo {nivelMin}
            </span>
          )}
          {competencia && criterio === 'di' && competenciaSeleccionada && (
            <span>{competenciaSeleccionada.label}: datos insuficientes</span>
          )}
        </p>
      )}

      {fase === 'cargando' && <EstadoCarga texto="Cargando empleados…" />}

      {fase === 'error' && (
        <EstadoError
          titulo="No pudimos cargar los empleados"
          mensaje="Ocurrió un problema al obtener el catálogo de empleados."
          onReintentar={cargar}
        />
      )}

      {fase === 'listo' && items.length === 0 && (
        <EstadoVacio
          titulo={
            hayFiltros
              ? 'No hay empleados que coincidan con estos filtros.'
              : 'Todavía no hay empleados registrados.'
          }
          descripcion={
            hayFiltros
              ? 'Puedes ajustar los filtros o limpiarlos para ver todo el catálogo.'
              : 'Registra a la primera persona para que su cuenta de acceso quede preparada.'
          }
        />
      )}

      {fase === 'listo' && items.length > 0 && (
        <>
          <Table columns={COLUMNAS} caption="Listado de empleados">
            {items.map((empleado) => (
              <tr key={empleado.id}>
                <th scope="row" className="tabla__th tabla__th--fila" data-label="Empleado">
                  <Button variant="ghost" size="small" onClick={() => abrirPerfil(empleado.id)}>
                    {empleado.nombre}
                  </Button>
                </th>
                <td data-label="Puesto">{empleado.puesto || SIN_DATO}</td>
                <td data-label="Área">{empleado.area || SIN_DATO}</td>
                <td data-label="Estado">
                  <Badge tone={empleado.activo ? 'success' : 'neutral'}>
                    {etiquetaEstado(empleado.activo)}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>

          <Pagination
            pagina={datos?.pagina ?? pagina}
            porPagina={porPagina}
            total={total}
            onCambiarPagina={setPagina}
            etiqueta="empleados"
          />
        </>
      )}
    </div>
  )
}
