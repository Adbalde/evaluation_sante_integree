"""
routers/users.py — sante-integree  [VERSION CORRIGÉE]
=============================================================
Routes pour l'authentification et la gestion des utilisateurs.

CORRECTIONS APPLIQUÉES :
  - AuditLog(detail=...)          : ok (model corrigé, field s'appelle detail)
  - models.ActionEnum.login_failed : ok (enum corrigé)
  - user.last_login               : ok (User model corrigé)
  - UserCreate → role str → enum  : conversion robuste ajoutée
  - PUT /users/{id} utilise UserUpdate à la place de UserCreate
=============================================================
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..auth import (
    hash_password, verify_password,
    create_access_token, get_current_user, require_admin,
)

router = APIRouter()


# ── POST /auth/token — Connexion ──────────────────────────────────────────────

@router.post(
    "/auth/token",
    response_model=schemas.Token,
    tags=["🔐 Authentification"],
    summary="Se connecter et obtenir un token JWT",
)
def connexion(
    form: OAuth2PasswordRequestForm = Depends(),
    db:   Session = Depends(get_db),
):
    """Authentifie un utilisateur et retourne un token JWT."""

    user = db.query(models.User).filter(
        models.User.username == form.username
    ).first()

    # Identifiants incorrects
    if not user or not verify_password(form.password, user.hashed_password):
        # Enregistre l'échec si l'utilisateur existe
        if user:
            db.add(models.AuditLog(
                user_id = user.id,
                action  = models.ActionEnum.login_failed,
                detail  = f"Tentative échouée pour {form.username}",
            ))
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nom d'utilisateur ou mot de passe incorrect",
        )

    # Compte désactivé
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé — contactez l'administrateur",
        )

    # Met à jour last_login
    user.last_login = datetime.now(timezone.utc)

    # Journal d'audit
    db.add(models.AuditLog(
        user_id = user.id,
        action  = models.ActionEnum.login,
        detail  = f"Connexion réussie de {user.username}",
    ))
    db.commit()

    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


# ── GET /users/me — Profil courant ────────────────────────────────────────────

@router.get(
    "/users/me",
    response_model=schemas.UserOut,
    tags=["👤 Utilisateurs"],
    summary="Profil de l'utilisateur connecté",
)
def mon_profil(current_user: models.User = Depends(get_current_user)):
    return current_user


# ── GET /users — Liste des utilisateurs (admin) ───────────────────────────────

@router.get(
    "/users",
    response_model=list[schemas.UserOut],
    tags=["👤 Utilisateurs"],
    summary="Lister tous les utilisateurs (admin)",
)
def lister_utilisateurs(
    db:    Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


# ── POST /users — Créer un utilisateur (admin) ────────────────────────────────

@router.post(
    "/users",
    response_model=schemas.UserOut,
    status_code=status.HTTP_201_CREATED,
    tags=["👤 Utilisateurs"],
    summary="Créer un utilisateur (admin)",
)
def creer_utilisateur(
    payload: schemas.UserCreate,
    db:      Session = Depends(get_db),
    admin:   models.User = Depends(require_admin),
):
    # Unicité username
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(400, f"Nom d'utilisateur '{payload.username}' déjà utilisé")

    # Unicité email
    if payload.email and db.query(models.User).filter(
        models.User.email == payload.email
    ).first():
        raise HTTPException(400, f"Email '{payload.email}' déjà utilisé")

    user = models.User(
        username        = payload.username,
        email           = payload.email,
        full_name       = payload.full_name,
        hashed_password = hash_password(payload.password),
        role            = payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    db.add(models.AuditLog(
        user_id     = admin.id,
        action      = models.ActionEnum.create_user,
        entity_type = "User",
        entity_id   = user.id,
        detail      = f"Création de l'utilisateur {user.username}",
    ))
    db.commit()
    return user


# ── PUT /users/{user_id} — Modifier un utilisateur (admin) ───────────────────

@router.put(
    "/users/{user_id}",
    response_model=schemas.UserOut,
    tags=["👤 Utilisateurs"],
    summary="Modifier un utilisateur (admin)",
)
def modifier_utilisateur(
    user_id: int,
    # CORRECTION : UserUpdate au lieu de UserCreate (tous les champs optionnels)
    payload: schemas.UserUpdate,
    db:      Session = Depends(get_db),
    admin:   models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, f"Utilisateur #{user_id} introuvable")

    # Applique seulement les champs fournis
    data = payload.model_dump(exclude_unset=True)
    if "password" in data:
        user.hashed_password = hash_password(data.pop("password"))
    for champ, valeur in data.items():
        setattr(user, champ, valeur)

    db.commit()
    db.refresh(user)

    db.add(models.AuditLog(
        user_id     = admin.id,
        action      = models.ActionEnum.update_user,
        entity_type = "User",
        entity_id   = user.id,
        detail      = f"Modification de {user.username}",
    ))
    db.commit()
    return user


# ── DELETE /users/{user_id} — Supprimer un utilisateur (admin) ───────────────

@router.delete(
    "/users/{user_id}",
    tags=["👤 Utilisateurs"],
    summary="Supprimer un utilisateur (admin)",
)
def supprimer_utilisateur(
    user_id: int,
    db:      Session = Depends(get_db),
    admin:   models.User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(400, "Vous ne pouvez pas supprimer votre propre compte")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, f"Utilisateur #{user_id} introuvable")

    nom = user.username
    db.delete(user)

    db.add(models.AuditLog(
        user_id = admin.id,
        action  = models.ActionEnum.delete_user,
        detail  = f"Suppression de {nom}",
    ))
    db.commit()
    return {"message": f"Utilisateur '{nom}' supprimé"}
