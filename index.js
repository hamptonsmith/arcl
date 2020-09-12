'use strict';

const fs = require('fs');
const grammar = require("./grammar.ne.js");
const lexer = require('./lexer.js');
const lodash = require('lodash');
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

	let result;

	try {
		result = evaluateBlockContentsAst(parser.results[0], {}, true);
	}
	catch (e) {
		console.log(JSON.stringify(parser.results[0], null, 4));
		throw e;
	}

	return result;
};

function evaluateBlockContentsAst(ast, templates, topLevel, argument) {
	// Pre-process for templates.
	for (let item of ast) {
		switch (item.type) {
			case 'taggedValue': {
				if (item.templateAnnotation) {
					if (!topLevel) {
						throw error('Nested templates are\'nt allowed.',
								item.templateAnnotation);
					}

					templates[evaluateKeyAst(item.key)] = item.value;
				}
				break;
			}
			default: {
				// Just ignore.  Next loop will raise an error if it's a weird
				// type.
			}
		}
	}

	let value;
	let parent;
	let reachedContent = false;
	for (let item of ast) {
		switch (item.type) {
			case 'blankLine':
			case 'comment': {
				// This space intentionally left blank.
				break;
			}
			case 'from': {
				if (reachedContent) {
					throw error(
							'@from must occur before content.', item.location);
				}

				parent = item.path;
				break;
			}
			case 'multilineStringLine': {
				reachedContent = true;
				value = appendMultilineStringLineAst(value, item, argument);
				break;
			}
			case 'taggedValue': {
				reachedContent = true;
				// Ignore templates.
				if (!item.templateAnnotation) {
					value = appendTaggedValueAst(
							value, item, templates, argument);
				}
				break;
			}
			case 'untaggedValue': {
				reachedContent = true;
				value = appendUntaggedValueAst(value, item, argument);
				break;
			}
			default: {
				throw new Error(
						'Unknown block item AST node type: ' + item.type);
			}
		}
	}

	let result;
	if (parent) {
		result = applyTemplate(templates, parent, value);
	}
	else {
		result = value;
	}

	return result;
}

function applyTemplate(templates, parent, argument) {
	const path = evaluatePathAst(parent.components);
	const chosenTemplate = lodash.get(templates, path);

	if (!chosenTemplate) {
		throw error('No such template: ' + path.join('.'), parent);
	}

	return evaluateValueAst(chosenTemplate, templates, argument);
}

function evaluatePathAst(path) {
	return path.map(component => {
		let result;

		switch (component.type) {
			case 'identifier': {
				result = component.identifier.value;
				break;
			}
			case 'stringLiteral': {
				result = JSON.parse(value);
				break;
			}
			default: {
				throw new Error('Unknown path component type: '
						+ component.type);
			}
		}

		return result;
	});
}

function appendMultilineStringLineAst(result, ast, argument) {
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

	result = appendStringFragment(result, ast, argument);

	return result;
}

function appendTaggedValueAst(result, ast, templates) {
	if (Array.isArray(result)) {
		throw error('Cannot add a tagged value to a list.', result.key.token);
	}

	if (typeof result == 'string') {
		throw error('Cannot add a tagged value to a string.', result.key.token);
	}

	const key = evaluateKeyAst(ast.key);
	const value = evaluateValueAst(ast.value, templates);

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

function evaluateValueAst(ast, templates, argument) {
	let result;

	switch (ast.type) {
		case 'simpleString': {
			result = ast.value.value.trim();
			break;
		}
		case 'block': {
			result = evaluateBlockContentsAst(
					ast.content, templates, false, argument);
			break;
		}
		default: {
			throw new Error('Unknown value AST type: ' + ast.type);
		}
	}

	return result;
}

function appendStringFragment(result, ast, argument) {
	let newLine = result.length !== 0;

	for (let element of ast.elements) {
		switch (element.type) {
			case 'placeholder': {
				const path = evaluatePathAst(element.path.components);
				const value = lodash.get(argument, path);

				if (!value) {
					throw error('Must provide a ' + path.join('.') + ' value.',
							argument);
				}

				if (typeof value !== 'string') {
					throw error('Provide value for ' + path.join('.') +
							'must be a string.', argument);
				}

				if (newLine) {
					result += '\n';
					newLine = false;
				}

				result += value;
				break;
			}
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
						+ element.type);
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
