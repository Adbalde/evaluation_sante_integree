// ──────────────────────────────────────────────────────────────────────────────
//  context/AuthContext.jsx — Contexte d'authentification
//  Ce fichier fournit à toute l'application :
//    - L'utilisateur connecté (user)
//    - La fonction de connexion (login)
//    - La fonction de déconnexion (logout)
//    - L'état de chargement (loading)
//
//  Utilisation dans un composant :
//    const { user, login, logout } = useAuth()
// ──────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect } from 'react'
import API from '../services/api'

// Crée le contexte — sera accessible depuis n'importe quel composant
const AuthContext = createContext(null)


// ══════════════════════════════════════════════════════════════
//  PROVIDER — Enveloppe l'application et partage l'état auth
// ══════════════════════════════════════════════════════════════

export function AuthProvider({ children }) {
  // Utilisateur connecté (null = pas connecté)
  const [user, setUser]       = useState(null)
  // True pendant la vérification initiale du token
  const [loading, setLoading] = useState(true)

  // ── Vérification du token au chargement de la page ────────
  // Si un token existe dans localStorage, vérifie qu'il est encore valide
  useEffect(() => {
    const token = localStorage.getItem('token')

    if (token) {
      // Demande le profil de l'utilisateur pour vérifier le token
      API.get('/users/me')
        .then(reponse => {
          setUser(reponse.data)  // Token valide → mémorise l'utilisateur
        })
        .catch(() => {
          // Token invalide ou expiré → nettoyage
          localStorage.removeItem('token')
          setUser(null)
        })
        .finally(() => {
          setLoading(false)  // Fin du chargement dans tous les cas
        })
    } else {
      // Pas de token → pas connecté
      setLoading(false)
    }
  }, [])

  // ── Fonction de connexion ─────────────────────────────────
  const login = async (nomUtilisateur, motDePasse) => {
    // FastAPI attend un formulaire (FormData), pas du JSON
    const formulaire = new FormData()
    formulaire.append('username', nomUtilisateur)
    formulaire.append('password', motDePasse)

    // Appelle l'endpoint de connexion
    const reponseToken = await API.post('/auth/token', formulaire)

    // Sauvegarde le token dans le navigateur (persistant entre les rechargements)
    localStorage.setItem('token', reponseToken.data.access_token)

    // Récupère le profil complet de l'utilisateur
    const reponseProfil = await API.get('/users/me')
    setUser(reponseProfil.data)

    return reponseProfil.data
  }

  // ── Fonction de déconnexion ───────────────────────────────
  const logout = () => {
    localStorage.removeItem('token')  // Supprime le token
    setUser(null)                      // Vide l'utilisateur en mémoire
    // L'intercepteur axios redirigera vers /login si besoin
  }

  // Partage l'état et les fonctions avec tous les composants enfants
  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}


// ══════════════════════════════════════════════════════════════
//  HOOK — Accède facilement au contexte depuis n'importe où
// ══════════════════════════════════════════════════════════════

/**
 * Hook pour utiliser l'authentification dans un composant.
 *
 * Exemple :
 *   function MonComposant() {
 *     const { user, logout } = useAuth()
 *     return <div>Bonjour {user.username}</div>
 *   }
 */
export function useAuth() {
  const contexte = useContext(AuthContext)

  if (!contexte) {
    throw new Error('useAuth doit être utilisé à l\'intérieur d\'un AuthProvider')
  }

  return contexte
}
