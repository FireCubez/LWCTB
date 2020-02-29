 path = require("path");
const fs = require("fs");
// The 2nd stage of parsing.
//
// This stage conveys scope, replacing identifiers with opaque objects
// Example:
// {
//   let x = (int8) 7;
//   {
//     let x = (int16) = 8;
//   }
// }
//
// converts into:
//
// { <scope object: a = {vars: [], ...}> scopes.push(a);
//   let <variable object: {unscoped: {value: "x", ...}, scope: a, }}> = (<type object: {name: "int8", scope: <std scope>}>) 7;
//   { <scope object: b = {vars: [], ...}> scopes.push(b);
//     let <variable object: {name: "x", scope: b}> = (<type object: {name: "int16", scope: <std scope>}>) 7;
//   } scopes.pop();
// } scopes.pop();
//
// Imports are also recursively resolved during this stage.
//

module.exports = (config, parsed) => {
	let scopes = [newScope()];
	let public = newScope();
	let sts = [];
	let deferredLabels = [];
	for(let stlabel of parsed) {
		let x = processStmt(stlabel);
		if(x != null) sts.push(x);
	}

	for(let label of deferredLabels) {
		let name = label.value;
		for(let i = scopes.length - 1; i >= 0; i--) {
			for(let [k, v] of scopes[i].labels) {
				if(k === name) {
					label.refer = v;
					break;
				}
			}
		}
	}

	return {public, sts};

	function newScope() {
		return {
			types: new Map(),
			vars: new Map(),
			labels: new Map()
		};
	}

	function processExpr(x) {
		if(x.type === "cast") return {
			type: "cast",
			a: processExpr(x.a),
			restype: processType(x.restype)
		};
		if(x.type === "access") return {
			type: "access",
			base: processExpr(x.base),
			list: x.list.map(e =>
				e.type === "call" ? {
					type: "call",
					args: e.args.map(processExpr)
				} : {
					type: "index",
					index: processExpr(e.index)
				}
			)
		}
		if(x.type === "posint") {
			return x;
		}
		if(x.type === "strlit") {
			return x;
		}
		if(x.type === "id") return processVar(x);
		if(x.type === "label") { // only in <AccessExpr>.base, but whatever, we can handle it here
			let v = { // let v = x; will probably break since deferredLabels would mutate it.
				type: "label",
				value: x.value,
				id: x.id,
				extern: x.extern
			};
			deferredLabels.push(v);
			return v;
		}
		return {
			type: x.type,
			a: processExpr(x.a),
			b: x.b && proceessExpr(x.b)
		}
	}

	function processStmt(stlabel) {
		for(let label of stlabel.labels) {
			scopes[scopes.length - 1].labels.set(label.value, label);
			if(label.extern) public.set(label.value, label);
		}
		let st = stlabel.st;
		switch(st.type) {
			case "import":
				let file = null;
				let imp = st.imp.value;
				for(let p of config.importPaths) {
					let x = path.join(p, imp);
					if(config.verbosity > 1) {
						console.debug("lwctbc: debug: searching for `" + imp + "` in path `" + p + "`: `" + x + "`");
					}
					if(fs.existsSync(x)) {
						file = x;
						if(config.verbosity > 1) {
							console.debug("lwctbc: debug: found`");
						}
					}
				}
				if(file == null) {
					console.error("lwctbc: error: cannot find import file `" + imp + "`");
					console.error("lwctbc: error in file " + config.fileName);
					process.exit(1);
				}

				config.emitDeps["*input"] = fs.readFileSync(file);

				let oldFile = config.fileName || "<unknown file>";
				config.fileName = file;
				let imported = config.runDeps(config.emitDeps.symbolify);
				config.fileName = oldFile;
				for(let [k, v] of imported.public.types) {
					scopes[scopes.length - 1].types.set(k, v);
				}
				for(let [k, v] of imported.public.labels) {
					scopes[scopes.length - 1].labels.set(k, v);
				}
				return null;
			case "exprst":
				return {
					type: "exprst",
					expr: processExpr(st.expr)
				};
			case "goto":
				let labels = st.labels.map(x => {
					scopes[scopes.length - 1].labels.set(x.value, {
						scope: scope[scopes.length - 1],
						...x
					});
				}); // placed first for side effects; `goto .x:.x` is possible like this
				return {
					type: "goto",
					dest: processExpr(st.dest),
					labels
				};
			case "let":
				let v;
				scopes[scopes.length - 1].vars.set(st.name.value, v = {
					type: "var",
					value: processExpr(st.val)
				});
				return {
					type: "let",
					variable: v,
					name: st.name.value
				};
				break;
			case "let[]":
				let va;
				scopes[scopes.length - 1].vars.set(st.name.value, va = {
					type: "array",
					size: processExpr(st.asize)
				});
				return {
					type: "let",
					variable: va,
					name: st.name.value
				};
			case "assign":
				return {
					type: "assign",
					dst: processExpr(dst),
					src: processExpr(src)
				};
			case "block":
				scopes.push(newScope());
				let sts = [];
				for(let stlabel of st.body) {
					let x = processStmt(stlabel);
					if(x != null) sts.push(x);
				}
				return {
					type: "block",
					body: sts,
					scope: scopes.pop()
				};
			case "if":
				return {
					type: "if",
					cond: processExpr(st.cond),
					then: processStmt(st.then),
					otherwise: processStmt(st.otherwise),
				};
			case "while":
				return {
					type: "while",
					cond: processExpr(st.cond),
					body: processStmt(st.body),
					isDo: st.isDo
				};
			case "structdef":
				let fields = new Map();
				for(let field of st.fields) {
					if(fields.has(field.name)) {
						console.error("lwctbc: error: field `" + field.name + "` has been previously defined (" + ploc(field) + ")");
						process.exit(1);
					} else {
						fields.set(field.name, field.ftype);
					}
				}
				scopes[scopes.length - 1].types.set(st.name, {
					type: "struct",
					name: st.name,
					fields
				});
				return null;
			case "bbj":
				return {
					type: "bbj",
					body: st.body.map(x => processExpr(x))
				};
		}
		throw new Error("Unknown statement type `" + st.type + "`");
	}

	function processType(x) {
		let t = scopes[scopes.length - 1].types.get(x.value);
		if(t == null) {
			console.error("lwctbc: error: type `" + x.value + "` is not defined (" + ploc(x) + ")");
			process.exit(1);
		}
		return {
			id: x,
			type: t
		};
	}

	function processVar(x) {
		let t = null;
		for(let i = scopes.length - 1; i >= 0 && t == null; i--) {
			if(config.verbosity > 1) {
				console.debug("lwctbc: debug: finding variable `" + x.value + "` in scope", i + ",", scopes[i]);
			}
			t = scopes[i].vars.get(x.value);
		}
		if(t == null) {
			console.error("lwctbc: error: variable `" + x.value + "` is not defined (" + ploc(x) + ")");
			process.exit(1);
		}
		return {
			type: "var",
			id: x,
			var: t
		};
	}

	function ploc(x) {
		return `${config.fileName} from ${x.location.start.line}:${x.location.start.column} to ${x.location.end.line}:${x.location.end.column}`;
	}
};
