#   Statistiques pour le tableau de bord
#  Route : GET /stats
#  Retourne tous les chiffres clés du système en une seule requête

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user
from datetime import datetime

router = APIRouter(prefix="/stats", tags=["📊 Statistiques"])


@router.get(
    "",
    response_model=schemas.StatsOut,
    summary="Obtenir toutes les statistiques du tableau de bord",
)
def obtenir_statistiques(
    db: Session = Depends(get_db),
    _:  models.User = Depends(get_current_user)
):
    """
    Retourne en une seule requête toutes les statistiques nécessaires
    au tableau de bord : totaux, répartitions, évolution mensuelle.
    """
    # Date actuelle pour filtrer "ce mois-ci"
    maintenant     = datetime.utcnow()
    mois_actuel    = maintenant.month
    annee_actuelle = maintenant.year

    # Totaux généraux 
    # Nombre total de patients actifs (non archivés)
    total_patients = db.query(models.Patient).filter(
        models.Patient.is_archived == False
    ).count()

    # Nombre total de consultations (toutes)
    total_consultations = db.query(models.Consultation).count()

    # Ce mois-ci 
    # Nouveaux patients créés ce mois
    nouveaux_ce_mois = db.query(models.Patient).filter(
        models.Patient.is_archived == False,
        extract("month", models.Patient.created_at) == mois_actuel,
        extract("year",  models.Patient.created_at) == annee_actuelle,
    ).count()

    # Consultations effectuées ce mois
    consultations_ce_mois = db.query(models.Consultation).filter(
        extract("month", models.Consultation.date_visite) == mois_actuel,
        extract("year",  models.Consultation.date_visite) == annee_actuelle,
    ).count()

    # Répartition par pathologie 
    # Patients diabétiques (le nom de maladie contient "Diabète")
    nb_diabete = db.query(models.Patient).filter(
        models.Patient.maladie.ilike("%diabète%"),
        models.Patient.is_archived == False,
    ).count()

    # Patients hypertendus
    nb_hypertension = db.query(models.Patient).filter(
        models.Patient.maladie.ilike("%hypertension%"),
        models.Patient.is_archived == False,
    ).count()

    # Patients avec les deux maladies
    nb_les_deux = db.query(models.Patient).filter(
        models.Patient.maladie.ilike("%diabète%"),
        models.Patient.maladie.ilike("%hypertension%"),
        models.Patient.is_archived == False,
    ).count()

    # Autres pathologies (soustraction pour éviter les doublons)
    nb_autre = max(0, total_patients - nb_diabete - nb_hypertension + nb_les_deux)

    # Évolution mensuelle 
    # Construit un dictionnaire {0: nb_jan, 1: nb_fev, ..., 11: nb_dec}
    # pour les graphiques du dashboard
    consultations_par_mois = {i: 0 for i in range(12)}

    # Requête groupée par mois pour l'année en cours
    resultats_mois = db.query(
        extract("month", models.Consultation.date_visite).label("mois"),
        func.count(models.Consultation.id).label("nombre"),
    ).filter(
        extract("year", models.Consultation.date_visite) == annee_actuelle
    ).group_by("mois").all()

    # Remplit le dictionnaire (index 0 = janvier, 11 = décembre)
    for ligne in resultats_mois:
        consultations_par_mois[int(ligne.mois) - 1] = ligne.nombre

    # Retourne toutes les statistiques
    return {
        "total_patients":          total_patients,
        "total_consultations":     total_consultations,
        "nouveaux_ce_mois":        nouveaux_ce_mois,
        "consultations_ce_mois":   consultations_ce_mois,
        "nb_diabete":              nb_diabete,
        "nb_hypertension":         nb_hypertension,
        "nb_les_deux":             nb_les_deux,
        "nb_autre":                nb_autre,
        "consultations_par_mois":  consultations_par_mois,
    }
