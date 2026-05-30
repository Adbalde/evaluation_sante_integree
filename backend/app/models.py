"""
models.py — sante-integree  [VERSION CORRIGÉE]
=============================================================
Tables de la base de données PostgreSQL via SQLAlchemy ORM.

CORRECTIONS APPLIQUÉES :
  - SexeEnum         : M/F → "Masculin"/"Féminin" (match frontend)
  - ActionEnum       : ajout des valeurs manquantes utilisées dans les routers
  - Patient          : sexe et maladie nullable, ajout tension/glycemie,
                       maladie en String (ilike sur SAEnum ne marche pas)
  - Consultation     : date_consultation → date_visite, fusion
                       tension_systolique + tension_diastolique → tension (String)
                       suppression traitement (non utilisé)
  - AuditLog         : table_name→entity_type, record_id→entity_id, details→detail
  - User             : ajout last_login
  - Relations        : suppression lazy="dynamic" (deprecated SQLAlchemy 2.0),
                       correction order_by string syntax
=============================================================
"""

import enum
from datetime import datetime, date

from sqlalchemy import (
    Column, Integer, String, Boolean, Date, DateTime,
    Float, Text, ForeignKey, Enum as SAEnum, Index, event
)
from sqlalchemy.orm import relationship, validates
from sqlalchemy.sql import func

from .database import Base


# =============================================================
# ÉNUMÉRATIONS
# =============================================================

class RoleEnum(str, enum.Enum):
    """Rôles possibles pour un utilisateur"""
    admin = "admin"   # Peut tout faire, y compris gérer les comptes
    agent = "agent"   # Peut gérer patients et consultations


class SexeEnum(str, enum.Enum):
    """
    Sexe du patient.
    CORRECTION : valeurs longues pour correspondre exactement au frontend
    (le frontend envoie "Masculin" et "Féminin")
    """
    Masculin = "Masculin"
    Feminin  = "Féminin"


class ActionEnum(str, enum.Enum):
    """
    Types d'actions enregistrées dans le journal d'audit.
    CORRECTION : ajout de toutes les valeurs utilisées dans les routers
    """
    # Authentification
    login           = "login"
    login_failed    = "login_failed"    # ← Ajouté (manquait)
    logout          = "logout"          # ← Ajouté (manquait)

    # Patients
    create_patient  = "create_patient"
    update_patient  = "update_patient"
    archive_patient = "archive_patient" # ← Ajouté (manquait)
    delete_patient  = "delete_patient"

    # Consultations
    create_consultation = "create_consultation"  # ← Renommé (était create_consult)
    update_consultation = "update_consultation"  # ← Renommé
    delete_consultation = "delete_consultation"  # ← Renommé

    # Utilisateurs
    create_user     = "create_user"
    update_user     = "update_user"
    delete_user     = "delete_user"

    # Synchronisation offline
    sync_offline    = "sync_offline"    # ← Ajouté (manquait)


# =============================================================
# MIXIN — colonnes communes à plusieurs tables
# =============================================================

class TimestampMixin:
    """
    Ajoute created_at et updated_at à un modèle.
    CORRECTION : utilisation de func.now() (côté serveur DB, plus fiable)
    """
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),  # La DB remplit ce champ automatiquement
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=True
    )


# =============================================================
# TABLE : users
# =============================================================

