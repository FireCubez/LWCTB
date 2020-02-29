module.exports = [
	{
		"location": {
			"start": {
				"offset": 0,
				"line": 1,
				"column": 1
			},
			"end": {
				"offset": 19,
				"line": 1,
				"column": 20
			}
		},
		"source": "let a = (type) \"x\";",
		"type": "st",
		"st": {
			"location": {
				"start": {
					"offset": 0,
					"line": 1,
					"column": 1
				},
				"end": {
					"offset": 19,
					"line": 1,
					"column": 20
				}
			},
			"source": "let a = (type) \"x\";",
			"type": "let",
			"name": {
				"location": {
					"start": {
						"offset": 4,
						"line": 1,
						"column": 5
					},
					"end": {
						"offset": 5,
						"line": 1,
						"column": 6
					}
				},
				"source": "a",
				"type": "id",
				"value": "a"
			},
			"val": {
				"location": {
					"start": {
						"offset": 8,
						"line": 1,
						"column": 9
					},
					"end": {
						"offset": 18,
						"line": 1,
						"column": 19
					}
				},
				"source": "(type) \"x\"",
				"type": "cast",
				"a": {
					"location": {
						"start": {
							"offset": 15,
							"line": 1,
							"column": 16
						},
						"end": {
							"offset": 18,
							"line": 1,
							"column": 19
						}
					},
					"source": "\"x\"",
					"type": "strlit",
					"inner": {
						"raw": "x",
						"value": "x"
					},
					"raw": "x",
					"value": "x"
				},
				"restype": {
					"location": {
						"start": {
							"offset": 9,
							"line": 1,
							"column": 10
						},
						"end": {
							"offset": 13,
							"line": 1,
							"column": 14
						}
					},
					"source": "type",
					"type": "id",
					"value": "type"
				}
			}
		},
		"labels": []
	}
]
