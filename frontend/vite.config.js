//  Configuration du bundler Vite
//  Vite compile et sert l'application React

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],   // Plugin pour supporter JSX (syntaxe React)

  server: {
    port: 5173,   // Port du serveur de développement

    // En développement, redirige /api/* vers le backend FastAPI
    // Évite les erreurs CORS pendant le développement local
    proxy: {
      '/api': {
        target:      'http://localhost:8000',  // URL du backend
        changeOrigin: true,
        rewrite:     (path) => path.replace(/^\/api/, ''),
      },
    },
  },

  build: {
    outDir:    'dist',   // Dossier de sortie du build
    sourcemap: false,    // Désactive les sourcemaps en production (sécurité)
  },
})
