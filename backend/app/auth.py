#  auth.py — Authentification JWT et sécurité
#  Ce fichier gère :
#    - Le hachage des mots de passe avec bcrypt
#    - La création et vérification des tokens JWT
#    - Les dépendances FastAPI pour protéger les routes

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from . import models
from .database import get_db
from dotenv import load_dotenv
import os

# Charge les variables d'environnement
load_dotenv()

#Configuration JWT
# Clé secrète pour signer les tokens (DOIT être longue et aléatoire en prod)
SECRET_KEY = os.getenv("SECRET_KEY", "changez-moi-en-production-avec-une-cle-longue")

# Algorithme de signature du token
ALGORITHM = "HS256"

# Durée de vie du token en minutes (480 = 8 heures)
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 480))

#Contexte de hachage
# bcrypt est l'algorithme recommandé pour les mots de passe
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

#Schéma OAuth2
# Indique à FastAPI où chercher le token dans les requêtes
# Le token doit être dans le header : Authorization: Bearer <token>
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


#  FONCTIONS DE MOT DE PASSE

def hasher_mot_de_passe(mot_de_passe: str) -> str:
    """
    Transforme un mot de passe en clair en hash sécurisé.
    Ex : "Admin1234!" → "$2b$12$abc...xyz"
    Le hash est différent à chaque appel (salt aléatoire).
    """
    return pwd_context.hash(mot_de_passe)

# Alias anglais pour compatibilité avec le reste du code
hash_password = hasher_mot_de_passe


def verifier_mot_de_passe(mot_de_passe_clair: str, hash_stocke: str) -> bool:
    """
    Vérifie qu'un mot de passe correspond à son hash stocké.
    Retourne True si correct, False sinon.
    On ne peut PAS retrouver le mot de passe depuis le hash (sens unique).
    """
    return pwd_context.verify(mot_de_passe_clair, hash_stocke)

# Alias anglais
verify_password = verifier_mot_de_passe


#  FONCTIONS JWT

def creer_token_acces(donnees: dict, expiration: Optional[timedelta] = None) -> str:
    """
    Crée un token JWT signé avec les données de l'utilisateur.

    Le token contient :
    - "sub" : le nom d'utilisateur
    - "exp" : la date d'expiration

    Le token est signé avec SECRET_KEY — impossible à falsifier sans la clé.
    """
    donnees_token = donnees.copy()

    # Calcule la date d'expiration
    if expiration:
        expire = datetime.utcnow() + expiration
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    donnees_token.update({"exp": expire})

    # Crée et retourne le token signé
    return jwt.encode(donnees_token, SECRET_KEY, algorithm=ALGORITHM)

# Alias anglais
create_access_token = creer_token_acces


#  DÉPENDANCES FASTAPI — Protègent les routes

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db:    Session = Depends(get_db)
) -> models.User:
    """
    Dépendance FastAPI qui :
    1. Extrait le token du header Authorization
    2. Vérifie la signature et la date d'expiration
    3. Charge l'utilisateur depuis la base de données
    4. Lève une erreur 401 si le token est invalide

    Utilisation dans une route :
        def ma_route(user = Depends(get_current_user)):
            # user est l'objet User de la BDD
    """
    # Erreur générique (ne pas donner trop d'infos à un attaquant)
    erreur_401 = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalide ou expiré — reconnectez-vous",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Décode et vérifie le token
        payload  = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")  # "sub" = subject = nom d'utilisateur

        if username is None:
            raise erreur_401

    except JWTError:
        # Token mal formé, signature invalide, ou expiré
        raise erreur_401

    # Cherche l'utilisateur dans la base de données
    user = db.query(models.User).filter(
        models.User.username == username
    ).first()

    # Vérifie que l'utilisateur existe et est actif
    if not user or not user.is_active:
        raise erreur_401

    return user


def require_admin(
    current_user: models.User = Depends(get_current_user)
) -> models.User:
    """
    Dépendance FastAPI qui vérifie que l'utilisateur est admin.
    Lève une erreur 403 si ce n'est pas le cas.

    Utilisation :
        def route_admin(admin = Depends(require_admin)):
            # Seulement accessible aux admins
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs",
        )
    return current_user
