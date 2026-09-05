# Package Nivuus home-desk — cibles de test.
#
# DEUX SUITES, DELIBEREMENT SEPAREES.
#
# `test` couvre le PACKAGE : manifeste, hook d'installation, portabilite et
# fraicheur de dist/. Scripts autonomes, python3 + PyYAML seulement, comme dans
# le depot installer — c'est ce qui permet de les lancer sur une machine qui
# n'a rien d'autre, y compris la cible d'installation.
#
# `test-app` couvre l'APPLICATION : 41 fichiers vitest, qui exigent Node et
# 115 Mo de node_modules. Les melanger rendrait le package intestable partout
# ou Node n'est pas installe — c'est-a-dire sur la cible.
#
# NIVUUS_INSTALLER_DIR fait valider le manifeste par le VRAI parseur du moteur.
#   make test NIVUUS_INSTALLER_DIR=$$HOME/Projects/Nivuus/packages/installer

PACKAGE_DIR := $(CURDIR)
PYTHON ?= python3

.PHONY: test test-app help

help:
	@grep -E '^[a-zA-Z_-]+:.*' $(MAKEFILE_LIST) | sed 's/:.*//' | sort

test:
	@for t in test_manifest_contract test_install_hook test_dist_portable test_dist_a_jour; do \
	    echo "--- $$t"; \
	    $(PYTHON) $(PACKAGE_DIR)/tests/$$t.py || exit 1; \
	done

test-app:
	cd $(PACKAGE_DIR)/app && npm test
