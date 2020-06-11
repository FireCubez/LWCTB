const path = require("path");
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
	let builtinScope = newScope();
	let n8Type = {
		name: "n8",
		type: "builtin",
		isIntegerType: true,
		size: 1
	};
	let n16Type = {
		name: "n16",
		type: "builtin",
		isIntegerType: true,
		size: 2
	};
	let n32Type = {
		name: "n32",
		type: "builtin",
		isIntegerType: true,
		size: 4
	};
	let n64Type = {
		name: "n64",
		type: "builtin",
		isIntegerType: true,
		size: 8
	};
	let n128Type = {
		name: "n128",
		type: "builtin",
		isIntegerType: true,
		size: 16
	};
	let strType = {
		name: "str",
		type: "builtin",
		isIntegerType: true,
		size: 16
	};
	let unknownIntegerType = {
		type: "unknownInteger",
		isIntegerType: true
	};
	
	builtinScope.types.set("n8", n8Type);
	builtinScope.types.set("n16", n16Type);
	builtinScope.types.set("n32", n32Type);
	builtinScope.types.set("n64", n64Type);
	builtinScope.types.set("n128", n128Type);
	builtinScope.types.set("str", strType);
	builtinScope.types.set("addr", n64Type);
	let scopes = [builtinScope];
	let public = newScope();
	let sts = [];
	let deferredLabels = [];
	let align = 1, multi = false;
	for(let stlabel of parsed) {
		let x = processStmt(stlabel);
		if(x != null) {
			if(x.pragma === 1) {
				align = constEval(x.n, false);
				if(align == null) {
					console.error("lwctbc: error: @align value must be a positive integer");
					process.exit(1);
				}
			} else if(x.pragma === 2) {
				multi = true;
			} else sts.push(x);
		}
	}

	resolveLabels: for(let label of deferredLabels) {
		let name = label.value;
		for(let i = scopes.length - 1; i >= 0; i--) {
			for(let [k, v] of scopes[i].labels) {
				if(k === name) {
					label.refer = v;
					continue resolveLabels;
				}
			}
		}
		console.error("lwctbc: error: label `" + name + "` could not be resolved (" + ploc(label) + ")");
		process.exit(1);
	}

	return {public, sts, multi, align};

	function newScope() {
		return {
			types: new Map(),
			vars: new Map(),
			labels: new Map()
		};
	}

	function arrayType(size, inner) {
		return {
			type: "array",
			innerType: inner,
			size,
			name: inner.name + "[" + size + "]"
		};
	}

	function processExpr(x) {
		if(x.type === "cast") {
			return {
				type: "cast",
				a: processExpr(x.a),
				xtype: processType(x.restype)
			};
		}
		if(x.type === "access") {
			let base = processExpr(x.base);
			let list = x.list.map(e =>
				e.type === "call" ? {
					type: "call",
					args: e.args.map(processExpr)
				} : {
					type: "index",
					index: processExpr(e.index)
				}
			);
			let xtype = list.reduce((curType, item) => {
				if(item.type === "call") {
					if(curType.type !== "fn") {
						console.error("lwctbc: error: tried to call an expression of type `" + curType.name + "` (" + ploc(x) + ")");
					}
					return curType.returnValue;
				} else {
					if(curType.type !== "array") {
						console.error("lwctbc: error: tried to get field `" + curType + "` on an expression of type `" + curType.name + "` (" + ploc(x) + ")");
					}
					return curType.returnValue;
				}
			}, base.xtype);
			return {
				type: "access",
				base,
				list,
				xtype
			};
		}
		if(x.type === "posint") {
			return {
				...x,
				xtype: unknownIntegerType
			};
		}
		if(x.type === "strlit") {
			return {
				...x,
				xtype: strType
			};
		}
		if(x.type === "id") return processVar(x);
		if(x.type === "label") { // only in <AccessExpr>.base, but whatever, we can handle it here
			let v = { // let v = x will probably break since deferredLabels would mutate it.
				type: "label",
				value: x.value,
				id: x.id,
				extern: x.extern,
				xtype: n64Type
			};
			deferredLabels.push(v);
			return v;
		}
		let opA = processExpr(x.a);
		let opB = x.b && processExpr(x.b);
		let opName = x.type[0] === "u" ? x.type.slice(3) : x.type.slice(1);
		if(opB) {
			if(opA.xtype !== opB.xtype) {
				console.error("lwctbc: error: tried to perform operation `" + opName + "` on different types: `" + opA.xtype.name + "` and `" + opB.xtype.name + "` (" + ploc(x) + ")");
				process.exit(1);
			}
		}
		if(x.type === "uop+" || x.type === "uop-" || x.type === "uop~" || x.type === "uop*") {
			if(!opA.xtype.isIntegerType) {
				console.error("lwctbc: error: tried to perform operation `" + opName + "` on value of type `" + opA.xtype.name + "` instead of integer type (" + ploc(x) + ")");
				process.exit(1);
			}
		}
		return {
			type: x.type,
			a: opA,
			b: opB,
			xtype: opA.xtype
		};
	}

	function processStmt(stlabel) {
		let st = stlabel.st;
		for(let label of stlabel.labels) {
			scopes[scopes.length - 1].labels.set(label.value, label);
			label.labelType = "statement";
			label.statement = st;
			if(label.extern) public.labels.set(label.value, label);
		}
		let x = (() => {
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

					config.emitDeps["*input"] = {result: fs.readFileSync(file, "utf-8")};

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
					return {
						type: "import",
						imported
					};
				case "exprst":
					return {
						type: "exprst",
						expr: processExpr(st.expr)
					};
				case "goto":
					let labels = st.labels.map(x => {
						let l;
						scopes[scopes.length - 1].labels.set(x.value, l = {
							scope: scope[scopes.length - 1],
							...x,
							labelType: "goto",
							statement: st
						});
						return l;
					}); // placed first for side effects; `goto .x:.x` is possible like this
					return {
						type: "goto",
						dest: processExpr(st.dest),
						labels
					};
				case "let":
					let v, val;
					scopes[scopes.length - 1].vars.set(st.name.value, v = {
						type: "var",
						value: val = processExpr(st.val),
						register: st.register,
						xtype: val.xtype
					});
					return {
						type: "let",
						variable: v,
						name: st.name.value
					};
				case "let[]":
					let va;
					let inner = processType(st.innerType);
					let asize = constEval(st.asize, false);
					if(asize == null) {
						console.error("lwctbc: error: expected constant value for array size (" + ploc(st.asize) + ")");
						process.exit(1);
					}
					scopes[scopes.length - 1].vars.set(st.name.value, va = {
						type: "array",
						size: asize,
						register: st.register,
						inner,
						xtype: arrayType(asize, inner)
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
						console.log("stlabel =", JSON.stringify(stlabel));
						if(x.pragma) {
							console.error("lwctbc: error: cannot be used except at top level (" + ploc(stlabel) + ")");
							process.exit(1);
						}
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

				// ------

				case "pragma@align":
					return {
						pragma: 1,
						n: constEval(st.n, false)
					};
				case "pragma@multi":
					return {
						pragma: 2
					};
			}
			throw new Error("Unknown statement type `" + st.type + "`");
		})();
		if(x != null) x.labels = stlabel.labels;
		return x;
	}

	function processType(x) {
		let t;
		for(let i = scopes.length - 1; i >= 0 && t == null; i--) {
			if(config.verbosity > 1) {
				console.debug("lwctbc: debug: finding type `" + x.value + "` in scope", i + ",", scopes[i]);
			}
			t = scopes[i].types.get(x.value);
		}
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
			var: t,
			xtype: t.xtype
		};
	}

	function ploc(x) {
		return `${config.fileName} from ${x.location.start.line}:${x.location.start.column} to ${x.location.end.line}:${x.location.end.column}`;
	}

	function constEval(x, allowStrings=true) {
		switch(x.type) {
			case "posint":
				return x.value;
			case "strlit":
				if(allowStrings) return x.value;
				return null;
			default:
				throw new Error("<UNIMPLEMENTED constEval>");
		}
	}

};
