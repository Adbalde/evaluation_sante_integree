// ──────────────────────────────────────────────────────────────────────────────
//  services/offlineQueue.js — Système offline-first complet
//  Ce fichier gère tout ce qui se passe quand l'utilisateur est hors ligne :
//    1. Stockage local des actions dans IndexedDB (base de données du navigateur)
//    2. Détection automatique de la connexion/déconnexion
//    3. Synchronisation automatique dès retour de connexion
//    4. Retry automatique en cas d'échec avec délai exponentiel
//    5. Déduplication pour éviter les doublons
// ──────────────────────────────────────────────────────────────────────────────

import { openDB } from 'idb'

// ── Configuration ──────────────────────────────────────────────────────────
const NOM_BASE    = 'sante-integree-offline'  // Nom de la base IndexedDB
const VERSION_DB  = 1                          // Version (à incrémenter si on change la structure)
const STORE_QUEUE = 'sync-queue'               // Table pour les actions en attente
const STORE_CACHE = 'data-cache'               // Table pour le cache des données

const CONFIG = {
  MAX_TENTATIVES:     5,                          // Arrête après 5 échecs
  DELAIS_RETRY_MS:   [2000, 5000, 15000, 30000, 60000], // Délais croissants entre les tentatives
  INTERVAL_SYNC_MS:  30_000,                      // Vérifie la queue toutes les 30 secondes
  TIMEOUT_REQUETE_MS: 10_000,                     // Abandonne une requête après 10 secondes
}

// ── État global du système ─────────────────────────────────────────────────
const etat = {
  enCoursDeSynchro: false,        // True si une synchro est en cours
  estEnLigne:       navigator.onLine,
  ecouteurs:        new Set(),    // Fonctions abonnées aux changements d'état
  timerSynchro:     null,         // Timer de synchro périodique
  instanceAPI:      null,         // Référence à axios
}


// ══════════════════════════════════════════════════════════════
//  INITIALISATION D'INDEXEDDB
//  IndexedDB est la base de données intégrée au navigateur
//  Elle persiste même si on ferme l'onglet
// ══════════════════════════════════════════════════════════════

let promesseDB = null

function obtenirDB() {
  // Ne crée la connexion qu'une seule fois (singleton)
  if (!promesseDB) {
    promesseDB = openDB(NOM_BASE, VERSION_DB, {
      upgrade(db, ancienneVersion) {
        // Crée la table de la queue si elle n'existe pas encore
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          const store = db.createObjectStore(STORE_QUEUE, {
            keyPath:       'id',
            autoIncrement: true,   // ID auto-généré
          })
          // Index pour chercher par statut ou local_id
          store.createIndex('par_statut',   'status')
          store.createIndex('par_local_id', 'local_id')
          store.createIndex('par_date',     'created_at')
          console.log('[offline] Base IndexedDB créée : sync-queue')
        }

        // Crée la table du cache si elle n'existe pas
        if (!db.objectStoreNames.contains(STORE_CACHE)) {
          const storeCache = db.createObjectStore(STORE_CACHE, {
            keyPath: 'cle_cache',
          })
          storeCache.createIndex('par_type', 'type')
          console.log('[offline] Base IndexedDB créée : data-cache')
        }
      },

      // Si la DB est bloquée par un autre onglet
      blocked() {
        console.warn('[offline] IndexedDB bloquée — ferme les autres onglets')
      },
    })
  }
  return promesseDB
}


// ══════════════════════════════════════════════════════════════
//  QUEUE — Ajouter / lire / supprimer des actions
// ══════════════════════════════════════════════════════════════

/**
 * Ajoute une action dans la queue locale.
 * Appelé quand l'utilisateur est hors ligne et effectue une action.
 *
 * @param {Object} action - { method, url, data, local_id, label }
 * @returns {Promise<number>} L'ID de l'entrée créée
 *
 * Exemple :
 *   await enqueue({ method: 'post', url: '/patients', data: {...}, label: 'Créer patient' })
 */
