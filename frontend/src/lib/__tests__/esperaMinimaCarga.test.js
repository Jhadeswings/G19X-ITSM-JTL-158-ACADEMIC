// Utilidad de espera mínima cancelable para los estados de carga iniciales
// del Empleado. Sin React ni red: solo temporizadores.
//
// Qué se verifica aquí:
// - la espera termina al alcanzar la duración mínima;
// - cancelar() resuelve sin dejar temporizadores pendientes;
// - una petición lenta no sufre retraso adicional tras su respuesta;
// - cancelar durante una espera resuelve de inmediato (el llamador ignora el
//   resultado obsoleto con su guarda de vigencia).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MIN_CARGA_EMPLEADO_MS,
  crearEsperaMinimaCarga,
} from '../../lib/esperaMinimaCarga.js'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('esperaMinimaCarga — duración mínima', () => {
  it('resuelve al alcanzar la duración mínima', async () => {
    expect(MIN_CARGA_EMPLEADO_MS).toBe(400)
    const espera = crearEsperaMinimaCarga()
    let resuelta = false
    const promesa = espera.esperar(Date.now()).then(() => {
      resuelta = true
    })
    await vi.advanceTimersByTimeAsync(MIN_CARGA_EMPLEADO_MS - 1)
    expect(resuelta).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await promesa
    expect(resuelta).toBe(true)
  })

  it('una petición lenta no sufre retraso adicional tras su respuesta', async () => {
    const espera = crearEsperaMinimaCarga()
    const inicio = Date.now()
    // La respuesta llegó 700 ms después del inicio: el mínimo ya pasó.
    vi.setSystemTime(inicio + 700)
    let resuelta = false
    await espera.esperar(inicio).then(() => {
      resuelta = true
    })
    expect(resuelta).toBe(true)
  })

  it('espera solo el tiempo restante cuando la petición fue rápida', async () => {
    const espera = crearEsperaMinimaCarga()
    const inicio = Date.now()
    // La respuesta llegó a los 80 ms: solo restan ~320 ms, no 400 más.
    vi.setSystemTime(inicio + 80)
    let resuelta = false
    const promesa = espera.esperar(inicio).then(() => {
      resuelta = true
    })
    await vi.advanceTimersByTimeAsync(MIN_CARGA_EMPLEADO_MS - 80 - 1)
    expect(resuelta).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await promesa
    expect(resuelta).toBe(true)
  })
})

describe('esperaMinimaCarga — cancelación', () => {
  it('cancelar() resuelve la espera sin dejar temporizadores pendientes', async () => {
    const espera = crearEsperaMinimaCarga()
    let resuelta = false
    const promesa = espera.esperar(Date.now()).then(() => {
      resuelta = true
    })
    expect(vi.getTimerCount()).toBe(1)
    espera.cancelar()
    await promesa
    expect(resuelta).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancelar() sin esperas pendientes no falla ni deja timers', () => {
    const espera = crearEsperaMinimaCarga()
    expect(() => espera.cancelar()).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('un desmontaje (cancelar) no deja promesas colgadas que actualicen estado', async () => {
    const espera = crearEsperaMinimaCarga()
    let actualizaciones = 0
    const promesa = espera.esperar(Date.now()).then(() => {
      actualizaciones += 1
    })
    // El componente se desmonta antes del mínimo: la espera se libera.
    espera.cancelar()
    await promesa
    // La promesa resolvió (sin colgarse); el llamador decide ignorarla con
    // su guarda de vigencia, aquí simulada: una segunda carga invalida la
    // primera, así que ni siquiera se cuenta como actualización válida.
    expect(actualizaciones).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
