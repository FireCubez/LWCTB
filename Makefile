all: cli

cli:
	$(info )
	$(info You are building the CLI. Package `dashdash` must be installed. Please run `npm install cmdln`)
	$(info if you enounter any errors.)
	$(info )
	$(info Bypass this warning with `make cli_no_warn`)
	$(info )
	$(MAKE) $(MAKEFLAGS) cli_no_warn

cli_no_warn: build/cli.js

build/cli.js: src/cli.js lib
	cp $< $@

build/lwctb-setup.js: src/lwctb-setup.js
	cp $< $@

lib: build/parser.js

test: all
	node tests/index.js

build/parser.js: src/parser.js build/grammar.js
	cp $< $@

clean:
	rm -rf build

.PHONY: clean test lib cli cli_no_warn all

build/%.js: src/%.pegjs
	npx pegjs -o $@ $<
