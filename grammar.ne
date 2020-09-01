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

comment -> "#" %line:? %nl {% ([hash, line]) => ({
	type: 'comment', value: line.value
})%}

taggedEntry -> "[" key "]" value {% ([open, key, close, value]) => ({
	type: 'taggedValue', key, value
})%}

untaggedEntry -> "-" value {% ([bullet, value]) => ({
	type: 'untaggedValue', value
})%}

value ->
	%line:? %nl {% ([line]) => ({ type: 'simpleString', value: line || ''}) %}
  | "{" %line:? %nl blockContents:? "}" %line:? %nl {%
  		([open, line, nl, content]) => ({ type: 'block', line, content })%}

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

stringExpressionLine ->
	(%stringLiteral | "+"):+ (comment | %nl) {% ([elements, comment, nl]) => ({
		type: 'multilineStringLine',
		comment,
		elements: elements.map(([element]) => element)
	})%}
