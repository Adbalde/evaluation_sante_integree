//  pages/NouvelleConsultation.jsx — Formulaire de création de consultation
//  Fonctionnalités :
//    - Recherche patient avec autocomplétion
//    - Pré-remplissage si patient_id dans l'URL (?patient_id=5)
//    - Indicateurs cliniques (tension / glycémie)
//    - Formulaire en 3 étapes : saisie → confirmation → succès
//    - Support offline (mise en queue si hors ligne)

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import API from '../services/api'
import { enqueue } from '../services/offlineQueue'

const styleInput = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, outline: 'none', width: '100%' }

// Indicateur de niveau clinique
function Indicateur({ valeur, seuils, unite }) {
  if (!valeur) return null
  const v = parseFloat(valeur)
  let label = 'Normal'
  let style = { bg: '#EAF3DE', color: '#27500A' }
  if (v >= seuils.danger)  { label = 'Élevé';  style = { bg: '#FCEBEB', color: '#791F1F' } }
  else if (v >= seuils.warning) { label = 'Limite'; style = { bg: '#FAEEDA', color: '#633806' } }
  return (
    <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: style.bg, color: style.color }}>
      {label} ({v} {unite})
    </span>
  )
}

// Étapes de progressio
function Etapes({ etapeActuelle }) {
  const etapes = ['Formulaire', 'Confirmation', 'Succès']
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
      {etapes.map((label, i) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: i + 1 === etapeActuelle ? '#0F6E56' : i + 1 < etapeActuelle ? '#1D9E75' : '#bbb', fontWeight: i + 1 === etapeActuelle ? 600 : 400 }}>
            {i + 1 < etapeActuelle ? '✓ ' : ''}{label}
          </span>
          {i < etapes.length - 1 && <span style={{ color: '#ddd' }}>›</span>}
        </span>
      ))}
    </div>
  )
}

