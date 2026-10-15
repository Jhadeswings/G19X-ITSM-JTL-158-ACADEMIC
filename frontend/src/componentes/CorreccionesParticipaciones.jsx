// Apartado interno de «Mi historial» (Empleado): Historial de mis
// participaciones. Equivalente, para el Empleado, de la vista de Auditoría de
// RH (PRD §22; ET §25/§32; Style Guide §13 estados, §14.1 tabla, §14.2
// paginación).
//
// SOLO LECTURA: consulta GET /api/v1/me/audits, que el backend ya filtra por
// las participaciones del empleado autenticado. Aquí NO se crea, edita ni
// borra nada, y esta consulta tampoco genera auditoría. El orden y la
// paginación los decide el backend; no se reordena ni se filtra en el cliente.
// Un 401 delega en `alSesionExpirada`.
//
// Muestra DOS tipos de evento sobre mis participaciones (§25): las correcciones
// administrativas de RH (`CORRECCION`) y mis propias modificaciones
// (`MODIFICACION_EMPLEADO`), diferenciadas por la etiqueta «Tipo».

import { useCallback, useEffect, useState } from 'react'
import { POR_PAGINA_DEFECTO, listarMisAuditorias } from '../api/misAuditorias.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import Pagination from '../componentes/ui/Pagination.jsx'
import Table from '../componentes/ui/Table.jsx'

/** Columnas de la tabla (Style Guide §14.1: encabezado claro, sin cálculos). */
const COLUMNAS = [
  { key: 'fecha', label: 'Fecha' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'proyecto', label: 'Proyecto' },
  { key: 'registro', label: 'Registro' },
  { key: 'motivo', label: 'Motivo' },
  { key: 'valores', label: 'Valores' },
  { key: 'autor', label: 'Autor' },
]

const SIN_DATO = '—'

/**
 * Etiqueta «Tipo» del evento, en primera persona para el Empleado (§25):
 * «Corrección de RH» la distingue de «Mi modificación» (su propio cambio).
 * Una operación desconocida se muestra tal cual: nunca se inventa una etiqueta.
 */
const ETIQUETA_TIPO = {
  CORRECCION: 'Corrección de RH',
  MODIFICACION_EMPLEADO: 'Mi modificación',
}

function etiquetaTipo(operacion) {
  return ETIQUETA_TIPO[operacion] || operacion
}

/** Estado inicial de la consulta (patrón de las demás vistas del Empleado). */
function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

/** Fecha/hora tal como llega del backend, sin recalcular la zona. */
function formatearFecha(iso) {
  if (!iso) return SIN_DATO
  return String(iso).replace('T', ' ').slice(0, 16)
}

/**
 * Resumen legible de un par de valores JSONB: `campo: anterior → nuevo`.
 * Sin comparaciones ni inferencias: se listan las claves tal cual llegan.
 */
function resumirValores(anteriores, nuevos) {
  const claves = [
    ...new Set([...Object.keys(anteriores ?? {}), ...Object.keys(nuevos ?? {})]),
  ]
  if (claves.length === 0) return null
  return claves.map((clave) => ({
    clave,
    anterior: anteriores?.[clave],
    nuevo: nuevos?.[clave],
  }))
}

/** Valor escalar a texto presentable; los complejos se muestran tal cual. */
function textoValor(valor) {
  if (valor === null || valor === undefined) return SIN_DATO
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (typeof valor === 'object') return JSON.stringify(valor)
  return String(valor)
}

export default function CorreccionesParticipaciones({ token, alSesionExpirada }) {
  const [pagina, setPagina] = useState(1)
  const [consulta, setConsulta] = useState(consultaInicial)

  const cargar = useCallback(() => {
    setConsulta(consultaInicial())
    listarMisAuditorias(token, { pagina, porPagina: POR_PAGINA_DEFECTO })
      .then((datos) => setConsulta({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setConsulta({ fase: 'error', datos: null, error })
      })
  }, [token, pagina, alSesionExpirada])

  useEffect(() => {
    cargar()
  }, [cargar])

  const { fase, datos } = consulta
  const items = fase === 'listo' ? datos?.items || [] : []
  const total = fase === 'listo' ? datos?.total ?? 0 : 0
  const porPagina =
    fase === 'listo' ? datos?.por_pagina ?? POR_PAGINA_DEFECTO : POR_PAGINA_DEFECTO

  return (
    <section className="historial-correcciones">
      <p className="historial-correcciones__aviso">
        Aquí ves las correcciones administrativas que RH realizó sobre tus
        participaciones y las modificaciones que tú mismo hiciste. No se muestran
        necesariamente todos los detalles: cada evento indica su autor, fecha,
        valores y el tipo de cambio.
      </p>

      {fase === 'cargando' && <EstadoCarga texto="Cargando tus correcciones…" />}

      {fase === 'error' && (
        <EstadoError
          titulo="No pudimos cargar tus correcciones"
          mensaje="Ocurrió un problema al obtener el historial de correcciones."
          onReintentar={cargar}
        />
      )}

      {fase === 'listo' && total === 0 && (
        <EstadoVacio
          titulo="Todavía no hay correcciones sobre tus participaciones."
          descripcion="Cuando RH corrija una participación tuya, o cuando tú mismo modifiques una, el cambio aparecerá aquí con su tipo, autor, fecha y valores."
        />
      )}

      {fase === 'listo' && total > 0 && (
        <>
          <Table
            columns={COLUMNAS}
            caption="Correcciones administrativas sobre mis participaciones"
          >
            {items.map((registro) => {
              const valores = resumirValores(
                registro.valores_anteriores,
                registro.valores_nuevos,
              )
              return (
                <tr key={registro.id}>
                  <td data-label="Fecha">{formatearFecha(registro.fecha)}</td>
                  <td data-label="Tipo">
                    {etiquetaTipo(registro.operacion)}
                  </td>
                  <td data-label="Proyecto">
                    {registro.proyecto_nombre || SIN_DATO}
                  </td>
                  <td data-label="Registro">
                    {registro.entidad} #{registro.entidad_id}
                  </td>
                  <td data-label="Motivo">{registro.motivo || SIN_DATO}</td>
                  <td data-label="Valores">
                    {valores === null ? (
                      SIN_DATO
                    ) : (
                      <ul className="auditoria-rh__valores">
                        {valores.map((par) => (
                          <li key={par.clave}>
                            <span className="auditoria-rh__campo">
                              {par.clave}:
                            </span>{' '}
                            {textoValor(par.anterior)} → {textoValor(par.nuevo)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td data-label="Autor">
                    {registro.actor_email || `Cuenta #${registro.actor_cuenta_id}`}
                  </td>
                </tr>
              )
            })}
          </Table>

          <Pagination
            pagina={datos?.pagina ?? pagina}
            porPagina={porPagina}
            total={total}
            onCambiarPagina={setPagina}
            etiqueta="correcciones"
          />
        </>
      )}
    </section>
  )
}
