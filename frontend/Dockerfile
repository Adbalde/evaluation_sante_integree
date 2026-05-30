# ──────────────────────────────────────────────────────────────────────────────
#  Dockerfile Frontend — SantéIntégrée
#  Build multi-étapes :
#    Étape 1 : Compile React avec Node.js → dossier dist/
#    Étape 2 : Sert les fichiers statiques avec Nginx (image légère)
# ──────────────────────────────────────────────────────────────────────────────

# ══ ÉTAPE 1 : BUILD ═══════════════════════════════════════════
# Image Node.js légère (alpine)
FROM node:20-alpine AS build

# Dossier de travail dans le container
WORKDIR /app

# Copie les fichiers de dépendances en premier
# (optimisation : Docker met en cache si package.json n'a pas changé)
COPY package.json ./

# Installe toutes les dépendances npm
RUN npm install

# Copie le reste du code source
COPY . .

# Variable d'environnement pour l'URL de l'API
# Injectée au moment du build (pas à l'exécution)
# En production : VITE_API_URL=/api (Nginx redirige vers le backend)
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

# Compile l'application React pour la production
# Génère des fichiers optimisés dans le dossier dist/
RUN npm run build

# ══ ÉTAPE 2 : SERVEUR WEB ════════════════════════════════════
# Image Nginx ultra-légère (seulement pour servir des fichiers)
FROM nginx:alpine

# Copie le build React depuis l'étape précédente
COPY --from=build /app/dist /usr/share/nginx/html

# Copie notre configuration Nginx personnalisée
# (gère le routing de React Router)
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

# Expose le port 80
EXPOSE 80

# Nginx se lance automatiquement avec l'image alpine
CMD ["nginx", "-g", "daemon off;"]
