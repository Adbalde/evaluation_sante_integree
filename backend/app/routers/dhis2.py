from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models
from ..database import get_db
from ..auth import get_current_user
from datetime import datetime
import httpx
import os

router = APIRouter(prefix="/dhis2", tags=["DHIS2"])

DHIS2_BASE_URL   = os.getenv("DHIS2_URL", "http://dhis2:8080")
DHIS2_USER       = os.getenv("DHIS2_USERNAME", "admin")
DHIS2_PASS       = os.getenv("DHIS2_PASSWORD", "district")

DATASET_ID       = "pECFQjv16jc"
ORG_UNIT_ID      = "mK8rIhPHxq7"
DE_PATIENTS      = "RgruRxJs24z"
DE_CONSULTATIONS = "eqP9ehlQUBl"
DE_DIABETIQUES   = "PCAhs4e8yaZ"
DE_HYPERTENDUS   = "P8ZOhOAkk1n"


@router.get("/status", summary="Vérifie si DHIS2 est accessible")
async def dhis2_status(current_user: models.User = Depends(get_current_user)):
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            res = await client.get(
                f"{DHIS2_BASE_URL}/api/system/info.json",
                auth=(DHIS2_USER, DHIS2_PASS),
            )
            if res.status_code == 200:
                info = res.json()
                return {
                    "status":  "connecté",
                    "version": info.get("version", "inconnue"),
                    "url":     DHIS2_BASE_URL,
                }
            return {"status": "erreur", "code": res.status_code}
    except httpx.ConnectError:
        return {"status": "déconnecté", "erreur": "DHIS2 inaccessible"}
    except Exception as e:
        return {"status": "erreur", "erreur": str(e)}


@router.post("/sync", summary="Envoie les statistiques vers DHIS2")
async def sync_dhis2(
    db:           Session     = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):

# Calcule les statistiques
    total_patients = db.query(models.Patient).filter(
        models.Patient.is_archived == False
    ).count()

    total_consultations = db.query(models.Consultation).count()

    nb_diabetiques = db.query(models.Patient).filter(
        models.Patient.maladie.ilike("%diabète%"),
        models.Patient.is_archived == False,
    ).count()

    nb_hypertendus = db.query(models.Patient).filter(
        models.Patient.maladie.ilike("%hypertension%"),
        models.Patient.is_archived == False,
    ).count()

    now    = datetime.utcnow()
    period = f"{now.year}{now.month:02d}"

    payload = {
        "dataSet":    DATASET_ID,
        "orgUnit":    ORG_UNIT_ID,
        "period":     period,
        "dataValues": [
            {"dataElement": DE_PATIENTS,      "value": str(total_patients)},
            {"dataElement": DE_CONSULTATIONS, "value": str(total_consultations)},
            {"dataElement": DE_DIABETIQUES,   "value": str(nb_diabetiques)},
            {"dataElement": DE_HYPERTENDUS,   "value": str(nb_hypertendus)},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            res = await client.post(
                f"{DHIS2_BASE_URL}/api/dataValueSets.json",
                json=payload,
                auth=(DHIS2_USER, DHIS2_PASS),
                headers={"Content-Type": "application/json"},
            )



        # Analyse la réponse DHIS2

        dhis2_body   = res.json() if res.text else {}
        dhis2_status = dhis2_body.get("response", {}).get("status") or dhis2_body.get("status", "")

        # 200/201 = succès total
        # 409 + WARNING = succès partiel (données importées malgré des conflits mineurs)
        # 409 + ERROR   = échec réel
        est_succes = res.status_code in [200, 201] or (
            res.status_code == 409 and dhis2_status == "WARNING"
        )

        if est_succes:
            # Résumé d'import DHIS2
            import_summary = dhis2_body.get("response", {})
            imported  = import_summary.get("importCount", {}).get("imported", 0)
            updated   = import_summary.get("importCount", {}).get("updated",   0)
            ignored   = import_summary.get("importCount", {}).get("ignored",   0)
            conflicts = import_summary.get("conflicts", [])

            # Audit log
            log = models.AuditLog(
                user_id = current_user.id,
                action  = "sync_offline",
                detail  = (
                    f"Sync DHIS2 {dhis2_status or 'OK'} — période {period} — "
                    f"importés:{imported} màj:{updated} ignorés:{ignored}"
                ),
            )
            db.add(log)
            db.commit()

            return {
                "status":  "succès" if dhis2_status != "WARNING" else "partiel",
                "message": (
                    "Données envoyées vers DHIS2 avec succès"
                    if dhis2_status != "WARNING"
                    else "Données envoyées avec succes vers DHIS2"
                ),
                "period":  period,
                "dataset": "SANTE INTEGREE",
                "orgUnit": "TEST SANTE INTEGREE",
                "donnees": {
                    "total_patients":      total_patients,
                    "total_consultations": total_consultations,
                    "nb_diabetiques":      nb_diabetiques,
                    "nb_hypertendus":      nb_hypertendus,
                },
                "import_summary": {
                    "importes":  imported,
                    "mis_a_jour": updated,
                    "ignores":   ignored,
                    "conflits":  [c.get("value", "") for c in conflicts[:3]],
                },
            }

        raise HTTPException(
            status_code=502,
            detail=f"DHIS2 erreur ({res.status_code}) : {res.text[:300]}",
        )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="DHIS2 ne répond pas — timeout 30s")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Impossible de joindre DHIS2")
