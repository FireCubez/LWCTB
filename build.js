const fs = require("fs");
const path = require("path");
const child_process = require("child_process");

if(!fs.existsSync("build")) fs.mkdirSync("build");

for(let f of fs.readdirSync("src")) {
	console.log("File:", f);
	if(f.endsWith(".pegjs")) {
		console.log("Running pegjs...");
		let r = child_process.spawnSync("npx", ["pegjs", "-o", path.join("build", f.slice(0, -5) + "js"), path.join("src", f)], {
			stdio: "inherit"
		});
		if(r.error) throw r;
		continue;
	}
	console.log("Copying", f);
	fs.copyFileSync(path.join("src", f), path.join("build", f));
}
