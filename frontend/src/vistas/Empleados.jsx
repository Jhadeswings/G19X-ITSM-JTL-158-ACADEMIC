// Sección RH → Empleados (PRD §20.1; Style Guide §14.1, §14.2, §14.4, §26;
// Especificación Técnica §31, §40).
//
// La sección tiene DOS subvistas internas —LISTADO y ALTA— y UNA sola entrada
// en la navegación lateral: el Style Guide §10 fija ocho secciones de RH y
// esta es la de Empleados. El alta no abre modal (§21: nada de modales para
// tareas simples realizables en página).
//
// Contrato: se usa EXCLUSIVAMENTE GET /api/v1/rh/employees con los parámetros
// que el backend ya acepta (pagina, por_pagina, activo, area). NO hay filtrado
// por nombre/puesto ni por competencia/nivel: el contrato no los expone y esas
// reglas son del backend (ET §42). El campo Área es coincidencia EXACTA
// normalizada, y se presenta como tal, no como búsqueda general.
//
// El total y el rango de la paginación salen de `total`/`por_pagina` del
// backend, nunca de `items.length`.
//
// Autorización: el frontend no decide permisos; el backend aplica `require_rh`
// en cada petición y un 401 cierra la sesión (ET §31/§32, patrón de InicioRH).

import { useCallback, useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { listarEmpleados, POR_PAGINA_DEFECTO } from '../api/empleados.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import Badge from '../componentes/ui/Badge.jsx'
import { Button } from '../componentes/ui/Button.jsx'
import Pagination from '../componentes/ui/Pagination.jsx'
import Table from '../componentes/ui/Table.jsx'
import AltaEmpleado from './AltaEmpleado.jsx'

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
  const [pagina, setPagina] = useState(1)
  const [estado, setEstado] = useState('todos')
  const [area, setArea] = useState('')
  const [consulta, setConsulta] = useState(consultaInicial)

  const filtroEstado = OPCIONES_ESTADO.find((opcion) => opcion.id === estado)

  const cargar = useCallback(() => {
    setConsulta(consultaInicial())
    listarEmpleados(token, {
      pagina,
      porPagina: POR_PAGINA_DEFECTO,
      activo: filtroEstado?.activo,
      area,
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
  }, [token, pagina, filtroEstado, area, alSesionExpirada])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Al volver del alta el listado se recarga para que el empleado recién
  // creado sea visible sin que RH tenga que cambiar de sección.
  function abrirAlta() {
    setVista('alta')
  }

  function volverAlListado() {
    setVista('listado')
    setPagina(1)
    cargar()
  }

  function cambiarEstado(nuevoEstado) {
    setEstado(nuevoEstado)
    setPagina(1)
  }

  function limpiarFiltros() {
    setEstado('todos')
    setArea('')
    setPagina(1)
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
  const hayFiltros = estado !== 'todos' || area.trim().length > 0

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

      {/* Filtros: solo los que el backend soporta (Style Guide §14.4). */}
      <section className="empleados-filtros" aria-label="Filtros de empleados">
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
      </section>

      {hayFiltros && (
        <p className="empleados-filtros__activos">
          Filtros activos:{' '}
          {estado !== 'todos' && <span>{filtroEstado?.label}</span>}
          {area.trim().length > 0 && <span>Área: {area.trim()}</span>}
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
                  {empleado.nombre}
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
