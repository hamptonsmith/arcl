@{%
	const lexer = require('./lexer');
%}

@lexer lexer

blockContents -> blockEntries:+ {% ([blockEntries]) => blockEntries %}

blockEntries ->
	comment {% ([comment]) => comment %}
  | taggedEntry {% ([taggedEntry]) => taggedEntry %}
  | untaggedEntry {% ([untaggedEntry]) => untaggedEntry %}
  | stringExpressionLine {% ([stringExpressionLine]) => stringExpressionLine %}
  | %nl {% () => ({ type: 'blankLine' }) %}
  | "@from" path {% ([from, path]) => ({ type: 'from', path }) %}

comment -> "#" %line:? %nl {% ([hash, line]) => ({
	type: 'comment', value: line.value
})%}

key ->
	%line:? %nl (stringExpressionLine | comment):* {%
			([ line, nl, stringLines ]) => ({
		type: 'multilineKey',
		stringExpressionLines: stringLines.map(([line]) => line)
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

stringExpressionLine ->
	(%stringLiteral | "+" | placeholder):+ (comment | %nl) {%
			([elements, comment, nl]) => ({
				type: 'multilineStringLine',
				comment,
				elements: elements.map(([element]) => element)
			})%}

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
