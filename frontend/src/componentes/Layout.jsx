import { useEffect, useRef, useState } from 'react'
import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'

export default function Layout({ titulo, cuenta, rol, secciones = [], activa, onSeleccionar, onCerrarSesion, children }) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [esMobile, setEsMobile] = useState(false)
  const botonMenuRef = useRef(null)
  const panelRef = useRef(null)
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const consulta = window.matchMedia('(max-width: 900px)')
    const actualizar = () => {
      setEsMobile(consulta.matches)
      if (!consulta.matches) setMenuAbierto(false)
    }
    actualizar()
    consulta.addEventListener?.('change', actualizar)
    return () => consulta.removeEventListener?.('change', actualizar)
  }, [])

  const conNavegacion = secciones.length > 0

  function cerrarMenu(devolverFoco = true) {
    setMenuAbierto(false)
    if (devolverFoco) window.requestAnimationFrame(() => botonMenuRef.current?.focus())
  }

  useEffect(() => {
    if (!menuAbierto) return undefined
    const primerControl = panelRef.current?.querySelector('button, a')
    primerControl?.focus()
    function alPresionarTecla(evento) {
      if (evento.key === 'Escape') cerrarMenu()
      if (evento.key === 'Tab' && panelRef.current) {
        const controles = [...panelRef.current.querySelectorAll('button:not([disabled]), a[href]')]
        if (!controles.length) return
        const primero = controles[0]
        const ultimo = controles[controles.length - 1]
        if (evento.shiftKey && document.activeElement === primero) { evento.preventDefault(); ultimo.focus() }
        if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primero.focus() }
      }
    }
    document.addEventListener('keydown', alPresionarTecla)
    document.body.classList.add('drawer-open')
    return () => {
      document.removeEventListener('keydown', alPresionarTecla)
      document.body.classList.remove('drawer-open')
    }
  }, [menuAbierto])

  function seleccionar(id) {
    onSeleccionar(id)
    cerrarMenu(false)
  }

  return (
    <div className="app-shell">
      {conNavegacion && <Sidebar secciones={secciones} activa={activa} onSeleccionar={seleccionar} />}
      <div className="app-shell__main">
        <Header titulo={titulo} cuenta={cuenta} rol={rol} mostrarMenu={conNavegacion} menuAbierto={menuAbierto} onAlternarMenu={() => menuAbierto ? cerrarMenu() : setMenuAbierto(true)} botonMenuRef={botonMenuRef} onCerrarSesion={onCerrarSesion} />
        {esMobile && (
          <div className={`shell-drawer${menuAbierto ? ' shell-drawer--open' : ''}`} ref={panelRef} aria-hidden={!menuAbierto}>
            <button className="shell-drawer__overlay" type="button" onClick={() => cerrarMenu()} aria-label="Cerrar navegación" tabIndex={menuAbierto ? 0 : -1} />
            <div className="shell-drawer__panel"><Sidebar secciones={secciones} activa={activa} onSeleccionar={seleccionar} mobile abierto={menuAbierto} /></div>
          </div>
        )}
        <main className="app-content" id="contenido-principal">{children}</main>
      </div>
    </div>
  )
}
