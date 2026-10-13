// Catálogo RH → Empleados (PRD §20.1; Style Guide §14.1, §14.2, §14.4, §26).
// La API se mockea: sin llamadas reales al backend.
//
// Qué se verifica aquí y NO debe romperse con cambios de diseño:
// - las cuatro columnas exactas del PRD;
// - el texto Activo/Inactivo (nunca solo color);
// - los únicos filtros que el backend soporta (estado y área) y la búsqueda
//   por nombre/puesto (q, PRD §20.1), que resuelve el backend;
// - la paginación calculada con `total`, no con `items.length`;
// - los estados de carga, vacío y error con reintento;
// - el 401 delegando en `alSesionExpirada`;
// - la navegación interna listado ↕ alta dentro de la misma sección.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearEmpleado, listarEmpleados, POR_PAGINA_DEFECTO } from '../../api/empleados.js'
import Empleados from '../Empleados.jsx'

vi.mock('../../api/empleados.js', async () => {
  const original = await vi.importActual('../../api/empleados.js')
  return { ...original, listarEmpleados: vi.fn(), crearEmpleado: vi.fn() }
})

const EMPLEADOS = [
  { id: 1, nombre: 'Ana López', puesto: 'Analista de datos', area: 'TI', activo: true },
  { id: 2, nombre: 'Luis Pérez', puesto: 'Desarrollador', area: null, activo: false },
  { id: 3, nombre: 'Sara Ruiz', puesto: null, area: 'Datos', activo: true },
]

function pagina(items, { total = items.length, pagina = 1, porPagina = POR_PAGINA_DEFECTO } = {}) {
  return { total, pagina, por_pagina: porPagina, items }
}

/** Filtros con los que se llamó al cliente en la última consulta. */
function ultimaConsulta() {
  return vi.mocked(listarEmpleados).mock.calls.at(-1)
}

beforeEach(() => {
  vi.mocked(listarEmpleados).mockReset()
  vi.mocked(crearEmpleado).mockReset()
  vi.mocked(listarEmpleados).mockResolvedValue(pagina(EMPLEADOS))
})

describe('Empleados — listado', () => {
  it('consulta el catálogo con el token de la sesión al abrir la sección', async () => {
    render(<Empleados token="token-rh" />)

    await waitFor(() => expect(listarEmpleados).toHaveBeenCalledTimes(1))
    const [token, filtros] = ultimaConsulta()
    expect(token).toBe('token-rh')
    expect(filtros.pagina).toBe(1)
    expect(filtros.porPagina).toBe(POR_PAGINA_DEFECTO)
  })

  it('muestra un estado de carga antes de resolver la consulta', async () => {
    render(<Empleados token="token-rh" />)

    expect(screen.getByText('Cargando empleados…')).toBeInTheDocument()
    await screen.findByText('Ana López')
  })

  it('muestra las cuatro columnas exactas del PRD §20.1', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    const encabezados = within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .map((th) => th.textContent)

    expect(encabezados).toEqual(['Empleado', 'Puesto', 'Área', 'Estado'])
  })

  it('no agrega columnas de correo ni de competencias', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    const tabla = screen.getByRole('table')
    // El correo vive en CuentaAcceso (PRD §3.2) y no es columna del catálogo.
    expect(screen.queryByText('empleado@empresa.dev')).not.toBeInTheDocument()
    expect(within(tabla).getAllByRole('columnheader')).toHaveLength(4)
  })

  it('muestra los datos de cada empleado', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    expect(screen.getByText('Analista de datos')).toBeInTheDocument()
    expect(screen.getByText('TI')).toBeInTheDocument()
  })

  it('muestra el estado con texto Activo o Inactivo, no solo color', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    // El estado se lee como texto en la propia fila: no depende del color.
    const estadoDe = (nombre) =>
      screen.getByText(nombre).closest('tr').querySelectorAll('td')[2].textContent

    expect(estadoDe('Ana López')).toBe('Activo')
    expect(estadoDe('Luis Pérez')).toBe('Inactivo')
  })

  it('trata los datos ausentes de forma neutra', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Luis Pérez')

    // Luis tiene puesto y no área; Sara tiene área y no puesto. En ambos casos
    // el dato ausente se presenta con un guion, nunca vacío ni como error.
    // La primera celda de la fila es el <th scope="row"> del nombre.
    const luis = screen.getByText('Luis Pérez').closest('tr').querySelectorAll('td')
    expect(luis[0]).toHaveTextContent('Desarrollador')
    expect(luis[1]).toHaveTextContent('—')

    const sara = screen.getByText('Sara Ruiz').closest('tr').querySelectorAll('td')
    expect(sara[0]).toHaveTextContent('—')
    expect(sara[1]).toHaveTextContent('Datos')
  })

  it('expone la tabla con un encabezado semántico accesible', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    const fila = screen.getByText('Ana López').closest('tr')
    expect(fila.querySelector('th')).toHaveAttribute('scope', 'row')
  })
})


