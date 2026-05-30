# 🔧 Rapport de corrections — SantéIntégrée v1.1.0

## Bugs critiques corrigés

### Bug #1 — ActionEnum : valeurs manquantes
**Fichier** : `backend/app/models.py`
**Symptôme** : `AttributeError: 'ActionEnum' has no attribute 'login_failed'` au démarrage
**Correction** : Ajout de `login_failed`, `archive_patient`, `create_consultation`,
`update_consultation`, `delete_consultation`, `logout`, `sync_offline`

### Bug #2 — AuditLog : champs inexistants
**Fichiers** : `models.py`, tous les routers
**Symptôme** : `TypeError: __init__() got unexpected keyword argument 'detail'`
**Correction** : Renommage `table_name→entity_type`, `record_id→entity_id`, `details→detail`

### Bug #3 — Consultation : champs incorrects
**Fichier** : `backend/app/models.py`
**Symptôme** : `AttributeError: 'Consultation' has no attribute 'date_visite'`
**Correction** :
- `date_consultation` → `date_visite` (match frontend et routers)
- `tension_systolique` + `tension_diastolique` → `tension: String` ("120/80")

### Bug #4 — User : champ last_login manquant
**Fichier** : `backend/app/models.py`
**Symptôme** : `AttributeError: 'User' object has no attribute 'last_login'`
**Correction** : Ajout de `last_login = Column(DateTime, nullable=True)`

### Bug #5 — PatientPage/ConsultationPage : clé `pages` vs `total_pages`
**Fichier** : `backend/app/schemas.py`
**Symptôme** : Erreur 422 sur les réponses paginées (champ `total_pages` non défini)
**Correction** : `pages: int` → `total_pages: int` dans les deux schémas

### Bug #6 — SexeEnum : valeurs 'M'/'F' au lieu de 'Masculin'/'Féminin'
**Fichier** : `backend/app/models.py`
**Symptôme** : Erreur 422 quand le frontend envoyait "Masculin" (attendait "M")
**Correction** : `M="M"` → `Masculin="Masculin"`, `F="F"` → `Feminin="Féminin"`

### Bug #7 — ConsultationOut : `agent_nom` vs `agent`
**Fichier** : `backend/app/schemas.py`
**Symptôme** : Le nom de l'agent ne s'affichait pas dans le frontend
**Correction** : `agent_nom: Optional[str]` → `agent: Optional[str]`

### Bug #8 — Patient : champs `tension` et `glycemie` manquants
**Fichier** : `backend/app/models.py` + `schemas.py`
**Symptôme** : Les mesures initiales du patient n'étaient pas sauvegardées
**Correction** : Ajout de `tension (String)` et `glycemie (Float)` dans Patient

### Bug #9 — `lazy="dynamic"` deprecated SQLAlchemy 2.0
**Fichier** : `backend/app/models.py`
**Symptôme** : `LegacyAPIWarning` + comportement incorrect des relations
**Correction** : Suppression de `lazy="dynamic"`, retour au défaut `"select"`

### Bug #10 — `maladie` : SAEnum incompatible avec `ilike()`
**Fichier** : `backend/app/models.py`
**Symptôme** : Les statistiques par pathologie ne fonctionnaient pas
**Correction** : `maladie = Column(SAEnum(MaladieEnum))` → `Column(String(50))`

### Bug #11 — `sexe` et `maladie` : `nullable=False` trop strict
**Fichier** : `backend/app/models.py`
**Symptôme** : Erreur 500 si le frontend n'envoyait pas ces champs
**Correction** : Passage à `nullable=True`

### Bug #12 — PatientCreate/ConsultationCreate : `sexe` et `maladie` requis
**Fichier** : `backend/app/schemas.py`
**Symptôme** : Erreur 422 si le formulaire soumis sans ces champs
**Correction** : `Optional[str] = None` pour ces champs dans le schéma
