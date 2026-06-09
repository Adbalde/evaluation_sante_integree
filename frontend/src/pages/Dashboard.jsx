import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import API from '../services/api'
import { subscribeToQueue } from '../services/offlineQueue'

const formaterDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}
const initiales = (nom = '') =>
  nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
const couleurAvatar = (nom = '') => {
  const p = [
    { bg: '#E1F5EE', color: '#0F6E56' },
    { bg: '#E6F1FB', color: '#185FA5' },
    { bg: '#FAEEDA', color: '#633806' },
    { bg: '#EEEDFE', color: '#3C3489' },
    { bg: '#FCEBEB', color: '#791F1F' },
  ]
  return p[nom.charCodeAt(0) % p.length]
}
const propsBadge = (maladie = '') => {
  if (maladie.includes('Hypertension') && maladie.includes('Diabète'))
    return { bg: '#FCEBEB', color: '#791F1F' }
  if (maladie.includes('Diabète'))   return { bg: '#FAEEDA', color: '#633806' }
  if (maladie.includes('Hypertension')) return { bg: '#FCEBEB', color: '#791F1F' }
  return { bg: '#EAF3DE', color: '#27500A' }
}

function CarteStats({ emoji, label, valeur, delta, couleur = '#0F6E56', bg = '#E1F5EE' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '18px 20px' }}>
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

