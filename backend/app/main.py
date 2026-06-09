import logging
import os
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import hash_password
from .database import Base, SessionLocal, engine
from .routers import consultations, patients, stats, users, dhis2
from . import models  # noqa: F401  (nécessaire pour que les modèles soient découverts)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("sante-integree")


# SEED — comptes par défaut

def initialiser_base() -> None:
    """
    Crée les comptes admin et agent au premier démarrage.
    Ne fait rien si les comptes existent déjà.
    """
    db = SessionLocal()
    try:
        admin_existe = db.query(models.User).filter(
            models.User.username == "admin"
        ).first()

        if not admin_existe:
            db.add(models.User(
                username        = "admin",
                email           = "diouldebalde323@gmail.com",
                hashed_password = hash_password(
                    os.getenv("ADMIN_PASSWORD", "Admin1234!")
                ),
                role      = models.RoleEnum.admin,
                is_active = True,
            ))
            db.add(models.User(
                username        = "agent",
                email           = "diouldebalde323+agent@gmail.com",
                hashed_password = hash_password(
                    os.getenv("AGENT_PASSWORD", "Agent1234!")
                ),
                role      = models.RoleEnum.agent,
                is_active = True,
            ))
            db.commit()
            logger.info("✅ Comptes par défaut créés (admin / agent)")
        else:
            logger.info("ℹ️  Comptes déjà présents — seed ignoré")

    except Exception as e:
        logger.error(f"❌ Erreur seed : {e}")
        db.rollback()
    finally:
        db.close()

# LIFESPAN

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Démarrage : création des tables + seed. Arrêt propre."""
    logger.info("🚀 Démarrage SantéIntégrée API …")
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Tables PostgreSQL vérifiées")
    initialiser_base()
    logger.info("🟢 API prête")
    yield
    logger.info("🔴 Arrêt SantéIntégrée API")


# APPLICATION

app = FastAPI(
    title       = "SantéIntégrée API",
    description = (
        "API de gestion des patients et consultations — mode offline-first.\n\n"
        "**Comptes test** : admin / Admin1234! · agent / Agent1234!"
    ),
    version  = "1.0.0",
    docs_url = "/docs",
    redoc_url= "/redoc",
    lifespan = lifespan,
)

#  CORS 
origines = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost,http://localhost:80,http://localhost:5173"
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins     = origines,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# Middleware de logging
@app.middleware("http")
async def logger_requetes(request: Request, call_next):
    debut    = time.time()
    reponse  = await call_next(request)
    duree    = round((time.time() - debut) * 1000, 2)
    code     = reponse.status_code
    methode  = request.method
    route    = request.url.path

    if code >= 500:
        logger.error(f"{methode} {route} → {code} ({duree}ms)")
    elif code >= 400:
        logger.warning(f"{methode} {route} → {code} ({duree}ms)")
    else:
        logger.info(f"{methode} {route} → {code} ({duree}ms)")

    reponse.headers["X-Response-Time"] = f"{duree}ms"
    return reponse


# Gestionnaires d'erreurs 
@app.exception_handler(RequestValidationError)
async def erreur_validation(request: Request, exc: RequestValidationError):
    erreurs = [
        {"champ": " → ".join(str(e) for e in err["loc"]), "message": err["msg"]}
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Données invalides", "erreurs": erreurs},
    )

@app.exception_handler(404)
async def erreur_404(request: Request, exc):
    # CORRECTION : status_code= et content= en arguments nommés (ordre positional était inversé)
    return JSONResponse(status_code=404, content={"detail": f"Route '{request.url.path}' introuvable"})

@app.exception_handler(500)
async def erreur_500(request: Request, exc):
    logger.error(f"Erreur interne : {exc}")
    # CORRECTION : idem — JSONResponse(content, status_code) ≠ JSONResponse(status_code, content)
    return JSONResponse(status_code=500, content={"detail": "Erreur interne du serveur"})


# Routeurs 
app.include_router(users.router)
app.include_router(patients.router)
app.include_router(consultations.router)
app.include_router(stats.router)
app.include_router(dhis2.router)

#  Routes utilitaires 
@app.get("/", tags=["🏥 Système"], summary="Health check basique")
def health_check():
    return {"status": "ok", "app": "SantéIntégrée API", "version": "1.0.0", "docs": "/docs"}


@app.get("/health", tags=["🏥 Système"], summary="Health check avec test BDD")
def health_check_complet():
    db = SessionLocal()
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        bdd = "ok"
    except Exception as e:
        bdd = f"erreur : {e}"
    finally:
        db.close()
    return {"status": "ok" if bdd == "ok" else "dégradé", "database": bdd, "version": "1.0.0"}
