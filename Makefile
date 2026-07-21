NPM     := npm
PORT    := 5173
SERVICE := italiadigitale-dashboard
BACKEND_DIR := ../italiadigitale-dashboard-backend

install:
	$(NPM) install

dev:
	$(NPM) run dev

build:
	$(NPM) run build

preview:
	$(NPM) run preview

# Deploy del frontend di PRODUZIONE = Firebase Hosting (dominio dashboard.italiadigitale.agency).
deploy: deploy-hosting

# Build statico + deploy su Firebase Hosting.
deploy-hosting:
	bash deploy-hosting.sh

# [DEPRECATO] Vecchio deploy del frontend come servizio Cloud Run: ridondante da quando il
# dominio è servito da Firebase Hosting. Tenuto solo per emergenze/rollback.
deploy-cloudrun:
	bash deploy.sh

# Deploy del backend: riusa il target del repo backend (deploy.sh + migrazione DB prod).
deploy-backend:
	$(MAKE) -C $(BACKEND_DIR) deploy

# Deploy completo: prima il backend (con migrazione DB), poi il frontend su Firebase Hosting.
deploy-all: deploy-backend deploy-hosting
	@echo "✓ Deploy completo: backend (Cloud Run) + frontend (Firebase Hosting)."

clean:
	rm -rf dist node_modules

.PHONY: install dev build preview deploy deploy-hosting deploy-cloudrun deploy-backend deploy-all clean
