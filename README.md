# LWCTB
<b>L</b>anguage <b>W</b>hich <b>C</b>ompiles <b>T</b>o <b>B</b>BJ

## Parser
Import the package, and call the `parse` method  to get an AST. Use `npm test` to test.

# CLI (`lwctbc`)
> *Note: only --emit-parse and --emit-bin are currently supported. --emit-text is currently unimplemented and will be ignored*

`lwctbc` is a command-line interface for the LWCTB compiler. There is currently no automatic setup; you must set up the compiler on your own. Here are instructions for that:

1. Clone this repo.
2. Run `npm install -O`\* to install optional dependencies. Build with `npm run build`.
3. Create a script `lwctbc`:
  - Windows: `node build/cli.js -- %*`
  - Linux: `node build/cli.js -- $*`
4. Add it to the `PATH` for convenience.
7. (Optional, will be guessed if omitted) Set environment variable `LWCTBC_PLATFORM` to your platform. `w` or `windows` for Windows, `l` or `linux` for Linux. If you want to use MinGW with LWCTB, set your platform to Linux.
8. Set up the standard library: set environment variable `LWCTBC_STD_DIR` to the `lwctbc-std` directory in this repo. Alternatively, you can choose a different stdlib (this is useful if you are developing LWCTB)
9. Profit.


\* TODO: is that correct?