function GraphiqueBarres({ data }) {
  if (!data || data.length === 0) return (
    <div style={{ textAlign: 'center', color: '#bbb', fontSize: 13, padding: '30px 0' }}>Pas encore de données</div>
  )
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
      {data.map((d, i) => {
        const h = Math.max((d.count / max) * 96, 4)
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

function Donut({ tranches }) {
  if (!tranches || tranches.length === 0) return null
  const total = tranches.reduce((s, t) => s + t.val, 0)
  if (total === 0) return null
  const R = 44, CX = 60, CY = 60
  let angle = -Math.PI / 2
  const arcs = tranches.map(t => {
    const pct = t.val / total
    const sweep = pct * 2 * Math.PI
    const x1 = CX + R * Math.cos(angle)
    const y1 = CY + R * Math.sin(angle)
    angle += sweep
    const x2 = CX + R * Math.cos(angle)
    const y2 = CY + R * Math.sin(angle)
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

//  Modal DHIS2 
function ModalDhis2({ etat, resultat, onFermer, onReessayer }) {
  if (!etat) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, padding: 28, width: 460,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      }}>
        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, background: '#E6F1FB', borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>🔗</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: '#111' }}>Synchronisation DHIS2</div>
              <div style={{ fontSize: 11, color: '#888' }}>SANTE INTEGREE — TEST SANTE INTEGREE</div>
            </div>
          </div>
          <button onClick={onFermer} style={{
            background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#bbb',
            lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        {/* Chargement */}
        {etat === 'loading' && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>⏳</div>
            <div style={{ color: '#555', fontSize: 14, fontWeight: 500 }}>Envoi des données vers DHIS2…</div>
            <div style={{ color: '#aaa', fontSize: 12, marginTop: 6 }}>Connexion à l'API dataValueSets</div>
          </div>
        )}

        {/* Succès */}
        {etat === 'success' && resultat && (
          <div>
            <div style={{
              background: '#E1F5EE', border: '1px solid #1D9E75',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <span style={{ fontSize: 13, color: '#085041', fontWeight: 500 }}>{resultat.message}</span>
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
              <div style={{ flex: 1, background: '#f8f9fa', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: '#888' }}>Période</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginTop: 2 }}>
                  {resultat.period?.slice(0, 4)}/{resultat.period?.slice(4)}
                </div>
              </div>
              <div style={{ flex: 1, background: '#f8f9fa', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: '#888' }}>DataSet</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#111', marginTop: 2 }}>{resultat.dataset}</div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#888', fontWeight: 500, fontSize: 12, borderBottom: '1px solid #eee' }}>
                    Élément de donnée
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#888', fontWeight: 500, fontSize: 12, borderBottom: '1px solid #eee' }}>
                    Valeur envoyée
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['👥 Total Patients',        'RgruRxJs24z', resultat.donnees?.total_patients],
                  ['📋 Total Consultations',   'eqP9ehlQUBl', resultat.donnees?.total_consultations],
                  ['🩺 Patients Diabétiques',  'PCAhs4e8yaZ', resultat.donnees?.nb_diabetiques],
                  ['❤️ Patients Hypertendus',  'P8ZOhOAkk1n', resultat.donnees?.nb_hypertendus],
                ].map(([label, id, val], i) => (
                  <tr key={id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid #f0f0f0' }}>
                      <div>{label}</div>
                      <div style={{ fontSize: 10, color: '#bbb', marginTop: 1 }}>ID: {id}</div>
                    </td>
                    <td style={{ padding: '9px 12px', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>
                      <span style={{
                        fontSize: 16, fontWeight: 700, color: '#0F6E56',
                      }}>{val}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontSize: 11, color: '#bbb', marginTop: 12, textAlign: 'center' }}>
              OrgUnit : {resultat.orgUnit} • mK8rIhPHxq7
            </div>
          </div>
        )}

        {/* Erreur */}
        {etat === 'error' && (
          <div>
            <div style={{
              background: '#FCEBEB', border: '1px solid #E24B4A',
              borderRadius: 8, padding: '12px 14px', marginBottom: 16,
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>❌</span>
              <div>
                <div style={{ fontSize: 13, color: '#791F1F', fontWeight: 500, marginBottom: 4 }}>
                  Échec de la synchronisation
                </div>
                <div style={{ fontSize: 12, color: '#A32D2D' }}>
                  {resultat?.erreur || 'Erreur inconnue'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>
              Vérifiez que DHIS2 est accessible sur{' '}
              <a href="https://vps-27978dbd.vps.ovh.net/dhis2" target="_blank" rel="noreferrer"
                style={{ color: '#0F6E56' }}>
                51.178.143.214:8080/dhis2
              </a>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {etat === 'loading' && (
            <button onClick={onFermer} style={{
              padding: '8px 18px', border: '1px solid #ddd', borderRadius: 8,
              fontSize: 13, cursor: 'pointer', background: '#fff', color: '#555',
            }}>
              Annuler
            </button>
          )}
          {etat === 'success' && (
            <button onClick={onFermer} style={{
              padding: '8px 20px', background: '#0F6E56', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>
              Fermer ✓
            </button>
          )}
          {etat === 'error' && (
            <>
              <button onClick={onFermer} style={{
                padding: '8px 18px', border: '1px solid #ddd', borderRadius: 8,
                fontSize: 13, cursor: 'pointer', background: '#fff',
              }}>
                Fermer
              </button>
              <button onClick={onReessayer} style={{
                padding: '8px 18px', background: '#1A5276', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>
                🔄 Réessayer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Page principale
export default function Dashboard() {
  const navigate = useNavigate()
  const [stats,         setStats]         = useState(null)
  const [consultations, setConsultations] = useState([])
  const [patients,      setPatients]      = useState([])
  const [graphData,     setGraphData]     = useState([])
  const [chargement,    setChargement]    = useState(true)
  const [etatSync,      setEtatSync]      = useState({ isOnline: true, queueCount: 0 })

  // États DHIS2
  const [dhis2Etat,    setDhis2Etat]    = useState(null)   // null | loading | success | error
  const [dhis2Resultat,setDhis2Resultat]= useState(null)
  const [dhis2Modal,   setDhis2Modal]   = useState(false)

  useEffect(() => {
    const desabonner = subscribeToQueue(setEtatSync)
    return desabonner
  }, [])

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
        setStats(prev => prev || { total_patients: '—', total_consultations: '—' })
      } finally {
        setChargement(false)
      }
    }
    charger()
  }, [])

  //  Synchronisation DHIS2 
  const syncDhis2 = async () => {
    setDhis2Etat('loading')
    setDhis2Resultat(null)
    setDhis2Modal(true)
    try {
      const res = await API.post('/dhis2/sync')
      setDhis2Resultat(res.data)
      setDhis2Etat('success')
    } catch (err) {
      setDhis2Resultat({
        erreur: err?.response?.data?.detail || 'Impossible de joindre DHIS2'
      })
      setDhis2Etat('error')
    }
  }

  const fermerDhis2 = () => {
    setDhis2Modal(false)
    setDhis2Etat(null)
    setDhis2Resultat(null)
  }

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

        {/* Boutons d'action */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>

          {/* Bouton DHIS2 */}
          <button
            onClick={syncDhis2}
            disabled={dhis2Etat === 'loading'}
            style={{
              padding: '9px 16px',
              background: dhis2Etat === 'loading' ? '#888' : '#1A5276',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: dhis2Etat === 'loading' ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: dhis2Etat === 'loading' ? 0.7 : 1,
              transition: 'all .15s',
            }}
          >
            {dhis2Etat === 'loading' ? '⏳ Envoi…' : '🔗 Synchroniser DHIS2'}
          </button>

          {/* Bouton Nouvelle consultation */}
          <button
            onClick={() => navigate('/consultation')}
            style={{
              padding: '9px 18px',
              background: '#0F6E56',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + Nouvelle consultation
          </button>
        </div>
      </div>

      {/* Bannière offline */}
      {(!etatSync.isOnline || etatSync.queueCount > 0) && (
        <div style={{
          background: etatSync.isOnline ? '#E1F5EE' : '#FAEEDA',
          border: `1px solid ${etatSync.isOnline ? '#1D9E75' : '#EF9F27'}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          fontSize: 13, color: etatSync.isOnline ? '#085041' : '#633806',
          display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <span>{etatSync.isOnline ? '🔄' : '⚠️'}</span>
          {!etatSync.isOnline && <strong>Mode hors ligne — </strong>}
          {etatSync.queueCount > 0 && <span><strong>{etatSync.queueCount}</strong> action(s) en attente de synchronisation</span>}
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
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Dernières consultations</span>
            <span style={{ fontSize: 12, color: '#0F6E56', cursor: 'pointer' }} onClick={() => navigate('/patients')}>Voir tout →</span>
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

        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Patients récents</span>
            <span style={{ fontSize: 12, color: '#0F6E56', cursor: 'pointer' }} onClick={() => navigate('/patients')}>Voir tout →</span>
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

      {/* Modal DHIS2 */}
      {dhis2Modal && (
        <ModalDhis2
          etat={dhis2Etat}
          resultat={dhis2Resultat}
          onFermer={fermerDhis2}
          onReessayer={syncDhis2}
        />
      )}
    </div>
  )
}
