import { BarChart3, BookOpen, CalendarCheck2, ChartNoAxesColumnIncreasing, ClipboardCheck, Compass, FolderKanban, GraduationCap, History, Home, Search, UserRound, UsersRound } from 'lucide-react'
import BrandMark from './BrandMark.jsx'

const iconos = {
  inicio: Home, empleados: UsersRound, empleados_: UsersRound, 'mi-progreso': ChartNoAxesColumnIncreasing, proyectos: FolderKanban, 'mis-proyectos': FolderKanban, busqueda: Search, comparar: BarChart3, mentoria: Compass, brechas: ChartNoAxesColumnIncreasing, evaluaciones: ClipboardCheck, 'mis-capacitaciones': GraduationCap, 'mi-historial': History, 'mi-cuenta': UserRound,
}

export default function Sidebar({ secciones, activa, onSeleccionar, mobile = false, abierto = false }) {
  return (
    <aside className={`product-sidebar${mobile ? ' product-sidebar--mobile' : ''}${abierto ? ' sidebar--abierto' : ''}`} id={mobile ? 'navegacion-movil' : undefined}>
      <div className="product-sidebar__brand"><BrandMark inverse /><span>Desarrollo conectado</span></div>
      <div className="product-sidebar__nav"><p className="product-sidebar__label">Navegación</p><nav aria-label="Navegación principal">
        <ul>{secciones.map((seccion) => { const Icono = iconos[seccion.id] || BookOpen; const activo = seccion.id === activa; return <li key={seccion.id}><button type="button" className={`product-sidebar__link${activo ? ' product-sidebar__link--active' : ''}`} aria-current={activo ? 'page' : undefined} onClick={() => onSeleccionar(seccion.id)}><Icono aria-hidden="true" /><span>{seccion.titulo}</span>{activo && <i aria-hidden="true" />}</button></li> })}</ul>
      </nav></div>
      <div className="product-sidebar__context"><CalendarCheck2 aria-hidden="true" /><div><strong>Un paso a la vez</strong><span>La evidencia orienta tu desarrollo.</span></div></div>
    </aside>
  )
}
