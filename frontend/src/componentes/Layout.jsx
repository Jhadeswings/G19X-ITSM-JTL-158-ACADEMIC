// Layout principal de la aplicación (Style Guide §7, §10, §11, §29;
// componente base §31).
//
// Estructura: navegación lateral + (header + contenido). Es el ÚNICO shell:
// las pantallas solo aportan su título y su contenido, de modo que la
// navegación es predecible y consistente (§3.2).
//
// Si no se reciben secciones no se dibuja la barra lateral: nunca se inventa
// navegación para roles o pantallas que no la tienen.

import { useEffect, useState } from 'react'
import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'

export default function Layout({
  titulo,
  cuenta,
  secciones = [],
  activa,
  onSeleccionar,
  onCerrarSesion,
  children,
}) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const conNavegacion = secciones.length > 0

  // En mobile la navegación es un drawer (§7): Escape lo cierra (§22).
  useEffect(() => {
    if (!menuAbierto) return undefined
    function alPresionarTecla(evento) {
      if (evento.key === 'Escape') setMenuAbierto(false)
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  }, [menuAbierto])

  function seleccionar(id) {
    onSeleccionar(id)
    setMenuAbierto(false)
  }

  return (
    <div className="layout">
      {conNavegacion && (
        <Sidebar
          secciones={secciones}
          activa={activa}
          onSeleccionar={seleccionar}
          abierto={menuAbierto}
        />
      )}
      <div className="layout__principal">
        <Header
          titulo={titulo}
          cuenta={cuenta}
          mostrarMenu={conNavegacion}
          menuAbierto={menuAbierto}
          onAlternarMenu={() => setMenuAbierto((abierto) => !abierto)}
          onCerrarSesion={onCerrarSesion}
        />
        <main className="app__contenido">{children}</main>
      </div>
    </div>
  )
}