// Résumé avant confirmation
function ResumeConfirmation({ form, patient, onConfirmer, onRetour, enregistrement }) {
  const lignes = [
    { label: 'Patient',            valeur: patient ? `${patient.prenom} ${patient.nom}` : form.patient_nom },
    { label: 'Date de visite',     valeur: form.date_visite },
    { label: 'Tension artérielle', valeur: form.tension   || '—' },
    { label: 'Glycémie',           valeur: form.glycemie  ? `${form.glycemie} g/L` : '—' },
    { label: 'Poids',              valeur: form.poids     ? `${form.poids} kg` : '—' },
    { label: 'Symptômes',          valeur: form.symptomes || '—' },
    { label: 'Notes médicales',    valeur: form.notes     || '—' },
  ]
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', padding: 28, maxWidth: 560 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Confirmer la consultation</h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Vérifiez les informations avant d'enregistrer.</p>
      {lignes.map(({ label, valeur }) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
          <span style={{ color: '#888' }}>{label}</span>
          <span style={{ fontWeight: 500, color: '#111', maxWidth: 280, textAlign: 'right' }}>{valeur}</span>
        </div>
      ))}
      {!navigator.onLine && (
        <div style={{ background: '#FAEEDA', color: '#633806', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginTop: 16 }}>
          ⚠️ Mode hors ligne — la consultation sera synchronisée au retour de connexion.
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
        <button onClick={onRetour} style={{ padding: '8px 18px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#fff' }}>← Modifier</button>
        <button onClick={onConfirmer} disabled={enregistrement} style={{ padding: '8px 20px', background: '#0F6E56', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          {enregistrement ? 'Enregistrement…' : '✓ Confirmer et enregistrer'}
        </button>
      </div>
    </div>
  )
}

// Page principale
export default function NouvelleConsultation() {
  const navigate     = useNavigate()
  const [searchParams] = useSearchParams()
  const patientIdUrl   = searchParams.get('patient_id')

  const [etape,         setEtape]         = useState(1)
  const [patient,       setPatient]       = useState(null)
  const [recherche,     setRecherche]     = useState('')
  const [suggestions,   setSuggestions]   = useState([])
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur,        setErreur]        = useState('')

  const [form, setForm] = useState({
    patient_id: '', patient_nom: '',
    date_visite: new Date().toISOString().split('T')[0],
    tension: '', glycemie: '', poids: '', symptomes: '', notes: '',
  })
  const set = (cle, val) => setForm(f => ({ ...f, [cle]: val }))

  // Pré-remplit le patient si patient_id est dans l'URL
  useEffect(() => {
    if (!patientIdUrl) return
    API.get(`/patients/${patientIdUrl}`).then(res => {
      setPatient(res.data)
      set('patient_id', res.data.id)
      set('patient_nom', `${res.data.prenom} ${res.data.nom}`)
      setRecherche(`${res.data.prenom} ${res.data.nom}`)
    }).catch(() => {})
  }, [patientIdUrl])

  // Recherche patients avec délai (debounce) pour éviter trop de requêtes
  useEffect(() => {
    if (recherche.length < 2 || patient) return
    const timer = setTimeout(async () => {
      try {
        const res = await API.get(`/patients?search=${recherche}&per_page=5`)
        setSuggestions(res.data.items || res.data)
      } catch { setSuggestions([]) }
    }, 300)
    return () => clearTimeout(timer)
  }, [recherche, patient])

  const choisirPatient = (p) => {
    setPatient(p)
    setRecherche(`${p.prenom} ${p.nom}`)
    setSuggestions([])
    set('patient_id',  p.id)
    set('patient_nom', `${p.prenom} ${p.nom}`)
  }

  const effacerPatient = () => {
    setPatient(null); setRecherche(''); setSuggestions([])
    set('patient_id', ''); set('patient_nom', '')
  }

  const validerFormulaire = () => {
    if (!form.patient_id) { setErreur('Sélectionnez un patient.'); return }
    if (!form.date_visite) { setErreur('La date est obligatoire.'); return }
    if (!form.tension && !form.glycemie) { setErreur('Renseignez au moins la tension ou la glycémie.'); return }
    setErreur(''); setEtape(2)
  }

  const enregistrer = async () => {
    setEnregistrement(true); setErreur('')
    const payload = {
      patient_id: form.patient_id, date_visite: form.date_visite,
      tension: form.tension || null, glycemie: form.glycemie ? parseFloat(form.glycemie) : null,
      poids: form.poids ? parseFloat(form.poids) : null,
      symptomes: form.symptomes || null, notes: form.notes || null,
      local_id: crypto.randomUUID(),  // UUID unique pour la déduplication offline
    }
    try {
      if (navigator.onLine) {
        await API.post('/consultations', payload)
      } else {
        await enqueue({ method: 'post', url: '/consultations', data: payload,
          label: `Consultation — ${form.patient_nom}` })
      }
      setEtape(3)
    } catch {
      setErreur('Erreur lors de l\'enregistrement.'); setEtape(1)
    } finally {
      setEnregistrement(false)
    }
  }

  // Vue succès
  if (etape === 3) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Consultation enregistrée</h2>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>
          {navigator.onLine ? 'Envoyée au serveur avec succès.' : 'Sauvegardée localement — sera synchronisée à la reconnexion.'}
        </p>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#0F6E56', marginBottom: 28 }}>Patient : {form.patient_nom}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate(`/patients/${form.patient_id}`)} style={{ padding: '9px 18px', background: '#0F6E56', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Voir le dossier</button>
          <button onClick={() => { setForm({ patient_id: '', patient_nom: '', date_visite: new Date().toISOString().split('T')[0], tension: '', glycemie: '', poids: '', symptomes: '', notes: '' }); setPatient(null); setRecherche(''); setEtape(1) }}
            style={{ padding: '9px 18px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#fff' }}>Nouvelle consultation</button>
          <button onClick={() => navigate('/patients')} style={{ padding: '9px 18px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#fff' }}>Retour aux patients</button>
        </div>
      </div>
    </div>
  )

  // Vue confirmation 
  if (etape === 2) return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Nouvelle consultation</h1>
        <Etapes etapeActuelle={2} />
      </div>
      <ResumeConfirmation form={form} patient={patient} onConfirmer={enregistrer} onRetour={() => setEtape(1)} enregistrement={enregistrement} />
    </div>
  )

  // Vue formulaire (étape 1)
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Nouvelle consultation</h1>
        <Etapes etapeActuelle={1} />
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', padding: 28, maxWidth: 560 }}>
        {/* Sélection du patient */}
        <div style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>Patient</div>
        <div style={{ marginBottom: 20, position: 'relative' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={recherche} onChange={e => { setRecherche(e.target.value); if (patient) effacerPatient() }}
              placeholder="Rechercher un patient par nom…" disabled={!!patient}
              style={{ ...styleInput, background: patient ? '#f8f9fa' : '#fff', flex: 1 }} />
            {patient && (
              <button onClick={effacerPatient} style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#fff', color: '#888' }}>✕</button>
            )}
          </div>
          {/* Liste de suggestions */}
          {suggestions.length > 0 && !patient && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid #ddd', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', marginTop: 4, overflow: 'hidden' }}>
              {suggestions.map(p => (
                <div key={p.id} onClick={() => choisirPatient(p)}
                  style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fffe'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <span style={{ fontWeight: 500 }}>{p.prenom} {p.nom}</span>
                  <span style={{ color: '#aaa', fontSize: 12 }}>{p.maladie}</span>
                </div>
              ))}
            </div>
          )}
          {/* Patient sélectionné */}
          {patient && (
            <div style={{ marginTop: 8, background: '#E1F5EE', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontWeight: 500, color: '#0F6E56', fontSize: 13 }}>{patient.prenom} {patient.nom}</span>
                <span style={{ fontSize: 12, color: '#1D9E75', marginLeft: 10 }}>{patient.localite} · {patient.maladie}</span>
              </div>
              <span style={{ fontSize: 11, color: '#1D9E75' }}>✓ Sélectionné</span>
            </div>
          )}
        </div>

        {/* Données cliniques */}
        <div style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>Données cliniques</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Date de visite *</label>
            <input type="date" value={form.date_visite} onChange={e => set('date_visite', e.target.value)} style={styleInput} />
          </div>
          <div />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Tension artérielle</label>
            <input value={form.tension} onChange={e => set('tension', e.target.value)} placeholder="ex : 130/85" style={styleInput} />
            {form.tension && (() => {
              const sys = parseInt(form.tension.split('/')[0])
              return <Indicateur valeur={sys} seuils={{ warning: 130, danger: 140 }} unite="mmHg" />
            })()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Glycémie (g/L)</label>
            <input type="number" step="0.01" value={form.glycemie} onChange={e => set('glycemie', e.target.value)} placeholder="ex : 1.20" style={styleInput} />
            <Indicateur valeur={form.glycemie} seuils={{ warning: 1.26, danger: 2.0 }} unite="g/L" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Poids (kg)</label>
            <input type="number" step="0.1" value={form.poids} onChange={e => set('poids', e.target.value)} placeholder="ex : 72" style={styleInput} />
          </div>
        </div>

        {/* Observations */}
        <div style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>Observations</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Symptômes</label>
            <input value={form.symptomes} onChange={e => set('symptomes', e.target.value)} placeholder="Céphalées, fatigue, vertiges…" style={styleInput} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Notes médicales</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={4}
              placeholder="Observations, traitement prescrit, recommandations…"
              style={{ ...styleInput, resize: 'vertical' }} />
          </div>
        </div>

        {erreur && (
          <div style={{ background: '#FCEBEB', color: '#791F1F', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            ⚠️ {erreur}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={() => navigate('/patients')} style={{ padding: '9px 18px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#fff' }}>Annuler</button>
          <button onClick={validerFormulaire} style={{ padding: '9px 20px', background: '#0F6E56', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Vérifier →
          </button>
        </div>
      </div>
    </div>
  )
}