export async function enqueue(action) {
  const db  = await obtenirDB()
  const now = new Date().toISOString()

  // Prépare l'entrée à stocker
  const entree = {
    method:      action.method.toLowerCase(),
    url:         action.url,
    data:        action.data     || null,
    local_id:    action.local_id || action.data?.local_id || null,
    label:       action.label    || _genererLabel(action),  // Description lisible
    status:      'pending',    // En attente d'envoi
    tentatives:  0,            // Nombre de tentatives effectuées
    last_error:  null,         // Dernière erreur rencontrée
    created_at:  now,
    updated_at:  now,
  }

  const id = await db.add(STORE_QUEUE, entree)
  console.log(`[offline] ✚ Action mise en queue : ${entree.method.toUpperCase()} ${entree.url} (id=${id})`)

  // Notifie les composants React abonnés (ex: OfflineBanner)
  _notifier()

  // Si on est en ligne, tente de synchro immédiatement
  if (etat.estEnLigne && etat.instanceAPI) {
    setTimeout(() => synchroniser(etat.instanceAPI), 500)
  }

  return id
}

/**
 * Récupère tous les éléments de la queue (tous statuts confondus).
 */
export async function getQueue() {
  const db = await obtenirDB()
  return db.getAll(STORE_QUEUE)
}

/**
 * Récupère seulement les éléments en attente ou en échec.
 * Ce sont ceux qui doivent encore être synchronisés.
 */
export async function getElementsEnAttente() {
  const db    = await obtenirDB()
  const tx    = db.transaction(STORE_QUEUE, 'readonly')
  const index = tx.store.index('par_statut')

  // Récupère les "pending" et les "failed" (qui peuvent être retentés)
  const [enAttente, enEchec] = await Promise.all([
    index.getAll('pending'),
    index.getAll('failed'),
  ])

  // Trie par date de création (plus ancien en premier)
  return [...enAttente, ...enEchec].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  )
}

/**
 * Retourne le nombre d'éléments en attente de synchro.
 */
export async function getQueueCount() {
  const elements = await getElementsEnAttente()
  return elements.length
}

/**
 * Supprime un élément de la queue (après synchro réussie).
 */
async function supprimerDeLaQueue(id) {
  const db = await obtenirDB()
  await db.delete(STORE_QUEUE, id)
  _notifier()
}

/**
 * Met à jour le statut et les infos d'un élément de la queue.
 */
async function mettreAJourEntree(id, modifications) {
  const db     = await obtenirDB()
  const entree = await db.get(STORE_QUEUE, id)
  if (!entree) return

  await db.put(STORE_QUEUE, {
    ...entree,
    ...modifications,
    updated_at: new Date().toISOString(),
  })
  _notifier()
}

/**
 * Vide entièrement la queue (utile pour les tests).
 */
export async function viderQueue() {
  const db = await obtenirDB()
  await db.clear(STORE_QUEUE)
  _notifier()
  console.log('[offline] Queue entièrement vidée')
}


// ══════════════════════════════════════════════════════════════
//  CACHE LOCAL — Stocke les données pour l'accès offline
// ══════════════════════════════════════════════════════════════

/**
 * Sauvegarde des données dans le cache local.
 * Utile pour afficher les patients même sans connexion.
 *
 * @param {string} cle   - Identifiant unique ex: 'liste_patients', 'patient_42'
 * @param {*}      data  - Données à stocker
 * @param {string} type  - Catégorie : 'patients' | 'consultations' | 'stats'
 */
export async function mettreEnCache(cle, data, type = 'general') {
  const db = await obtenirDB()
  await db.put(STORE_CACHE, {
    cle_cache:  cle,
    type,
    data,
    updated_at: new Date().toISOString(),
  })
}

/**
 * Récupère des données du cache local.
 * Retourne null si la clé n'existe pas.
 */
export async function lireCache(cle) {
  try {
    const db     = await obtenirDB()
    const entree = await db.get(STORE_CACHE, cle)
    return entree ? entree.data : null
  } catch {
    return null
  }
}

/**
 * Supprime une entrée du cache.
 */
export async function supprimerCache(cle) {
  const db = await obtenirDB()
  await db.delete(STORE_CACHE, cle)
}


// ══════════════════════════════════════════════════════════════
//  SYNCHRONISATION — Envoie les actions en attente au serveur
// ══════════════════════════════════════════════════════════════

/**
 * Synchronise toutes les actions en attente avec le serveur.
 * Appelée automatiquement au retour de connexion et toutes les 30s.
 *
 * @param {Function} instanceAPI - La fonction axios à utiliser pour les requêtes
 */
