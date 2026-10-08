// Sección RH → Mentoría (PRD §14; ET §29; Style Guide §999).
//
// RH elige UN receptor (de la lista de empleados activos, con búsqueda) y UNA
// competencia objetivo; el backend responde por reglas con nivel del receptor,
// elegibilidad, mentor (si existe) y `Criterio del sistema`. Aquí no se
// calcula ni interpreta nada: la respuesta se presenta tal cual.
//
// Reglas que esta vista respeta y no debe romper:
// - la justificación se muestra SIEMPRE con la etiqueta «Criterio del
//   sistema» (PRD §14.3): nunca «mejor empleado», «top mentor», «mejor
//   talento», ranking, score ni ganador;
// - los casos SIN mentor (nivel 5, Datos insuficientes, inactivo o nadie
//   cumple) se presentan con tono neutro y descriptivo: nunca como un
//   fracaso de la persona;
// - `nivel_receiver` null se muestra como «Datos insuficientes.» (nunca 0);
// - solo empleados ACTIVOS en la lista (el backend aplica sus propias reglas
//   ante cualquier cambio);
// - 404 (receptor ya no existe) y 422 (petición inválida) con mensaje legible
//   del backend y reintento; 401 cierra la sesión.

import { useCallback, useEffect, useState } from 'react'
import { sugerirMentor } from '../api/mentoria.js'
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

/** Las cinco competencias oficiales (PRD §14/§16). */
const COMPETENCIAS = [
  'desempeno_tecnico',
  'liderazgo',
  'trabajo_equipo',
  'comunicacion',
  'aprendizaje',
]

const COLUMNAS = [
  { key: 'receptor', label: 'Receptor' },
  { key: 'empleado', label: 'Empleado' },
  { key: 'puesto', label: 'Puesto' },
  { key: 'area', label: 'Área' },
]

/** Estado inicial de una consulta (patrón de las demás vistas RH). */
function consultaInicial() {
  return { fase: 'cargando', datos: null, error: null }
}

/** Estado inicial de la sugerencia: aún no se ha consultado. */
function sugerenciaInicial() {
  return { fase: 'inactiva', datos: null, error: null }
}

