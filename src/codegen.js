//const Vec = require("./vec.js");

// Actually convert it to BBJ

module.exports = (config, tree) => {
	let buf = [
		/* reserved 8 bytes for entry */ ...x8(0),
		/* stack pointer */ ...x8(0),
		/* immediate register */ ...x16(0),
	];
	const ENTRY = 0;
	const STACK_PTR = 8;

	const IMM_REG_LOC = 16;
	const IMM_REG_SIZE = 16;

	let addTable;

	let immSize = 0;
	let registerIndex = 0;
	let constAddrs = new Map();
	let constStrAddrs = new Map();

	let deferredLabelRefs = [];

	let utf8Encoder = new TextEncoder();
	
	if(config.noMath) {
		// registers
		for(let i = 0; i < 32; i++) {
			genBBJAddr(0);
			genBBJAddr(0);
		}
	} else {
		alignBuf(0x10000);

		addTable = getBufLen();
		for(let a = 0; a < 256; a++) {
			for(let b = 0; b < 256; b++) {
				genBBJByte((a + b) & 0xFF);
			}
		}
	}

	// align to 0x100
	alignBuf(0x100);

	const NOT_TABLE = getBufLen();
	
	// NOT-table
	genBBJByte(8); // 8 = true for simplicity of conditional implementation
	genBBJByte(0); // 0 = false

	for(let st of tree.sts) {
		genStatement(st);
	}

	for(let ref of deferredLabelRefs) {
		if(ref.expr != null) {
			// evaluate compile-time expression
			setBBJAddr(ref.addr, evalCTExpr(ref.expr));
		} else {
			setBBJAddr(ref.addr, ref.label.addr);
		}
	}

	return Buffer.from(buf);

	function register(n) {
		return (n + 2) * 16;
	}

	function x1(n) {
		return [n];
	}

	function x2(n) {
		return [n, n];
	}

	function x4(n) {
		return [n, n, n, n];
	}

	function x8(n) {
		return [n, n, n, n, n, n, n, n];
	}

	function x16(n) {
		return [n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n];
	}

	function sizeof(t) {
		if(t.builtin) return t.size;
		if(t.type === "array") return t.size * sizeof(t.innerType);
		throw new Error("<UNIMPLEMENTED sizeof(<struct>)>");
	}

	function evalCTExpr(expr) {
		switch(expr.type) {
			case "op+":
				return evalCTExpr(expr.a) + evalCTExpr(expr.b);
			case "op-":
				return evalCTExpr(expr.a) - evalCTExpr(expr.b);
			case "op*":
				return evalCTExpr(expr.a) * evalCTExpr(expr.b);
			case "op/":
				return evalCTExpr(expr.a) / evalCTExpr(expr.b);
			case "op%":
				return evalCTExpr(expr.a) % evalCTExpr(expr.b);
			case "uop!":
				return evalCTExpr(expr.a) === 0 ? 8 : 0;
			case "uop~":
				return ~evalCTExpr(expr.a);
			case "uop+":
				return +evalCTExpr(expr.a);
			case "uop-":
				return -evalCTExpr(expr.a);
			case "cast":
				let bits = sizeof(expr.xtype) * 8;
				return evalCTExpr(expr.a) & ((1 << bits) - 1);
			// primitives
			case "posint":
				return Number(expr.value);
			case "strlit":
				return expr.value;
			case "label":
				return expr.refer.addr;
		}
	}

	function genStatement(st) {
		console.log(st);
		for(let label of st.labels) {
			label.addr = getBufLen();
			if(label.extern && label.value === "_start") {
				setBBJAddr(ENTRY, getBufLen());
			}
		}
		switch(st.type) {
			case "import":
				if(!st.imported.multi) {
					if(st.imported.doneOnce) break;
					st.imported.doneOnce = true;
				}
				if(getBufLen() % st.imported.align !== 0) {
					genBBJAddr(0);
					genBBJAddr(0);
					let jmpTarget = getBufLen();
					genBBJAddr(0);
					alignBuf(st.imported.align);
					setBBJAddr(jmpTarget, getBufLen());
				}
				for(let st of st.imported.sts) {
					genStatement(st);
				}
				break;
			case "exprst":
				genExpression(st.expr);
				break;
			case "goto":
				genExpression(st.dest);
				genJumpD(IMM_REG_LOC);
				break;
			case "let":
				if(st.register) {
					let ind = registerIndex++;
					st.variable.registerIndex = ind;
					genExpression(st.variable.value);
					genSetMemDD(register(ind), IMM_REG_LOC, IMM_REG_SIZE);
				} else {
					throw new Error("No support for non-register vars");
				}
				break;
			case "let[]":
				if(st.register) {
					let ind = registerIndex++;
					st.variable.registerIndex = ind;
					// allocate registers for the array data itself
					registerIndex += st.variable.xtype.size;
				} else {
					throw new Error("No support for non-register vars");
				}
				break;
			case "assign":
				if(st.dst.type === "uop*") {
					let ptr = st.dst.a;
					genExpression(ptr);
					let tmp = register(registerIndex++);
					genSetMemDD(tmp, IMM_REG_LOC, 8);
					genExpression(st.src);
					genSetMemDD(getBufLen() + 32, tmp, 8);
					genSetMemDD(0, IMM_REG_LOC, IMM_REG_SIZE);
					registerIndex--;
				}
				throw new Error("No support for array-indexing lvalues");
				break;
			case "block":
				let regInd = registerIndex;

				// TODO: add code to dynamically save stack pointer in a register

				for(let st of st.body) {
					genStatement(st);
				}

				// TODO: add code to retrieve stack pointer from register

				registerIndex = regInd; // free register variables
				break;
			case "bbj":
				for(let val of st.body) {
					genCTExprValue(val);
				}
				break;
			default:
				throw new Error("Unknown statement type `" + st.type + "`");
		}
	}

	function genExpression(expr) {
		switch(expr.type) {
			case "cast":
				// truncate value to prevent cases such as (n64) (BYTE) 888 essentially ignoring the cast (because thats exactly what we'd be doing)
				immSize = sizeof(expr.xtype.type);
				for(let i = immSize; i < IMM_REG_SIZE; i++) {
					genSetMemDC(IMM_REG_LOC + i, 0);
				}
				break;
			case "access":
				if(expr.list.length) throw new Error("<UNIMPLEMENTED genExpression(<non-empty access expression>)");
				genExpression(expr.base);
				break;
			case "posint":
				// default integer size is max imm reg size, 16 bytes.
				genSetMemDCBig(IMM_REG_LOC, Number(expr.value), IMM_REG_SIZE);
				immSize = IMM_REG_SIZE;
				break;
			case "strlit":
				let data = getConstStrData(expr.value);
				genSetMemDCBig(IMM_REG_LOC, data.addr, 8);
				genSetMemDCBig(IMM_REG_LOC + 8, data.length, 8);
				immSize = 16;
				break;
			case "var":
				if(expr.var.register) {
					if(expr.var.registerIndex == null) {
						throw new Error("INTERNAL LWCTBC CODEGEN ERROR: expr.var.registerIndex:", expr.var.registerIndex, "expr.id.value:", expr.id.value, "expr.id.location:", `${config.fileName} from ${x.location.start.line}:${x.location.start.column} to ${x.location.end.line}:${x.location.end.column}`);
					}
					genSetMemDD(IMM_REG_LOC, register(expr.var.registerIndex), IMM_REG_SIZE);
					immSize = IMM_REG_SIZE;
				} else {
					throw new Error("No support for non-register vars");
				}
			case "label":
				genBBJAddr(IMM_REG_LOC);
				genDeferredLabel(expr.refer);
				genBBJAddr(getBufLen() + 8);
				break;
			case "uop!":
				genExpression(expr.a);
				genTableLookupCDD(NOT_TABLE, IMM_REG_LOC, IMM_REG_LOC);
				break;
			case "uop+":
				break;
			default:
				throw new ERROR("UNIMPLEMENTED <genExpression(<operation " + expr.type + ")>")
				break;
		}
	}

	function genCTExprVal(expr) {
		deferredLabelRefs.push({
			addr: getBufLen(),
			expr
		});
		genBBJAddr(0);
	}

	function genSetMemDD(dst, src, amt=1) {
		for(let i = 0; i < amt; i++) {
			genBBJAddr(src);
			genBBJAddr(dst);
			genBBJAddr(getBufLen() + 8);
			src++;
			dst++;
		}
	}

	function genSetMemDC(dst, n, amt=1) {
		let c = getConstAddr(n);
		for(let i = 0; i < amt; i++) {
			genSetMemDD(dst, c);
			dst++;
		}
	}

	function genSetMemDCBig(dst, n, bytes) {
		for(let i = 0; i < bytes; i++) {
			genSetMemDC(dst, n & 0xFF);
			n = n >> 8;
			dst++;
		}
	}

	function genSetMemDCBytes(dst, bytes) {
		for(let i = 0; i < bytes.length; i++) {
			genSetMemDC(dst, bytes[i]);
			dst++
		}
	}

	function genTableLookupCDD(table, dst, src, amt=1) {
		genSetMemDD(getBufLen() + 24, src, amt);
		genSetMemDD(dst, table);
	}

	function genJumpWithData(bytes) {
		genBBJAddr(0);
		genBBJAddr(0);
		let b = getBufLen() + 8;
		genBBJAddr(b + bytes.length);
		genBBJBytes(bytes);
		return b;
	}

	function genJumpC(dst) {
		genBBJAddr(0);
		genBBJAddr(0);
		genBBJAddr(dst);
	}
	function genJumpD(dst) {
		genSetMemDD(getBufLen() + 40, dst, 8);
		genJumpC(0);
	}

	function genDeferredLabel(label) {
		deferredLabelRefs.push({
			addr: getBufLen(),
			label
		});
		genBBJAddr(0);
	}

	function getConstAddr(n) {
		if(n > 255) throw new Error("n must be a byte (getConstAddr(" + n + "))");
		if(constAddrs.has(n)) return constAddrs.get(n);
		let b = genJumpWithData([n]);
		constAddrs.set(n, b);
		return b;
	}

	function getConstStrData(str) {
		if(constStrAddrs.has(str)) return constStrAddrs.get(str);
		let bytes = utf8Bytes(str);
		let s = genJumpWithData(bytes);
		let o = {
			addr: s,
			bytes: bytes,
			length: bytes.length
		};
		constStrAddrs.set(str, o);
		return o;
	}

	function utf8Bytes(str) {
		return utf8Encoder.encode(str);
	}

	function genBBJByte(b) {
		buf.push(b);
	}

	function genBBJBytes(bytes) {
		buf.push(...bytes);
	}

	function setBBJByte(loc, b) {
		buf[loc] = b;
	}

	function setBBJBytes(loc, bytes) {
		for(let i = 0; i < bytes.length; i++) {
			buf[loc + i] = bytes[i];
		}
	}

	function setBBJAddr(loc, addr) {
		for(let i = 0; i < 8; i++) {
			setBBJByte(loc, addr & 0xFF);
			addr = addr >> 8;
			loc++;
		}
	}

	function alignBuf(align) {
		while(getBufLen() % align !== 0) {
			genBBJByte(0);
		}
	}

	function getBufLen() {
		return buf.length;
	}

	function genBBJAddr(addr) {
		for(let i = 0; i < 8; i++) {
			genBBJByte(addr & 0xFF);
			addr = addr >> 8;
		}
	}

}