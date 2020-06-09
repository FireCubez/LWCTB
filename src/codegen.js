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
	
	const ADD_TABLE = 0x10000;

	let immSize = 0;
	let registerIndex = 0;
	let constAddrs = new Map();
	let constStrAddrs = new Map();

	let deferredLabelRefs = [];

	for(let i = buf.length; i < 0x10000; i++) {
		genBBJByte(0);
	}

	for(let a = 0; a < 256; a++) {
		for(let b = 0; b < 256; b++) {
			genBBJByte((a + b) & 0xFF);
		}
	}
	for(let st of tree.sts) {
		genStatement(buf);
	}

	for(let ref of deferredLabelRefs) {
		setBBJBytes(ref.addr, ref.label.addr);
	}

	return new Buffer(buf);

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
		throw new Error("<UNIMPLEMENTED sizeof(<struct>)>");
	}

	function genStatement(st) {
		for(let label of st.labels) {
			label.addr = getBufLen();
		}
		switch(st.type) {
			case "import":
				for(let st of st.imported.sts) {
					if(!st.imported.multi) {
						if(st.imported.doneOnce) break;
						st.imported.doneOnce = true;
					}
					genStatement(st);
				}
				break;
			case "exprst":
				genExpression(st.expr);
				break;
		}
		throw new Error("Unknown statement type `" + st.type + "`");
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
				throw new Error("<UNIMPLEMENTED genExpression(<access expression>)");
			case "posint":
				// default integer size is max imm reg size, 16 bytes.
				genSetMemDCBig(IMM_REG_LOC, expr.value, IMM_REG_SIZE);
				immSize = IMM_REG_SIZE;
				break;
			case "strlit":
				let data = getConstStrData(expr.value);
				genSetMemDCBig(IMM_REG_LOC, data.addr, 8);
				genSetMemDCBig(IMM_REG_LOC + 8, data.length, 8);
				break;
			case "var":
				if(expr.var.register) {
					if(expr.var.registerIndex == null) {
						throw new Error("INTERNAL LWCTBC CODEGEN ERROR: expr.var.registerIndex:", expr.var.registerIndex, "expr.id.value:", expr.id.value, "expr.id.location:", `${config.fileName} from ${x.location.start.line}:${x.location.start.column} to ${x.location.end.line}:${x.location.end.column}`);
					}
					genSetMemDD(IMM_REG_LOC, register(expr.var.registerIndex));
				} else {
					throw new Error("UNIMPLEMENTED <genExpression(<non-register var>)");
				}
			case "label":
				genDeferredLabel(expr.refer);
				break;
			default:
				
				break;
		}
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

	function getSetMemDC(dst, n, amt=1) {
		let c = getConstAddr(n);
		for(let i = 0; i < amt; i++) genSetMemDD(dst, c);
	}

	function genSetMemDCBig(dst, n, bytes) {
		for(let i = 0; i < bytes; i++) {
			genSetMemDC(n & 0xFF);
			n = n >> 8;
		}
	}

	function genSetMemDCBytes(dst, bytes) {
		for(let i = 0; i < bytes.length; i++) {
			genSetMemDC(bytes[i]);
		}
	}

	function genJumpWithData(bytes) {
		genBBJAddr(0);
		genBBJAddr(0);
		let b = getBufLen() + 8;
		genBBJAddr(b + bytes.length);
		genBBJBytes(bytes);
		return b;
	}

	function genDeferredLabel(label) {
		deferredLabelRefs.push({
			addr: getBufLen(),
			label
		});
		genBBJBytes(x8(0));
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

	let utf8Encoder = new TextEncoder();
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
		buf[loc] = n;
	}

	function setBBJBytes(loc, bytes) {
		for(let i = 0; i < bytes.length; i++) {
			buf[loc + i] = bytes[i];
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