export async function synchroniser(instanceAPI) {
  // Évite deux synchros simultanées
  if (etat.enCoursDeSynchro) {
    console.log('[offline] Synchro déjà en cours — ignoré')
    return
  }

  // N'essaie pas si on est hors ligne
  if (!navigator.onLine) {
    console.log('[offline] Hors ligne — synchro annulée')
    return
  }

  etat.enCoursDeSynchro = true
  etat.instanceAPI      = instanceAPI
  _notifier()

  const elements = await getElementsEnAttente()

  if (elements.length === 0) {
    etat.enCoursDeSynchro = false
    _notifier()
    return
  }

  console.log(`[offline] 🔄 Synchro de ${elements.length} action(s) en attente…`)

  let reussites = 0
  let echecs    = 0

  // Traite chaque action une par une
  for (const element of elements) {
    const succes = await _synchroniserUnElement(element, instanceAPI)
    succes ? reussites++ : echecs++
  }

  etat.enCoursDeSynchro = false
  _notifier()

  console.log(`[offline] ✅ Synchro terminée — ${reussites} succès, ${echecs} échec(s)`)
}

// Alias pour compatibilité
export const syncQueue = synchroniser

/**
 * Tente de synchroniser un seul élément de la queue.
 * @returns {boolean} true si succès, false si échec
 */
async function _synchroniserUnElement(element, instanceAPI) {
  // Marque l'élément comme "en cours d'envoi"
  await mettreAJourEntree(element.id, { status: 'syncing' })

  try {
    // Envoie la requête avec un timeout
    await Promise.race([
      instanceAPI({
        method: element.method,
        url:    element.url,
        data:   element.data,
      }),
      _timeout(CONFIG.TIMEOUT_REQUETE_MS),
    ])

    // ✅ Succès — supprime de la queue
    await supprimerDeLaQueue(element.id)
    console.log(`[offline] ✓ Synchronisé : ${element.method.toUpperCase()} ${element.url}`)
    return true

  } catch (erreur) {
    const nouvelleTentative = element.tentatives + 1
    const codeHTTP          = erreur?.response?.status

    // 409 Conflict = doublon côté serveur → supprime sans retry
    if (codeHTTP === 409) {
      console.log(`[offline] ↩ Doublon ignoré : ${element.url}`)
      await supprimerDeLaQueue(element.id)
      return true
    }

    // 422 = données invalides → inutile de retenter
    if (codeHTTP === 422) {
      console.error(`[offline] ✗ Données invalides : ${element.url} — abandon`)
      await mettreAJourEntree(element.id, {
        status:     'failed',
        tentatives: nouvelleTentative,
        last_error: 'Données invalides (HTTP 422)',
      })
      return false
    }

    // Trop de tentatives → abandon définitif
    if (nouvelleTentative >= CONFIG.MAX_TENTATIVES) {
      console.error(`[offline] ✗ Abandon après ${CONFIG.MAX_TENTATIVES} tentatives : ${element.url}`)
      await mettreAJourEntree(element.id, {
        status:     'failed',
        tentatives: nouvelleTentative,
        last_error: _extraireMessageErreur(erreur),
      })
      return false
    }

    // Programme un retry avec délai croissant
    const delai = CONFIG.DELAIS_RETRY_MS[nouvelleTentative - 1] || 60_000
    console.warn(
      `[offline] ⚠ Échec ${element.url} — ` +
      `tentative ${nouvelleTentative}/${CONFIG.MAX_TENTATIVES} dans ${delai / 1000}s`
    )

    await mettreAJourEntree(element.id, {
      status:     'pending',
      tentatives: nouvelleTentative,
      last_error: _extraireMessageErreur(erreur),
    })

    // Retry différé
    setTimeout(() => {
      if (navigator.onLine && etat.instanceAPI) {
        _synchroniserUnElement({ ...element, tentatives: nouvelleTentative }, etat.instanceAPI)
      }
    }, delai)

    return false
  }
}


// ══════════════════════════════════════════════════════════════
//  INITIALISATION ET ÉCOUTE DU RÉSEAU
//  À appeler une seule fois au démarrage de l'application
// ══════════════════════════════════════════════════════════════

/**
 * Initialise tout le système offline-first.
 * À appeler dans App.jsx avec useEffect au montage.
 *
 * @param {Function} instanceAPI - La fonction axios (ex: (config) => API(config))
 */
