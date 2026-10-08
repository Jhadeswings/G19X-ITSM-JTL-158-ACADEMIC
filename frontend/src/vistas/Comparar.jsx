// Sección RH → Comparar (PRD §20.5; Style Guide §27 barra contextual, §995).
//
// Dos pasos internos: SELECCIÓN (solo empleados ACTIVOS, reutilizando el
// catálogo existente con su búsqueda) y RESULTADOS (lo que devuelve
// POST /rh/employees/compare, sin transformar).
//
// Reglas que esta vista respeta y no debe romper:
// - selección de 2 o más (la barra contextual solo aparece con selección y
//   el botón se habilita con >= 2); sin máximo inventado;
// - los IDs viajan en el ORDEN de selección (neutral, sin duplicados);
// - cinco competencias con VALOR y ETIQUETA del contrato, y `Datos
//   insuficientes.` tal cual (nunca nivel 0);
// - experiencia SOLO como contexto, visualmente separada;
// - SIN 9-Box, sin ganador, sin ranking, sin score, sin promedios, sin
//   colores que sugieran quién es mejor y sin reordenar los resultados.
// - 404/422 del POST = rechazo de la comparación COMPLETA (mensaje legible
//   del backend, sin resultados parciales); 401 cierra la sesión.

import { useCallback, useEffect, useState } from 'react'
import { compararEmpleados } from '../api/comparacion.js'
import { listarEmpleados, POR_PAGINA_DEFECTO } from '../api/empleados.js'
import { NOMBRES_COMPETENCIAS } from '../textos.js'
import EstadoCarga from '../componentes/EstadoCarga.jsx'
import EstadoError from '../componentes/EstadoError.jsx'
import EstadoVacio from '../componentes/EstadoVacio.jsx'
import SectionHeader from '../componentes/SectionHeader.jsx'
import { Button } from '../componentes/ui/Button.jsx'
import Pagination from '../componentes/ui/Pagination.jsx'
import Table from '../componentes/ui/Table.jsx'

/** Texto neutro para datos ausentes: nunca un hueco ni un error. */
const SIN_DATO = '—'

const COLUMNAS = [
  { key: 'seleccionar', label: 'Seleccionar' },
  { key: 'empleado', label: 'Empleado' },
  { key: 'puesto', label: 'Puesto' },
  { key: 'area', label: 'Área' },
]

/** Estado inicial de una consulta (patrón de las demás vistas RH). */
function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

/**
 * Lectura de UNA competencia del contrato: valor y etiqueta tal cual llegan.
 * `Datos insuficientes.` se preserva como estado válido (nunca nivel 0).
 */
function lecturaCompetencia(competencia) {
  if (
    competencia.estado === 'INSUFFICIENT_DATA' ||
    competencia.nivel === null ||
    competencia.nivel === undefined
  ) {
    return 'Datos insuficientes.'
  }
  const valor = competencia.valor ?? SIN_DATO
  const etiqueta = competencia.etiqueta ?? ''
  return etiqueta ? `${valor} · ${etiqueta}` : String(valor)
}

