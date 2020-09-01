'use strict';

const moo = require('moo');

const nl = { match: /\n/, lineBreaks: true };
const placeholder = /<<[^>\n]+>>/;
const stringLiteral = /\"(?:(?:[^\n\"\\])|(?:\\.))+\"/;
const ws = /[ \t]+/;

const lexer = moo.states({
	main: {
		closeCurly: '}',
		directive: { match: /@(?:[A-Za-z0-9_]+)/, push: 'line' },
		hash: { match: '#', push: 'line' },
		minus: { match: '-', push: 'line' },
		nl,
		openCurly: { match: '{', push: 'line' },
		openSquare: { match: '[', push: 'key' },
		placeholder,
		plus: '+',
		stringLiteral,
		ws: /[ \t]+/
	},

	key: {
		closeSquare: { match: ']', next: 'line' },
		simpleContent: /(?:(?:[^\n\]\\])|(?:\\.))+/,
		nl: Object.assign({}, nl, { next: 'multilineKey' })
	},
	line: {
		line: /[^ \t\{\n][^\n]*/,
		nl: Object.assign({}, nl, { pop: true }),
		openCurly: { match: '{' },
		ws: /[ \t]+/
	},
	multilineKey: {
		closeSquare: { match: ']', pop: true },
		plus: '+',
		nl,
		placeholder,
		stringLiteral,
		ws,
		hash: { match: '#', push: 'line' },
	}
});

// Adapted from
// https://github.com/no-context/moo/issues/81#issuecomment-337582515
lexer.next = (next => () => {
    let tok;
    while ((tok = next.call(lexer)) && tok.type === "ws") {}
    return tok;
})(lexer.next);

module.exports = lexer;
