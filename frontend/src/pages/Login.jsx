// ──────────────────────────────────────────────────────────────────────────────
//  pages/Login.jsx — Page de connexion
//  Formulaire de connexion avec gestion des erreurs
// ──────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [erreur,   setErreur]   = useState('')
  const [chargement, setChargement] = useState(false)

  const { login }  = useAuth()
  const navigate   = useNavigate()

  // Gère la soumission du formulaire
  const gererSoumission = async (e) => {
    e.preventDefault()        // Empêche le rechargement de la page
    setChargement(true)
    setErreur('')

    try {
      await login(username, password)
      navigate('/')             // Redirige vers le dashboard après connexion
    } catch (err) {
      // Affiche le message d'erreur retourné par le serveur
      const messageErreur = err?.response?.data?.detail || 'Identifiants incorrects'
      setErreur(messageErreur)
    } finally {
      setChargement(false)
    }
  }

  return (
    <div style={{
      minHeight:      '100vh',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      background:     'linear-gradient(135deg, #E1F5EE 0%, #f0f4f8 100%)',
    }}>
      {/* Carte de connexion */}
      <div style={{
        background:   '#fff',
        borderRadius: 14,
        padding:      40,
        width:        380,
        boxShadow:    '0 4px 24px rgba(0,0,0,0.08)',
      }}>

        {/* En-tête */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏥</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0F6E56', marginBottom: 6 }}>
            SantéIntégrée
          </h1>
          <p style={{ fontSize: 13, color: '#999' }}>
            Connectez-vous à votre espace de travail
          </p>
        </div>

        {/* Formulaire */}
        <form onSubmit={gererSoumission}>

          {/* Champ nom d'utilisateur */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 6, fontWeight: 500 }}>
              Nom d'utilisateur
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoFocus
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid #ddd', borderRadius: 8,
                fontSize: 14, outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#1D9E75'}
              onBlur={e  => e.target.style.borderColor = '#ddd'}
            />
          </div>

          {/* Champ mot de passe */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 6, fontWeight: 500 }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid #ddd', borderRadius: 8,
                fontSize: 14, outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#1D9E75'}
              onBlur={e  => e.target.style.borderColor = '#ddd'}
            />
          </div>

          {/* Message d'erreur */}
          {erreur && (
            <div style={{
              background: '#FCEBEB', color: '#791F1F',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 13, marginBottom: 20,
              border: '1px solid #F5C6C6',
            }}>
              ❌ {erreur}
            </div>
          )}

          {/* Bouton de connexion */}
          <button
            type="submit"
            disabled={chargement}
            style={{
              width: '100%', padding: '12px',
              background:   chargement ? '#9FE1CB' : '#0F6E56',
              color:        '#fff',
              border:       'none',
              borderRadius: 8,
              fontSize:     14,
              fontWeight:   500,
              cursor:       chargement ? 'not-allowed' : 'pointer',
              transition:   'background 0.2s',
            }}
          >
            {chargement ? '⏳ Connexion en cours…' : '🔐 Se connecter'}
          </button>
        </form>

        {/* Aide */}
        <p style={{ textAlign: 'center', fontSize: 12, color: '#bbb', marginTop: 20 }}>
          Comptes test : admin / Admin1234! • agent / Agent1234!
        </p>
      </div>
    </div>
  )
}