export default function Comparar({ token, alSesionExpirada }) {
  const [paso, setPaso] = useState('seleccion')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [catalogo, setCatalogo] = useState(consultaInicial)
  // IDs en ORDEN de selección (el orden neutral que viaja al backend) y sin
  // duplicados por construcción: alternar quita si ya estaba.
  const [seleccion, setSeleccion] = useState([])
  const [comparacion, setComparacion] = useState(consultaInicial)

  // La selección VIVE en la vista: paginar o buscar no la pierde.
  const cargarCatalogo = useCallback(() => {
    setCatalogo(consultaInicial())
    listarEmpleados(token, {
      pagina,
      porPagina: POR_PAGINA_DEFECTO,
      activo: true,
      q: busqueda,
    })
      .then((datos) => setCatalogo({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setCatalogo({ fase: 'error', datos: null, error })
      })
  }, [token, pagina, busqueda, alSesionExpirada])

  useEffect(() => {
    cargarCatalogo()
  }, [cargarCatalogo])

  function alternar(id) {
    setSeleccion((actual) =>
      actual.includes(id) ? actual.filter((elemento) => elemento !== id) : [...actual, id],
    )
  }

  function comparar() {
    setPaso('resultados')
    setComparacion(consultaInicial())
    compararEmpleados(token, seleccion)
      .then((datos) => setComparacion({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        // 401: el backend ya decidió que la sesión no sirve (ET §32).
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        // 404/422: rechazo de la comparación COMPLETA — nunca resultados
        // parciales ni exclusión silenciosa de un ID.
        setComparacion({ fase: 'error', datos: null, error })
      })
  }

  function volverASeleccion() {
    setPaso('seleccion')
    setComparacion(consultaInicial())
  }

  // --- PASO 2: resultados (tal cual llegan, en el orden del backend) -------
  if (paso === 'resultados') {
    const { fase, datos, error } = comparacion
    return (
      <div className="comparar">
        <SectionHeader
          eyebrow="Vista lateral"
          title="Comparar"
          description="Cinco competencias actuales y experiencia como contexto. El sistema no declara ganadores ni produce rankings."
        />
        <div className="comparar-acciones">
          <Button variant="ghost" onClick={volverASeleccion}>
            Cambiar selección
          </Button>
        </div>

        {fase === 'cargando' && <EstadoCarga texto="Comparando empleados…" />}

        {fase === 'error' && (
          <EstadoError
            titulo={
              error?.estado === 404
                ? 'No pudimos comparar: algún empleado ya no está disponible'
                : error?.estado === 422
                  ? 'No pudimos comparar: la selección dejó de ser válida'
                  : 'No pudimos comparar los empleados'
            }
            mensaje={error?.message}
            onReintentar={comparar}
          />
        )}

        {fase === 'listo' && datos && (
          <div className="comparar-resultados">
            {datos.items.map((empleado) => (
              <article
                key={empleado.empleado_id}
                className="comparar-empleado"
                aria-labelledby={`comparar-empleado-${empleado.empleado_id}`}
              >
                <h3 id={`comparar-empleado-${empleado.empleado_id}`}>
                  {empleado.nombre}
                </h3>
                <p className="comparar-empleado__meta">
                  {empleado.puesto || SIN_DATO} · {empleado.area || SIN_DATO}
                </p>

                {/* Cinco competencias: valor y etiqueta del contrato, o DI. */}
                <dl className="comparar-empleado__competencias">
                  {empleado.competencias.map((competencia) => (
                    <div key={competencia.clave} className="comparar-empleado__competencia">
                      <dt>{NOMBRES_COMPETENCIAS[competencia.clave] || competencia.clave}</dt>
                      <dd>{lecturaCompetencia(competencia)}</dd>
                    </div>
                  ))}
                </dl>

                {/* Experiencia: CONTEXTO separado y secundario (PRD §8/§20.5). */}
                <div className="comparar-empleado__experiencia">
                  <h4>Experiencia (contexto)</h4>
                  <dl>
                    <div>
                      <dt>Antigüedad</dt>
                      <dd>
                        {empleado.experiencia.anios_antiguedad == null
                          ? SIN_DATO
                          : `${empleado.experiencia.anios_antiguedad} años`}
                      </dd>
                    </div>
                    <div>
                      <dt>Proyectos únicos</dt>
                      <dd>{empleado.experiencia.proyectos_unicos ?? SIN_DATO}</dd>
                    </div>
                  </dl>
                  <p>
                    Información contextual: la experiencia no es una competencia
                    ni un criterio de selección.
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    )
  }

  // --- PASO 1: selección de empleados activos ------------------------------
  const { fase, datos } = catalogo
  const items = fase === 'listo' ? datos?.items || [] : []
  const total = fase === 'listo' ? datos?.total ?? 0 : 0
  const porPagina =
    fase === 'listo' ? datos?.por_pagina ?? POR_PAGINA_DEFECTO : POR_PAGINA_DEFECTO
  const hayBusqueda = busqueda.trim().length > 0

  return (
    <div className="comparar">
      <SectionHeader
        eyebrow="Vista lateral"
        title="Comparar"
        description="Selecciona dos o más empleados activos para ver sus cinco competencias actuales y su experiencia como contexto."
      />

      <section className="comparar-seleccion" aria-label="Selección de empleados activos">
        <div className="comparar-seleccion__busqueda">
          <label className="form-field__label" htmlFor="comparar-busqueda">
            Búsqueda
          </label>
          <input
            id="comparar-busqueda"
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

        {fase === 'cargando' && <EstadoCarga texto="Cargando empleados activos…" />}

        {fase === 'error' && (
          <EstadoError
            titulo="No pudimos cargar los empleados activos"
            mensaje="Ocurrió un problema al obtener el catálogo de empleados."
            onReintentar={cargarCatalogo}
          />
        )}

        {fase === 'listo' && items.length === 0 && (
          <EstadoVacio
            titulo={
              hayBusqueda
                ? 'No hay empleados activos que coincidan con la búsqueda.'
                : 'Todavía no hay empleados activos para comparar.'
            }
            descripcion={
              hayBusqueda
                ? 'Revisa el texto escrito o límpialo para volver a ver todos los empleados activos.'
                : 'Cuando existan empleados activos, podrás seleccionarlos aquí para compararlos.'
            }
          />
        )}

        {fase === 'listo' && items.length > 0 && (
          <>
            <Table columns={COLUMNAS} caption="Empleados activos">
              {items.map((empleado) => (
                <tr key={empleado.id}>
                  <td data-label="Seleccionar">
                    <input
                      type="checkbox"
                      checked={seleccion.includes(empleado.id)}
                      onChange={() => alternar(empleado.id)}
                      aria-label={`Seleccionar a ${empleado.nombre}`}
                    />
                  </td>
                  <th
                    scope="row"
                    className="tabla__th tabla__th--fila"
                    data-label="Empleado"
                  >
                    {empleado.nombre}
                  </th>
                  <td data-label="Puesto">{empleado.puesto || SIN_DATO}</td>
                  <td data-label="Área">{empleado.area || SIN_DATO}</td>
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
      </section>

      {/* Barra contextual (SG §27): SOLO con selección; el botón se habilita
          con dos o más. Sin máximo: el contrato no define tope. */}
      {seleccion.length > 0 && (
        <div className="comparar-barra" role="status">
          <p className="comparar-barra__conteo">
            {seleccion.length === 1
              ? '1 empleado seleccionado'
              : `${seleccion.length} empleados seleccionados`}
          </p>
          <Button onClick={comparar} disabled={seleccion.length < 2}>
            Comparar
          </Button>
        </div>
      )}
    </div>
  )
}