describe('Empleados — filtros soportados por el backend', () => {
  it('ofrece Todos, Activos e Inactivos', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    for (const opcion of ['Todos', 'Activos', 'Inactivos']) {
      expect(screen.getByRole('button', { name: opcion })).toBeInTheDocument()
    }
  })

  it('envía activo=true al filtrar por Activos', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('button', { name: 'Activos' }))

    await waitFor(() => expect(ultimaConsulta()[1].activo).toBe(true))
  })

  it('envía activo=false al filtrar por Inactivos', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }))

    await waitFor(() => expect(ultimaConsulta()[1].activo).toBe(false))
  })

  it('omite el filtro de estado por defecto', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    expect(ultimaConsulta()[1].activo).toBeUndefined()
  })

  it('envía el área escrita como parámetro exacto', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.change(screen.getByLabelText('Área'), { target: { value: 'Datos' } })

    await waitFor(() => expect(ultimaConsulta()[1].area).toBe('Datos'))
  })

  it('identifica el filtro de área como coincidencia exacta, no como búsqueda', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    expect(screen.getByLabelText('Área')).toHaveAttribute('placeholder', 'Área exacta')
  })

  it('envía áreas con acento tal cual las escribe RH', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    // El backend compara de forma EXACTA: el valor viaja sin transformar para
    // que "Tecnología" conserve su acento (causa del filtro vacío en FiltroArea).
    fireEvent.change(screen.getByLabelText('Área'), { target: { value: 'Tecnología' } })

    await waitFor(() => expect(ultimaConsulta()[1].area).toBe('Tecnología'))
  })

  it('muestra los filtros activos y permite limpiarlos', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('button', { name: 'Activos' }))
    fireEvent.change(screen.getByLabelText('Área'), { target: { value: 'TI' } })
    await waitFor(() => expect(screen.getByText('Filtros activos:')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    await waitFor(() => {
      const filtros = ultimaConsulta()[1]
      expect(filtros.activo).toBeUndefined()
      expect(filtros.area).toBe('')
    })
  })

  it('ofrece los filtros por competencia y nivel del contrato §54', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    // Catálogo OFICIAL de las cinco + opción inicial sin competencia.
    const selector = screen.getByLabelText('Competencia')
    const valores = within(selector)
      .getAllByRole('option')
      .map((opcion) => opcion.value)
    expect(valores).toEqual([
      '',
      'desempeno_tecnico',
      'liderazgo',
      'trabajo_equipo',
      'comunicacion',
      'aprendizaje',
    ])
    expect(selector.value).toBe('')
  })

  it('el criterio depende de la competencia y el nivel del criterio', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    // Sin competencia: criterio deshabilitado y sin selector de nivel.
    expect(screen.getByLabelText('Resultado')).toBeDisabled()
    expect(screen.queryByLabelText('Nivel mínimo')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Competencia'), {
      target: { value: 'liderazgo' },
    })
    expect(screen.getByLabelText('Resultado')).toBeEnabled()

    // El nivel solo aparece con el criterio «Nivel mínimo».
    fireEvent.change(screen.getByLabelText('Resultado'), {
      target: { value: 'nivel' },
    })
    expect(screen.getByLabelText('Nivel mínimo')).toBeInTheDocument()
  })

  it('una competencia sola no aplica ningún filtro de resultado', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.change(screen.getByLabelText('Competencia'), {
      target: { value: 'liderazgo' },
    })

    await waitFor(() => {
      const filtros = ultimaConsulta()[1]
      expect(filtros.competencia).toBeUndefined()
      expect(filtros.nivelMin).toBeUndefined()
      expect(filtros.soloDi).toBeUndefined()
    })
  })

  it('nivel mínimo envía competencia y nivelMin, nunca soloDi', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.change(screen.getByLabelText('Competencia'), {
      target: { value: 'liderazgo' },
    })
    fireEvent.change(screen.getByLabelText('Resultado'), {
      target: { value: 'nivel' },
    })
    await screen.findByLabelText('Nivel mínimo')
    fireEvent.change(screen.getByLabelText('Nivel mínimo'), {
      target: { value: '3' },
    })

    await waitFor(() => {
      const filtros = ultimaConsulta()[1]
      expect(filtros.competencia).toBe('liderazgo')
      expect(filtros.nivelMin).toBe(3)
      expect(filtros.soloDi).toBeUndefined()
    })
  })

  it('DI envía competencia y soloDi, sin ningún nivel', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.change(screen.getByLabelText('Competencia'), {
      target: { value: 'liderazgo' },
    })
    fireEvent.change(screen.getByLabelText('Resultado'), {
      target: { value: 'di' },
    })

    await waitFor(() => {
      const filtros = ultimaConsulta()[1]
      expect(filtros.competencia).toBe('liderazgo')
      expect(filtros.soloDi).toBe(true)
      expect(filtros.nivelMin).toBeUndefined()
    })
    // Con DI no existe selector de nivel: DI no es un número (§54 H3-C).
    expect(screen.queryByLabelText('Nivel mínimo')).not.toBeInTheDocument()
  })

  it('elegir DI después de un nivel descarta el nivel (exclusión mutua)', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.change(screen.getByLabelText('Competencia'), {
      target: { value: 'liderazgo' },
    })
    fireEvent.change(screen.getByLabelText('Resultado'), {
      target: { value: 'nivel' },
    })
    await screen.findByLabelText('Nivel mínimo')
    fireEvent.change(screen.getByLabelText('Nivel mínimo'), {
      target: { value: '4' },
    })
    fireEvent.change(screen.getByLabelText('Resultado'), {
      target: { value: 'di' },
    })

    await waitFor(() => {
      const filtros = ultimaConsulta()[1]
      expect(filtros.soloDi).toBe(true)
      expect(filtros.nivelMin).toBeUndefined()
    })
    expect(screen.queryByLabelText('Nivel mínimo')).not.toBeInTheDocument()
  })

  it('cambiar la competencia restablece el criterio dependiente', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.change(screen.getByLabelText('Competencia'), {
      target: { value: 'liderazgo' },
    })
    fireEvent.change(screen.getByLabelText('Resultado'), {
      target: { value: 'nivel' },
    })
    await waitFor(() => expect(ultimaConsulta()[1].competencia).toBe('liderazgo'))

    // Al cambiar de competencia, el criterio vuelve a «Sin filtro»: no
    // queda un nivel huérfano de la competencia anterior (§54, regla 5).
    fireEvent.change(screen.getByLabelText('Competencia'), {
      target: { value: 'comunicacion' },
    })

    await waitFor(() => {
      const filtros = ultimaConsulta()[1]
      expect(filtros.competencia).toBeUndefined()
      expect(filtros.nivelMin).toBeUndefined()
      expect(filtros.soloDi).toBeUndefined()
    })
    expect(screen.getByLabelText('Resultado').value).toBe('ninguno')
  })

  it('vuelve a la primera página al cambiar un filtro', async () => {
    vi.mocked(listarEmpleados).mockResolvedValue(
      pagina(EMPLEADOS, { total: 42, porPagina: 20 }),
    )
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('button', { name: 'Página 3' }))
    await waitFor(() => expect(ultimaConsulta()[1].pagina).toBe(3))

    fireEvent.click(screen.getByRole('button', { name: 'Activos' }))

    await waitFor(() => expect(ultimaConsulta()[1].pagina).toBe(1))
  })
})

