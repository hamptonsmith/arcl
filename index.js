'use strict';

const fs = require('fs');
const grammar = require("./grammar.ne.js");
const lexer = require('./lexer.js');
const nearley = require("nearley");

module.exports = input => {
	const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));
	parser.feed(input);

	if (parser.results.length === 0) {
		throw new Error('Unexpected end of input.');
	}
	else if (parser.results.length > 1) {
		const e = new Error('Ambiguous parse.');
		e.parses = parser.results;
		throw e;
	}

	return evaluateBlockContentsAst(parser.results[0]);
};

function evaluateBlockContentsAst(ast) {
	let result;

	for (let item of ast) {
		switch (item.type) {
			case 'comment': {
				// This space intentionally left blank.
				break;
			}
			case 'multilineStringLine': {
				result = appendMultilineStringLineAst(result, item);
				break;
			}
			case 'taggedValue': {
				result = appendTaggedValueAst(result, item);
				break;
			}
			case 'untaggedValue': {
				result = appendUntaggedValueAst(result, item);
				break;
			}
			default: {
				throw new Error(
						'Unknown block item AST node type: ' + item.type);
			}
		}
	}

	return result;
}

function appendMultilineStringLineAst(result, ast) {
	if (Array.isArray(result)) {
		throw error(
				'Cannot append a string fragment to a list.', result.key.token);
	}

	if (typeof result === 'object') {
		throw error('Cannot append a string fragment to a dictionary.',
				result.key.token);
	}

	if (result === undefined) {
		result = '';
	}

	result = appendStringFragment(result, ast);

	return result;
}

function appendTaggedValueAst(result, ast) {
	if (Array.isArray(result)) {
		throw error('Cannot add a tagged value to a list.', result.key.token);
	}

	if (typeof result == 'string') {
		throw error('Cannot add a tagged value to a string.', result.key.token);
	}

	const key = evaluateKeyAst(ast.key);
	const value = evaluateValueAst(ast.value);

	if (result === undefined) {
		result = {};
	}

	result[key] = value;

	return result;
}

function appendUntaggedValueAst(result, ast) {
	if (typeof result === 'object' && !Array.isArray(result)) {
		throw error('Cannot add an untagged value to a dictionary.',
				result.key.token);
	}

	if (typeof result == 'string') {
		throw error('Cannot add an untagged value to a string.',
				result.key.token);
	}

	const value = evaluateValueAst(ast.value);

	if (result === undefined) {
		result = [];
	}

	result.push(value);

	return result;
}

function evaluateKeyAst(ast) {
	let result;

	switch (ast.type) {
		case 'multilineKey': {
			result = '';

			let newLine = false;
			for (let line of ast.stringExpressionLines) {
				switch (line.type) {
					case 'comment': {
						// This space intentionally left blank.
						break;
					}
					case 'multilineStringLine': {
						for (let element of line.elements) {
							switch (element.type) {
								case 'plus': {
									newLine = false;
									break;
								}
								case 'stringLiteral': {
									if (newLine) {
										result += '\n';
										newLine = false;
									}

									result += trimQuotes(element.value);
									newLine = true;
									break;
								}
								default: {
									throw new Error('Unknown '
											+ 'multilineStringLine type: '
											+ element.type)
								}
							}
						}
						break;
					}
					default: {
						throw new Error('Unknown multiline key line type: '
								+ line.type);
					}
				}
			}

			break;
		}
		case 'simpleKey': {
			result = ast.value.value.trim();
			break;
		}
		default: {
			throw new Error('Unknown key AST type: ' + ast.type);
		}
	}

	return result;
}

function evaluateValueAst(ast) {
	let result;

	switch (ast.type) {
		case 'simpleString': {
			result = ast.value.value.trim();
			break;
		}
		case 'block': {
			result = evaluateBlockContentsAst(ast.content);
			break;
		}
		default: {
			throw new Error('Unknown value AST type: ' + ast.type);
		}
	}

	return result;
}

function appendStringFragment(result, ast) {
	let newLine = result.length !== 0;

	for (let element of ast.elements) {
		switch (element.type) {
			case 'plus': {
				newLine = false;
				break;
			}
			case 'stringLiteral': {
				if (newLine) {
					result += '\n';
					newLine = false;
				}

				result += trimQuotes(element.value);
				break;
			}
			default: {
				throw new Error('Unknown string fragment element type: '
						+ element.tpye);
			}
		}
	}

	return result;
}

function trimQuotes(stringLiteral) {
	return stringLiteral.substring(1, stringLiteral.length - 1);
}

function error(msg, token) {
	const e = new Error(msg);
	e.token = token;
	return e;
}
