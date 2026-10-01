// Contrato del registro de participación del Empleado (PRD §12; ET §9, §31).
// El cliente HTTP se mockea: sin llamadas reales al backend.
//
// Solo se verifica TRANSPORTE: ruta exacta, POST con `{ token }`, cuerpo
// exacto del contrato (ocho campos y ningún otro), respuesta sin transformar y
// propagación de 401/404/409/422. Nada de reglas de negocio: `empleado_id`,
// `fecha_registro`, la unicidad empleado/proyecto y la inmutabilidad de los
// indicadores son del backend.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import { crearParticipacion } from '../participaciones.js'

vi.mock('../clienteApi.js', () => ({ solicitar: vi.fn() }))

/** Payload permitido por ParticipacionCreateIn (ocho campos, ni uno más). */
const REGISTRO = {
  proyecto_id: 3,
  rol: 'Desarrollador',
  entregables: 'API de pagos',
  en_equipo: true,
  coordino_tareas: false,
  explico_a_publico_distinto: true,
  resolvio_problema: true,
  horas: 120,
}

/** Respuesta real: ParticipacionOut del registro inicial. */
const PARTICIPACION = {
  id: 21,
  empleado_id: 7,
  proyecto_id: 3,
  rol: 'Desarrollador',
  entregables: 'API de pagos',
  en_equipo: true,
  coordino_tareas: false,
  explico_a_publico_distinto: true,
  resolvio_problema: true,
  horas: 120,
  fecha_registro: '2026-09-30',
  proyecto: null,
  created_at: '2026-09-30T09:00:00',
  updated_at: '2026-09-30T09:00:00',
}

function errorDe(estado, mensaje) {
  return Object.assign(new Error(mensaje), { estado })
}

beforeEach(() => {
  vi.mocked(solicitar).mockReset()
})

describe('participaciones — registro inicial (POST /me/participations)', () => {
  it('llama a POST /api/v1/me/participations con el token de la sesión', async () => {
    vi.mocked(solicitar).mockResolvedValue(PARTICIPACION)

    await crearParticipacion('token-empleado', REGISTRO)

    expect(solicitar).toHaveBeenCalledTimes(1)
    expect(solicitar).toHaveBeenCalledWith('/api/v1/me/participations', {
      metodo: 'POST',
      token: 'token-empleado',
      cuerpo: REGISTRO,
    })
  })

  it('la ruta es exacta: sin query params ni barra final', async () => {
    vi.mocked(solicitar).mockResolvedValue(PARTICIPACION)

    await crearParticipacion('token-empleado', REGISTRO)

    const [ruta] = vi.mocked(solicitar).mock.calls[0]
    expect(ruta).toBe('/api/v1/me/participations')
    expect(ruta).not.toContain('?')
    expect(ruta.endsWith('/')).toBe(false)
  })

  it('envía el cuerpo sin copiarlo ni reordenarlo', async () => {
    vi.mocked(solicitar).mockResolvedValue(PARTICIPACION)

    await crearParticipacion('token-empleado', REGISTRO)

    const [, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(opciones.cuerpo).toBe(REGISTRO)
    expect(Object.keys(opciones.cuerpo)).toEqual([
      'proyecto_id',
      'rol',
      'entregables',
      'en_equipo',
      'coordino_tareas',
      'explico_a_publico_distinto',
      'resolvio_problema',
      'horas',
    ])
  })

  it('NO envía `empleado_id` (se deriva de la cuenta autenticada, §32)', async () => {
    vi.mocked(solicitar).mockResolvedValue(PARTICIPACION)

    await crearParticipacion('token-empleado', { proyecto_id: 3, rol: 'X', horas: 1 })

    const [, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(opciones.cuerpo).not.toHaveProperty('empleado_id')
    expect(Object.keys(opciones.cuerpo)).toHaveLength(3)
  })

  it('NO envía `fecha_registro` (la fija el servidor)', async () => {
    vi.mocked(solicitar).mockResolvedValue(PARTICIPACION)

    await crearParticipacion('token-empleado', REGISTRO)

    const [, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(opciones.cuerpo).not.toHaveProperty('fecha_registro')
  })

  it('NO envía `estado` ni ningún campo fuera del contrato', async () => {
    vi.mocked(solicitar).mockResolvedValue(PARTICIPACION)

    await crearParticipacion('token-empleado', REGISTRO)

    const [, opciones] = vi.mocked(solicitar).mock.calls[0]
    expect(opciones.cuerpo).not.toHaveProperty('estado')
    expect([...Object.keys(opciones.cuerpo)].sort()).toEqual(
      [
        'coordino_tareas',
        'en_equipo',
        'entregables',
        'explico_a_publico_distinto',
        'horas',
        'proyecto_id',
        'resolvio_problema',
        'rol',
      ].sort(),
    )
  })

  it('devuelve la respuesta del backend sin transformarla', async () => {
    vi.mocked(solicitar).mockResolvedValue(PARTICIPACION)

    await expect(crearParticipacion('token-empleado', REGISTRO)).resolves.toBe(
      PARTICIPACION,
    )
  })

  it('propaga el 401 de la sesión expirada', async () => {
    const error = errorDe(401, 'Credenciales inválidas.')
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(crearParticipacion('token-empleado', REGISTRO)).rejects.toBe(error)
  })

  it('propaga el 404 de proyecto inexistente con su mensaje', async () => {
    const error = errorDe(404, 'Proyecto no encontrado.')
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(
      crearParticipacion('token-empleado', { ...REGISTRO, proyecto_id: 9999 }),
    ).rejects.toMatchObject({ estado: 404, message: 'Proyecto no encontrado.' })
  })

  it('propaga el 409 de participación duplicada con su mensaje', async () => {
    const error = errorDe(
      409,
      'Ya existe una participación de este empleado en ese proyecto.',
    )
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(crearParticipacion('token-empleado', REGISTRO)).rejects.toMatchObject({
      estado: 409,
      message: 'Ya existe una participación de este empleado en ese proyecto.',
    })
  })

  it('propaga el 422 de validación sin reinterpretarlo', async () => {
    const error = errorDe(422, 'Algunos datos enviados no son válidos.')
    vi.mocked(solicitar).mockRejectedValue(error)

    await expect(
      crearParticipacion('token-empleado', { ...REGISTRO, horas: -1 }),
    ).rejects.toBe(error)
  })
})
