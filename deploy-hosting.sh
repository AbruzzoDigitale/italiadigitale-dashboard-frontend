#!/bin/bash
# Deploy del frontend statico su Firebase Hosting (dominio dashboard.italiadigitale.agency).
# Il frontend è una SPA statica: Firebase la serve dalla sua CDN e chiama il backend
# Cloud Run via VITE_API_URL (assoluto, bakato nel bundle al build-time). Il CORS del
# backend ammette già *.italiadigitale.agency, quindi non serve toccare Cloud Run.
set -e

API_URL="https://italiadigitale-api-440752089673.europe-west8.run.app"

echo "📦 Build statico (VITE_API_URL=$API_URL)..."
VITE_API_URL="$API_URL" npm run build

echo "🚀 Deploy su Firebase Hosting..."
firebase deploy --only hosting

echo "✓ Fatto. Se non l'hai ancora fatto, aggiungi il dominio personalizzato:"
echo "  console Firebase → Hosting → Aggiungi dominio personalizzato → dashboard.italiadigitale.agency"
