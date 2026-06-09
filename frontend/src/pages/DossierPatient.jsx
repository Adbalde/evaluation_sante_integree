//  pages/DossierPatient.jsx — Dossier médical complet d'un patient
//  Fonctionnalités :
//    - Fiche identité du patient (colonne gauche)
//    - Timeline des consultations dépliables (colonne droite)
//    - Onglet "Évolution" avec mini-graphiques SVG tension/glycémie
//    - Modal de modification du patient
//    - Bouton "Nouvelle consultation" pré-rempli

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import API from '../services/api'
import { enqueue } from '../services/offlineQueue'

//  UTILITAIRES

/** Formate une date ISO en "12 jan. 2025" */
const formaterDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

/** Calcule l'âge à partir d'une date de naissance */
const calculerAge = (dateNaissance) => {
  if (!dateNaissance) return null
  const diff = Date.now() - new Date(dateNaissance).getTime()
  return Math.floor(diff / 31_557_600_000)  // Millisecondes dans une année
}

/** Génère les 2 initiales d'un nom complet */
const initiales = (nom = '') =>
  nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

/** Couleur de badge selon la maladie */
const propsBadge = (maladie = '') => {
  if (maladie.includes('Hypertension') && maladie.includes('Diabète'))
    return { bg: '#FCEBEB', color: '#791F1F', emoji: '⚠️' }
  if (maladie.includes('Diabète'))
    return { bg: '#FAEEDA', color: '#633806', emoji: '🩸' }
  if (maladie.includes('Hypertension'))
    return { bg: '#FCEBEB', color: '#791F1F', emoji: '❤️' }
  return { bg: '#EAF3DE', color: '#27500A', emoji: '✅' }
}

/** Couleur et label du niveau de tension */
const niveauTension = (tension) => {
  if (!tension) return null
  const sys = parseInt(tension.split('/')[0])
  if (sys >= 140) return { label: 'Élevée',  bg: '#FCEBEB', color: '#791F1F' }
  if (sys >= 130) return { label: 'Limite',  bg: '#FAEEDA', color: '#633806' }
  return            { label: 'Normale', bg: '#EAF3DE', color: '#27500A' }
}

/** Couleur et label du niveau de glycémie */
const niveauGlycemie = (gly) => {
  if (!gly) return null
  if (gly >= 2.0)  return { label: 'Élevée',  bg: '#FCEBEB', color: '#791F1F' }
  if (gly >= 1.26) return { label: 'Limite',  bg: '#FAEEDA', color: '#633806' }
  return             { label: 'Normale', bg: '#EAF3DE', color: '#27500A' }
}

const styleInput = {
  padding: '8px 10px', border: '1px solid #ddd',
  borderRadius: 8, fontSize: 13, width: '100%', outline: 'none',
}


//  MINI-GRAPHIQUE EN LIGNE SVG
//  Trace une courbe simple à partir d'une liste de valeurs

function MiniCourbe({ valeurs, couleur = '#0F6E56', unite = '' }) {
  // Besoin d'au moins 2 points pour tracer une courbe
  if (!valeurs || valeurs.length < 2) {
    return (
      <span style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>
        (pas assez de données)
      </span>
    )
  }

  const L = 180, H = 50  // Largeur et hauteur du SVG
  const min = Math.min(...valeurs)
  const max = Math.max(...valeurs)
  const ecart = max - min || 1  // Évite la division par zéro

  // Calcule les coordonnées de chaque point
  const points = valeurs.map((v, i) => ({
    x: (i / (valeurs.length - 1)) * (L - 16) + 8,
    y: H - 8 - ((v - min) / ecart) * (H - 16),
  }))

  // Construit la chaîne SVG du chemin
  const chemin = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')

  const derniere = valeurs[valeurs.length - 1]
  const tendance = valeurs.length >= 2
    ? valeurs[valeurs.length - 1] > valeurs[valeurs.length - 2] ? '↑' : '↓'
    : ''

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width={L} height={H} viewBox={`0 0 ${L} ${H}`}
        style={{ background: '#f8fffe', borderRadius: 8 }}>
        {/* Ligne de la courbe */}
        <path d={chemin} stroke={couleur} strokeWidth="2"
          fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* Points sur la courbe */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 4 : 2.5}
            fill={i === points.length - 1 ? couleur : '#fff'}
            stroke={couleur} strokeWidth="1.5" />
        ))}
      </svg>
      {/* Valeur la plus récente */}
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#111' }}>
          {derniere} {unite}
        </div>
        <div style={{ fontSize: 11, color: couleur }}>
          {tendance} Dernière valeur
        </div>
      </div>
    </div>
  )
}


