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

deploy:
	bash deploy.sh

# Deploy del frontend statico su Firebase Hosting (dominio dashboard.italiadigitale.agency).
deploy-hosting:
	bash deploy-hosting.sh

# Deploy del backend: riusa il target del repo backend (deploy.sh + migrazione DB prod).
deploy-backend:
	$(MAKE) -C $(BACKEND_DIR) deploy

# Deploy completo: prima il backend (con migrazione DB), poi il frontend.
deploy-all: deploy-backend deploy
	@echo "✓ Deploy completo: backend + frontend."

clean:
	rm -rf dist node_modules

.PHONY: install dev build preview deploy deploy-hosting deploy-backend deploy-all clean
