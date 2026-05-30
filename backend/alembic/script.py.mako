"""${message}

Identifiant : ${up_revision}
Date        : ${create_date}
Auteur      : Alembic (auto-généré)

Modifications de la version précédente : ${down_revision | comma,n}
"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# Identifiant unique de cette migration
revision = ${repr(up_revision)}

# Identifiant de la migration précédente (pour permettre le rollback)
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on    = ${repr(depends_on)}


def upgrade() -> None:
    """Applique les modifications (aller)."""
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    """Annule les modifications (retour arrière)."""
    ${downgrades if downgrades else "pass"}
