import enum
from datetime import datetime, date

from sqlalchemy import (
    Column, Integer, String, Boolean, Date, DateTime,
    Float, Text, ForeignKey, Enum as SAEnum, Index, event
)
from sqlalchemy.orm import relationship, validates
from sqlalchemy.sql import func

from .database import Base


# ÉNUMÉRATIONS

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
from sqlalchemy import (
    Column, Integer, String, Float, Date,
    DateTime, ForeignKey, Boolean, Text, Index, event
)
from sqlalchemy.orm import relationship, validates
from sqlalchemy.sql import func
from .database import Base
import re


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    username        = Column(String(50),  unique=True, nullable=False, index=True)
    email           = Column(String(150), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(String(20),  default="agent", nullable=False)
    is_active       = Column(Boolean, default=True, nullable=False)
    last_login      = Column(DateTime(timezone=True), nullable=True)

    consultations = relationship("Consultation", back_populates="agent")
    audit_logs    = relationship("AuditLog", back_populates="user",
                                 cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User id={self.id} username={self.username!r}>"


class Patient(Base, TimestampMixin):
    __tablename__ = "patients"

    id             = Column(Integer, primary_key=True, index=True)
    prenom         = Column(String(100), nullable=False)
    nom            = Column(String(100), nullable=False)
    sexe           = Column(String(20),  nullable=True)
    date_naissance = Column(Date,        nullable=True)
    telephone      = Column(String(25),  nullable=True, index=True)
    localite       = Column(String(150), nullable=True, index=True)
    adresse        = Column(String(255), nullable=True)
    maladie        = Column(String(100), nullable=True, index=True)
    tension        = Column(String(20),  nullable=True)
    glycemie       = Column(Float,       nullable=True)
    poids          = Column(Float,       nullable=True)
    local_id       = Column(String(36),  unique=True, nullable=True, index=True)
    is_archived    = Column(Boolean, default=False, nullable=False)
    archived_at    = Column(DateTime(timezone=True), nullable=True)

    consultations = relationship(
        "Consultation", back_populates="patient",
        cascade="all, delete-orphan",
        order_by="Consultation.date_visite.desc()",
    )

    __table_args__ = (
        Index("ix_patients_nom_prenom",    "nom", "prenom"),
        Index("ix_patients_maladie_actif", "maladie", "is_archived"),
    )

    @property
    def nom_complet(self):
        return f"{self.prenom} {self.nom}"

    @property
    def age(self):
        if not self.date_naissance:
            return None
        from datetime import date
        today = date.today()
        d = self.date_naissance
        return today.year - d.year - ((today.month, today.day) < (d.month, d.day))

    def __repr__(self):
        return f"<Patient id={self.id} nom={self.nom_complet!r}>"


class Consultation(Base, TimestampMixin):
    __tablename__ = "consultations"

    id          = Column(Integer, primary_key=True, index=True)
    patient_id  = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    agent_id    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"),
                         nullable=True)
    date_visite = Column(Date,        nullable=False, index=True)
    tension     = Column(String(20),  nullable=True)
    glycemie    = Column(Float,       nullable=True)
    poids       = Column(Float,       nullable=True)
    symptomes   = Column(String(500), nullable=True)
    notes       = Column(Text,        nullable=True)
    local_id    = Column(String(36),  unique=True, nullable=True, index=True)

    patient = relationship("Patient", back_populates="consultations")
    agent   = relationship("User",    back_populates="consultations")

    __table_args__ = (
        Index("ix_consultations_patient_date", "patient_id", "date_visite"),
    )

    def __repr__(self):
        return f"<Consultation id={self.id} patient_id={self.patient_id}>"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"),
                         nullable=True, index=True)
    action      = Column(String(100), nullable=False, index=True)
    detail      = Column(Text,        nullable=True)
    entity_type = Column(String(50),  nullable=True)
    entity_id   = Column(Integer,     nullable=True)
    ip_address  = Column(String(45),  nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(),
                         nullable=False, index=True)

    user = relationship("User", back_populates="audit_logs")

    def __repr__(self):
        return f"<AuditLog id={self.id} action={self.action}>"


@event.listens_for(Patient, "before_update")
def patient_before_update(mapper, connection, target):
    from datetime import datetime, timezone
    if target.is_archived and target.archived_at is None:
        target.archived_at = datetime.now(timezone.utc)
