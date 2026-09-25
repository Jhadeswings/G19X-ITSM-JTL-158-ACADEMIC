import { LogOut, Menu, UserRound } from 'lucide-react'
import { Button } from './ui/Button.jsx'

export default function Header({ titulo, cuenta, rol, mostrarMenu = false, menuAbierto = false, onAlternarMenu, onCerrarSesion, botonMenuRef }) {
  return (
    <header className="app-header">
      <div className="app-header__context">
        {mostrarMenu && <Button ref={botonMenuRef} variant="ghost" size="icon" className="app-header__menu" aria-label="Abrir navegación" aria-expanded={menuAbierto} aria-controls="navegacion-movil" onClick={onAlternarMenu}><Menu aria-hidden="true" /></Button>}
        <div><p className="app-header__eyebrow">Espacio de talento</p><h1 className="app-header__title">{titulo}</h1></div>
      </div>
      <div className="app-header__session">
        {cuenta ? <div className="account-chip"><UserRound aria-hidden="true" /><span><small>Sesión activa · {rol}</small><strong>{cuenta}</strong></span></div> : <span className="account-chip app-header__role"><UserRound aria-hidden="true" /><span><small>Sesión activa · {rol}</small><strong>Tu espacio</strong></span></span>}
        <Button variant="ghost" onClick={onCerrarSesion}><LogOut aria-hidden="true" /><span className="app-header__logout-text">Cerrar sesión</span></Button>
      </div>
    </header>
  )
}
