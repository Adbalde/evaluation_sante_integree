# ──────────────────────────────────────────────────────────────────────────────
#  alembic/env.py — Configuration de l'environnement Alembic
#  Ce fichier explique à Alembic :
#    - Comment se connecter à la base de données
#    - Quels modèles surveiller pour générer des migrations
# ──────────────────────────────────────────────────────────────────────────────

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv
import os
import sys

# Ajoute le dossier parent au chemin Python pour importer app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Charge les variables d'environnement depuis .env
load_dotenv()

# Importe les modèles pour qu'Alembic les "voit"
from app.database import Base
from app import models  # Importe tous les modèles

# Objet de configuration Alembic (lu depuis alembic.ini)
config = context.config

# Configure les logs selon le fichier alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Donne à Alembic les métadonnées des modèles SQLAlchemy
# C'est ce qui permet à --autogenerate de détecter les changements
target_metadata = Base.metadata

# Surcharge l'URL de la base de données avec la variable d'environnement
# (pour ne pas stocker l'URL en dur dans alembic.ini)
database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/sante_integree")
config.set_main_option("sqlalchemy.url", database_url)


def run_migrations_offline() -> None:
    """
    Mode "offline" : génère le SQL sans se connecter vraiment à la base.
    Utile pour générer un script SQL à exécuter plus tard.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Mode "online" : se connecte à la base et applique les migrations.
    Mode utilisé dans la plupart des cas.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # Pas de pool en mode migration
    )
    with connectable.connect() as connexion:
        context.configure(
            connection=connexion,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


# Lance le bon mode selon le contexte
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