export default function Mentoria({ token, alSesionExpirada }) {
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [catalogo, setCatalogo] = useState(consultaInicial)
  const [receptorId, setReceptorId] = useState(null)
  // Nombre elegido en el momento de la selección: el resultado puede
  // renderizarse aunque el receptor ya no esté en la página visible.
  const [receptorNombre, setReceptorNombre] = useState(null)
  const [competencia, setCompetencia] = useState(COMPETENCIAS[0])
  const [sugerencia, setSugerencia] = useState(sugerenciaInicial)

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

  // Cambiar receptor o competencia invalida el resultado anterior: nunca
  // convive una sugerencia vieja con una selección nueva.
  function elegirReceptor(empleado) {
    setReceptorId(empleado.id)
    setReceptorNombre(empleado.nombre)
    setSugerencia(sugerenciaInicial())
  }

  function cambiarCompetencia(evento) {
    setCompetencia(evento.target.value)
    setSugerencia(sugerenciaInicial())
  }

  function sugerir() {
    setSugerencia({ fase: 'cargando', datos: null, error: null })
    sugerirMentor(token, { receiver_id: receptorId, competency_code: competencia })
      .then((datos) => setSugerencia({ fase: 'listo', datos, error: null }))
      .catch((error) => {
        // 401: el backend ya decidió que la sesión no sirve (ET §32).
        if (error?.estado === 401) {
          alSesionExpirada?.()
          return
        }
        setSugerencia({ fase: 'error', datos: null, error })
      })
  }

  // --- Catálogo de receptores (solo activos, patrón de Comparar) -----------
  const { fase, datos } = catalogo
  const items = fase === 'listo' ? datos?.items || [] : []
  const total = fase === 'listo' ? datos?.total ?? 0 : 0
  const porPagina =
    fase === 'listo' ? datos?.por_pagina ?? POR_PAGINA_DEFECTO : POR_PAGINA_DEFECTO
  const hayBusqueda = busqueda.trim().length > 0
  // Sugerencia ya resuelta: se presenta tal cual, sin recalcular nada.
  const resultado = sugerencia.fase === 'listo' ? sugerencia.datos : null

  return (
    <div className="mentoria">
      <SectionHeader
        eyebrow="Criterio del sistema"
        title="Mentoría"
        description="Selecciona un empleado receptor y una competencia objetivo; el sistema sugiere un mentor por reglas deterministas y explica el criterio aplicado."
      />

      <section className="mentoria-seleccion" aria-label="Selección de receptor y competencia">
        <div className="mentoria-seleccion__controles">
          <div className="mentoria-seleccion__busqueda">
            <label className="form-field__label" htmlFor="mentoria-busqueda">
              Receptor
            </label>
            <input
              id="mentoria-busqueda"
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

          <div className="mentoria-seleccion__competencia">
            <label className="form-field__label" htmlFor="mentoria-competencia">
              Competencia objetivo
            </label>
            <select
              id="mentoria-competencia"
              value={competencia}
              onChange={cambiarCompetencia}
            >
              {COMPETENCIAS.map((codigo) => (
                <option key={codigo} value={codigo}>
                  {NOMBRES_COMPETENCIAS[codigo] || codigo}
                </option>
              ))}
            </select>
          </div>

          <Button
            onClick={sugerir}
            disabled={receptorId === null}
            loading={sugerencia.fase === 'cargando'}
          >
            Sugerir mentor
          </Button>
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
                : 'Todavía no hay empleados activos disponibles.'
            }
            descripcion={
              hayBusqueda
                ? 'Revisa el texto escrito o límpialo para volver a ver todos los empleados activos.'
                : 'Cuando existan empleados activos, podrás elegirlos aquí como receptor de mentoría.'
            }
          />
        )}

        {fase === 'listo' && items.length > 0 && (
          <>
            <Table columns={COLUMNAS} caption="Empleados activos">
              {items.map((empleado) => (
                <tr key={empleado.id}>
                  <td data-label="Receptor">
                    <input
                      type="radio"
                      name="mentoria-receptor"
                      checked={receptorId === empleado.id}
                      onChange={() => elegirReceptor(empleado)}
                      aria-label={`Elegir a ${empleado.nombre} como receptor`}
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

      {/* --- Resultado de la sugerencia (tal cual llega del backend) -------- */}
      {sugerencia.fase === 'cargando' && (
        <EstadoCarga texto="Calculando la sugerencia de mentoría…" />
      )}

      {sugerencia.fase === 'error' && (
        <EstadoError
          titulo={
            sugerencia.error?.estado === 404
              ? 'No pudimos sugerir el mentor: el receptor ya no está disponible'
              : sugerencia.error?.estado === 422
                ? 'No pudimos sugerir el mentor: la selección ya no es válida'
                : 'No pudimos calcular la sugerencia de mentoría'
          }
          mensaje={sugerencia.error?.message}
          onReintentar={sugerir}
        />
      )}

      {resultado && (
        <article className="mentoria-resultado" aria-label="Sugerencia de mentoría">
          <p className="mentoria-resultado__titulo">Sugerencia de mentoría</p>

          <dl className="mentoria-resultado__lista">
            <div>
              <dt>Receptor</dt>
              <dd>{receptorNombre || `Empleado ${resultado.receiver_id}`}</dd>
            </div>
            <div>
              <dt>Competencia objetivo</dt>
              <dd>{NOMBRES_COMPETENCIAS[resultado.competency_code] || resultado.competency_code}</dd>
            </div>
            <div>
              <dt>Nivel del receptor</dt>
              {/* DI es estado válido: se muestra tal cual, nunca como 0. */}
              <dd>
                {resultado.nivel_receiver === null ||
                resultado.nivel_receiver === undefined
                  ? 'Datos insuficientes.'
                  : resultado.nivel_receiver}
              </dd>
            </div>
            <div>
              <dt>Elegibilidad del receptor</dt>
              <dd>{resultado.elegible ? 'Elegible' : 'No elegible'}</dd>
            </div>
          </dl>

          {resultado.mentor ? (
            <div className="mentoria-mentor">
              <h3>{resultado.mentor.nombre}</h3>
              <p>
                Nivel {resultado.mentor.nivel} en{' '}
                {NOMBRES_COMPETENCIAS[resultado.competency_code] ||
                  resultado.competency_code}{' '}
                · Empleado {resultado.mentor.empleado_id}
              </p>
            </div>
          ) : (
            /* Tono neutro y descriptivo: nunca un fracaso de la persona. */
            <div className="mentoria-mentor">
              <h3>Sin mentor sugerido</h3>
              <p>
                {resultado.elegible
                  ? 'Ningún empleado activo cumple con los requisitos de mentoría para esta consulta.'
                  : 'El receptor no es elegible para mentoría en la competencia objetivo según las reglas del sistema.'}
              </p>
            </div>
          )}

          {/* PRD §14.3: la justificación SIEMPRE con esta etiqueta. */}
          <div className="mentoria-resultado__criterio">
            <p className="mentoria-resultado__criterio-etiqueta">Criterio del sistema</p>
            <p className="mentoria-resultado__criterio-texto">
              {resultado.criterio_del_sistema}
            </p>
          </div>

          <p className="mentoria-resultado__nota">
            Selección determinista por reglas: sin inteligencia artificial y sin uso
            de experiencia como criterio de mentoría.
          </p>
        </article>
      )}
    </div>
  )
}