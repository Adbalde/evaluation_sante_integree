#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
#  push-to-github.sh — Pousse le projet vers GitHub (Adbalde)
#  Usage : bash push-to-github.sh
# ──────────────────────────────────────────────────────────────
set -e

REPO="https://github.com/Adbalde/sante-integree.git"
BRANCH="main"

echo ""
echo "════════════════════════════════════════════"
echo "  🚀 Push vers GitHub — Adbalde/sante-integree"
echo "════════════════════════════════════════════"
echo ""

# Vérifie qu'on est dans le bon dossier
if [ ! -f "docker-compose.yml" ]; then
  echo "❌ Lance ce script depuis la racine du projet sante-integree/"
  exit 1
fi

# Initialise Git si nécessaire
if [ ! -d ".git" ]; then
  echo "📁 Initialisation Git..."
  git init
  git config user.name  "Adbalde"
  git config user.email "adbalde@sante-integree.local"
fi

# Configure le remote
if git remote get-url origin &>/dev/null; then
  git remote set-url origin "$REPO"
else
  git remote add origin "$REPO"
fi

echo "📦 Ajout des fichiers..."
git add .

echo ""
echo "📝 Commit initial..."
git commit -m "feat: SantéIntégrée v1.1.0 — production-ready

Stack : FastAPI + React + PostgreSQL + Docker + DHIS2

Backend :
- API REST complète (patients, consultations, stats, auth JWT)
- Déduplication offline via local_id UUID
- Journal d'audit complet
- Migrations Alembic

Frontend :
- Dashboard avec graphiques SVG
- Gestion patients (CRUD + recherche)
- Consultations en 3 étapes
- Dossier patient avec évolution clinique
- Mode offline-first IndexedDB

Infrastructure :
- Docker Compose production-ready
- Nginx reverse proxy
- CI/CD GitHub Actions
- Scan sécurité hebdomadaire
- Dependabot

Corrections v1.1.0 :
- 12 bugs critiques corrigés (ActionEnum, AuditLog, Consultation,
  SexeEnum, PatientPage, lazy=dynamic, ilike sur Enum, etc.)" 2>/dev/null || \
git commit -m "chore: mise à jour vers v1.1.0" 2>/dev/null || \
echo "ℹ️  Rien à commiter (déjà à jour)"

echo ""
echo "🌿 Bascule sur la branche $BRANCH..."
git branch -M "$BRANCH"

echo ""
echo "⬆️  Push vers $REPO ..."
echo "   (GitHub va demander votre token d'accès)"
echo ""
git push -u origin "$BRANCH"

echo ""
echo "════════════════════════════════════════════"
echo "  ✅ Projet publié sur GitHub !"
echo "  🔗 https://github.com/Adbalde/sante-integree"
echo "════════════════════════════════════════════"
echo ""
echo "Prochaines étapes :"
echo "  1. Configurer les Secrets GitHub (voir README)"
echo "  2. Créer un VPS DigitalOcean et y cloner le repo"
echo "  3. Le pipeline CD se déclenchera à chaque push sur main"
