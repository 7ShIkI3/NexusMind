#!/usr/bin/env bash
set -euo pipefail

# Build images locally and tag for production. Replace REGISTRY with your container registry.
REGISTRY=${1:-}
if [ -z "$REGISTRY" ]; then
  echo "Usage: $0 <registry.example.com/your-org>"
  echo "This will build images and tag them for pushing to your registry."
  exit 1
fi

# Build images
docker build -t ${REGISTRY}/nexusmind-backend:latest -f backend/Dockerfile backend
docker build -t ${REGISTRY}/nexusmind-rag-server:latest -f backend/Dockerfile.rag backend
docker build -t ${REGISTRY}/nexusmind-frontend:latest -f frontend/Dockerfile frontend

echo "Built images. To push to your registry run:"
echo "  docker push ${REGISTRY}/nexusmind-backend:latest"
echo "  docker push ${REGISTRY}/nexusmind-rag-server:latest"
echo "  docker push ${REGISTRY}/nexusmind-frontend:latest"

echo "To deploy locally using the prod compose file:"
echo "  docker compose -f docker-compose.prod.yml up -d --build"