//  MODAL DE MODIFICATION DU PATIENT

function ModalModificationPatient({ patient, onFermer, onSauvegarde }) {
  // Initialise le formulaire avec les données existantes
  const [form, setForm] = useState({
    prenom:         patient.prenom         || '',
    nom:            patient.nom            || '',
    sexe:           patient.sexe           || 'Masculin',
    date_naissance: patient.date_naissance || '',
    telephone:      patient.telephone      || '',
    localite:       patient.localite       || '',
    adresse:        patient.adresse        || '',
    maladie:        patient.maladie        || 'Diabète',
    tension:        patient.tension        || '',
    glycemie:       patient.glycemie       || '',
    poids:          patient.poids          || '',
  })
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur,         setErreur]         = useState('')

  const set = (cle, val) => setForm(f => ({ ...f, [cle]: val }))

  const gererSoumission = async (e) => {
    e.preventDefault()
    setEnregistrement(true); setErreur('')
    try {
      if (navigator.onLine) {
        await API.put(`/patients/${patient.id}`, form)
      } else {
        // Hors ligne : met la modification en queue
        await enqueue({
          method: 'put',
          url:    `/patients/${patient.id}`,
          data:   form,
          label:  `Modifier patient — ${form.prenom} ${form.nom}`,
        })
      }
      onSauvegarde()
    } catch {
      setErreur('Erreur lors de la sauvegarde. Réessayez.')
    } finally {
      setEnregistrement(false)
    }
  }

  // Composant champ texte réutilisable dans ce modal
  const Champ = ({ label, cle, type = 'text', placeholder = '' }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>{label}</label>
      <input type={type} value={form[cle] || ''} onChange={e => set(cle, e.target.value)}
        placeholder={placeholder} style={styleInput} />
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.40)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, width: 540,
        maxHeight: '90vh', overflowY: 'auto', padding: 28,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        {/* En-tête du modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 22 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Modifier le dossier patient</h2>
          <button onClick={onFermer}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>
            ×
          </button>
        </div>

        <form onSubmit={gererSoumission}>
          {/* Section identité */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56', textTransform: 'uppercase',
            letterSpacing: '.05em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
            Identité
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <Champ label="Prénom *"         cle="prenom"         placeholder="Mariama" />
            <Champ label="Nom *"            cle="nom"            placeholder="Kouyaté" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Sexe</label>
              <select value={form.sexe} onChange={e => set('sexe', e.target.value)} style={styleInput}>
                <option>Masculin</option>
                <option>Féminin</option>
              </select>
            </div>
            <Champ label="Date de naissance" cle="date_naissance" type="date" />
            <Champ label="Téléphone"  cle="telephone" placeholder="+224 6xx xxx xxx" />
            <Champ label="Localité"   cle="localite"  placeholder="Conakry, Kindia…" />
            <div style={{ gridColumn: '1/-1' }}>
              <Champ label="Adresse complète" cle="adresse" placeholder="Quartier, rue…" />
            </div>
          </div>

          {/* Section clinique */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56', textTransform: 'uppercase',
            letterSpacing: '.05em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
            Données cliniques
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Maladie chronique</label>
              <select value={form.maladie} onChange={e => set('maladie', e.target.value)} style={styleInput}>
                <option>Diabète</option>
                <option>Hypertension</option>
                <option>Diabète + Hypertension</option>
                <option>Autre</option>
              </select>
            </div>
            <Champ label="Tension artérielle" cle="tension"  placeholder="120/80" />
            <Champ label="Glycémie (g/L)"     cle="glycemie" type="number" placeholder="1.20" />
            <Champ label="Poids (kg)"          cle="poids"    type="number" placeholder="72" />
          </div>

          {/* Message d'erreur */}
          {erreur && (
            <div style={{ background: '#FCEBEB', color: '#791F1F', borderRadius: 8,
              padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
              {erreur}
            </div>
          )}

          {/* Boutons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onFermer}
              style={{ padding: '8px 18px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#fff' }}>
              Annuler
            </button>
            <button type="submit" disabled={enregistrement}
              style={{ padding: '8px 20px', background: '#0F6E56', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {enregistrement ? 'Sauvegarde…' : '💾 Sauvegarder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


//  CARTE D'UNE CONSULTATION (dans la timeline)
//  Cliquable pour afficher/masquer les détails

function CarteConsultation({ consultation, onNouvelleConsultation }) {
  const [ouvert, setOuvert] = useState(false)  // Dépliée ou repliée

  const ntens = niveauTension(consultation.tension)
  const ngly  = niveauGlycemie(consultation.glycemie)

  return (
    <div style={{
      background: '#fff', border: '1px solid #eee', borderRadius: 10, overflow: 'hidden',
      marginBottom: 10, transition: 'box-shadow 0.2s',
    }}>
      {/* En-tête de la carte — toujours visible */}
      <div
        onClick={() => setOuvert(v => !v)}
        style={{
          padding: '14px 16px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12,
          background: ouvert ? '#f8fffe' : '#fff',
        }}
      >
        {/* Icône de l'indicateur principal */}
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: ntens?.bg || ngly?.bg || '#E1F5EE',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>
          {consultation.tension ? '❤️' : '🩸'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 13, color: '#111' }}>
            Consultation du {formaterDate(consultation.date_visite)}
          </div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2, display: 'flex', gap: 12 }}>
            {consultation.tension  && <span>TA {consultation.tension}</span>}
            {consultation.glycemie && <span>Gly. {consultation.glycemie} g/L</span>}
            {consultation.poids    && <span>Poids {consultation.poids} kg</span>}
            {!consultation.tension && !consultation.glycemie && <span>Consultation de suivi</span>}
          </div>
        </div>

        {/* Badges de niveau */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {ntens && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20,
              background: ntens.bg, color: ntens.color, fontWeight: 500 }}>
              TA {ntens.label}
            </span>
          )}
          {ngly && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20,
              background: ngly.bg, color: ngly.color, fontWeight: 500 }}>
              Gly. {ngly.label}
            </span>
          )}
        </div>

        {/* Flèche dépliage */}
        <span style={{ color: '#bbb', fontSize: 14, transform: ouvert ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>
          ▾
        </span>
      </div>

      {/* Détails dépliables */}
      {ouvert && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid #f0f0f0', background: '#fafffe' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {/* Bloc tension */}
            {consultation.tension && (
              <div style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px solid #eee' }}>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>Tension artérielle</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#111' }}>{consultation.tension}</div>
                {ntens && (
                  <span style={{ fontSize: 11, marginTop: 4, display: 'inline-block',
                    padding: '2px 8px', borderRadius: 20, background: ntens.bg, color: ntens.color }}>
                    {ntens.label}
                  </span>
                )}
              </div>
            )}
            {/* Bloc glycémie */}
            {consultation.glycemie && (
              <div style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px solid #eee' }}>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>Glycémie</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#111' }}>{consultation.glycemie} g/L</div>
                {ngly && (
                  <span style={{ fontSize: 11, marginTop: 4, display: 'inline-block',
                    padding: '2px 8px', borderRadius: 20, background: ngly.bg, color: ngly.color }}>
                    {ngly.label}
                  </span>
                )}
              </div>
            )}
            {/* Bloc poids */}
            {consultation.poids && (
              <div style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px solid #eee' }}>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>Poids</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#111' }}>{consultation.poids} kg</div>
              </div>
            )}
            {/* Bloc agent */}
            {consultation.agent && (
              <div style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px solid #eee' }}>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>Agent de santé</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>👤 {consultation.agent}</div>
              </div>
            )}
          </div>

          {/* Symptômes */}
          {consultation.symptomes && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>Symptômes observés</div>
              <div style={{ fontSize: 13, color: '#333', background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px solid #eee' }}>
                {consultation.symptomes}
              </div>
            </div>
          )}

          {/* Notes médicales */}
          {consultation.notes && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>Notes médicales</div>
              <div style={{ fontSize: 13, color: '#333', background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px solid #eee', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {consultation.notes}
              </div>
            </div>
          )}

          {/* Bouton nouvelle consultation de suivi */}
          <button
            onClick={() => onNouvelleConsultation()}
            style={{
              marginTop: 6, padding: '6px 14px', background: '#E1F5EE', color: '#0F6E56',
              border: '1px solid #9FE1CB', borderRadius: 8, fontSize: 12,
              cursor: 'pointer', fontWeight: 500,
            }}
          >
            + Consultation de suivi
          </button>
        </div>
      )}
    </div>
  )
}


//  PAGE PRINCIPALE — DOSSIER PATIENT

export default function DossierPatient() {
  const { id }   = useParams()    // Récupère l'ID du patient depuis l'URL
  const navigate = useNavigate()

  // États du composant
  const [patient,       setPatient]       = useState(null)
  const [consultations, setConsultations] = useState([])
  const [chargement,    setChargement]    = useState(true)
  const [erreur,        setErreur]        = useState('')
  const [onglet,        setOnglet]        = useState('historique')  // 'historique' ou 'evolution'
  const [modalModif,    setModalModif]    = useState(false)         // Modal de modification ouvert ?

  // Charge le patient et ses consultations
  const chargerDonnees = async () => {
    setChargement(true); setErreur('')
    try {
      // Charge le patient et ses consultations en parallèle
      const [patRes, consRes] = await Promise.all([
        API.get(`/patients/${id}`),
        API.get(`/consultations?patient_id=${id}&per_page=50`),
      ])
      setPatient(patRes.data)
      setConsultations(consRes.data.items || consRes.data)
    } catch {
      setErreur('Impossible de charger le dossier patient.')
    } finally {
      setChargement(false)
    }
  }

  useEffect(() => { chargerDonnees() }, [id])

  // Après sauvegarde du modal, recharge les données
  const apresModification = () => {
    setModalModif(false)
    chargerDonnees()
  }

  //  Données calculées
  const nomComplet   = patient ? `${patient.prenom} ${patient.nom}` : ''
  const age          = patient ? calculerAge(patient.date_naissance) : null
  const badgeProps   = propsBadge(patient?.maladie || '')
  const nbConsults   = consultations.length

  // Extractions pour les graphiques d'évolution
  const donneesTension = consultations
    .filter(c => c.tension && c.tension.includes('/'))
    .slice()
    .reverse()           // Chronologique (plus ancien en premier pour le graphique)
    .map(c => parseInt(c.tension.split('/')[0]))  // Valeur systolique seulement

  const donneesGlycemie = consultations
    .filter(c => c.glycemie)
    .slice()
    .reverse()
    .map(c => parseFloat(c.glycemie))

  // Écrans de chargement et d'erreur 
  if (chargement) return (
    <div style={{ textAlign: 'center', padding: 60, color: '#888', fontSize: 15 }}>
      ⏳ Chargement du dossier…
    </div>
  )

  if (erreur || !patient) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>😕</div>
      <div style={{ color: '#E24B4A', fontSize: 14, marginBottom: 16 }}>
        {erreur || 'Patient introuvable'}
      </div>
      <button onClick={() => navigate('/patients')}
        style={{ padding: '9px 18px', background: '#0F6E56', color: '#fff',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
        ← Retour aux patients
      </button>
    </div>
  )

  // Rendu principal 
  return (
    <div>
      {/*  Fil d'Ariane */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13, color: '#888' }}>
        <span style={{ cursor: 'pointer', color: '#0F6E56' }} onClick={() => navigate('/patients')}>
          Patients
        </span>
        <span>›</span>
        <span style={{ color: '#111', fontWeight: 500 }}>{nomComplet}</span>
      </div>

      {/* Mise en page en 2 colonnes  */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>

        {/* COLONNE GAUCHE — Fiche identité du patient */}
        <div>
          {/* Carte identité principale */}
          <div style={{
            background: '#fff', borderRadius: 12, border: '1px solid #eee',
            padding: 20, marginBottom: 14,
          }}>
            {/* Avatar + nom */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{
                width: 68, height: 68, borderRadius: '50%',
                background: '#E1F5EE', color: '#0F6E56',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 600, margin: '0 auto 12px',
              }}>
                {initiales(nomComplet)}
              </div>
              <div style={{ fontWeight: 600, fontSize: 16, color: '#111', marginBottom: 4 }}>
                {nomComplet}
              </div>
              {/* Badge pathologie */}
              {patient.maladie && (
                <span style={{
                  display: 'inline-block', padding: '3px 12px', borderRadius: 20,
                  fontSize: 12, fontWeight: 500,
                  background: badgeProps.bg, color: badgeProps.color,
                }}>
                  {badgeProps.emoji} {patient.maladie}
                </span>
              )}
            </div>

            {/* Informations personnelles */}
            {[
              { label: 'Sexe',        valeur: patient.sexe    || '—' },
              { label: 'Âge',         valeur: age ? `${age} ans` : '—' },
              { label: 'Naissance',   valeur: formaterDate(patient.date_naissance) },
              { label: 'Téléphone',   valeur: patient.telephone || '—' },
              { label: 'Localité',    valeur: patient.localite  || '—' },
              { label: 'Suivi depuis',valeur: formaterDate(patient.created_at) },
            ].map(({ label, valeur }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: '1px solid #f5f5f5',
                fontSize: 12,
              }}>
                <span style={{ color: '#aaa' }}>{label}</span>
                <span style={{ color: '#111', fontWeight: 500, textAlign: 'right', maxWidth: 140 }}>{valeur}</span>
              </div>
            ))}

            {/* Résumé dernières mesures */}
            {(patient.tension || patient.glycemie) && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>Dernières mesures (dossier)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {patient.tension && (
                    <div style={{ flex: 1, background: '#f8f9fa', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#aaa' }}>Tension</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{patient.tension}</div>
                    </div>
                  )}
                  {patient.glycemie && (
                    <div style={{ flex: 1, background: '#f8f9fa', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#aaa' }}>Glycémie</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{patient.glycemie} g/L</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Statistiques rapides */}
          <div style={{
            background: '#fff', borderRadius: 12, border: '1px solid #eee',
            padding: 16, marginBottom: 14,
          }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 12, color: '#111' }}>
              Résumé
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Consultations', valeur: nbConsults, emoji: '📋' },
                { label: 'Cette année',   valeur: consultations.filter(c => new Date(c.date_visite).getFullYear() === new Date().getFullYear()).length, emoji: '📅' },
              ].map(s => (
                <div key={s.label} style={{
                  background: '#f8f9fa', borderRadius: 8, padding: '10px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 20 }}>{s.emoji}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: '#111' }}>{s.valeur}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Boutons d'action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => navigate(`/consultation?patient_id=${patient.id}`)}
              style={{
                padding: '10px 14px', background: '#0F6E56', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500,
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              + Nouvelle consultation
            </button>
            <button
              onClick={() => setModalModif(true)}
              style={{
                padding: '10px 14px', background: '#fff', color: '#333',
                border: '1px solid #ddd', borderRadius: 8, fontSize: 13,
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              ✏️ Modifier le dossier
            </button>
            <button
              onClick={() => navigate('/patients')}
              style={{
                padding: '10px 14px', background: '#fff', color: '#888',
                border: '1px solid #eee', borderRadius: 8, fontSize: 13,
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              ← Retour aux patients
            </button>
          </div>
        </div>


        {/* COLONNE DROITE — Consultations et évolution */}
        <div>
          {/* Onglets */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {[
              { id: 'historique', label: `📋 Historique (${nbConsults})` },
              { id: 'evolution',  label: '📈 Évolution' },
            ].map(ong => (
              <button
                key={ong.id}
                onClick={() => setOnglet(ong.id)}
                style={{
                  padding: '8px 18px',
                  background:   onglet === ong.id ? '#0F6E56' : '#fff',
                  color:        onglet === ong.id ? '#fff'    : '#666',
                  border:       onglet === ong.id ? 'none' : '1px solid #ddd',
                  borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}
              >
                {ong.label}
              </button>
            ))}
          </div>

          {/* ONGLET HISTORIQUE : Timeline des consultations  */}
          {onglet === 'historique' && (
            <div>
              {consultations.length === 0 ? (
                <div style={{
                  background: '#fff', borderRadius: 12, border: '1px dashed #ddd',
                  padding: 40, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                  <div style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>
                    Aucune consultation enregistrée pour ce patient.
                  </div>
                  <button
                    onClick={() => navigate(`/consultation?patient_id=${patient.id}`)}
                    style={{
                      padding: '9px 20px', background: '#0F6E56', color: '#fff',
                      border: 'none', borderRadius: 8, fontSize: 13,
                      fontWeight: 500, cursor: 'pointer',
                    }}
                  >
                    + Première consultation
                  </button>
                </div>
              ) : (
                consultations.map(c => (
                  <CarteConsultation
                    key={c.id}
                    consultation={c}
                    onNouvelleConsultation={() => navigate(`/consultation?patient_id=${patient.id}`)}
                  />
                ))
              )}
            </div>
          )}

          {/* ── ONGLET ÉVOLUTION : Graphiques cliniques ── */}
          {onglet === 'evolution' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Courbe de tension */}
              <div style={{
                background: '#fff', borderRadius: 12,
                border: '1px solid #eee', padding: 20,
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  ❤️ Évolution de la tension artérielle (systolique)
                </div>
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>
                  Valeur systolique en mmHg — seuil normal : &lt; 130
                </div>
                {donneesTension.length >= 2 ? (
                  <MiniCourbe valeurs={donneesTension} couleur="#E24B4A" unite="mmHg" />
                ) : (
                  <div style={{ color: '#bbb', fontSize: 13, fontStyle: 'italic' }}>
                    Pas assez de données de tension pour afficher le graphique
                    (minimum 2 consultations avec tension).
                  </div>
                )}
                {/* Seuils de référence */}
                <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
                  {[
                    { label: 'Normale',    seuil: '< 130 mmHg', bg: '#EAF3DE', color: '#27500A' },
                    { label: 'Limite',     seuil: '130–139',     bg: '#FAEEDA', color: '#633806' },
                    { label: 'Élevée',     seuil: '≥ 140',       bg: '#FCEBEB', color: '#791F1F' },
                  ].map(s => (
                    <span key={s.label} style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 20,
                      background: s.bg, color: s.color,
                    }}>
                      {s.label} : {s.seuil}
                    </span>
                  ))}
                </div>
              </div>

              {/* Courbe de glycémie */}
              <div style={{
                background: '#fff', borderRadius: 12,
                border: '1px solid #eee', padding: 20,
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  🩸 Évolution de la glycémie
                </div>
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>
                  En g/L — seuil normal à jeun : &lt; 1.26 g/L
                </div>
                {donneesGlycemie.length >= 2 ? (
                  <MiniCourbe valeurs={donneesGlycemie} couleur="#EF9F27" unite="g/L" />
                ) : (
                  <div style={{ color: '#bbb', fontSize: 13, fontStyle: 'italic' }}>
                    Pas assez de données de glycémie pour afficher le graphique
                    (minimum 2 consultations avec glycémie).
                  </div>
                )}
                {/* Seuils de référence */}
                <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
                  {[
                    { label: 'Normale', seuil: '< 1.26 g/L', bg: '#EAF3DE', color: '#27500A' },
                    { label: 'Limite',  seuil: '1.26–1.99',   bg: '#FAEEDA', color: '#633806' },
                    { label: 'Élevée',  seuil: '≥ 2.0',       bg: '#FCEBEB', color: '#791F1F' },
                  ].map(s => (
                    <span key={s.label} style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 20,
                      background: s.bg, color: s.color,
                    }}>
                      {s.label} : {s.seuil}
                    </span>
                  ))}
                </div>
              </div>

              {/* Résumé statistique */}
              {nbConsults > 0 && (
                <div style={{
                  background: '#fff', borderRadius: 12,
                  border: '1px solid #eee', padding: 20,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>
                    📊 Résumé statistique
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {[
                      {
                        label:  'Tension moy.',
                        valeur: donneesTension.length
                          ? `${Math.round(donneesTension.reduce((a, b) => a + b, 0) / donneesTension.length)} mmHg`
                          : '—',
                        emoji: '❤️',
                      },
                      {
                        label:  'Glycémie moy.',
                        valeur: donneesGlycemie.length
                          ? `${(donneesGlycemie.reduce((a, b) => a + b, 0) / donneesGlycemie.length).toFixed(2)} g/L`
                          : '—',
                        emoji: '🩸',
                      },
                      {
                        label:  'Consultations',
                        valeur: nbConsults,
                        emoji: '📋',
                      },
                    ].map(s => (
                      <div key={s.label} style={{
                        background: '#f8f9fa', borderRadius: 8, padding: '14px',
                        textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>{s.emoji}</div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: '#111' }}>{s.valeur}</div>
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de modification (s'affiche par-dessus tout) */}
      {modalModif && (
        <ModalModificationPatient
          patient={patient}
          onFermer={()      => setModalModif(false)}
          onSauvegarde={apresModification}
        />
      )}
    </div>
  )
}
