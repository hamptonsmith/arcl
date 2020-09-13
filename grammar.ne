@{%
	const lexer = require('./lexer');
%}

@lexer lexer

blockContents -> blockEntries:+ {% ([blockEntries]) => blockEntries %}

blockEntries ->
	comment {% ([comment]) => comment %}
  | taggedEntry {% ([taggedEntry]) => taggedEntry %}
  | untaggedEntry {% ([untaggedEntry]) => untaggedEntry %}
  | placeholderEntry {% ([placeholderEntry]) => placeholderEntry %}
  | stringExpressionEntry {%
	  ([stringExpressionEntry]) => stringExpressionEntry
	%}
  | %nl {% () => ({ type: 'blankLine' }) %}
  | "@from" path {% ([from, path]) => ({ type: 'from', path }) %}

comment -> "#" %line:? %nl {% ([hash, line]) => ({
	type: 'comment', value: line.value
})%}

eol -> %nl | comment

key ->
	%line:? %nl (stringExpressionEntry | eol):* {%
			([ line, nl, stringLines ]) => ({
		type: 'multilineKey',
		entries: stringLines
			.map(([e]) => e)
			.filter(e => e.type === 'stringExpression')
	})%}
  | %simpleContent {% ([simpleContent]) => ({
  		type: 'simpleKey',
		value: simpleContent
  	})%}

path -> pathComponent ("." pathComponent):* {%
	([head, others]) => ({
		type: 'path',
		components: [head, ...others.map(([dot, other]) => other)]
	})
%}

pathComponent ->
	%identifier {% ([identifier]) => ({ type: 'identifier', identifier }) %}
  | %star {% ([star]) => ({ type: 'star'}) %}
  | %stringLiteral {%
  		([stringLiteral]) => ({ type: 'stringLiteral', stringLiteral })%}

placeholder -> "<<" path ">>" {% ([open, path, close]) => ({
	type: 'placeholder',
	path
}) %}

placeholderEntry -> placeholder %nl {% ([placeholder, nl]) => ({
	type: 'placeholderEntry',
	placeholder
}) %}

stringExpressionComponent -> (%stringLiteral | placeholder) {% ([[x]]) => x %}

stringExpressionEntry ->
	placeholder stringExpressionTail eol {% ([placeholder, others, eol]) => ({
		type: 'stringExpression',
		components: [placeholder].concat(others)
	})%}
  | %stringLiteral stringExpressionTail:? eol {% ([first, others, eol]) => ({
	    type: 'stringExpression',
		components: [first].concat(others || [])
    })%}

stringExpressionTail -> (eol:* "+" eol:* stringExpressionComponent):+ {%
	([components]) =>
		components.map(([eol1, plus, eol2, component]) => component)
%}

taggedEntry -> "@template":? "[" key "]" value {%
		([templateAnnotation, open, key, close, value]) => ({
			type: 'taggedValue', key, templateAnnotation, value
		})%}

untaggedEntry -> "-" value {% ([bullet, value]) => ({
	type: 'untaggedValue', value
})%}

value ->
	%line:? %nl {% ([line]) => ({ type: 'simpleString', value: line || ''}) %}
  | "{" %line:? %nl blockContents:? "}" %line:? %nl {%
  		([open, line, nl, content]) => ({ type: 'block', line, content })%}
