module.exports = class Vec {
	constructor(type) {
		this.type = type;
		this.cap = 65535;
		this.len = 0;
		this.buf = this.makeBuffer(this.cap);
	}

	ensureCapacity(cap) {
		if(this.capacity() < cap) {
			this.cap = cap;
			let newBuf = this.makeBuffer(cap);
			newBuf.set(this.buf);
			this.buf = newBuf;
		}
	}

	capacity() {
		return this.buf.length;
	}

	makeBuffer(cap) {
		return new (this.type)(cap);
	}

}