export function initOfflineSync(instanceAPI) {
  etat.instanceAPI = instanceAPI

  // ── Écoute les événements réseau du navigateur ────────────
  window.addEventListener('online', async () => {
    console.log('[offline] 🌐 Connexion Internet rétablie')
    etat.estEnLigne = true
    _notifier()

    // Petite pause pour laisser la connexion s'établir
    await _attendre(1500)
    synchroniser(instanceAPI)
  })

  window.addEventListener('offline', () => {
    console.log('[offline] 📵 Connexion Internet perdue')
    etat.estEnLigne = false
    _notifier()
  })

  // ── Synchro périodique toutes les 30 secondes ─────────────
  if (etat.timerSynchro) clearInterval(etat.timerSynchro)

  etat.timerSynchro = setInterval(() => {
    if (navigator.onLine && !etat.enCoursDeSynchro) {
      getElementsEnAttente().then(elements => {
        if (elements.length > 0) {
          console.log(`[offline] ⏱ Synchro périodique — ${elements.length} action(s) en attente`)
          synchroniser(instanceAPI)
        }
      })
    }
  }, CONFIG.INTERVAL_SYNC_MS)

  // ── Synchro quand l'utilisateur revient sur l'onglet ──────
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      getElementsEnAttente().then(elements => {
        if (elements.length > 0) synchroniser(instanceAPI)
      })
    }
  })

  // ── Synchro initiale au démarrage ─────────────────────────
  // Gère le cas où des actions étaient en attente avant le rechargement
  if (navigator.onLine) {
    setTimeout(() => synchroniser(instanceAPI), 2000)
  }

  console.log('[offline] ✅ Système offline-first initialisé')
}

/**
 * Arrête le timer de synchro (utile pour les tests).
 */
export function arreterSync() {
  if (etat.timerSynchro) {
    clearInterval(etat.timerSynchro)
    etat.timerSynchro = null
  }
}


// ══════════════════════════════════════════════════════════════
//  ABONNEMENTS — Les composants React écoutent les changements
// ══════════════════════════════════════════════════════════════

/**
 * S'abonne aux changements d'état offline/synchro.
 * Le callback est appelé à chaque changement avec { isOnline, isSyncing, queueCount }.
 *
 * @param {Function} callback - Fonction appelée à chaque changement
 * @returns {Function} Fonction de désabonnement (à appeler dans useEffect cleanup)
 *
 * Exemple dans un composant React :
 *   useEffect(() => {
 *     const desabonner = subscribeToQueue(({ isOnline, queueCount }) => {
 *       setEstHorsLigne(!isOnline)
 *       setNbEnAttente(queueCount)
 *     })
 *     return desabonner  // Nettoyage au démontage du composant
 *   }, [])
 */
export function subscribeToQueue(callback) {
  etat.ecouteurs.add(callback)

  // Appel immédiat pour initialiser l'état du composant
  getQueueCount().then(nombre => {
    callback({
      isOnline:   navigator.onLine,
      isSyncing:  etat.enCoursDeSynchro,
      queueCount: nombre,
    })
  })

  // Retourne la fonction de désabonnement
  return () => etat.ecouteurs.delete(callback)
}


// ══════════════════════════════════════════════════════════════
//  FONCTIONS UTILITAIRES PRIVÉES (usage interne uniquement)
// ══════════════════════════════════════════════════════════════

/** Notifie tous les abonnés de l'état actuel */
async function _notifier() {
  if (etat.ecouteurs.size === 0) return

  const nombre  = await getQueueCount()
  const payload = {
    isOnline:   navigator.onLine,
    isSyncing:  etat.enCoursDeSynchro,
    queueCount: nombre,
  }

  etat.ecouteurs.forEach(callback => {
    try {
      callback(payload)
    } catch (e) {
      console.error('[offline] Erreur dans un écouteur :', e)
    }
  })
}

/** Génère un label lisible depuis les données de l'action */
function _genererLabel(action) {
  const methode = action.method.toUpperCase()
  const parties = action.url.split('/').filter(Boolean)
  const type    = parties[0] || 'ressource'

  const labels = {
    POST:   `Créer ${type}`,
    PUT:    `Modifier ${type}`,
    PATCH:  `Modifier ${type}`,
    DELETE: `Supprimer ${type}`,
  }

  return labels[methode] || `${methode} ${action.url}`
}

/** Extrait un message lisible depuis une erreur axios */
function _extraireMessageErreur(erreur) {
  if (erreur?.response?.data?.detail)  return erreur.response.data.detail
  if (erreur?.response?.data?.message) return erreur.response.data.message
  if (erreur?.message)                 return erreur.message
  return 'Erreur inconnue'
}

/** Crée une promesse qui rejette après un délai (pour le timeout) */
function _timeout(ms) {
  return new Promise((_, rejeter) =>
    setTimeout(() => rejeter(new Error(`Timeout : pas de réponse après ${ms}ms`)), ms)
  )
}

/** Crée une promesse qui résout après un délai (pause) */
function _attendre(ms) {
  return new Promise(resoudre => setTimeout(resoudre, ms))
}
