// ──────────────────────────────────────────────────────────────────────────────
//  pages/Dashboard.jsx — Tableau de bord principal
//  Affiche les statistiques clés, graphiques et dernières activités
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import API from '../services/api'
import { subscribeToQueue } from '../services/offlineQueue'

// ── Utilitaires ───────────────────────────────────────────────────────────────

const formaterDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const initiales = (nom = '') =>
  nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

const couleurAvatar = (nom = '') => {
  const palettes = [
    { bg: '#E1F5EE', color: '#0F6E56' },
    { bg: '#E6F1FB', color: '#185FA5' },
    { bg: '#FAEEDA', color: '#633806' },
    { bg: '#EEEDFE', color: '#3C3489' },
    { bg: '#FCEBEB', color: '#791F1F' },
  ]
  return palettes[nom.charCodeAt(0) % palettes.length]
}

const propsBadge = (maladie = '') => {
  if (maladie.includes('Hypertension') && maladie.includes('Diabète'))
    return { bg: '#FCEBEB', color: '#791F1F' }
  if (maladie.includes('Diabète'))
    return { bg: '#FAEEDA', color: '#633806' }
  if (maladie.includes('Hypertension'))
    return { bg: '#FCEBEB', color: '#791F1F' }
  return { bg: '#EAF3DE', color: '#27500A' }
}

// ── Composant carte statistique ───────────────────────────────────────────────
function CarteStats({ emoji, label, valeur, delta, couleur = '#0F6E56', bg = '#E1F5EE' }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #eee',
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
        <div style={{ width: 36, height: 36, background: bg, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          {emoji}
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: '#111', lineHeight: 1 }}>{valeur}</div>
      {delta && <div style={{ fontSize: 12, color: couleur, marginTop: 6 }}>{delta}</div>}
    </div>
  )
}

