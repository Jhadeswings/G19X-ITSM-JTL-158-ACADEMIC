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
//
// Presentación del AUTOR y del MOTIVO por tipo de operación (§25):
// - `MODIFICACION_EMPLEADO` → autor «Tú»: se decide con la operación Y la
//   identidad de la cuenta autenticada (`GET /me` vía `obtenerCuenta`, el
//   mismo contrato que usa Mi cuenta), comparando `cuenta_id` —el email solo
//   como respaldo—; nunca comparando a ciegas cadenas de correo. Si la
//   identidad no se pudo corroborar, se muestra el correo real del actor:
//   no se afirma «Tú» sin evidencia.
// - `CORRECCION` → el correo del responsable que registró RH; si el registro
//   no trae correo, «No disponible» (indicador neutro, sin inventar nombres).
// - Operación desconocida → «No disponible» en el autor.
// - El motivo NO existe para la operación del Empleado → siempre «—»; el de
//   RH se conserva tal cual se registró y, si falta, «—». Nada se inventa.

import { useCallback, useEffect, useState } from 'react'
import { obtenerCuenta } from '../api/cuenta.js'
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

/** Autor sin identidad que mostrar: indicador neutro, nunca un nombre inventado. */
const NO_DISPONIBLE = 'No disponible'

/** Autor de la modificación realizada por la propia persona autenticada. */
const TEXTO_AUTOR_PROPIO = 'Tú'

// Operaciones del contrato (§25). Fuera de estas dos, la operación se
// considera desconocida y su autor no se clasifica.
const CORRECCION = 'CORRECCION'
const MODIFICACION_EMPLEADO = 'MODIFICACION_EMPLEADO'

/**
 * Etiqueta «Tipo» del evento, en primera persona para el Empleado (§25):
 * «Corrección de RH» la distingue de «Mi modificación» (su propio cambio).
 * Una operación desconocida se muestra tal cual: nunca se inventa una etiqueta.
 */
const ETIQUETA_TIPO = {
  [CORRECCION]: 'Corrección de RH',
  [MODIFICACION_EMPLEADO]: 'Mi modificación',
}

function etiquetaTipo(operacion) {
  return ETIQUETA_TIPO[operacion] || operacion
}

/**
 * ¿El evento lo realizó la cuenta autenticada? Se decide con la operación
 * (solo `MODIFICACION_EMPLEADO` es, por contrato §25, cambio propio) Y la
 * identidad que el backend devuelve en `GET /me`: coincide por `cuenta_id`
 * (identificador de la cuenta autenticada) y usa el email solo como respaldo
 * cuando aquel no viene. NO es una comparación ciega de cadenas de correo: si
 * la identidad no está disponible, nunca se afirma que el actor es uno mismo.
 */
function esAutorPropio(registro, identidad) {
  if (registro.operacion !== MODIFICACION_EMPLEADO || !identidad) return false
  if (identidad.cuenta_id != null) {
    return registro.actor_cuenta_id === identidad.cuenta_id
  }
  return Boolean(identidad.email) && registro.actor_email === identidad.email
}

/**
 * Autor presentable por tipo de operación (§25): «Tú» para la modificación
 * propia corroborada con la identidad autenticada; el correo real del
 * responsable para las operaciones reconocidas; «No disponible» cuando no hay
 * identidad que mostrar o la operación es desconocida. Nunca se inventan
 * nombres ni cuentas técnicas.
 */
function textoAutor(registro, identidad) {
  if (esAutorPropio(registro, identidad)) return TEXTO_AUTOR_PROPIO
  if (registro.operacion === CORRECCION || registro.operacion === MODIFICACION_EMPLEADO) {
    return registro.actor_email || NO_DISPONIBLE
  }
  return NO_DISPONIBLE
}

/**
 * Motivo presentable por tipo de operación (§25): la operación del Empleado
 * NO solicita motivo por contrato, así que siempre es «—» (aunque el registro
 * trajera algo); la corrección de RH conserva su motivo registrado y, si no
 * lo hay, «—». Nunca se inventa un motivo.
 */
function textoMotivo(registro) {
  if (registro.operacion === MODIFICACION_EMPLEADO) return SIN_DATO
  return registro.motivo || SIN_DATO
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
  // Identidad propia (GET /me) para el autor «Tú»; independiente del listado.
  const [identidad, setIdentidad] = useState(null)

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

  // Identidad propia (GET /me) SOLO para presentar el autor «Tú»: es una
  // consulta de solo lectura más, independiente del listado. Un fallo
  // distinto de 401 no rompe el apartado: la tabla sigue mostrando el correo
  // real del actor (§13.6) y no se afirma «Tú» sin corroborar la identidad.
  useEffect(() => {
    let cancelado = false
    obtenerCuenta(token)
      .then((datos) => {
        if (!cancelado) setIdentidad(datos ?? null)
      })
      .catch((error) => {
        if (cancelado) return
        if (error?.estado === 401) {
          alSesionExpirada?.()
        }
      })
    return () => {
      cancelado = true
    }
  }, [token, alSesionExpirada])

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
                  <td data-label="Motivo">{textoMotivo(registro)}</td>
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
                    {textoAutor(registro, identidad)}
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
