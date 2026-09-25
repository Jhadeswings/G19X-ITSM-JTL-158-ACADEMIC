/**
 * @vitest-environment node
 */
// Guardarraíl de estilos (Style Guide Talento v1.1 §4, §5, §8, §23).
//
// Verifica que `src/index.css` sea CSS plano y válido, y que los tokens
// visuales sigan coincidiendo con el Style Guide.
//
// Por qué existe: Vite/esbuild compila sin error un CSS con llaves
// desbalanceadas — convierte las reglas anidadas en selectores
// descendientes (`.a .b`) que nunca coinciden con el DOM — y Vitest se
// ejecuta con `css: false`, así que ni el build ni los tests de React lo
// detectan. Este test lee el archivo como texto y lo analiza, SIN
// dependencias nuevas.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Ruta del CSS a validar. Con el entorno `node` de Vitest, `import.meta.url`
 * es `file:` y se resuelve directo; si el archivo llegara a ejecutarse en
 * jsdom (URL `http:`), se resuelve desde la raíz del proyecto.
 */
function rutaCss() {
  const url = new URL('../index.css', import.meta.url)
  return url.protocol === 'file:' ? url : resolve(process.cwd(), 'src/index.css')
}

const css = readFileSync(rutaCss(), 'utf8')

// Paleta y radios del Style Guide v1.1 (§4.1 y §8) declarados aquí como
// contrato esperado: no se leen del documento para que el test funcione
// también dentro del contenedor del frontend, donde el Style Guide no vive.
const TOKENS_ESPERADOS = {
  '--color-bg': '#f6f7f5',
  '--color-surface': '#ffffff',
  '--color-surface-soft': '#f0f4f2',
  '--color-text-primary': '#263238',
  '--color-text-secondary': '#5f6b73',
  '--color-primary': '#4f7f7b',
  '--color-primary-soft': '#e4eeec',
  '--color-secondary': '#637696',
  '--color-accent': '#d99a7c',
  '--color-border': '#dce2df',
  '--radius-card': '12px',
  '--radius-control': '8px',
}

// At-rules que SÍ pueden contener reglas (§23).
const AGRUPADORES = ['@media', '@supports', '@layer', '@container', '@scope']
// Sus bloques internos son selectores de keyframe, no reglas anidadas.
const KEYFRAMES = ['@keyframes', '@-webkit-keyframes']

/** Quita comentarios: sus llaves no deben contar para el balance. */
function sinComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Recorre el CSS carácter a carácter y devuelve cada bloque con el
 * `selector` que lo abre y el `padre` (selector del bloque contenedor).
 * El preludio acumulado se descarta al cerrar un bloque para que las
 * declaraciones no se confundan con selectores.
 */
function analizarBloques(texto) {
  const pila = []
  const bloques = []
  const errores = []
  let preludio = ''

  for (const caracter of sinComentarios(texto)) {
    if (caracter === '{') {
      const selector = preludio.trim()
      bloques.push({ selector, padre: pila[pila.length - 1] })
      pila.push(selector)
      preludio = ''
      continue
    }
    if (caracter === '}') {
      if (pila.length === 0) {
        errores.push('Llave de cierre sin apertura.')
      } else {
        pila.pop()
      }
      preludio = ''
      continue
    }
    preludio += caracter
  }

  if (pila.length > 0) {
    errores.push(`Bloques sin cerrar: ${pila.join(' | ')}`)
  }
  return { bloques, errores }
}

/** Mapa `token → valor` de todas las variables declaradas en el CSS. */
function tokensDeclarados() {
  const tokens = new Map()
  for (const [, nombre, valor] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(nombre, valor.trim().toLowerCase())
  }
  return tokens
}

const { bloques, errores } = analizarBloques(css)

describe('index.css — estructura', () => {
  it('cierra todas las llaves (sin bloques huérfanos)', () => {
    expect(errores).toEqual([])
  })

  it('no contiene reglas anidadas accidentalmente', () => {
    const anidadas = bloques
      .filter(({ selector, padre }) => {
        if (selector === '' || padre === undefined) return false
        if (AGRUPADORES.some((agrupador) => padre.startsWith(agrupador))) {
          return false
        }
        if (KEYFRAMES.some((keyframes) => padre.startsWith(keyframes))) {
          return false
        }
        return !padre.startsWith('@')
      })
      .map(({ selector, padre }) => `${selector} dentro de ${padre}`)

    expect(anidadas).toEqual([])
  })

  it('deja @keyframes y @media de movimiento en el nivel superior', () => {
    const superiores = bloques
      .filter((bloque) => bloque.padre === undefined)
      .map((bloque) => bloque.selector)

    expect(superiores).toContain('@keyframes pulso')
    expect(superiores).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('no deja bloques vacíos', () => {
    const vacios = [...sinComentarios(css).matchAll(/\{[^{}]*\}/g)]
      .map((coincidencia) => coincidencia[0])
      .filter((bloque) => bloque.slice(1, -1).trim() === '')

    expect(vacios).toEqual([])
  })
})

describe('index.css — tokens visuales', () => {
  it('mantiene la paleta del Style Guide §4.1 y los radios §8', () => {
    const tokens = tokensDeclarados()
    for (const [nombre, valor] of Object.entries(TOKENS_ESPERADOS)) {
      expect(tokens.get(nombre), `token ${nombre}`).toBe(valor)
    }
  })
})
