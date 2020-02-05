const child_process = require("child_process");

module.exports = (config, opts) => {
	return new Promise((resolve, reject) => {
		let proc = child_process.spawn(opts.use_preprocessor, [...opts.pre_opts, config.inputFile], {
			shell: true
		});
		proc.on("error", err => {
			reject(err);
		});
		let stderr = "", stdout = "";
		proc.stderr.on("data", x => {
			stderr += x;
		});
		proc.stdout.on("data", x => {
			stdout += x;
		});
		if(preprocessEmit.val != null) {
			proc.stdout.pipe(fs.createWriteStream(preprocessEmit.val));
		}
		proc.on("exit", code => {
			if(config.verbosity > 0) console.info("lwctbc: info: preprocessor exited with status", code);
			if(code !== 0) {
				console.error("lwctbc: error: preprocessor exited with non-zero status", code, "--- stderr dump:");
				console.error(stderr);
				process.exit(1);
			}
			resolve(stdout);
		});
	});
}