describe('Empleados — búsqueda por nombre/puesto (PRD §20.1)', () => {
  it('ofrece un campo de búsqueda distinto del filtro exacto de área', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    const busqueda = screen.getByRole('searchbox')
    expect(busqueda).toHaveAttribute('placeholder', 'Nombre o puesto')
    // El área conserva SU semántica: sigue siendo coincidencia exacta.
    expect(screen.getByLabelText('Área')).toHaveAttribute('placeholder', 'Área exacta')
  })

  it('envía q al backend al escribir y vuelve a la primera página', async () => {
    vi.mocked(listarEmpleados).mockResolvedValue(
      pagina(EMPLEADOS, { total: 42, porPagina: 20 }),
    )
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('button', { name: 'Página 3' }))
    await waitFor(() => expect(ultimaConsulta()[1].pagina).toBe(3))

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'ana' },
    })

    await waitFor(() => {
      expect(ultimaConsulta()[1].q).toBe('ana')
      expect(ultimaConsulta()[1].pagina).toBe(1)
    })
  })

  it('la búsqueda vacía no viaja: omite el parámetro como el área', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    expect(ultimaConsulta()[1].q).toBe('')
    expect(ultimaConsulta()[1].area).toBe('')
  })

  it('sin resultados muestra el vacío por filtros, no el del catálogo', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    vi.mocked(listarEmpleados).mockResolvedValue(pagina([]))
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'noexiste' },
    })

    expect(
      await screen.findByText('No hay empleados que coincidan con estos filtros.'),
    ).toBeInTheDocument()
  })

  it('muestra la búsqueda entre los filtros activos y la limpia con el resto', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'luis' },
    })
    await waitFor(() =>
      expect(screen.getByText('Búsqueda: luis')).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    await waitFor(() => {
      const filtros = ultimaConsulta()[1]
      expect(filtros.q).toBe('')
      expect(filtros.area).toBe('')
      expect(filtros.activo).toBeUndefined()
    })
    expect(screen.queryByText('Búsqueda: luis')).not.toBeInTheDocument()
  })
})


