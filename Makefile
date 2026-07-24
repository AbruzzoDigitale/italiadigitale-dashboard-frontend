NPM     := npm
PORT    := 5173
SERVICE := italiadigitale-dashboard
BACKEND_DIR := ../italiadigitale-dashboard-backend
MOBILE_DIR  := ../italiadigitale-dashboard-mobile

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

# Deploy della PWA mobile su Firebase Hosting (sito italiadigitale-mobile → app.italiadigitale.agency).
# Lo script fa build + firebase deploy dentro la cartella dell'app.
deploy-mobile:
	cd $(MOBILE_DIR) && bash deploy-hosting.sh

# Deploy completo di TUTTO: backend (con migrazione DB) + dashboard + app mobile.
deploy-all: deploy-backend deploy-hosting deploy-mobile
	@echo "✓ Deploy completo: backend (Cloud Run) + dashboard + app mobile (Firebase Hosting)."

clean:
	rm -rf dist node_modules

.PHONY: install dev build preview deploy deploy-hosting deploy-cloudrun deploy-backend deploy-mobile deploy-all clean
