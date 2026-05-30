# 🏥 SantéIntégrée — Système de Gestion E-Santé

> Application web de gestion des patients et consultations pour agents de santé,
> conçue pour fonctionner en contexte de connectivité instable (offline-first).

---

## 🎯 Présentation

**SantéIntégrée** est une application web e-santé destinée aux agents de santé
opérant dans des zones à connectivité instable. Elle permet :

- L'enregistrement rapide de patients et de consultations
- Le fonctionnement **sans connexion Internet** (mode offline-first)
- La synchronisation automatique dès retour de connexion
- Un tableau de bord de suivi épidémiologique
- L'intégration avec **DHIS2** pour l'interopérabilité nationale

---

## 🏗 Architecture

```
Nginx (reverse proxy — port 80/443)
  ├── /api/*    → Backend FastAPI  (port 8000 interne)
  ├── /dhis2/*  → DHIS2            (port 8080 interne)
  └── /*        → Frontend React   (port 80 interne)
                        ↓
                   PostgreSQL 15   (port 5432 interne)
```

---

## ⚙️ Installation rapide (Docker)

```bash
# 1. Clone le projet
git clone https://github.com/<ton-compte>/sante-integree.git
cd sante-integree

# 2. Configure les variables d'environnement
cp .env.example .env
nano .env   # Modifie les mots de passe

# 3. Lance tout
docker compose up -d --build

# 4. Vérifie que tout tourne
docker compose ps
```

L'application est accessible sur **http://localhost**

---

## 🔐 Comptes de test

| Utilisateur | Mot de passe | Rôle  |
|-------------|-------------|-------|
| `admin`     | `Admin1234!` | Admin |
| `agent`     | `Agent1234!` | Agent |

---

## 📖 URLs importantes

| URL                       | Description          |
|---------------------------|----------------------|
| `http://localhost`        | Application frontend |
| `http://localhost/api/docs` | Swagger UI (API)   |
| `http://localhost/dhis2`  | Interface DHIS2      |
| `http://localhost/api/health` | Health check     |

---

## 🛠 Stack technique

| Couche      | Technologie              |
|-------------|--------------------------|
| Backend     | FastAPI + Python 3.11    |
| Base de données | PostgreSQL 15        |
| ORM         | SQLAlchemy 2.0           |
| Migrations  | Alembic                  |
| Authentification | JWT + bcrypt        |
| Frontend    | React 18 + Vite          |
| Routing SPA | React Router 6           |
| HTTP client | Axios                    |
| Offline     | IndexedDB (via idb)      |
| Infra       | Docker Compose + Nginx   |
| E-santé     | DHIS2 2.40               |

---

## 📁 Structure du projet

```
sante-integree/
├── .env.example              # Modèle de configuration
├── .gitignore
├── docker-compose.yml        # Orchestration Docker
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   └── env.py
│   └── app/
│       ├── main.py           # Point d'entrée FastAPI
│       ├── database.py       # Connexion SQLAlchemy
│       ├── models.py         # Tables PostgreSQL
│       ├── schemas.py        # Validation Pydantic
│       ├── auth.py           # JWT + bcrypt
│       └── routers/
│           ├── users.py
│           ├── patients.py
│           ├── consultations.py
│           └── stats.py
├── frontend/
│   ├── Dockerfile
│   ├── nginx-spa.conf
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── context/AuthContext.jsx
│       ├── services/api.js
│       ├── services/offlineQueue.js
│       ├── components/Layout.jsx
│       ├── components/OfflineBanner.jsx
│       └── pages/
│           ├── Login.jsx
│           ├── Dashboard.jsx
│           ├── Patients.jsx
│           ├── NouvelleConsultation.jsx
│           └── DossierPatient.jsx
└── nginx/
    └── nginx.conf
```

---

## 💻 Commandes utiles

```bash
# Démarrer
docker compose up -d --build

# Voir les logs
docker compose logs -f backend

# Arrêter (conserve les données)
docker compose down

# Repartir de zéro (efface les données)
docker compose down -v

# Appliquer les migrations
docker compose exec backend alembic upgrade head

# Sauvegarder la base
docker compose exec postgres pg_dump -U postgres sante_integree > backup.sql
```

---

## 📴 Mode offline

- Actions hors ligne stockées dans **IndexedDB** (navigateur)
- Synchronisation automatique au retour de connexion
- **Retry** exponentiel (2s, 5s, 15s, 30s, 60s)
- **Déduplication** par `local_id` UUID pour éviter les doublons
- Bannière visuelle indiquant l'état de synchronisation

---

*SantéIntégrée — Développé dans le cadre de l'évaluation e-santé*
