#!/bin/bash
set -e

PROJECT_ID="italiadigitale"
SERVICE="italiadigitale-dashboard"
REGION="europe-west8"
IMAGE="europe-west8-docker.pkg.dev/$PROJECT_ID/italia-digitale/$SERVICE:latest"
API_URL="https://italiadigitale-api-440752089673.europe-west8.run.app"

echo "📦 Build immagine Docker (linux/amd64)..."
docker build --platform linux/amd64 \
  --build-arg VITE_API_URL="$API_URL" \
  -t "$IMAGE" .

echo "📤 Push su Artifact Registry..."
docker push "$IMAGE"

echo "🌐 Deploy su Cloud Run..."
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --min-instances 0 \
  --max-instances 5 \
  --memory 256Mi \
  --cpu 1

echo "✓ Deploy completato."
gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format "value(status.url)"
