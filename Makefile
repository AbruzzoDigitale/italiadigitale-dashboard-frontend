NPM     := npm
PORT    := 5173
SERVICE := italiadigitale-dashboard

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

clean:
	rm -rf dist node_modules
