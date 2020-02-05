const getStdin = require("get-stdin-with-tty");
const dashdash = require("dashdash");

const child_process = require("child_process");
const fs = require("fs");

const parser = require("./parser.js");

let options = [
	{names: ["help", "h"], type: "bool", help: "Print help and exit."},
	{names: ["verbose", "v"], type: "arrayOfBool", help: "Increase verbosity (can be used multiple times)", default: []},
	{
		name: "emit-bin", type: "string",
		helpArg: "PATH",
		help: "Emit a binary file"
	},
	{
		name: "emit-txt", type: "string",
		helpArg: "PATH",
		help: "Emit a file containing 8-byte integers in decimal format corresponding to the data which would be produced by --emit-bin"
	},
	{
		name: "emit-parse", type: "string",
		helpArg: "PATH",
		help: "Emit a parse tree in JSON format"
	},
	{
		name: "emit-preprocess", type: "string",
		helpArg: "PATH",
		help: "Emit the preprocessed source code"
	},
	{
		names: ["include-path", "I"], type: "arrayOfString",
		helpArg: "DIRECTORY",
		help: "Add a directory to be searched for `#include` directives",
		default: []
	},
	{
		names: ["std-dir", "X"], type: "string",
		env: "LWCTBC_STD_DIR",
		helpArg: "DIRECTORY",
		help: "Use a custom standard library"
	},
	{
		name: "no-std", type: "bool",
		help: "Don't include the standard library",
		default: false
	},
	{
		name: "pre-opts", type: "arrayOfString",
		helpArg: "OPT",
		env: "LWCTBC_PRE_OPTS",
		help: "Passes options to the preprocessor (`cpp` on Linux, `cl` on Windows)",
		default: []
	},
	{
		name: "use-preprocessor", type: "string",
		helpArg: "PREPROCESSOR",
		env: "LWCTBC_PREPROCESSOR",
		help: "Use a specific preprocessor"
	},
	{
		names: ["force-platform", "Q"], type: "string",
		helpArg: "PLATFORM",
		env: "LWCTBC_PLATFORM",
		help: "Assume we are running on this platform (values: linux/l, windows/w)"
	},
];

let cliparser = dashdash.createParser({options});

let opts = cliparser.parse(process.argv);
if(opts.help) {
	let help = cliparser.help({includeEnv: true}).trimRight();
	console.log(`\
lwctbc v1.0.0

USAGE: lwctbc [OPTIONS]

OPTIONS:
${help}`);
	process.exit(0);
}

let config = {};
config.verbosity = opts.verbose.length;
config.platform = opts.force_platform;

if(config.platform === "w") config.platform = "windows";
else if(config.platform === "l") config.platform = "linux";
else if(config.platform) {
	console.error("lwctbc: error: unknown platform", config.platform);
	process.exit(1);
}

if(!config.platform) {
	if(process.platform === "win32") {
		config.platform = "windows";
	} else {
		if(process.platform !== "linux") {
			console.warn("lwctbc: warning: unknown platform", process.platform + ", assuming it is linux-like");
		}
		config.platform = "linux";
	}
}
if(config.verbosity > 0) {
	console.info("lwctbc: info: selected platform:", config.platform);
	console.info("lwctbc: info: std directory", opts.std_dir);
	console.info("lwctbc: info: preprocessor", opts.use_preprocessor, opts.pre_opts.join(" "));
}

config.inputFile = opts._args.shift();
if(config.inputFile == null) {
	console.error("lwctbc: error: expected an input file");
	process.exit(1);
}

const STAGE_PREPROCESS = 0;
const STAGE_PARSE = 1;
const STAGE_TXT = 2;
const STAGE_BIN = 2;

config.emits = [{
	name: "preprocess",
	val: opts.emit_preprocess,
	stage: STAGE_PREPROCESS
}, {
	name: "parse",
	val: opts.emit_parse,
	stage: STAGE_PARSE
}, {
	name: "bin",
	val: opts.emit_bin,
	stage: STAGE_BIN
}, {
	name: "text",
	val: opts.emit_text,
	stage: STAGE_TXT
}];

let maxStage = -1;
for(let emit of config.emits) {
	if(emit.val && (emit.stage > maxStage)) maxStage = emit.stage;
}

if(maxStage === -1) {
	let defaultOut = config.inputFile.replace(/\.[^.]*$/, ".bbj");
	config.emits.bin = defaultOut;
	maxStage = STAGE_BIN;
	if(config.verbosity > 0) console.info("lwctbc: info: no --emit-* options specified, assuming `--emit-bin \"" + defaultOut + "\"`");
}

if(config.verbosity > 0) console.info("lwctbc: info: max stage =", maxStage);

config.maxStage = maxStage;

config.std = opts.no_std ? null : opts.use_std;
if(config.std == null && opts.use_std != null) {
	console.error("lwctbc: error: --no-std and --use-std are mutually exclusive");
	process.exit(1);
}

console.log(config, opts);

config.includePaths = [...opts.include_path];

if(config.std) config.include_paths.push(config.std);

if(config.verbosity > 1) {
	console.debug("lwctbc: debug: current config after parsing:", config);
}
// END OF OPTION PARSING

let fileMap = new Map();
(async () => {
	let currentStage = 0;
	let input = config.inputFile === "-" ? await getStdin() : fs.readFileSync(config.inputFile, "utf-8");
	if(config.verbosity > 2) {
		console.debug("lwctbc: debug: input file", config.inputFile, "contents", input);
	}
	fileMap.set(config.inputFile, input);
	let preprocessEmit = config.emits[currentStage];
	let stdout = await preprocessEmit.action();

	if(currentStage++ > config.maxStage) process.exit(0);
	let res = parser.parse(stdout, config.inputFile);
	let parseEmit = config.emits.shift();
	if(parseEmit.val != null) fs.writeFileSync(parseEmit.val, JSON.stringify(res.result));
	for(let val of res.processedLines.linemap.values()) {
		if(!fileMap.has(val.file)) {
			let v = val.file === "-" ? await getStdin() : fs.readFileSync(val.file, "utf-8");
			fileMap.set(val.file, v);
		}
	}
})().catch(e => {
	console.error(e.stack);
});

// === preprocess ===
