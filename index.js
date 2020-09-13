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
			case 'placeholderEntry': {
				reachedContent = true;
				value = appendResolvedPlaceholderAst(value, item, argument);
				break;
			}
			case 'stringExpression': {
				reachedContent = true;
				value = appendStringExpressionAst(value, item, argument);
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

function appendResolvedPlaceholderAst(value, ast, argument) {
	const path = evaluatePathAst(ast.placeholder.path.components);
	const resolvedArgument = lodash.get(argument, path);

	if (!resolvedArgument) {
		throw error('Must provide a ' + path.join('.') + ' value.', argument);
	}

	if (value === undefined) {
		value = resolvedArgument;
	}
	else {
		const typeofResolvedArgument = typeof resolvedArgument;
		switch (typeofResolvedArgument) {
			case 'object': {
				if (Array.isArray(resolvedArgument)) {
					if (!Array.isArray(value)) {
						throw error('Cannot inject non-list ' + path.join('.')
					 			+ ' in a list slot.', ast.path);
					}

					value = value.concat(resolvedArgument);
				}
				else {
					if (typeof resolvedArgument !== 'object'
							|| Array.isArray(resolvedArgument)) {
						throw error('Cannot inject non-map ' + path.join('.')
								+ ' in a map slot.', ast.path);
					}

					value = merge(value, resolvedArgument);
				}
				break;
			}
			case 'string': {
				if (typeof value !== 'string') {
					throw error('Cannot inject non-string ' + path.join('.')
				 			+ ' in a string slot.', ast.path);
				}

				value += resolvedArgument;

				break;
			}
			default: {
				throw new Error('Unexpected resolved argument type: '
						+ typeofResolvedArgument);
			}
		}
	}

	return value;
}

function merge(a, b) {
	let result;

	if (typeof a === 'object') {
		if (Array.isArray(a)) {
			if (b === undefined) {
				result = a;
			}
			else if (Array.isArray(b)) {
				result = b;
			}
			else {
				throw error('Cannot merge non-array onto array.', b);
			}
		}
		else {
			result = Object.assign({}, a);

			if (typeof b !== 'object' || Array.isArray(b)) {
				throw error('Cannot merge non-map onto map.', b);
			}

			for (let [bKey, bVal] of Object.entries(b)) {
				result[bKey] = merge(result[bKey], bVal);
			}
		}
	}
	else if (typeof a === 'string') {
		if (b === undefined) {
			result = a;
		}
		else if (typeof b === 'string') {
			result = b;
		}
		else {
			throw error('Cannont merge non-string onto string.', b);
		}
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

function appendStringExpressionAst(result, ast, argument) {
	if (Array.isArray(result)) {
		throw error('Cannot append a string expression to a list.',
				result.key.token);
	}

	if (typeof result === 'object') {
		throw error('Cannot append a string expression to a dictionary.',
				result.key.token);
	}

	if (result === undefined) {
		result = '';
	}

	result = appendStringExpression(result, ast, argument);

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

			for (let line of ast.entries) {
				if (result != '') {
					result += '\n';
				}

				for (let element of line.components) {
					switch (element.type) {
						case 'stringLiteral': {
							result += trimQuotes(element.value);
							break;
						}
						default: {
							throw new Error('Unknown string expression ' +
									'component type: ' + element.type);
						}
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

function appendStringExpression(result, ast, argument) {
	if (result !== '') {
		result += '\n';
	}

	for (let component of ast.components) {
		switch (component.type) {
			case 'placeholder': {
				const path = evaluatePathAst(component.path.components);
				const value = lodash.get(argument, path);

				if (!value) {
					throw error('Must provide a ' + path.join('.') + ' value.',
							argument);
				}

				if (typeof value !== 'string') {
					throw error('Provide value for ' + path.join('.') +
							'must be a string.', argument);
				}

				result += value;
				break;
			}
			case 'stringLiteral': {
				result += trimQuotes(component.value);
				break;
			}
			default: {
				throw new Error('Unknown string fragment element type: '
						+ component.type);
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
