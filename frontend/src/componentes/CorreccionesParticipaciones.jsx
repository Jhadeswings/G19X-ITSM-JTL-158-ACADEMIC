// Apartado interno de «Mi historial» (Empleado): Historial de mis
// participaciones. Equivalente, para el Empleado, de la vista de Auditoría de
// RH (PRD §22; ET §25/§32; Style Guide §13 estados, §26 rediseño visual).
//
// Rediseño visual Fase 1: la presentación en tabla pasa a ser una CRONOLOGÍA
// plana (boceto panel_empleado_v6_zonas(1).html): fecha y hora a la izquierda;
// tipo con punto de color, autor, proyecto, registro, motivo y valores
// anterior → nuevo a la derecha. Solo cambia la presentación: siguen los
// mismos registros, en el orden del backend y con los mismos textos.
//
// SOLO LECTURA: consulta GET /api/v1/me/audits, que el backend ya filtra por
// las participaciones del empleado autenticado. Aquí NO se crea, edita ni
// borra nada, y esta consulta tampoco genera auditoría. El orden y la
// paginación los decide el backend; no se reordena. Un 401 delega en
// `alSesionExpirada`.
//
// Los filtros «Todos / Mi modificación / Corrección de RH» son de
// PRESENTACIÓN sobre la página YA cargada: el contrato /me/audits solo admite
// paginación, así que aquí no se pide ningún parámetro nuevo al backend, no se
// altera el `total` del backend y el resultado filtrado NUNCA se presenta como
// el historial completo (un aviso discreto lo aclara al activar un filtro
// específico). «Todos» restaura la página cargada completa.
//
// Muestra DOS tipos de evento sobre mis participaciones (§25): las correcciones
// administrativas de RH (`CORRECCION`) y mis propias modificaciones
// (`MODIFICACION_EMPLEADO`), diferenciadas por el tipo y por el punto de color
// (verde azulado para lo propio, terracota para RH).
//
// Presentación del AUTOR y del MOTIVO por tipo de operación (§25):
// - `MODIFICACION_EMPLEADO` → autor «Tú»: se decide con la operación Y la
//   identidad de la cuenta autenticada (`GET /me` vía `obtenerCuenta`),
//   comparando `cuenta_id` —el email solo como respaldo—; nunca comparando a
//   ciegas cadenas de correo. Si la identidad no se pudo corroborar, se
//   muestra el correo real del actor: no se afirma «Tú» sin evidencia.
// - `CORRECCION` → el correo del responsable que registró RH; si el registro
//   no trae correo, «No disponible» (indicador neutro, sin inventar nombres).
// - Operación desconocida → «No disponible» en el autor.
// - El motivo NO existe para la operación del Empleado → siempre «—»; el de
//   RH se conserva tal cual se registró y, si falta, «—». Nada se inventa.
//
// Las etiquetas de campo («Horas», «Trabajo en equipo», …) son un diccionario
// SOLO de presentación sobre las claves REALES de participación; una clave
// desconocida se muestra tal cual llega, sin perder información.

import { useCallback, useEffect, useRef, useState } from 'react'
import { obtenerCuenta } from '../api/cuenta.js'
import { POR_PAGINA_DEFECTO, listarMisAuditorias } from '../api/misAuditorias.js'
import { crearEsperaMinimaCarga } from '../lib/esperaMinimaCarga.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import Pagination from '../componentes/ui/Pagination.jsx'

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
 * Filtros visuales de la cronología: presentación sobre la página cargada.
 * `id` coincide con la `operación` REAL del contrato; vacío = «Todos».
 */
const FILTROS = [
  { id: '', etiqueta: 'Todos' },
  { id: MODIFICACION_EMPLEADO, etiqueta: 'Mi modificación' },
  { id: CORRECCION, etiqueta: 'Corrección de RH' },
]

/**
 * Etiquetas legibles SOLO de presentación para las claves REALES de la
 * participación (modelo Participacion del backend). No renombran datos ni
 * cambian contratos: una clave desconocida se muestra tal cual llega.
 */
const ETIQUETAS_CAMPO = {
  horas: 'Horas',
  en_equipo: 'Trabajo en equipo',
  coordino_tareas: 'Coordinó tareas',
  explico_a_publico_distinto: 'Explicación a públicos distintos',
  rol: 'Rol',
  entregables: 'Entregables',
  resolvio_problema: 'Resolvió problema',
  fecha_registro: 'Fecha de registro',
}

