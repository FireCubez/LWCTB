// Wrapper around grammar.js
const grammar = require("./grammar.js");

const linemarker = /^#(?:line)?\s*(\d+)\s+"(.*?)"((?:\s+[1-4])*)/;
exports.processLines = function(s, infile) {
	let linemap = new Map();
	linemap.set(1, {
		line: 1,
		file: infile,
		flags: []
	});
	let result = "";
	let lines = s.split(/\r?\n/g);
	let j = 1;
	for(let i = 0; i < lines.length; i++) {
		let line = lines[i];
		let match = line.match(linemarker);
		if(match != null) {
			let line = +match[1];
			let file = match[2];
			let flags = match[3].trim().split(" ").filter(x => x !== "").map(x => +x);
			linemap.set(j, {
				line, file, flags
			});
		} else {
			j++;
			result += line + "\n";
		}
	}

	return {linemap, result};
}

exports.parse = function(s, f) {
	let x = exports.processLines(s, f);
	global.$$LWCTB = {
		getLineInfo(l) {
			return exports.getLineInfo(x.linemap, l);
		}
	};
	try {
		return {
			result: grammar.parse(x.result),
			processedLines: x
		};
	} catch(ex) {
		if(ex.name === "SyntaxError") {
			let s = $$LWCTB.getLineInfo(ex.location.start.line);
			let e = $$LWCTB.getLineInfo(ex.location.end.line);
			ex.location.start.line = s.line;
			ex.location.start.file = s.file;
			ex.location.start.flags = s.flags;
			ex.location.end.line = e.line;
			ex.location.end.file = e.file;
			ex.location.end.flags = e.flags;
		}
		throw ex;
	}
}

exports.binarySearch = function(keys, x) {
	// binary search
	while(keys.length > 2) {
		let ind = Math.floor(keys.length / 2);
		let midpoint = keys[ind];
		if(midpoint === x) return midpoint;
		if(midpoint > x) keys = keys.slice(0, ind);
		else {
			keys = keys.slice(ind + 1);
		}
	}
	for(let i = keys.length - 1; i >= 0; i--) {
		if(keys[i] <= x) {
			return keys[i];
		}
	}
}

exports.getClosestLineInfo = function(linemap, x) {
	return linemap.get(exports.binarySearch([...linemap.keys()], x));
}

exports.getLineInfo = function(linemap, line) {
	let closest = exports.getClosestLineInfo(linemap, line);
	return {
		line: line - closest.line,
		file: closest.file,
		flags: closest.flags
	};
}
