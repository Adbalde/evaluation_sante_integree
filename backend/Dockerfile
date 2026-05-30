# ────────────────────────────────────────────────────────
#  Dockerfile Backend — SantéIntégrée (production-ready)
# ────────────────────────────────────────────────────────

FROM python:3.11-slim

# Variables d'environnement Python recommandées en production
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dépendances système pour psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Installe les dépendances Python (cache Docker si requirements.txt inchangé)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Crée un utilisateur non-root pour la sécurité
RUN addgroup --system app && adduser --system --group app

# Copie le code source et ajuste les permissions
COPY ./app ./app
RUN chown -R app:app /app

# Bascule sur l'utilisateur non-root
USER app

EXPOSE 8000

# Lance uvicorn avec les paramètres de production
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--access-log", \
     "--log-level", "info"]
