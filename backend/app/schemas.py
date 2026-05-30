"""
schemas.py — sante-integree  [VERSION CORRIGÉE]
=============================================================
Schémas Pydantic pour la validation des données.

CORRECTIONS APPLIQUÉES :
  - PatientBase  : sexe et maladie Optional, ajout tension/glycemie
  - PatientPage  : pages → total_pages (match routers)
  - ConsultationBase : date_consultation→date_visite,
                       tension_systolique+diastolique → tension String
  - ConsultationOut  : agent_nom → agent (match ce que le router injecte)
  - ConsultationPage : pages → total_pages (match routers)
  - UserOut      : full_name ajouté
  - SyncPayload  : aligné avec offlineQueue.js côté frontend
=============================================================
"""

from datetime import datetime, date
from typing import Optional, List, Dict
from pydantic import BaseModel, EmailStr, field_validator

from .models import RoleEnum


# =============================================================
# AUTHENTIFICATION
# =============================================================

class Token(BaseModel):
    """Réponse retournée après une connexion réussie"""
    access_token: str
    token_type:   str


class TokenData(BaseModel):
    """Données extraites d'un token JWT (usage interne)"""
    username: Optional[str] = None


# =============================================================
# UTILISATEURS
# =============================================================

class UserBase(BaseModel):
    username:  str
    email:     Optional[EmailStr] = None
    full_name: Optional[str]      = None
    role:      RoleEnum           = RoleEnum.agent


class UserCreate(UserBase):
    """Données pour créer un compte. Mot de passe min 8 caractères."""
    password: str

    @field_validator("password")
    @classmethod
    def valide_mot_de_passe(cls, v):
        if len(v) < 8:
            raise ValueError("Le mot de passe doit faire au moins 8 caractères")
        return v


class UserUpdate(BaseModel):
    """Modification d'un compte — tous les champs sont optionnels."""
    email:     Optional[EmailStr] = None
    full_name: Optional[str]      = None
    role:      Optional[RoleEnum] = None
    is_active: Optional[bool]     = None
    password:  Optional[str]      = None


class UserOut(UserBase):
    """Réponse quand on lit un compte utilisateur"""
    id:         int
    is_active:  bool
    created_at: datetime

    model_config = {"from_attributes": True}


# =============================================================
# PATIENTS
# =============================================================

class PatientBase(BaseModel):
    """Champs communs patient"""
    nom:            str
    prenom:         str
    date_naissance: Optional[date]  = None

    # CORRECTION : Optional (le frontend peut ne pas envoyer ces champs)
    sexe:           Optional[str]   = None
    telephone:      Optional[str]   = None
    localite:       Optional[str]   = None
    adresse:        Optional[str]   = None
    maladie:        Optional[str]   = None
    antecedents:    Optional[str]   = None

    # CORRECTION : ajout tension et glycemie (envoyés par le form patient)
    tension:        Optional[str]   = None
    glycemie:       Optional[float] = None


class PatientCreate(PatientBase):
    """
    Données pour créer un patient.
    local_id = UUID côté client pour déduplication offline.
    """
    local_id: Optional[str] = None


class PatientUpdate(BaseModel):
    """Modification d'un patient — tous les champs optionnels."""
    nom:            Optional[str]   = None
    prenom:         Optional[str]   = None
    date_naissance: Optional[date]  = None
    sexe:           Optional[str]   = None
    telephone:      Optional[str]   = None
    localite:       Optional[str]   = None
    adresse:        Optional[str]   = None
    maladie:        Optional[str]   = None
    antecedents:    Optional[str]   = None
    tension:        Optional[str]   = None
    glycemie:       Optional[float] = None


class PatientOut(PatientBase):
    """Données renvoyées quand on lit un patient"""
    id:          int
    local_id:    Optional[str]      = None
    is_archived: bool
    created_at:  datetime
    updated_at:  Optional[datetime] = None
    # Champs calculés depuis les @property du modèle
    age:         Optional[int]      = None
    nom_complet: Optional[str]      = None

    model_config = {"from_attributes": True}


class PatientPage(BaseModel):
    """Réponse paginée pour la liste des patients"""
    items:       List[PatientOut]
    total:       int
    page:        int
    per_page:    int
    # CORRECTION : pages → total_pages (les routers retournent "total_pages")
    total_pages: int


# =============================================================
# CONSULTATIONS
# =============================================================

class ConsultationBase(BaseModel):
    """Champs communs consultation"""
    patient_id:  int

    # CORRECTION : date_consultation → date_visite (match frontend + routers)
    date_visite: date

    # CORRECTION : tension unifiée en String "120/80" (match frontend + models)
    tension:     Optional[str]   = None
    glycemie:    Optional[float] = None
    poids:       Optional[float] = None
    symptomes:   Optional[str]   = None
    notes:       Optional[str]   = None


class ConsultationCreate(ConsultationBase):
    """Données pour créer une consultation. local_id pour déduplication offline."""
    local_id: Optional[str] = None


class ConsultationUpdate(BaseModel):
    """Modification d'une consultation — tous les champs optionnels."""
    date_visite: Optional[date]  = None
    tension:     Optional[str]   = None
    glycemie:    Optional[float] = None
    poids:       Optional[float] = None
    symptomes:   Optional[str]   = None
    notes:       Optional[str]   = None


class ConsultationOut(ConsultationBase):
    """Données renvoyées quand on lit une consultation"""
    id:          int
    local_id:    Optional[str]      = None
    agent_id:    Optional[int]      = None
    created_at:  datetime
    updated_at:  Optional[datetime] = None

    # Champs enrichis depuis les relations (injectés par le router)
    patient_nom: Optional[str] = None    # Nom complet du patient
    maladie:     Optional[str] = None    # Pathologie du patient
    # CORRECTION : agent_nom → agent (le router injecte la clé "agent")
    agent:       Optional[str] = None    # Nom d'utilisateur de l'agent

    model_config = {"from_attributes": True}


class ConsultationPage(BaseModel):
    """Réponse paginée pour la liste des consultations"""
    items:       List[ConsultationOut]
    total:       int
    # CORRECTION : pages → total_pages (les routers retournent "total_pages")
    total_pages: int


# =============================================================
# STATISTIQUES (tableau de bord)
# =============================================================

class StatsOut(BaseModel):
    """Données du tableau de bord principal"""
    total_patients:         int
    total_consultations:    int
    nouveaux_ce_mois:       int
    consultations_ce_mois:  int
    nb_diabete:             int
    nb_hypertension:        int
    nb_les_deux:            int
    nb_autre:               int
    consultations_par_mois: Dict[int, int]


# =============================================================
# SYNCHRONISATION OFFLINE
# =============================================================

class SyncItem(BaseModel):
    """Une action offline en attente d'envoi au serveur"""
    method:   str                    # "post", "put", "delete"
    url:      str                    # Endpoint cible ex: "/patients"
    data:     Optional[dict] = None  # Corps de la requête
    local_id: Optional[str]  = None  # UUID client pour déduplication


class SyncPayload(BaseModel):
    """Lot d'actions offline à rejouer"""
    items: List[SyncItem]
