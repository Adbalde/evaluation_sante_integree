// ──────────────────────────────────────────────────────────────────────────────
//  pages/Patients.jsx — Liste et gestion des patients
//  Fonctionnalités :
//    - Liste paginée (10 par page)
//    - Recherche multicritère en temps réel
//    - Filtre par pathologie
//    - Modal création/modification de patient
//    - Support offline (actions mises en queue si hors ligne)
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import API from '../services/api'
import { enqueue } from '../services/offlineQueue'

// ── Constantes ─────────────────────────────────────────────────────────────────
const MALADIES = ['Tous', 'Diabète', 'Hypertension', 'Diabète + Hypertension', 'Autre']

// ── Utilitaires visuels ────────────────────────────────────────────────────────
const initiales = (nom = '') => nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

const couleurAvatar = (nom = '') => {
  const p = [
    { bg: '#E1F5EE', color: '#0F6E56' }, { bg: '#E6F1FB', color: '#185FA5' },
    { bg: '#FAEEDA', color: '#633806' }, { bg: '#EEEDFE', color: '#3C3489' },
    { bg: '#FCEBEB', color: '#791F1F' },
  ]
  return p[nom.charCodeAt(0) % p.length]
}

const propsBadge = (maladie = '') => {
  if (maladie.includes('Hypertension') && maladie.includes('Diabète')) return { bg: '#FCEBEB', color: '#791F1F' }
  if (maladie.includes('Diabète'))     return { bg: '#FAEEDA', color: '#633806' }
  if (maladie.includes('Hypertension')) return { bg: '#FCEBEB', color: '#791F1F' }
  return { bg: '#EAF3DE', color: '#27500A' }
}

const styleInput = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, width: '100%' }

