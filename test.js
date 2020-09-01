'use strict';

const arcl = require('./index');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ARCL_EXTENSION = '.arcl';

const testDir = path.join(__dirname, 'testing', 'tests');

let testCt = 0;

fs.readdirSync(testDir).forEach(file => {
	const absFile = path.join(testDir, file);

	if (absFile.endsWith(ARCL_EXTENSION)) {
		testCt++;

		const actual = arcl(fs.readFileSync(absFile, 'utf8'));
		const expected = JSON.parse(fs.readFileSync(
			absFile.substring(0, absFile.length - ARCL_EXTENSION.length)
			+ '.json',
			'utf8'));

		assert.deepStrictEqual(actual, expected, file);
	}
});

console.log(`All ${testCt} tests passed.`);
