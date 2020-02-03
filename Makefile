all: build/parser.js

test: all
	node tests/index.js

build/parser.js: src/parser.js build/grammar.js
	cp $< $@

clean:
	rm -rf build

.PHONY: clean test

build/%.js: src/%.pegjs
	npx pegjs -o $@ $<