class User(TimestampMixin, Base):
    """
    Compte d'un agent de santé ou administrateur.
    CORRECTION : ajout de last_login (utilisé dans routers/users.py)
    """
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    username        = Column(String(50), unique=True, nullable=False, index=True)
    email           = Column(String(100), unique=True, nullable=True)
    full_name       = Column(String(100), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(SAEnum(RoleEnum), default=RoleEnum.agent, nullable=False)
    is_active       = Column(Boolean, default=True, nullable=False)

    # CORRECTION : ajout de last_login (référencé dans routers/users.py ligne 77)
    last_login      = Column(DateTime(timezone=True), nullable=True)

    # Relations
    consultations = relationship("Consultation", back_populates="agent")
    audit_logs    = relationship("AuditLog", back_populates="user")

    def __repr__(self):
        return f"<User {self.username} ({self.role})>"


# =============================================================
# TABLE : patients
# =============================================================

class Patient(TimestampMixin, Base):
    """
    Dossier médical d'un patient.

    CORRECTIONS :
    - sexe      : nullable=True (frontend peut ne pas l'envoyer)
    - maladie   : String (pas SAEnum) pour que ilike() fonctionne dans stats
    - maladie   : nullable=True
    - tension   : ajouté (le form patient du frontend envoie ce champ)
    - glycemie  : ajouté (le form patient du frontend envoie ce champ)
    """
    __tablename__ = "patients"

    id       = Column(Integer, primary_key=True, index=True)
    local_id = Column(String(36), unique=True, nullable=True, index=True)

    # ── Identité ────────────────────────────────────────────
    nom            = Column(String(100), nullable=False)
    prenom         = Column(String(100), nullable=False)
    date_naissance = Column(Date, nullable=True)

    # CORRECTION : nullable=True (le form peut envoyer "" qui deviendra None)
    sexe           = Column(SAEnum(SexeEnum), nullable=True)

    # ── Contact ─────────────────────────────────────────────
    telephone      = Column(String(20),  nullable=True)
    localite       = Column(String(100), nullable=True)
    adresse        = Column(Text,        nullable=True)

    # ── Informations médicales ───────────────────────────────
    # CORRECTION : String au lieu de SAEnum pour que ilike() fonctionne
    # CORRECTION : nullable=True
    maladie      = Column(String(50), nullable=True)
    antecedents  = Column(Text,       nullable=True)

    # CORRECTION : tension et glycemie ajoutés (envoyés par le form frontend)
    tension      = Column(String(20), nullable=True)
    glycemie     = Column(Float,      nullable=True)

    # ── Archivage logique ────────────────────────────────────
    is_archived  = Column(Boolean,              default=False, nullable=False)
    archived_at  = Column(DateTime(timezone=True), nullable=True)

    # CORRECTION : suppression lazy="dynamic" (deprecated SQLAlchemy 2.0)
    # CORRECTION : suppression order_by string syntax (incompatible SQLAlchemy 2.0)
    consultations = relationship(
        "Consultation",
        back_populates="patient",
        cascade="all, delete-orphan",
    )

    # Index pour accélérer les recherches fréquentes
    __table_args__ = (
        Index("idx_patient_localite_active", "localite", "is_archived"),
        Index("idx_patient_maladie_active",  "maladie",  "is_archived"),
    )

    @property
    def nom_complet(self):
        return f"{self.prenom} {self.nom}"

    @property
    def age(self):
        if not self.date_naissance:
            return None
        today = date.today()
        a = today.year - self.date_naissance.year
        if (today.month, today.day) < (self.date_naissance.month, self.date_naissance.day):
            a -= 1
        return a

    @validates("telephone")
    def valide_telephone(self, key, value):
        if value:
            return value.replace(" ", "").replace("-", "")
        return value

    def __repr__(self):
        return f"<Patient {self.nom_complet} (id={self.id})>"


# ── Listener archived_at ────────────────────────────────────
@event.listens_for(Patient, "before_update")
def patient_before_update(mapper, connection, target):
    if target.is_archived and not target.archived_at:
        target.archived_at = datetime.utcnow()
    elif not target.is_archived:
        target.archived_at = None


# =============================================================
# TABLE : consultations
# =============================================================

class Consultation(TimestampMixin, Base):
    """
    Visite médicale pour un patient.

    CORRECTIONS :
    - date_consultation  → date_visite (match frontend + routers/stats)
    - tension_systolique + tension_diastolique → tension String "120/80"
      (le frontend envoie une chaîne, les routers s'attendent à une chaîne)
    - suppression traitement (non utilisé dans le frontend)
    """
    __tablename__ = "consultations"

    id       = Column(Integer, primary_key=True, index=True)
    local_id = Column(String(36), unique=True, nullable=True, index=True)

    # Liens vers d'autres tables
    patient_id = Column(Integer, ForeignKey("patients.id",  ondelete="CASCADE"), nullable=False)
    agent_id   = Column(Integer, ForeignKey("users.id",     ondelete="SET NULL"), nullable=True)

    # CORRECTION : date_consultation → date_visite
    date_visite = Column(Date, nullable=False, default=date.today)

    # CORRECTION : tension unifiée en une chaîne "120/80" (comme frontend)
    tension     = Column(String(20), nullable=True)
    glycemie    = Column(Float,      nullable=True)
    poids       = Column(Float,      nullable=True)

    # Observations cliniques
    symptomes   = Column(Text, nullable=True)
    notes       = Column(Text, nullable=True)

    # Relations
    patient = relationship("Patient", back_populates="consultations")
    agent   = relationship("User",    back_populates="consultations")

    __table_args__ = (
        Index("idx_consult_patient_date", "patient_id", "date_visite"),
    )

    @property
    def niveau_tension(self):
        """Évalue la tension à partir de la chaîne '120/80'"""
        if not self.tension or "/" not in self.tension:
            return None
        try:
            sys_val = int(self.tension.split("/")[0])
            dia_val = int(self.tension.split("/")[1])
        except (ValueError, IndexError):
            return None
        if sys_val >= 140 or dia_val >= 90:
            return "hypertension"
        if sys_val >= 130 or dia_val >= 80:
            return "elevee"
        return "normal"

    @property
    def niveau_glycemie(self):
        if not self.glycemie:
            return None
        if self.glycemie >= 7.0:
            return "diabete"
        if self.glycemie >= 5.6:
            return "pre_diabete"
        return "normal"

    def __repr__(self):
        return f"<Consultation patient_id={self.patient_id} date={self.date_visite}>"


# =============================================================
# TABLE : audit_logs
# =============================================================

class AuditLog(Base):
    """
    Journal immuable de toutes les actions importantes.

    CORRECTIONS :
    - table_name  → entity_type  (match routers qui utilisent entity_type=)
    - record_id   → entity_id    (match routers qui utilisent entity_id=)
    - details     → detail       (match routers qui utilisent detail=)
    """
    __tablename__ = "audit_logs"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action     = Column(SAEnum(ActionEnum), nullable=False, index=True)

    # CORRECTIONS : renommage des colonnes
    entity_type = Column(String(50), nullable=True)   # Ex: "Patient", "Consultation"
    entity_id   = Column(Integer,    nullable=True)   # Ex: 42
    detail      = Column(Text,       nullable=True)   # Description lisible

    ip_address  = Column(String(45), nullable=True)
    created_at  = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )

    user = relationship("User", back_populates="audit_logs")

    def __repr__(self):
        return f"<AuditLog {self.action} by user_id={self.user_id}>"
