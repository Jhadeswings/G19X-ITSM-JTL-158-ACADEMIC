// Comparación de empleados por RH (PRD §20.5; ET: contrato del backend).
//
// POST /api/v1/rh/employees/compare con EXACTAMENTE { employee_ids }:
// el backend es la fuente de verdad y resuelve identificación, cinco
// competencias actuales y experiencia (contexto) desde el estado presente.
// Aquí no se transforman, ordenan ni recalculan los resultados; los IDs viajan
// en el orden de selección (orden neutral que el backend conserva).

import { solicitar } from './clienteApi.js'

/**
 * Compara 2 o más empleados activos.
 * @param {string} token token de la sesión RH.
 * @param {number[]} employeeIds IDs seleccionados, sin duplicados (>= 2).
 * @returns {Promise<{total: number, items: object[]}>} ComparacionOut del
 *   backend, sin transformar.
 */
export async function compararEmpleados(token, employeeIds) {
  return solicitar('/api/v1/rh/employees/compare', {
    metodo: 'POST',
    token,
    cuerpo: { employee_ids: employeeIds },
  })
}