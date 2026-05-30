"""
routers/patients.py — sante-integree  [VERSION CORRIGÉE]
=============================================================
CORRECTIONS APPLIQUÉES :
  - models.ActionEnum.archive_patient : ok (enum corrigé)
  - AuditLog(detail=..., entity_type=..., entity_id=...) : ok (model corrigé)
  - PatientPage.total_pages : ok (schema corrigé)
  - ilike sur maladie (maintenant String, fonctionne)
=============================================================
"""

import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(prefix="/patients", tags=["👥 Patients"])


# ── GET /patients ─────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=schemas.PatientPage,
    summary="Lister les patients avec recherche et pagination",
)
def lister_patients(
    search:   str = Query("",  description="Recherche par nom/prénom/téléphone/localité"),
    maladie:  str = Query("",  description="Filtrer par pathologie"),
    page:     int = Query(1,   ge=1),
    per_page: int = Query(10,  ge=1, le=100),
    db:       Session = Depends(get_db),
    _:        models.User = Depends(get_current_user),
):
    """Liste paginée des patients actifs avec recherche multicritère."""

    q = db.query(models.Patient).filter(models.Patient.is_archived == False)

    if search:
        terme = f"%{search}%"
        q = q.filter(or_(
            models.Patient.nom.ilike(terme),
            models.Patient.prenom.ilike(terme),
            models.Patient.telephone.ilike(terme),
            models.Patient.localite.ilike(terme),
        ))

    if maladie:
        # ilike fonctionne maintenant que maladie est String (pas SAEnum)
        q = q.filter(models.Patient.maladie.ilike(f"%{maladie}%"))

    total       = q.count()
    total_pages = math.ceil(total / per_page) if total > 0 else 1

    patients = (
        q.order_by(models.Patient.created_at.desc())
         .offset((page - 1) * per_page)
         .limit(per_page)
         .all()
    )

    return {
        "items":       patients,
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "total_pages": total_pages,
    }


# ── GET /patients/{patient_id} ────────────────────────────────────────────────

@router.get(
    "/{patient_id}",
    response_model=schemas.PatientOut,
    summary="Détail d'un patient",
)
def obtenir_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    _:  models.User = Depends(get_current_user),
):
    patient = db.query(models.Patient).filter(
        models.Patient.id == patient_id
    ).first()
    if not patient:
        raise HTTPException(404, f"Patient #{patient_id} introuvable")
    return patient


# ── POST /patients ────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=schemas.PatientOut,
    status_code=status.HTTP_201_CREATED,
    summary="Créer un patient",
)
def creer_patient(
    payload:      schemas.PatientCreate,
    db:           Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Crée un patient. Déduplication offline via local_id :
    si un patient avec le même local_id existe déjà, le retourne sans doublon.
    """
    # Déduplication offline
    if payload.local_id:
        existant = db.query(models.Patient).filter(
            models.Patient.local_id == payload.local_id
        ).first()
        if existant:
            return existant

    # Filtre les champs None pour éviter les conflits avec les valeurs par défaut
    donnees = payload.model_dump(exclude_none=True)
    patient = models.Patient(**donnees)
    db.add(patient)
    db.commit()
    db.refresh(patient)

    db.add(models.AuditLog(
        user_id     = current_user.id,
        action      = models.ActionEnum.create_patient,
        entity_type = "Patient",
        entity_id   = patient.id,
        detail      = f"Patient créé : {patient.prenom} {patient.nom}",
    ))
    db.commit()
    return patient


# ── PUT /patients/{patient_id} ────────────────────────────────────────────────

@router.put(
    "/{patient_id}",
    response_model=schemas.PatientOut,
    summary="Modifier un patient",
)
def modifier_patient(
    patient_id:   int,
    payload:      schemas.PatientUpdate,
    db:           Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    patient = db.query(models.Patient).filter(
        models.Patient.id == patient_id
    ).first()
    if not patient:
        raise HTTPException(404, f"Patient #{patient_id} introuvable")

    for champ, valeur in payload.model_dump(exclude_unset=True).items():
        setattr(patient, champ, valeur)

    db.commit()
    db.refresh(patient)

    db.add(models.AuditLog(
        user_id     = current_user.id,
        action      = models.ActionEnum.update_patient,
        entity_type = "Patient",
        entity_id   = patient.id,
        detail      = f"Patient modifié : {patient.prenom} {patient.nom}",
    ))
    db.commit()
    return patient


# ── DELETE /patients/{patient_id} ─────────────────────────────────────────────

@router.delete(
    "/{patient_id}",
    summary="Archiver un patient (suppression logique)",
)
def archiver_patient(
    patient_id:   int,
    db:           Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Archive le patient (il reste en BDD, ne s'affiche plus)."""
    patient = db.query(models.Patient).filter(
        models.Patient.id == patient_id
    ).first()
    if not patient:
        raise HTTPException(404, f"Patient #{patient_id} introuvable")

    patient.is_archived = True
    db.commit()

    db.add(models.AuditLog(
        user_id     = current_user.id,
        action      = models.ActionEnum.archive_patient,
        entity_type = "Patient",
        entity_id   = patient.id,
        detail      = f"Patient archivé : {patient.prenom} {patient.nom}",
    ))
    db.commit()
    return {"message": f"Patient '{patient.prenom} {patient.nom}' archivé"}
