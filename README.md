# LWCTB
<b>L</b>anguage <b>W</b>hich <b>C</b>ompiles <b>T</b>o <b>B</b>BJ

## Parser
Import the package, and call the `parse` method  to get an AST. Use `npm test` to test.

# CLI (`lwctbc`)
> *Note: only --emit-parse and --emit-preprocess are currently supported. --emit-text and --emit-bin are unimplemented and will be ignored*

`lwctbc` is a command-line interface for the LWCTB compiler. There is currently no automatic setup; you must set up the compiler on your own. Here are instructions for that:

1. Clone this repo.
2. Run `npm install -O`\* to install optional dependencies. Build with `make cli`.
3. Create a script `lwctbc`:
  - Windows: `node build/cli.js -- %*`
  - Linux: `node build/cli.js -- $*`
4. Add it to the `PATH` for convenience.
5. (Optional) Make sure your preprocessor is in the `PATH`:
  - Windows: `cl.exe` should be in `PATH`
  - Linux: `cpp` should be in `PATH`
6. Set environment variable `LWCTBC_PREPROCESSOR` to your preprocessor. If you did step 5, you can just type `cl` or `cpp`. If not, specify the full path. If your preprocessor is `cl`, set `LWCTBC_PRE_OPTS` to `/E`
7. (Optional, will be guessed if omitted) Set environment variable `LWCTBC_PLATFORM` to your platform. `w` or `windows` for Windows, `l` or `linux` for Linux. If you want to use MinGW with LWCTB, set your platform to Linux.
8. Set up the standard library: set environment variable `LWCTBC_STD_DIR` to the `lwctbc-std` directory in this repo. Alternatively, you can choose a different stdlib (this is useful if you are developing LWCTB)
9. Profit.


\* TODO: is that correct?