// ── Graphique barres pour l'évolution mensuelle ───────────────────────────────
function GraphiqueBarres({ data }) {
  if (!data || data.length === 0) return (
    <div style={{ textAlign: 'center', color: '#bbb', fontSize: 13, padding: '30px 0' }}>
      Pas encore de données
    </div>
  )
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
      {data.map((d, i) => {
        const h       = Math.max((d.count / max) * 96, 4)
        const dernier = i === data.length - 1
        return (
          <div key={d.mois} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: '#aaa' }}>{d.count}</span>
            <div style={{ width: '100%', borderRadius: '4px 4px 0 0', height: h, background: dernier ? '#0F6E56' : '#9FE1CB' }} />
            <span style={{ fontSize: 10, color: dernier ? '#0F6E56' : '#aaa', fontWeight: dernier ? 600 : 400 }}>{d.mois}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Graphique donut pour la répartition ───────────────────────────────────────
function Donut({ tranches }) {
  if (!tranches || tranches.length === 0) return null
  const total = tranches.reduce((s, t) => s + t.val, 0)
  if (total === 0) return null
  const R = 44, CX = 60, CY = 60
  let angle = -Math.PI / 2
  const arcs = tranches.map(t => {
    const pct   = t.val / total
    const sweep = pct * 2 * Math.PI
    const x1 = CX + R * Math.cos(angle)
    const y1 = CY + R * Math.sin(angle)
    angle += sweep
    const x2   = CX + R * Math.cos(angle)
    const y2   = CY + R * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    return { ...t, pct, d: `M${CX} ${CY} L${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2}Z` }
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        {arcs.map((a, i) => <path key={i} d={a.d} fill={a.couleur} stroke="#fff" strokeWidth="2" />)}
        <circle cx={CX} cy={CY} r={R - 14} fill="#fff" />
        <text x={CX} y={CY - 5} textAnchor="middle" fontSize="13" fontWeight="600" fill="#111">{total}</text>
        <text x={CX} y={CY + 9} textAnchor="middle" fontSize="9" fill="#888">patients</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {arcs.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: a.couleur }} />
            <span style={{ color: '#555' }}>{a.label}</span>
            <span style={{ color: '#aaa' }}>{a.val} ({Math.round(a.pct * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page principale Dashboard ─────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const [stats,         setStats]         = useState(null)
  const [consultations, setConsultations] = useState([])
  const [patients,      setPatients]      = useState([])
  const [graphData,     setGraphData]     = useState([])
  const [chargement,    setChargement]    = useState(true)
  const [etatSync,      setEtatSync]      = useState({ isOnline: true, queueCount: 0 })

  // Surveille l'état offline
  useEffect(() => {
    const desabonner = subscribeToQueue(setEtatSync)
    return desabonner
  }, [])

  // Charge toutes les données du dashboard
  useEffect(() => {
    const charger = async () => {
      setChargement(true)
      try {
        const [statsRes, consultsRes, patientsRes] = await Promise.all([
          API.get('/stats'),
          API.get('/consultations?per_page=5'),
          API.get('/patients?per_page=5'),
        ])
        setStats(statsRes.data)
        setConsultations(consultsRes.data.items || consultsRes.data)
        setPatients(patientsRes.data.items      || patientsRes.data)

        // Prépare les données du graphique (6 derniers mois)
        const moisLabels = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
        const maintenant = new Date()
        const graph = Array.from({ length: 6 }, (_, i) => {
          const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - (5 - i), 1)
          return {
            mois:  moisLabels[d.getMonth()],
            count: statsRes.data?.consultations_par_mois?.[d.getMonth()] ?? 0,
          }
        })
        setGraphData(graph)
      } catch {
        // En mode offline, on garde les données précédentes
        setStats(prev => prev || { total_patients: '—', total_consultations: '—' })
      } finally {
        setChargement(false)
      }
    }
    charger()
  }, [])

  const tranches = stats ? [
    { label: 'Diabète',      val: stats.nb_diabete      || 0, couleur: '#EF9F27' },
    { label: 'Hypertension', val: stats.nb_hypertension || 0, couleur: '#E24B4A' },
    { label: 'Les deux',     val: stats.nb_les_deux     || 0, couleur: '#7F77DD' },
    { label: 'Autre',        val: stats.nb_autre        || 0, couleur: '#888780' },
  ].filter(t => t.val > 0) : []

  if (chargement) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
      Chargement du tableau de bord…
    </div>
  )

  return (
    <div>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#111' }}>Tableau de bord</h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button onClick={() => navigate('/consultation')} style={{
          padding: '9px 18px', background: '#0F6E56', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>
          + Nouvelle consultation
        </button>
      </div>

      {/* Bannière offline */}
      {(!etatSync.isOnline || etatSync.queueCount > 0) && (
        <div style={{
          background: etatSync.isOnline ? '#E1F5EE' : '#FAEEDA',
          border: `1px solid ${etatSync.isOnline ? '#1D9E75' : '#EF9F27'}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          fontSize: 13, color: etatSync.isOnline ? '#085041' : '#633806',
          display: 'flex', gap: 10,
        }}>
          <span>{etatSync.isOnline ? '🔄' : '⚠️'}</span>
          {!etatSync.isOnline && <strong>Mode hors ligne — </strong>}
          {etatSync.queueCount > 0 && <span><strong>{etatSync.queueCount}</strong> action(s) en attente</span>}
        </div>
      )}

      {/* Cartes statistiques */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        <CarteStats emoji="👥" label="Total patients" valeur={stats?.total_patients ?? '—'}
          delta={stats?.nouveaux_ce_mois ? `+${stats.nouveaux_ce_mois} ce mois` : null} />
        <CarteStats emoji="📋" label="Consultations" valeur={stats?.total_consultations ?? '—'}
          delta={stats?.consultations_ce_mois ? `+${stats.consultations_ce_mois} ce mois` : null} />
        <CarteStats emoji="🩺" label="Diabétiques" valeur={stats?.nb_diabete ?? '—'}
          couleur="#BA7517" bg="#FAEEDA"
          delta={stats?.total_patients ? `${Math.round((stats.nb_diabete / stats.total_patients) * 100)}% des patients` : null} />
        <CarteStats emoji="❤️" label="Hypertendus" valeur={stats?.nb_hypertension ?? '—'}
          couleur="#A32D2D" bg="#FCEBEB"
          delta={stats?.total_patients ? `${Math.round((stats.nb_hypertension / stats.total_patients) * 100)}% des patients` : null} />
      </div>

      {/* Graphiques */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Consultations — 6 derniers mois</div>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 12 }}>Nombre de visites par mois</div>
          <GraphiqueBarres data={graphData} />
        </div>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Répartition par pathologie</div>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>Distribution des maladies chroniques</div>
          {tranches.length > 0 ? <Donut tranches={tranches} /> : (
            <div style={{ textAlign: 'center', color: '#bbb', fontSize: 13, padding: '20px 0' }}>Pas encore de données</div>
          )}
        </div>
      </div>

      {/* Listes récentes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Dernières consultations */}
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Dernières consultations</span>
            <span style={{ fontSize: 12, color: '#0F6E56', cursor: 'pointer' }} onClick={() => navigate('/patients')}>
              Voir tout →
            </span>
          </div>
          {consultations.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#bbb', fontSize: 13, padding: '20px 0' }}>Aucune consultation</div>
          ) : consultations.map((c, i) => {
            const nom = c.patient_nom || `Patient #${c.patient_id}`
            const av  = couleurAvatar(nom)
            const bp  = propsBadge(c.maladie || '')
            return (
              <div key={c.id} onClick={() => navigate(`/patients/${c.patient_id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                  borderBottom: i < consultations.length - 1 ? '1px solid #f5f5f5' : 'none', cursor: 'pointer' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: av.bg, color: av.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                  {initiales(nom)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>
                    {[c.tension && `TA ${c.tension}`, c.glycemie && `Gly. ${c.glycemie} g/L`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {c.maladie && <div style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: bp.bg, color: bp.color, fontWeight: 500, marginBottom: 3 }}>{c.maladie}</div>}
                  <div style={{ fontSize: 11, color: '#bbb' }}>{formaterDate(c.date_visite)}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Patients récents */}
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Patients récents</span>
            <span style={{ fontSize: 12, color: '#0F6E56', cursor: 'pointer' }} onClick={() => navigate('/patients')}>
              Voir tout →
            </span>
          </div>
          {patients.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#bbb', fontSize: 13, padding: '20px 0' }}>Aucun patient</div>
          ) : patients.map((p, i) => {
            const nom = `${p.prenom} ${p.nom}`
            const av  = couleurAvatar(nom)
            const bp  = propsBadge(p.maladie || '')
            const age = p.date_naissance ? Math.floor((Date.now() - new Date(p.date_naissance)) / 31557600000) : null
            return (
              <div key={p.id} onClick={() => navigate(`/patients/${p.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                  borderBottom: i < patients.length - 1 ? '1px solid #f5f5f5' : 'none', cursor: 'pointer' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: av.bg, color: av.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                  {initiales(nom)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{nom}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>{[p.localite, age && `${age} ans`].filter(Boolean).join(' · ')}</div>
                </div>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: bp.bg, color: bp.color, fontWeight: 500 }}>
                  {p.maladie || '—'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
