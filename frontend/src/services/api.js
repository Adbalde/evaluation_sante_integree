// ──────────────────────────────────────────────────────────────────────────────
//  services/api.js — Client HTTP pour appeler le backend FastAPI
//  Ce fichier crée une instance axios configurée avec :
//    - L'URL de base de l'API
//    - L'ajout automatique du token JWT dans chaque requête
//    - La redirection vers /login si le token expire
// ──────────────────────────────────────────────────────────────────────────────

import axios from 'axios'

// URL de base de l'API — vient de la variable d'environnement Vite
// En développement : http://localhost:8000 (via proxy Vite)
// En production :    /api (Nginx redirige vers le backend)
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 10000,  // Abandonne la requête après 10 secondes
})


// ── Intercepteur de REQUÊTE ────────────────────────────────────────────────
// S'exécute avant chaque requête pour ajouter le token JWT
API.interceptors.request.use(
  (config) => {
    // Récupère le token JWT stocké dans le navigateur
    const token = localStorage.getItem('token')

    if (token) {
      // Ajoute le token dans le header Authorization
      // Format attendu par FastAPI : "Bearer eyJ..."
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (erreur) => {
    // En cas d'erreur lors de la préparation de la requête
    return Promise.reject(erreur)
  }
)


// ── Intercepteur de RÉPONSE ────────────────────────────────────────────────
// S'exécute après chaque réponse pour gérer les erreurs globalement
API.interceptors.response.use(
  (reponse) => {
    // Réponse normale (code 2xx) — retourne directement
    return reponse
  },
  (erreur) => {
    if (erreur.response) {
      const code = erreur.response.status

      // Token expiré ou invalide → déconnexion automatique
      if (code === 401) {
        localStorage.removeItem('token')       // Supprime le token invalide
        window.location.href = '/login'        // Redirige vers la connexion
        return Promise.reject(erreur)
      }

      // Accès interdit → affiche un message (géré dans chaque composant)
      if (code === 403) {
        console.warn('[API] Accès refusé — droits insuffisants')
      }

      // Erreur serveur → log pour le débogage
      if (code >= 500) {
        console.error('[API] Erreur serveur :', erreur.response.data)
      }
    } else if (erreur.request) {
      // La requête a été envoyée mais pas de réponse (réseau coupé)
      console.warn('[API] Pas de réponse du serveur — vérifiez la connexion')
    }

    return Promise.reject(erreur)
  }
)

export default API