// ── Modal de création / modification patient ───────────────────────────────────
function ModalPatient({ patient, onFermer, onSauvegarde }) {
  const enModification = !!patient?.id
  const [form, setForm] = useState(patient || {
    prenom: '', nom: '', sexe: 'Masculin', date_naissance: '',
    telephone: '', localite: '', maladie: 'Diabète', tension: '', glycemie: '',
  })
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState('')

  const modifier = (cle, val) => setForm(f => ({ ...f, [cle]: val }))

  const gererSoumission = async (e) => {
    e.preventDefault()
    setEnregistrement(true); setErreur('')
    try {
      if (navigator.onLine) {
        if (enModification) await API.put(`/patients/${patient.id}`, form)
        else await API.post('/patients', form)
      } else {
        // Hors ligne : met l'action en queue
        await enqueue({
          method:   enModification ? 'put' : 'post',
          url:      enModification ? `/patients/${patient.id}` : '/patients',
          data:     { ...form, local_id: crypto.randomUUID() },
          label:    `${enModification ? 'Modifier' : 'Créer'} patient — ${form.prenom} ${form.nom}`,
        })
      }
      onSauvegarde()
    } catch {
      setErreur('Erreur lors de l\'enregistrement. Réessayez.')
    } finally {
      setEnregistrement(false)
    }
  }

  const Champ = ({ label, cle, type = 'text', placeholder = '' }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>{label}</label>
      <input type={type} value={form[cle] || ''} onChange={e => modifier(cle, e.target.value)}
        placeholder={placeholder} style={styleInput} />
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: 540, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 22 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{enModification ? 'Modifier le patient' : 'Nouveau patient'}</h2>
          <button onClick={onFermer} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        <form onSubmit={gererSoumission}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Identité</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <Champ label="Prénom *" cle="prenom" placeholder="Mariama" />
            <Champ label="Nom *"    cle="nom"    placeholder="Kouyaté" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Sexe</label>
              <select value={form.sexe} onChange={e => modifier('sexe', e.target.value)} style={styleInput}>
                <option>Masculin</option><option>Féminin</option>
              </select>
            </div>
            <Champ label="Date de naissance" cle="date_naissance" type="date" />
            <Champ label="Téléphone"  cle="telephone"  placeholder="+224 6xx xxx xxx" />
            <Champ label="Localité"   cle="localite"   placeholder="Conakry, Kindia…" />
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Données cliniques</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Maladie chronique</label>
              <select value={form.maladie} onChange={e => modifier('maladie', e.target.value)} style={styleInput}>
                {MALADIES.slice(1).map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <Champ label="Tension artérielle" cle="tension"  placeholder="120/80" />
            <Champ label="Glycémie (g/L)"     cle="glycemie" type="number" placeholder="1.20" />
          </div>
          {erreur && <div style={{ background: '#FCEBEB', color: '#791F1F', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>{erreur}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onFermer} style={{ padding: '8px 18px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#fff' }}>Annuler</button>
            <button type="submit" disabled={enregistrement} style={{ padding: '8px 18px', background: '#0F6E56', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {enregistrement ? 'Enregistrement…' : enModification ? 'Sauvegarder' : 'Créer le patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Page principale Patients ───────────────────────────────────────────────────
export default function Patients() {
  const navigate = useNavigate()
  const [patients,      setPatients]      = useState([])
  const [chargement,    setChargement]    = useState(true)
  const [recherche,     setRecherche]     = useState('')
  const [filtreMaladie, setFiltreMaladie] = useState('Tous')
  const [page,          setPage]          = useState(1)
  const [totalPages,    setTotalPages]    = useState(1)
  const [totalItems,    setTotalItems]    = useState(0)
  const [modal,         setModal]         = useState(null)
  const [erreur,        setErreur]        = useState('')
  const PAR_PAGE = 10

  const chargerPatients = async () => {
    setChargement(true); setErreur('')
    try {
      const params = new URLSearchParams({
        page, per_page: PAR_PAGE,
        ...(recherche && { search: recherche }),
        ...(filtreMaladie !== 'Tous' && { maladie: filtreMaladie }),
      })
      const res = await API.get(`/patients?${params}`)
      setPatients(res.data.items || res.data)
      setTotalPages(res.data.total_pages || 1)
      setTotalItems(res.data.total || 0)
    } catch {
      setErreur('Impossible de charger les patients (vérifiez la connexion)')
    } finally {
      setChargement(false)
    }
  }

  useEffect(() => { chargerPatients() }, [page, recherche, filtreMaladie])

  const gererSauvegarde = () => { setModal(null); chargerPatients() }

  return (
    <div>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#111' }}>Patients</h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
            {chargement ? '…' : `${totalItems} patient(s) au total`}
          </p>
        </div>
        <button onClick={() => setModal('nouveau')} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 18px', background: '#0F6E56', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>
          + Nouveau patient
        </button>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={recherche}
          onChange={e => { setRecherche(e.target.value); setPage(1) }}
          placeholder="Rechercher par nom, téléphone, localité…"
          style={{ flex: 1, minWidth: 220, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13 }}
        />
        <select value={filtreMaladie} onChange={e => { setFiltreMaladie(e.target.value); setPage(1) }}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
          {MALADIES.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* Erreur */}
      {erreur && (
        <div style={{ background: '#FAEEDA', color: '#633806', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
          ⚠️ {erreur}
        </div>
      )}

      {/* Tableau */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #eee', overflow: 'hidden' }}>
        {chargement ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Chargement…</div>
        ) : patients.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 14 }}>
            Aucun patient trouvé.{' '}
            <span style={{ color: '#0F6E56', cursor: 'pointer' }} onClick={() => setModal('nouveau')}>Créer le premier ?</span>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {['Patient', 'Sexe', 'Âge', 'Localité', 'Pathologie', 'Tension', 'Glycémie', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, fontSize: 12, color: '#888', borderBottom: '1px solid #eee' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patients.map(p => {
                const nomComplet = `${p.prenom} ${p.nom}`
                const av  = couleurAvatar(nomComplet)
                const bp  = propsBadge(p.maladie || '')
                const age = p.date_naissance
                  ? Math.floor((Date.now() - new Date(p.date_naissance)) / 31557600000) : '—'
                return (
                  <tr key={p.id} onClick={() => navigate(`/patients/${p.id}`)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fffe'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{initiales(nomComplet)}</div>
                        <div>
                          <div style={{ fontWeight: 500, color: '#111' }}>{nomComplet}</div>
                          <div style={{ fontSize: 11, color: '#aaa' }}>{p.telephone || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#555' }}>{p.sexe?.[0] || '—'}</td>
                    <td style={{ padding: '12px 14px', color: '#555' }}>{age} ans</td>
                    <td style={{ padding: '12px 14px', color: '#555' }}>{p.localite || '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      {p.maladie && <span style={{ background: bp.bg, color: bp.color, padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>{p.maladie}</span>}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#555' }}>{p.tension || '—'}</td>
                    <td style={{ padding: '12px 14px', color: '#555' }}>{p.glycemie ? `${p.glycemie} g/L` : '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setModal(p)} style={{ padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: '#fff' }}>✏️</button>
                        <button onClick={() => navigate(`/patients/${p.id}`)} style={{ padding: '4px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: '#fff' }}>👁</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '6px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}>
            ← Précédent
          </button>
          <span style={{ fontSize: 13, color: '#666' }}>Page {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '6px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>
            Suivant →
          </button>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <ModalPatient
          patient={modal === 'nouveau' ? null : modal}
          onFermer={() => setModal(null)}
          onSauvegarde={gererSauvegarde}
        />
      )}
    </div>
  )
}
