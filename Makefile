all: build/*

cli:
	$(info )
	$(info If you want to build the CLI, optional packages must be installed. Please run `npm install -O`)
	$(info if you enounter any errors.)
	$(info )
	$(info Build the CLI using `make all`)

test: all
	node tests/index.js

clean:
	rm -rf build

.PHONY: clean test lib cli cli_no_warn all

build/%.js: src/%.js
	cp $< $@

build/%.js: src/%.pegjs
	npx pegjs -o $@ $<
