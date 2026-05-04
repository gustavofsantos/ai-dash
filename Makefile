.PHONY: dev start build test install clean

BINARY_NAME := ai-dash
DIST_DIR    := dist
INSTALL_DIR := $(HOME)/.local/bin

dev:
	bun --hot src/server/index.ts

start:
	NODE_ENV=production bun src/server/index.ts

build:
	mkdir -p $(DIST_DIR)
	bun build --compile --minify --outfile $(DIST_DIR)/$(BINARY_NAME) src/bin/ai-dash.ts

install: build
	mkdir -p $(INSTALL_DIR)
	cp $(DIST_DIR)/$(BINARY_NAME) $(INSTALL_DIR)/$(BINARY_NAME)
	chmod +x $(INSTALL_DIR)/$(BINARY_NAME)
	@echo "Installed $(BINARY_NAME) to $(INSTALL_DIR)/$(BINARY_NAME)"

test:
	bun test

clean:
	rm -rf $(DIST_DIR)
