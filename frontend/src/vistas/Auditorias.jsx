// Sección RH → Auditoría (Tarea C; PRD §22 «Privacidad, seguridad y
// auditoría»; Especificación Técnica §25; Style Guide §13 estados, §14.1
// tabla, §14.2 paginación, §24 densidad RH).
//
// Pantalla de SOLO LECTURA: consulta los registros YA existentes en
// AuditoriaModificacion con GET /api/v1/rh/audits. Aquí NO se crea, NO se
// edita y NO se borra ningún registro, y esta consulta tampoco genera
// auditoría: la pantalla solo presenta lo que las correcciones RH (§9.1) y
// las modificaciones del Empleado ya persistieron en su misma transacción.
//
// Contrato real del backend (nada se inventa):
// - AuditoriaPageOut { total, pagina, por_pagina, items[] }.
// - Cada item es AuditoriaOut: id, actor_cuenta_id, entidad, entidad_id,
//   operacion, valores_anteriores/nuevos (JSONB nullable), motivo
//   (nullable) y fecha, más actor_email como identificación de
//   presentación del actor (PRD §22 «quién modificó») y empleado_nombre /
//   proyecto_nombre como identificación del registro auditado (solo
//   participaciones; None = «No disponible», nunca se inventan).
//
// El orden (fecha DESC, id DESC) y la paginación los decide el backend:
// aquí no se reordena ni se filtra en el cliente. Un 401 delega en
// `alSesionExpirada` (patrón de todas las vistas RH).

import { useCallback, useEffect, useRef, useState } from 'react'
import { POR_PAGINA_DEFECTO, listarAuditorias } from '../api/auditorias.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import Badge from '../componentes/ui/Badge.jsx'
import Pagination from '../componentes/ui/Pagination.jsx'
import Table from '../componentes/ui/Table.jsx'

/** Columnas de la tabla (Style Guide §14.1: encabezado claro, sin cálculos). */
const COLUMNAS = [
  { key: 'fecha', label: 'Fecha' },
  { key: 'quien', label: 'Quién modificó' },
  { key: 'operacion', label: 'Operación' },
  { key: 'registro', label: 'Registro' },
  { key: 'empleado', label: 'Empleado' },
  { key: 'proyecto', label: 'Proyecto' },
  { key: 'motivo', label: 'Motivo' },
  { key: 'valores', label: 'Valores' },
]

const SIN_DATO = '—'

/** Sin relación o dato ausente: nunca se inventa un nombre. */
const NO_DISPONIBLE = 'No disponible'

/**
 * Etiqueta legible por operación (§25). El backend diferencia la corrección
 * administrativa de RH (`CORRECCION`) de la modificación del propio empleado
 * (`MODIFICACION_EMPLEADO`). Una operación desconocida se muestra tal cual:
 * aquí no se inventan etiquetas.
 */
const ETIQUETA_OPERACION = {
  CORRECCION: 'Corrección de RH',
  MODIFICACION_EMPLEADO: 'Modificación del empleado',
}

function etiquetaOperacion(operacion) {
  return ETIQUETA_OPERACION[operacion] || operacion
}

/** Estado inicial de la consulta (patrón de las demás vistas RH). */
function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

/**
 * Fecha/hora tal como llega del backend, sin recalcular la zona: solo se
 * presenta el instante ya serializado por el servidor.
 */
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

export default function Auditorias({ token, alSesionExpirada }) {
  const [pagina, setPagina] = useState(1)
  const [listado, setListado] = useState(consultaInicial)

  // Guarda de carrera: solo la ÚLTIMA solicitud iniciada puede actualizar el
  // estado (una respuesta vieja se descarta en silencio).
  const cargaActualRef = useRef(0)

  const cargar = useCallback(() => {
    const solicitud = ++cargaActualRef.current
    setListado((actual) => ({
      fase: 'cargando',
      datos: actual.datos,
      error: null,
    }))
    listarAuditorias(token, { pagina, porPagina: POR_PAGINA_DEFECTO })
      .then((datos) => {
        if (solicitud !== cargaActualRef.current) return
        setListado({ fase: 'listo', datos, error: null })
      })
      .catch((error) => {
        // 401: el backend ya decidió que la sesión no sirve (ET §32).
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        if (solicitud !== cargaActualRef.current) return
        setListado((actual) => ({
          fase: 'error',
          datos: actual.datos,
          error,
        }))
      })
  }, [token, pagina, alSesionExpirada])

  useEffect(() => {
    cargar()
  }, [cargar])

  const { fase, datos } = listado
  const items = fase === 'listo' ? datos?.items || [] : []
  const total = fase === 'listo' ? datos?.total ?? 0 : 0
  const porPagina =
    fase === 'listo'
      ? datos?.por_pagina ?? POR_PAGINA_DEFECTO
      : POR_PAGINA_DEFECTO

  return (
    <div className="auditoria-rh">
      <SectionHeader
        eyebrow="Talento"
        title="Auditoría"
        description="Registro de las correcciones administrativas realizadas por RH: quién modificó, qué registro, cuándo y con qué valores. Solo consulta."
      />

      <section
        className="auditoria-rh__registro"
        aria-labelledby="auditoria-rh-titulo"
      >
        <h2 id="auditoria-rh-titulo">Correcciones registradas</h2>

        {fase === 'cargando' && !listado.datos && (
          <EstadoCarga texto="Cargando auditoría…" />
        )}
        {fase === 'cargando' && listado.datos && (
          <span className="visualmente-oculto" role="status">
            Actualizando auditoría…
          </span>
        )}

        {fase === 'error' && (
          <EstadoError
            titulo="No pudimos cargar la auditoría"
            mensaje="Ocurrió un problema al obtener el registro de correcciones."
            onReintentar={cargar}
          />
        )}

        {fase === 'listo' && total === 0 && (
          <EstadoVacio
            titulo="Todavía no hay correcciones registradas."
            descripcion="Cada corrección de RH y cada modificación del empleado sobre una participación quedará aquí con su tipo, autor, fecha y valores anteriores y nuevos."
          />
        )}

        {fase === 'listo' && total > 0 && (
          <>
            <Table
              columns={COLUMNAS}
              caption="Correcciones administrativas registradas"
            >
              {items.map((registro) => {
                const valores = resumirValores(
                  registro.valores_anteriores,
                  registro.valores_nuevos,
                )
                return (
                  <tr key={registro.id}>
                    <td data-label="Fecha">{formatearFecha(registro.fecha)}</td>
                    <td data-label="Quién modificó">
                      {registro.actor_email || `Cuenta #${registro.actor_cuenta_id}`}
                    </td>
                    <td data-label="Operación">
                      <Badge tone="neutral">{etiquetaOperacion(registro.operacion)}</Badge>
                    </td>
                    <td data-label="Registro">
                      {registro.entidad} #{registro.entidad_id}
                    </td>
                    <td data-label="Empleado">
                      {registro.empleado_nombre || NO_DISPONIBLE}
                    </td>
                    <td data-label="Proyecto">
                      {registro.proyecto_nombre || NO_DISPONIBLE}
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
                  </tr>
                )
              })}
            </Table>

            <Pagination
              pagina={datos?.pagina ?? pagina}
              porPagina={porPagina}
              total={total}
              onCambiarPagina={setPagina}
              etiqueta="registros"
            />

            {/* Ayuda contextual discreta (Style Guide §13): una línea. */}
            <p className="auditoria-rh__ayuda">
              Los registros se muestran del más reciente al más antiguo y no se
              pueden editar desde aquí.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
