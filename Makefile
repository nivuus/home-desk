# Package Nivuus home-desk — cibles de test.
#
# TROIS SUITES, DELIBEREMENT SEPAREES.
#
# `test` couvre le PACKAGE : manifeste, hook d'installation, portabilite et
# fraicheur de dist/. Scripts autonomes, python3 + PyYAML seulement, comme dans
# le depot installer — c'est ce qui permet de les lancer sur une machine qui
# n'a rien d'autre, y compris la cible d'installation.
#
# `test-app` couvre l'APPLICATION : fichiers vitest, qui exigent Node et
# 115 Mo de node_modules. Les melanger rendrait le package intestable partout
# ou Node n'est pas installe — c'est-a-dire sur la cible.
#
# `test-composant` couvre l'INTEGRATION `custom_components/home_desk` : elle
# exige un environnement virtuel et tire Home Assistant en dependance (voir
# tests/composant/requirements.txt), donc ni `test` (qui doit rester
# lancable sur la cible d'installation) ni `test-app` (qui n'a rien a voir
# avec Home Assistant) ne peuvent l'accueillir sans perdre ce qui les rend
# lancables la ou elles le sont. La version epinglee de
# pytest-homeassistant-custom-component y exige Python >= 3.14 (voir le
# commentaire de tests/composant/requirements.txt) ; si `python3` resout vers
# une version plus ancienne sur la machine, passez PYTHON=python3.14 (ou tout
# interpreteur >= 3.14) a cette cible, comme NIVUUS_INSTALLER_DIR ci-dessous.
#
# NIVUUS_INSTALLER_DIR fait valider le manifeste par le VRAI parseur du moteur.
#   make test NIVUUS_INSTALLER_DIR=$$HOME/Projects/Nivuus/packages/installer

PACKAGE_DIR := $(CURDIR)
PYTHON ?= python3
COMPOSANT_VENV := $(PACKAGE_DIR)/.venv-composant

.PHONY: test test-app test-composant contrat help

help:
	@grep -E '^[a-zA-Z_-]+:.*' $(MAKEFILE_LIST) | sed 's/:.*//' | sort

test:
	@for t in test_manifest_contract test_install_hook test_dist_portable test_dist_a_jour test_contrat_embarque; do \
	    echo "--- $$t"; \
	    $(PYTHON) $(PACKAGE_DIR)/tests/$$t.py || exit 1; \
	done

test-app:
	cd $(PACKAGE_DIR)/app && npm test

test-composant:
	@test -d $(COMPOSANT_VENV) || $(PYTHON) -m venv $(COMPOSANT_VENV)
	@$(COMPOSANT_VENV)/bin/pip install -q -r $(PACKAGE_DIR)/tests/composant/requirements.txt
	@$(COMPOSANT_VENV)/bin/pytest $(PACKAGE_DIR)/tests/composant -q

# Le composant embarque sa copie de contrat/ : depose dans
# config/custom_components/, il ne voit pas le depot. `make test` verifie
# qu'elle est identique a la source (tests/test_contrat_embarque.py), dont la
# liste FICHIERS vient du meme glob que la boucle ci-dessous : deux
# enumerations recopiees a la main divergeraient en silence des qu'un fichier
# est ajoute a contrat/.
contrat:
	@mkdir -p $(PACKAGE_DIR)/custom_components/home_desk/contrat
	@n=0; \
	for f in $(PACKAGE_DIR)/contrat/*.json; do \
	    cp $$f $(PACKAGE_DIR)/custom_components/home_desk/contrat/; \
	    n=$$((n+1)); \
	done; \
	echo "contrat embarque : $$n fichiers"