function etiquetaCampo(clave) {
  return ETIQUETAS_CAMPO[clave] || clave
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

/** Fecha y hora tal como llegan del backend, sin recalcular la zona. */
function fechaDe(iso) {
  return iso ? String(iso).slice(0, 10) : SIN_DATO
}

function horaDe(iso) {
  return iso ? String(iso).slice(11, 16) : SIN_DATO
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
  // Filtro visual activo sobre la página YA cargada ('' = Todos). No altera
  // el total del backend ni dispara nuevas consultas.
  const [filtro, setFiltro] = useState('')
  // Espera mínima cancelable de la carga INICIAL + guarda de vigencia: solo
  // la ÚLTIMA consulta actualiza el estado. Filtros locales y cambios de
  // presentación NO esperan. Se cancela al desmontar.
  const esperaRef = useRef(null)
  if (esperaRef.current === null) esperaRef.current = crearEsperaMinimaCarga()
  const cargaActualRef = useRef(0)
  useEffect(() => () => {
    esperaRef.current?.cancelar()
    cargaActualRef.current += 1
  }, [])

  const cargar = useCallback(() => {
    const inicio = Date.now()
    const solicitud = ++cargaActualRef.current
    setConsulta(consultaInicial())
    listarMisAuditorias(token, { pagina, porPagina: POR_PAGINA_DEFECTO })
      .then(async (datos) => {
        await esperaRef.current.esperar(inicio)
        if (solicitud !== cargaActualRef.current) return
        setConsulta({ fase: 'listo', datos, error: null })
      })
      .catch((error) => {
        if (solicitud !== cargaActualRef.current) return
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
  // distinto de 401 no rompe el apartado: la cronología sigue mostrando el
  // correo real del actor (§13.6) y no se afirma «Tú» sin corroborarla.
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
  // Filtro de PRESENTACIÓN sobre la página cargada: no reordena, no consulta
  // y no altera `total`; «Todos» restaura los registros de la página.
  const itemsVisibles = filtro
    ? items.filter((registro) => registro.operacion === filtro)
    : items

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
          {/* Filtros de presentación sobre la página ya cargada. */}
          <div
            className="historial-tabs"
            role="group"
            aria-label="Filtrar por tipo de cambio"
          >
            {FILTROS.map((f) => (
              <button
                key={f.id || 'todos'}
                type="button"
                className="historial-tabs__tab"
                aria-pressed={filtro === f.id}
                onClick={() => setFiltro(f.id)}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>

          {filtro !== '' && (
            <p className="historial-correcciones__nota-filtro">
              Mostrando solo los registros de esta página que coinciden con el
              filtro; el historial completo se pagina con los controles inferiores.
            </p>
          )}

          {itemsVisibles.length > 0 ? (
            <ol className="historial-correcciones__eventos">
              {itemsVisibles.map((registro) => {
                const valores = resumirValores(
                  registro.valores_anteriores,
                  registro.valores_nuevos,
                )
                const esCorreccionRH = registro.operacion === CORRECCION
                return (
                  <li key={registro.id} className="historial-correcciones__evento">
                    <div className="historial-correcciones__fecha" data-dato="fecha">
                      <b>{fechaDe(registro.fecha)}</b>
                      <span>{horaDe(registro.fecha)}</span>
                    </div>
                    <div className="historial-correcciones__detalle">
                      <div className="historial-correcciones__cabecera">
                        <span
                          className={`historial-correcciones__tipo${
                            esCorreccionRH ? ' historial-correcciones__tipo--rh' : ''
                          }`}
                          data-dato="tipo"
                        >
                          {etiquetaTipo(registro.operacion)}
                        </span>
                        <span className="historial-correcciones__autor" data-dato="autor">
                          Autor: <b>{textoAutor(registro, identidad)}</b>
                        </span>
                      </div>
                      <p className="historial-correcciones__proyecto" data-dato="proyecto">
                        <b>{registro.proyecto_nombre || SIN_DATO}</b>{' '}
                        <span className="historial-correcciones__registro" data-dato="registro">
                          {registro.entidad} #{registro.entidad_id}
                        </span>
                      </p>
                      <p className="historial-correcciones__motivo" data-dato="motivo">
                        {textoMotivo(registro)}
                      </p>
                      <ul className="historial-correcciones__valores" data-dato="valores">
                        {valores === null ? (
                          <li>{SIN_DATO}</li>
                        ) : (
                          valores.map((par) => (
                            <li key={par.clave} className="historial-correcciones__valor">
                              <span className="historial-correcciones__campo">
                                {etiquetaCampo(par.clave)}:
                              </span>
                              <span className="historial-correcciones__anterior">
                                {textoValor(par.anterior)}
                              </span>
                              <span
                                className="historial-correcciones__flecha"
                                aria-hidden="true"
                              >
                                →
                              </span>
                              <span className="historial-correcciones__nuevo">
                                {textoValor(par.nuevo)}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : filtro !== '' ? (
            <p className="historial-correcciones__sin-eventos">
              Ningún registro de esta página coincide con el filtro seleccionado.
            </p>
          ) : (
            <p className="historial-correcciones__sin-eventos">
              Esta página no trae registros por el momento.
            </p>
          )}

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