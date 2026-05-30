// ──────────────────────────────────────────────────────────────────────────────
//  components/Layout.jsx — Structure principale de l'application
//  Ce composant affiche :
//    - La barre de navigation latérale (sidebar) avec les liens
//    - Le bandeau offline en haut si nécessaire
//    - Le contenu de la page active (via children)
//    - Le nom et le bouton de déconnexion en bas de la sidebar
// ──────────────────────────────────────────────────────────────────────────────

import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import OfflineBanner from './OfflineBanner'

// Éléments du menu de navigation
const ELEMENTS_MENU = [
  { chemin: '/',             label: 'Tableau de bord', emoji: '📊' },
  { chemin: '/patients',     label: 'Patients',        emoji: '👥' },
  { chemin: '/consultation', label: 'Consultation',    emoji: '📋' },
]

export default function Layout({ children }) {
  const { pathname } = useLocation()    // Chemin actuel de l'URL
  const { user, logout } = useAuth()   // Utilisateur connecté et fonction logout
  const navigate = useNavigate()

  const gererDeconnexion = () => {
    logout()
    navigate('/login')
  }

  return (
    <div style={{
      display:  'flex',
      height:   '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: '#f8f9fa',
    }}>

      {/* ── Barre de navigation latérale ───────────────────── */}
      <aside style={{
        width:        210,
        background:   '#fff',
        borderRight:  '1px solid #eee',
        display:      'flex',
        flexDirection:'column',
        flexShrink:   0,
      }}>

        {/* Logo et nom de l'application */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid #eee' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, background: '#E1F5EE',
              borderRadius: 8, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 18,
            }}>
              🏥
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#0F6E56' }}>
                SantéIntégrée
              </div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>
                Système e-santé
              </div>
            </div>
          </div>
        </div>

        {/* Liens de navigation */}
        <nav style={{ padding: '12px 8px', flex: 1 }}>
          {ELEMENTS_MENU.map(item => {
            const estActif = pathname === item.chemin

            return (
              <Link key={item.chemin} to={item.chemin} style={{ textDecoration: 'none' }}>
                <div style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          10,
                  padding:      '9px 12px',
                  borderRadius: 8,
                  marginBottom: 2,
                  fontSize:     13,
                  // Style différent si c'est la page active
                  background: estActif ? '#E1F5EE' : 'transparent',
                  color:      estActif ? '#0F6E56' : '#666',
                  fontWeight: estActif ? 500 : 400,
                  transition: 'background 0.15s',
                }}>
                  <span>{item.emoji}</span>
                  <span>{item.label}</span>
                </div>
              </Link>
            )
          })}
        </nav>

        {/* Profil et déconnexion */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #eee' }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
            👤 {user?.username || 'Utilisateur'}
            <span style={{
              marginLeft: 6, fontSize: 10,
              background: user?.role === 'admin' ? '#FAEEDA' : '#E1F5EE',
              color: user?.role === 'admin' ? '#633806' : '#0F6E56',
              padding: '1px 6px', borderRadius: 10,
            }}>
              {user?.role || 'agent'}
            </span>
          </div>
          <button
            onClick={gererDeconnexion}
            style={{
              width:        '100%',
              padding:      '7px 12px',
              background:   '#fff',
              border:       '1px solid #eee',
              borderRadius: 8,
              fontSize:     12,
              cursor:       'pointer',
              color:        '#666',
              textAlign:    'left',
              display:      'flex',
              alignItems:   'center',
              gap:          6,
            }}
          >
            🚪 Se déconnecter
          </button>
        </div>
      </aside>

      {/* ── Zone de contenu principale ─────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Bandeau offline (visible seulement si hors ligne ou synchro en cours) */}
        <OfflineBanner />

        {/* Contenu de la page active */}
        <main style={{
          flex:       1,
          overflowY: 'auto',
          padding:   24,
        }}>
          {children}
        </main>
      </div>
    </div>
  )
}
