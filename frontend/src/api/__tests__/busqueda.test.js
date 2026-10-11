// Contrato de la búsqueda manual de talento (PRD §13.1; ET §26; DT #36/#41).
// El cliente HTTP se mockea: sin llamadas reales al backend.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { solicitar } from '../clienteApi.js'
import { buscarTalento, interpretarBusqueda } from '../busqueda.js'

vi.mock('../clienteApi.js', () => ({ solicitar: vi.fn() }))

const CRITERIOS = [
  { code: 'liderazgo', min_level: 4 },
  { code: 'trabajo_equipo', min_level: 3 },
]

beforeEach(() => {
  vi.mocked(solicitar).mockReset()
})

describe('busqueda — búsqueda manual de talento', () => {
  it('llama a POST /api/v1/rh/talent-search/manual con el token de la sesión', async () => {
    vi.mocked(solicitar).mockResolvedValue({ total: 0, criterios: [], items: [] })

    await buscarTalento('token-rh', CRITERIOS)

    expect(solicitar).toHaveBeenCalledWith('/api/v1/rh/talent-search/manual', {
      metodo: 'POST',
      token: 'token-rh',
      cuerpo: {
        competencies: [
          { code: 'liderazgo', min_level: 4 },
          { code: 'trabajo_equipo', min_level: 3 },
        ],
      },
    })
  })

  it('el payload contiene EXACTAMENTE competencies con code y min_level', async () => {
    vi.mocked(solicitar).mockResolvedValue({ total: 0, criterios: [], items: [] })

    await buscarTalento('token-rh', CRITERIOS)

    const cuerpo = vi.mocked(solicitar).mock.calls.at(-1)[1].cuerpo
    expect(Object.keys(cuerpo)).toEqual(['competencies'])
    for (const criterio of cuerpo.competencies) {
      expect(Object.keys(criterio).sort()).toEqual(['code', 'min_level'])
    }
  })

  it('devuelve la respuesta del backend sin transformarla', async () => {
    const respuesta = {
      total: 1,
      criterios: [{ code: 'liderazgo', min_level: 4 }],
      items: [
        {
          empleado_id: 7,
          nombre: 'Ana López',
          area: 'TI',
          competencias: [
            { code: 'liderazgo', estado: 'CALCULABLE', nivel: 4 },
          ],
          promedio_seleccionadas: '4.00',
        },
      ],
    }
    vi.mocked(solicitar).mockResolvedValue(respuesta)

    await expect(buscarTalento('token-rh', CRITERIOS)).resolves.toEqual(respuesta)
  })
})

// ---------------------------------------------------------------------------
// 5B-2 — Interpretación IA de la necesidad (PRD §13.3; ET §27; DT #39).
// El cliente HTTP se mockea: sin llamadas reales a proveedores.
// ---------------------------------------------------------------------------

describe('busqueda — interpretación IA de la necesidad (5B-2)', () => {
  it('llama a POST /api/v1/rh/talent-search/interpret con el token de la sesión', async () => {
    vi.mocked(solicitar).mockResolvedValue({
      proveedor: 'groq',
      criterios: {
        competencies: [{ code: 'liderazgo', min_level: 4 }],
        area: null,
        position: null,
      },
    })

    await interpretarBusqueda('token-rh', 'Necesito personas con liderazgo fuerte')

    expect(solicitar).toHaveBeenCalledWith(
      '/api/v1/rh/talent-search/interpret',
      {
        metodo: 'POST',
        token: 'token-rh',
        cuerpo: { query_text: 'Necesito personas con liderazgo fuerte' },
      },
    )
  })

  it('el payload contiene EXACTAMENTE query_text (InterpretacionIn, extra="forbid")', async () => {
    vi.mocked(solicitar).mockResolvedValue({
      proveedor: 'groq',
      criterios: { competencies: [], area: null, position: null },
    })

    await interpretarBusqueda('token-rh', 'texto de la necesidad')

    const cuerpo = vi.mocked(solicitar).mock.calls.at(-1)[1].cuerpo
    expect(Object.keys(cuerpo)).toEqual(['query_text'])
    expect(cuerpo.query_text).toBe('texto de la necesidad')
  })

  it('devuelve la respuesta del backend sin transformarla', async () => {
    const respuesta = {
      proveedor: 'gemini',
      criterios: {
        competencies: [
          { code: 'liderazgo', min_level: 4 },
          { code: 'comunicacion', min_level: 3 },
        ],
        area: 'TI',
        position: 'Backend',
      },
    }
    vi.mocked(solicitar).mockResolvedValue(respuesta)

    await expect(
      interpretarBusqueda('token-rh', 'texto de la necesidad'),
    ).resolves.toEqual(respuesta)
  })
})