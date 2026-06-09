"""

Ce fichier gère la connexion à la base de données PostgreSQL.

Rôle de chaque composant :
  - engine       : le "moteur" qui parle directement à PostgreSQL
  - SessionLocal : une fabrique de sessions (chaque requête HTTP
                   reçoit sa propre session indépendante)
  - Base         : classe parente de tous les modèles SQLAlchemy
  - get_db()     : dépendance FastAPI qui ouvre/ferme la session
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

#  Lecture de l'URL de connexion depuis les variables d'env ──
# Format : postgresql://utilisateur:motdepasse@hote:port/base
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/sante_integree"
)

#  Création du moteur SQLAlchemy 

# pool_pre_ping=True : vérifie que la connexion est toujours vivante
# avant chaque requête (évite les erreurs "connexion perdue")
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    # Taille du pool de connexions (par défaut 5)
    pool_size=10,
    # Connexions supplémentaires autorisées si le pool est plein
    max_overflow=20,
)

#  Fabrique de sessions 
# autocommit=False : on contrôle manuellement quand valider
# autoflush=False  : on contrôle manuellement les flush
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

#  Classe de base pour tous les modèles 
# Tous les modèles (Patient, Consultation...) héritent de Base
Base = declarative_base()


def get_db():
    """
    Dépendance FastAPI pour obtenir une session de base de données.

    Utilisation dans un router :
        def ma_route(db: Session = Depends(get_db)):
            ...

    La session est automatiquement :
    - ouverte avant la requête
    - fermée après la requête (même en cas d'erreur)
    """
    # Crée une nouvelle session pour cette requête
    db = SessionLocal()
    try:
        # Fournit la session à la fonction appelante
        yield db
    finally:
        # Ferme toujours la session, même si une exception survient
        db.close()
