{
	function meta(x) {
		return Object.assign({location: xlocation(), source: text()}, x);
	}

	function xlocation() {
		let loc = location();
		let s = $$LWCTB.getLineInfo(loc.start.line);
		let e = $$LWCTB.getLineInfo(loc.end.line);
		return {
			start: {
				line: s.line,
				file: s.file,
				flags: s.flags,
				col: loc.start.column
			},
			end: {
				line: e.line,
				file: e.file,
				flags: e.flags,
				col: loc.end.column
			},
		};
	}

	const KEYWORDS = ["goto", "if", "else", "while", "do", "let", "bbj"];
	const RESERVED = ["@setstack", "@setstacksize", "struct", "static", "const"];
	const BUILTINS = [];
}

Program "program" = sts:(_n s:Statement {return s})* _n {return sts} / "" {return []}

Statement "statement" = labels:(l:Label _ ":" _n {return l})* st:(
	ExprSt / Goto / Let / Assign / Block / If / While / BBJ
) {return meta({
	type: "st",
	st, labels
})}

ExprSt = e:Expr _ ";" {return meta({
	type: "exprst",
	expr: e
})}

Goto = "goto" _ labels:(l:Label _ ":" _ {return l})* dest:CTExpr _ ";" {return meta({
	type: "goto",
	dest,
	labels
})}

Let = "let" __ name:Identifier _ "=" _ val:Expr _ ";" {return meta({
	type: "let",
	name, val
})} / "let" _ "[" _ asize:CTExpr _ "]" _ name:Identifier _ ";" {return meta({
	type: "let",
	name, asize
})}

Assign = dst:Assignable _ "=" _ src:Expr {return meta({
	type: "assign",
	dst, src
})}

Block "code block" = "{" p:Program "}" {return meta({
	type: "block",
	body: p
})}

If "if statement" = "if" __ cond:Expr _ then:Block otherwise:(_ "else" _ o:Block {return o}) {return meta({
	type: "if",
	cond, then, otherwise
})}

While "while loop" = isDo:("do" __)? "while" __ cond:Expr _ body:Block {return meta({
	type: "while",
	cond, body, isDo: !!isDo
})}

BBJ "inline BBJ" = "bbj" _ "{" body:(_n x:CTExpr {return x})* _n "}" {return meta({
	type: "bbj",
	body
})}

Assignable "assignable value" = e:Expr & {
	if(e.type === "access" && e.list.length && e.list[e.list.length - 1].type === "index") return true;
	if(e.base.type === "uop*") return true;
	return false;
} {return e}

Expr "expression" = Prec1Expr

Prec1Expr = a:Prec2Expr _ op:[+-] _ b:Prec1Expr {return meta({
	type: "op" + op,
	a, b
})} / Prec2Expr

Prec2Expr = a:Prec3Expr _ op:[*/%] _ b:Prec2Expr {return meta({
	type: "op" + op,
	a, b
})} / Prec3Expr

Prec3Expr = "(" _ restype:Identifier _ ")" _ a:Prec3Expr {return meta({
	type: "cast",
	a, restype
})} / op:[!~+*-] _ a:Prec3Expr {return meta({
	type: "uop" + op,
	a
})} / AccessExpr / PositiveInteger / StringLiteral

AccessExpr = base:(Identifier / Label / "(" _ e:Expr _ ")" {
	return meta({
		type: "parens",
		expr: e,
		unparened: e.type === "parens" ? e.unparened : e
	});
}) list:(
	"(" a:(_ head:Expr tail:(_ "," _ e:Expr {return e})* _ {return [head].concat(tail)} / _ {return []}) ")" {return meta({
		type: "call",
		args: a
	})} /
	"[" _ index:Expr _ "]" {return meta({
		type: "index",
		index
	})}
)* {return meta({
	type: "access",
	base, list
})}

CTExpr "compile-time known expression" = CTPrec1Expr

CTPrec1Expr = a:CTPrec2Expr _ op:[+-] _ b:CTPrec2Expr {return meta({
	type: "op" + op,
	a, b
})} / CTPrec2Expr

CTPrec2Expr = a:CTPrec3Expr _ op:[*/%] _ b:CTPrec3Expr {return meta({
	type: "op" + op,
	a, b
})} / CTPrec3Expr

CTPrec3Expr = "(" _ restype:Identifier _ ")" _ a:Prec3Expr {return meta({
	type: "cast",
	a, restype
})} / op:[!~+-] a:CTPrec3Expr {return meta({
	type: "uop" + op,
	a
})} / CTAccessExpr / PositiveInteger / StringLiteral

CTAccessExpr = base:(Label / "(" _ e:CTExpr _ ")" {return e}) list:(
	"(" a:(_ head:CTExpr tail:(_ "," _ e:CTExpr {return e})* _ {return [head].concat(tail)} / _ {return []}) ")" {return meta({
		type: "call",
		args: a
	})} /
	"[" _ index:CTExpr _ "]" {return meta({
		type: "index",
		index
	})}
)* {return meta({
	type: "access",
	base, list
})}

Identifier "identifier" = head:[A-Za-z$_@] tail:[A-Za-z0-9$_@]* ! {return KEYWORDS.includes(head + tail.join(""))} {
	let t = text();
	if(RESERVED.includes(t)) error("`" + t + "` is a keyword reserved for future use");
	if(t.startsWith("@") && !BUILTINS.includes(t)) error("`" + t + "` is not recommended for use as an identifier; identifiers beginning with `@` may conflict with builtin variables in the future");
	return meta({
		type: "id",
		value: t
	})
}

Label "label name" = "." x:Identifier {return meta({
	type: "labelname",
	value: x.value,
	id: x
})}

PositiveInteger "positive integer" = ntype:("0x" [0-9A-Fa-f]+ {return "hex"} / "0o" [0-7]+ {return "oct"} / "0b" [01]+ {return "bin"} / "0" {return "dec"} / [1-9][0-9]* {return "dec"}) {return meta({
	type: "posint",
	ntype,
	value: Number(text())
})}

StringLiteral "string literal" = '"' inner:StringLiteralInner '"' {
	return meta({
		type: "strlit",
		inner: inner,
		raw: inner.raw,
		value: inner.value
	})
}
StringLiteralInner = x:([^"\\] / "\\" x:[abtnvfr"\\] {return ({
	a: "\a",
	b: "\b",
	t: "\t",
	n: "\n",
	v: "\v",
	f: "\f",
	r: "r",
	"\\": "\\",
	'"': '"'
})[x]} / "\\" o:Oct3Digits {return String.fromCharCode(parseInt(o, 8))})* {return {
	raw: text(),
	value: x.join("")
}}

Oct3Digits "at most 3 octal digits" = ([0-7]([0-7][0-7]?)?) {return text()}
__ "whitespace" = [ \t]+

_ = __?

__n = [ \t\r\n]+
_n = __n?