describe('Empleados — paginación', () => {
  it('muestra el rango según total y por_pagina del backend', async () => {
    vi.mocked(listarEmpleados).mockResolvedValue(
      pagina(EMPLEADOS, { total: 42, porPagina: 20 }),
    )
    render(<Empleados token="token-rh" />)

    expect(await screen.findByText(/Mostrando/)).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('no calcula el total con items.length', async () => {
    vi.mocked(listarEmpleados).mockResolvedValue(
      pagina(EMPLEADOS, { total: 42, porPagina: 20 }),
    )
    render(<Empleados token="token-rh" />)

    await screen.findByText('Ana López')
    // Solo hay 2 items en la página, pero el resumen usa el total real.
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('pide la página seleccionada al navegar', async () => {
    vi.mocked(listarEmpleados).mockResolvedValue(
      pagina(EMPLEADOS, { total: 42, porPagina: 20 }),
    )
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }))

    await waitFor(() => expect(ultimaConsulta()[1].pagina).toBe(2))
  })

  it('navega con los controles Anterior y Siguiente', async () => {
    // El mock devuelve la página solicitada, como haría el backend.
    vi.mocked(listarEmpleados).mockImplementation((_token, filtros) =>
      Promise.resolve(pagina(EMPLEADOS, { total: 42, pagina: filtros.pagina, porPagina: 20 })),
    )
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(ultimaConsulta()[1].pagina).toBe(2))

    fireEvent.click(await screen.findByRole('button', { name: 'Página anterior' }))
    await waitFor(() => expect(ultimaConsulta()[1].pagina).toBe(1))
  })

  it('deshabilita Anterior en la primera página', async () => {
    vi.mocked(listarEmpleados).mockResolvedValue(
      pagina(EMPLEADOS, { total: 42, porPagina: 20 }),
    )
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
  })

  it('omite la paginación cuando el volumen no la justifica', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /Paginación/ })).not.toBeInTheDocument()
  })

  it('expone la paginación como región navegable con página actual marcada', async () => {
    vi.mocked(listarEmpleados).mockResolvedValue(
      pagina(EMPLEADOS, { total: 42, porPagina: 20 }),
    )
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    const paginacion = screen.getByRole('navigation', { name: 'Paginación de empleados' })
    expect(within(paginacion).getByRole('button', { name: 'Página 1' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})


describe('Empleados — estados vacío, error y sesión', () => {
  it('muestra estado vacío cuando el catálogo no tiene empleados', async () => {
    vi.mocked(listarEmpleados).mockResolvedValue(pagina([]))
    render(<Empleados token="token-rh" />)

    expect(
      await screen.findByText('Todavía no hay empleados registrados.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('distingue el vacío por filtros del vacío del catálogo', async () => {
    vi.mocked(listarEmpleados).mockResolvedValue(pagina([]))
    render(<Empleados token="token-rh" />)
    await screen.findByText('Todavía no hay empleados registrados.')

    fireEvent.click(screen.getByRole('button', { name: 'Activos' }))

    expect(
      await screen.findByText('No hay empleados que coincidan con estos filtros.'),
    ).toBeInTheDocument()
  })

  it('muestra estado de error con reintento y no lo convierte en cero registros', async () => {
    vi.mocked(listarEmpleados)
      .mockRejectedValueOnce(new Error('fallo'))
      .mockResolvedValue(pagina(EMPLEADOS))
    render(<Empleados token="token-rh" />)

    expect(await screen.findByText('No pudimos cargar los empleados')).toBeInTheDocument()
    // Nunca se presenta como un catálogo vacío.
    expect(screen.queryByText('Todavía no hay empleados registrados.')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))

    expect(await screen.findByText('Ana López')).toBeInTheDocument()
  })

  it('expone el error como alerta accesible', async () => {
    vi.mocked(listarEmpleados).mockRejectedValue(new Error('fallo'))
    render(<Empleados token="token-rh" />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('cierra la sesión ante un 401 sin mostrar un estado de error', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(listarEmpleados).mockRejectedValue(
      Object.assign(new Error('Credenciales inválidas.'), { estado: 401 }),
    )
    render(<Empleados token="token-rh" alSesionExpirada={alSesionExpirada} />)

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('No pudimos cargar los empleados')).not.toBeInTheDocument()
  })
})


describe('Empleados — alta integrada en la sección', () => {
  it('abre el listado, no el formulario, al entrar a la sección', async () => {
    render(<Empleados token="token-rh" />)

    expect(await screen.findByText('Ana López')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear empleado' })).not.toBeInTheDocument()
  })

  it('ofrece la acción "Registrar empleado"', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    expect(screen.getByRole('button', { name: 'Registrar empleado' })).toBeInTheDocument()
  })

  it('muestra el formulario de alta como subvista interna con los cinco campos del PRD §3.3', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('button', { name: 'Registrar empleado' }))

    expect(screen.getByRole('button', { name: 'Crear empleado' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo de acceso')).toBeInTheDocument()
    expect(screen.getByLabelText('Puesto')).toBeInTheDocument()
    expect(screen.getByLabelText('Área')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha de ingreso')).toBeInTheDocument()
  })

  it('no consulta el catálogo de nuevo al entrar al alta', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')
    const llamadas = vi.mocked(listarEmpleados).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Registrar empleado' }))

    expect(vi.mocked(listarEmpleados).mock.calls).toHaveLength(llamadas)
  })

  it('permite volver del alta al listado', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('button', { name: 'Registrar empleado' }))
    fireEvent.click(screen.getByRole('button', { name: 'Volver al listado' }))

    expect(await screen.findByText('Ana López')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Crear empleado' })).not.toBeInTheDocument()
  })

  it('recarga el listado al volver del alta', async () => {
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')
    const llamadas = vi.mocked(listarEmpleados).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Registrar empleado' }))
    fireEvent.click(screen.getByRole('button', { name: 'Volver al listado' }))

    await waitFor(() =>
      expect(vi.mocked(listarEmpleados).mock.calls.length).toBe(llamadas + 1),
    )
  })

  it('conserva la confirmación de éxito del alta y permite volver al listado', async () => {
    vi.mocked(crearEmpleado).mockResolvedValue({
      id: 9,
      nombre: 'Nueva Persona',
      activo: true,
      cuenta: { email: 'nueva@empresa.dev', activo: true, must_change_password: true },
    })
    render(<Empleados token="token-rh" />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('button', { name: 'Registrar empleado' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nueva Persona' } })
    fireEvent.change(screen.getByLabelText('Correo de acceso'), {
      target: { value: 'nueva@empresa.dev' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear empleado' }))

    expect(await screen.findByText('Empleado creado')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Volver al listado' }))

    expect(await screen.findByText('Ana López')).toBeInTheDocument()
  })

  it('expulsa la sesión si el alta responde 401', async () => {
    const alSesionExpirada = vi.fn()
    vi.mocked(crearEmpleado).mockRejectedValue(
      Object.assign(new Error('Credenciales inválidas.'), { estado: 401 }),
    )
    render(<Empleados token="token-rh" alSesionExpirada={alSesionExpirada} />)
    await screen.findByText('Ana López')

    fireEvent.click(screen.getByRole('button', { name: 'Registrar empleado' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nueva Persona' } })
    fireEvent.change(screen.getByLabelText('Correo de acceso'), {
      target: { value: 'nueva@empresa.dev' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear empleado' }))

    await waitFor(() => expect(alSesionExpirada).toHaveBeenCalledTimes(1))
  })
})
