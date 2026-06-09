import axios from 'axios'
import { enqueue, generateUUID } from './offlineQueue'


/*
//  Générateur UUID compatible HTTP et HTTPS 
function generateUUID() {
  // crypto.randomUUID() ne fonctionne qu'en HTTPS
  // Cette fonction fonctionne dans tous les contextes
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback manuel pour HTTP
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
*/





//  Instance axios configurée
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 10000,
})


//  INTERCEPTEUR REQUÊTE — Ajoute le token JWT à chaque appel

API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (erreur) => Promise.reject(erreur)
)


//  INTERCEPTEUR RÉPONSE — Gère le mode offline et les erreurs HTTP

API.interceptors.response.use(

  // ✅ Réponse normale (2xx) — retourne directement
  (reponse) => reponse,

  async (erreur) => {
    const config  = erreur.config || {}
    const methode = (config.method || '').toLowerCase()

    //  MODE OFFLINE 
    // Pas de réponse du serveur ET navigateur hors ligne
    if (!erreur.response && !navigator.onLine) {

      // Seules les actions qui modifient des données sont mises en queue
      // Les GET (lecture) sont ignorés — on affiche les données du cache
      const estMutation = ['post', 'put', 'patch', 'delete'].includes(methode)

      if (estMutation) {
        // Récupère les données envoyées dans la requête
        let data = {}
        try {
          data = typeof config.data === 'string'
            ? JSON.parse(config.data)
            : config.data || {}
        } catch {
          data = {}
        }

        // Génère un identifiant unique pour éviter les doublons
        // lors de la synchronisation (le backend vérifie ce local_id)
        if (!data.local_id) {
          data.local_id = generateUUID()
        }

        // Sauvegarde l'action dans IndexedDB
        await enqueue({
          method:   methode,
          url:      config.url,
          data,
          local_id: data.local_id,
          label:    _genererLabel(methode, config.url),
        })

        console.log(`[API] 📥 Sauvegardé offline : ${methode.toUpperCase()} ${config.url}`)

        // Retourne une réponse fictive pour ne pas crasher le composant React
        // Le composant peut vérifier response.offline === true si besoin
        return Promise.resolve({
          data:    { ...data, offline: true, local_id: data.local_id },
          status:  202,
          offline: true,
        })
      }

      // GET hors ligne — retourne null (le composant affiche le cache local)
      console.warn(`[API] Hors ligne — GET ${config.url} ignoré`)
      return Promise.resolve({ data: null, offline: true })
    }

    // ERREUR RÉSEAU EN LIGNE 
    // Requête envoyée mais pas de réponse (serveur down, timeout…)
    if (!erreur.response) {
      console.warn('[API] Pas de réponse — réseau instable ou serveur inaccessible')
      return Promise.reject(erreur)
    }

    // ERREURS HTTP
    const code = erreur.response.status

    // 401 — Token expiré ou invalide → déconnexion automatique
    if (code === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
      return Promise.reject(erreur)
    }

    // 403 — Accès interdit
    if (code === 403) {
      console.warn('[API] Accès refusé — droits insuffisants')
    }

    // 500+ — Erreur serveur
    if (code >= 500) {
      console.error('[API] Erreur serveur :', erreur.response.data)
    }

    return Promise.reject(erreur)
  }
)


//  UTILITAIRE — Génère un label lisible pour la queue offline

function _genererLabel(methode, url) {
  const partie = (url || '').split('/').filter(Boolean)[0] || 'ressource'
  const labels = {
    post:   `Créer ${partie}`,
    put:    `Modifier ${partie}`,
    patch:  `Modifier ${partie}`,
    delete: `Supprimer ${partie}`,
  }
  return labels[methode] || `${methode.toUpperCase()} ${url}`
}


export default API

