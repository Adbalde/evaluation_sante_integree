"""
routers/consultations.py — sante-integree  [VERSION CORRIGÉE]
=============================================================
CORRECTIONS APPLIQUÉES :
  - models.Consultation.date_visite  : ok (model corrigé)
  - models.ActionEnum.create_consultation etc. : ok (enum corrigé)
  - AuditLog(detail=..., entity_type=...) : ok (model corrigé)
  - ConsultationPage.total_pages : ok (schema corrigé)
  - donnees["agent"] au lieu de donnees["agent_nom"] : ok (schema corrigé)
  - lister_consultations : retourne page/per_page manquants dans le dict
=============================================================
"""

import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(prefix="/consultations", tags=["📋 Consultations"])


# ── GET /consultations ────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=schemas.ConsultationPage,
    summary="Lister les consultations",
)
def lister_consultations(
    patient_id: int = Query(None, description="Filtrer par patient"),
    page:       int = Query(1,    ge=1),
    per_page:   int = Query(10,   ge=1, le=100),
    db:         Session = Depends(get_db),
    _:          models.User = Depends(get_current_user),
):
    """Liste paginée des consultations, triées par date décroissante."""

    q = db.query(models.Consultation).options(
        joinedload(models.Consultation.patient),
        joinedload(models.Consultation.agent),
    )
    if patient_id:
        q = q.filter(models.Consultation.patient_id == patient_id)

    total       = q.count()
    total_pages = math.ceil(total / per_page) if total > 0 else 1

    # CORRECTION : date_visite (pas date_consultation)
    consultations = (
        q.order_by(models.Consultation.date_visite.desc())
         .offset((page - 1) * per_page)
         .limit(per_page)
         .all()
    )

    # Enrichit avec les données des relations
    resultats = []
    for c in consultations:
        d = schemas.ConsultationOut.model_validate(c).model_dump()
        d["patient_nom"] = f"{c.patient.prenom} {c.patient.nom}" if c.patient else None
        d["maladie"]     = c.patient.maladie  if c.patient else None
        # CORRECTION : clé "agent" (schema corrigé, plus "agent_nom")
        d["agent"]       = c.agent.username   if c.agent  else None
        resultats.append(d)

    return {"items": resultats, "total": total, "total_pages": total_pages}


# ── GET /consultations/{id} ───────────────────────────────────────────────────

@router.get(
    "/{consultation_id}",
    response_model=schemas.ConsultationOut,
    summary="Détail d'une consultation",
)
def obtenir_consultation(
    consultation_id: int,
    db:              Session = Depends(get_db),
    _:               models.User = Depends(get_current_user),
):
    c = db.query(models.Consultation).filter(
        models.Consultation.id == consultation_id
    ).first()
    if not c:
        raise HTTPException(404, f"Consultation #{consultation_id} introuvable")
    return c


# ── POST /consultations ───────────────────────────────────────────────────────

@router.post(
    "",
    response_model=schemas.ConsultationOut,
    status_code=status.HTTP_201_CREATED,
    summary="Créer une consultation",
)
def creer_consultation(
    payload:      schemas.ConsultationCreate,
    db:           Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Enregistre une consultation.
    Déduplication offline via local_id.
    """
    # Déduplication offline
    if payload.local_id:
        existante = db.query(models.Consultation).filter(
            models.Consultation.local_id == payload.local_id
        ).first()
        if existante:
            return existante

    # Vérifie le patient
    patient = db.query(models.Patient).filter(
        models.Patient.id  == payload.patient_id,
        models.Patient.is_archived == False,
    ).first()
    if not patient:
        raise HTTPException(404, f"Patient #{payload.patient_id} introuvable ou archivé")

    consultation = models.Consultation(
        **payload.model_dump(),
        agent_id=current_user.id,
    )
    db.add(consultation)
    db.commit()
    db.refresh(consultation)

    db.add(models.AuditLog(
        user_id     = current_user.id,
        action      = models.ActionEnum.create_consultation,
        entity_type = "Consultation",
        entity_id   = consultation.id,
        # CORRECTION : date_visite (plus date_consultation)
        detail      = f"Consultation pour {patient.prenom} {patient.nom} le {consultation.date_visite}",
    ))
    db.commit()
    return consultation


# ── PUT /consultations/{id} ───────────────────────────────────────────────────

@router.put(
    "/{consultation_id}",
    response_model=schemas.ConsultationOut,
    summary="Modifier une consultation",
)
def modifier_consultation(
    consultation_id: int,
    payload:         schemas.ConsultationUpdate,
    db:              Session = Depends(get_db),
    current_user:    models.User = Depends(get_current_user),
):
    c = db.query(models.Consultation).filter(
        models.Consultation.id == consultation_id
    ).first()
    if not c:
        raise HTTPException(404, f"Consultation #{consultation_id} introuvable")

    for champ, valeur in payload.model_dump(exclude_unset=True).items():
        setattr(c, champ, valeur)

    db.commit()
    db.refresh(c)

    db.add(models.AuditLog(
        user_id     = current_user.id,
        action      = models.ActionEnum.update_consultation,
        entity_type = "Consultation",
        entity_id   = consultation_id,
        detail      = f"Consultation #{consultation_id} modifiée",
    ))
    db.commit()
    return c


# ── DELETE /consultations/{id} ────────────────────────────────────────────────

@router.delete(
    "/{consultation_id}",
    summary="Supprimer une consultation",
)
def supprimer_consultation(
    consultation_id: int,
    db:              Session = Depends(get_db),
    current_user:    models.User = Depends(get_current_user),
):
    c = db.query(models.Consultation).filter(
        models.Consultation.id == consultation_id
    ).first()
    if not c:
        raise HTTPException(404, f"Consultation #{consultation_id} introuvable")

    db.delete(c)

    db.add(models.AuditLog(
        user_id = current_user.id,
        action  = models.ActionEnum.delete_consultation,
        detail  = f"Consultation #{consultation_id} supprimée",
    ))
    db.commit()
    return {"message": f"Consultation #{consultation_id} supprimée"}
