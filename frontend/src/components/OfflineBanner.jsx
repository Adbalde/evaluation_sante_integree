// ──────────────────────────────────────────────────────────────────────────────
//  components/OfflineBanner.jsx — Bandeau d'état offline/synchro
//  Affiché automatiquement quand :
//    - L'utilisateur perd la connexion Internet
//    - Des actions sont en attente de synchronisation
//  Disparaît automatiquement quand tout est synchronisé
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { subscribeToQueue, synchroniser } from '../services/offlineQueue'
import API from '../services/api'

export default function OfflineBanner() {
  // État local du composant
  const [etatSync, setEtatSync] = useState({
    isOnline:   navigator.onLine,   // En ligne ou hors ligne ?
    isSyncing:  false,              // Synchro en cours ?
    queueCount: 0,                  // Nombre d'actions en attente
  })

  // S'abonne aux changements d'état offline
  useEffect(() => {
    // subscribeToQueue retourne une fonction de désabonnement
    const desabonner = subscribeToQueue(setEtatSync)

    // Nettoyage : se désabonne quand le composant est démonté
    return desabonner
  }, [])

  const { isOnline, isSyncing, queueCount } = etatSync

  // Ne rien afficher si tout va bien (en ligne et rien en attente)
  if (isOnline && queueCount === 0) return null

  // Lance une synchro manuelle quand l'utilisateur clique sur le bouton
  const synchroManuelle = () => synchroniser((config) => API(config))

  // Détermine la couleur selon l'état
  const couleurFond    = isOnline ? '#E1F5EE' : '#FAEEDA'
  const couleurBordure = isOnline ? '#1D9E75' : '#EF9F27'
  const couleurTexte   = isOnline ? '#085041' : '#633806'
  const emoji          = !isOnline ? '⚠️' : isSyncing ? '🔄' : '✅'

  return (
    <div style={{
      background:   couleurFond,
      borderBottom: `1px solid ${couleurBordure}`,
      padding:      '10px 20px',
      display:      'flex',
      alignItems:   'center',
      gap:          12,
      fontSize:     13,
      color:        couleurTexte,
    }}>
      {/* Icône d'état */}
      <span style={{ fontSize: 18 }}>{emoji}</span>

      {/* Message principal */}
      <span style={{ flex: 1 }}>
        {!isOnline && <strong>Mode hors ligne — </strong>}
        {isSyncing && <strong>Synchronisation en cours… </strong>}
        {queueCount > 0 && (
          <>
            <strong>{queueCount}</strong>{' '}
            action{queueCount > 1 ? 's' : ''} en attente de synchronisation
          </>
        )}
        {isOnline && !isSyncing && queueCount === 0 && (
          <span>Tout est synchronisé</span>
        )}
      </span>

      {/* Badge avec le nombre d'actions en attente */}
      {queueCount > 0 && (
        <span style={{
          background:   isOnline ? '#1D9E75' : '#EF9F27',
          color:        '#fff',
          borderRadius: 20,
          padding:      '2px 10px',
          fontSize:     11,
          fontWeight:   600,
        }}>
          {queueCount} en attente
        </span>
      )}

      {/* Bouton de synchro manuelle (visible si en ligne et des actions en attente) */}
      {isOnline && queueCount > 0 && !isSyncing && (
        <button
          onClick={synchroManuelle}
          style={{
            padding:      '5px 14px',
            background:   '#1D9E75',
            color:        '#fff',
            border:       'none',
            borderRadius: 6,
            fontSize:     12,
            cursor:       'pointer',
            fontWeight:   500,
          }}
        >
          Synchroniser maintenant
        </button>
      )}
    </div>
  )
}
