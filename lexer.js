'use strict';

const moo = require('moo');

const identifier = /(?:[A-Za-z0-9][A-Za-z0-9_\-]*)/;
const nl = { match: /\n/, lineBreaks: true };
const placeholder = /<<[^>\n]+>>/;
const stringLiteral = /\"(?:(?:[^\n\"\\])|(?:\\.))+\"/;
const ws = /[ \t]+/;

const lexer = moo.states({
	main: {
		closeCurly: '}',
		directive: /@(?:[A-Za-z0-9_]+)/,
		hash: { match: '#', push: 'line' },
		identifier,
		minus: { match: '-', push: 'line' },
		nl,
		openCurly: { match: '{', push: 'line' },
		openSquare: { match: '[', push: 'key' },
		openAngled: { match: '<<', push: 'placeholder' },
		plus: '+',
		stringLiteral,
		ws: /[ \t]+/
	},

	key: {
		closeSquare: { match: ']', next: 'line' },
		nl: Object.assign({}, nl, { next: 'multilineKey' }),
		simpleContent: /(?:(?:[^\n\]\\])|(?:\\.))+/
	},
	line: {
		line: /[^ \t\{\n][^\n]*/,
		nl: Object.assign({}, nl, { pop: true }),
		openCurly: { match: '{' },
		ws: /[ \t]+/
	},
	multilineKey: {
		closeSquare: { match: ']', pop: true },
		hash: { match: '#', push: 'line' },
		plus: '+',
		nl,
		placeholder,
		stringLiteral,
		ws
	},
	placeholder: {
		closeAngled: { match: '>>', pop: true },
		dot: '.',
		identifier,
		star: '*',
		stringLiteral
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
