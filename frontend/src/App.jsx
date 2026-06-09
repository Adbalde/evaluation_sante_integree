//  App.jsx — Configuration du routeur et des routes de l'application
//  Ce fichier définit :
//    - Les URLs de l'application et les pages correspondantes
//    - La protection des routes (redirige vers /login si pas connecté)
//    - L'initialisation du système offline au démarrage

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { initOfflineSync } from './services/offlineQueue'
import API from './services/api'
import Layout from './components/Layout'

// Pages de l'application
import Login                from './pages/Login'
import Dashboard            from './pages/Dashboard'
import Patients             from './pages/Patients'
import NouvelleConsultation from './pages/NouvelleConsultation'
import DossierPatient       from './pages/DossierPatient'


//  ROUTE PROTÉGÉE — Redirige vers /login si pas connecté

function RoutePrivee({ children }) {
  const { user, loading } = useAuth()

  // Pendant la vérification du token, affiche un écran de chargement
  if (loading) {
    return (
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        height:         '100vh',
        color:          '#0F6E56',
        fontSize:       15,
      }}>
        ⏳ Chargement…
      </div>
    )
  }

  // Si pas connecté → redirige vers /login
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Connecté → affiche la page avec la navigation
  return <Layout>{children}</Layout>
}


//  ROUTES — Définit toutes les URL de l'application

function AppRoutes() {
  // Initialise le système offline une seule fois au démarrage
  useEffect(() => {
    // Passe l'instance axios au système offline
    // (config) => API(config) = fonction qui fait des requêtes axios
    initOfflineSync((config) => API(config))
  }, [])

  return (
    <Routes>
      {/* Page publique : connexion */}
      <Route path="/login" element={<Login />} />

      {/* Pages protégées : nécessitent d'être connecté */}
      <Route path="/" element={
        <RoutePrivee><Dashboard /></RoutePrivee>
      } />

      <Route path="/patients" element={
        <RoutePrivee><Patients /></RoutePrivee>
      } />

      <Route path="/patients/:id" element={
        <RoutePrivee><DossierPatient /></RoutePrivee>
      } />

      <Route path="/consultation" element={
        <RoutePrivee><NouvelleConsultation /></RoutePrivee>
      } />

      {/* Toute URL inconnue redirige vers le dashboard */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}


//  COMPOSANT RACINE — Enveloppe tout avec les providers

export default function App() {
  return (
    // AuthProvider : partage l'état d'authentification à toute l'app
    <AuthProvider>
      {/* BrowserRouter : active le système de navigation React Router */}
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
