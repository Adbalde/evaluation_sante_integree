from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv
import os, sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from app.database import Base
from app import models

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

database_url = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@postgres:5432/sante_integree"
)
config.set_main_option("sqlalchemy.url", database_url)

# Tables de notre application uniquement
APP_TABLES = {"users", "patients", "consultations", "audit_logs"}

def include_name(name, type_, parent_names):
    """Filtre appliqué AVANT la comparaison — ignore tout sauf nos tables."""
    if type_ == "table":
        return name in APP_TABLES
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_name=include_name,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connexion:
        context.configure(
            connection=connexion,
            target_metadata=target_metadata,
            include_name=include_name,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
