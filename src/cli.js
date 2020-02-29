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
		names: ["import-path", "I"], type: "arrayOfString",
		helpArg: "DIRECTORY",
		help: "Add a directory to be searched for imports",
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
}

config.inputFile = opts._args.shift();
if(config.inputFile == null) {
	console.error("lwctbc: error: expected an input file");
	process.exit(1);
}

/// NEW COMPILATION STEPS ARE ADDED HERE
config.emitDeps = {
	"txt": ["bin", bin => {
		console.error("lwctbc: error: --emit-txt is not supported");
		process.exit(1);
	}],
	"bin": ["symbolify"],
	"symbolify": ["parse", parsed => {
		require("./symbolify.js")(config, parsed);
	}],
	"parse": ["*input", input => {
		return require("./grammar.js").parse(input);
	}],
};




config.runDeps = (x, cache) => {
	//if(x.result) return x.result;
	let argDeps = x.slice(0, -1);
	let args = [];
	for(let x of argDeps) {
		if(cache && cache.has(x)) {
			args.push(x);
			continue;
		}
		let y;
		if(typeof x === "function") args.push(y = x());
		else args.push(y = config.runDeps(config.emitDeps[x], cacher));
		if(cache) cache.set(x, y);
	}
	//x.result =
	return x[x.length - 1](...args);
	//return x.result;
};

config.emits = Object.keys(opts).filter(x => x.startsWith("emit_")).map(x => [x.slice(5), opts[x]]);

if(config.emits.length === 0) {
	let defaultOut = config.inputFile.replace(/\.[^.]*$/, ".bbj");
	config.emits = [["bin", defaultOut]];
	if(config.verbosity > 0) console.info("lwctbc: info: no --emit-* options specified, assuming `--emit-bin \"" + defaultOut + "\"`");
}

config.std = opts.no_std ? null : opts.use_std;
if(config.std == null && opts.use_std != null) {
	console.error("lwctbc: error: --no-std and --use-std are mutually exclusive");
	process.exit(1);
}

config.importPaths = [...opts.import_path];

if(config.std) config.importPaths.push(config.std);

if(config.verbosity > 1) {
	console.debug("lwctbc: debug: current config after parsing:", config);
}
// END OF OPTION PARSING

(async () => {
	let input = config.inputFile === "-" ? await getStdin() : fs.readFileSync(config.inputFile, "utf-8");
	config.fileName = config.inputFile;
	if(config.verbosity > 2) {
		console.debug("lwctbc: debug: input file", config.inputFile, "contents", input);
	}
	config.emitDeps["*input"] = {result: input};
	let cache = new Map();
	for(let [dep, out] of config.emits) {
		fs.writeFileSync(out, config.runDeps(config.emitDeps[dep], cache));
	}
})().catch(e => {
	console.error(e.stack);
});

// === preprocess ===
