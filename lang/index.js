var _ = require("lodash");
var symbolToJSIdentifier = require("../symbolToJSIdentifier");

var target_macros = {};
var defTmacro = function(name, fn){
  target_macros[name] = fn;
};

var mkJSLiteral = function(ast, value, raw){
  return {
    loc: ast.loc,
    type: "Literal",
    value: value,
    raw: raw
  };
};

var assertAstListLength = function(ast, len){
  if(_.size(ast.value) !== len){
    throw new Error("Wrong num args "+len+" != "+_.size(ast.value)+": todo helpful message with line numbers etc...");
  }
};
var assertAstType = function(ast, type){
  if(ast.type !== type){
    throw new Error("Expected "+type+" but got "+ast.type+": todo helpful message with line numbers etc...");
  }
};

var toStatement = function(estree){
  if(/(Statement|Declaration)$/.test(estree.type)){
    return estree;
  }
  return {
    loc: estree.loc,
    type: "ExpressionStatement",
    expression: estree
  };
};

var literal_symbols = {
  "js/null": function(ast){
    return mkJSLiteral(ast, null, "null");
  },
  "js/false": function(ast){
    return mkJSLiteral(ast, false, "false");
  },
  "js/true": function(ast){
    return mkJSLiteral(ast, true, "true");
  },
  "js/undefined": function(ast){
    return {
      loc: ast.loc,
      type: "Identifier",
      name: "undefined"
    };
  },
  "js/this": function(ast){
    return {
      "loc": ast.loc,
      "type": "ThisExpression"
    };
  },
  "js/arguments": function(ast){
    return {
      "loc": ast.loc,
      "type": "Identifier",
      "name": "arguments"
    };
  },
  "nil": function(ast){
    return {
      loc: ast.loc,
      type: "UnaryExpression",
      prefix: true,
      operator: "void",
      argument: {
        loc: ast.loc,
        type: "Literal",
        value: 0,
        raw: "0"
      }
    };
  }
};

////////////////////////////////////////////////////////////////////////////////
//primitive $$ecmaless$$ macros
defTmacro("$$ecmaless$$apply", function(ast, astToTarget){
  //TODO look for user defined macros here?
  return {
    loc: ast.loc,
    type: "CallExpression",
    callee: astToTarget(ast.value[1]),
    "arguments": _.map(ast.value.slice(2), astToTarget)
  };
});
defTmacro("$$ecmaless$$make-type-symbol", function(ast, astToTarget){
  if(_.has(literal_symbols, ast.value)){
    return literal_symbols[ast.value](ast);
  }
  var symbol = ast.value;
  return {
    loc: ast.loc,
    type: "Identifier",
    name: symbolToJSIdentifier(symbol)
  };
});
defTmacro("$$ecmaless$$make-type-number", function(ast, astToTarget){
  return mkJSLiteral(ast, parseFloat(ast.value), ast.src);
});
defTmacro("$$ecmaless$$make-type-string", function(ast, astToTarget){
  return mkJSLiteral(ast, ast.value, ast.src);
});

////////////////////////////////////////////////////////////////////////////////
//js macros
defTmacro("js/program", function(ast, astToTarget){
  return {
    "loc": ast.loc,
    "type": "Program",
    "body": _.map(astToTarget(ast.value.slice(1)), toStatement)
  };
});

var mkJS1ArgOperator = function(ast, astToTarget, operator){
  return {
    loc: ast.value[0].loc,
    type: "UnaryExpression",
    prefix: true,
    operator: operator,
    argument: astToTarget(ast.value[1])
  };
};

var mkJS2ArgOperator = function(ast, astToTarget, type, operator){
  return {
    loc: ast.value[0].loc,
    type: type,
    operator: operator,
    left: astToTarget(ast.value[1]),
    right: astToTarget(ast.value[2])
  };
};

var defJSOperator = function(type, operator){
  var name = "js/" + operator;
  name = name.replace(/</g, "lt");
  name = name.replace(/>/g, "gt");
  defTmacro(name, function(ast, astToTarget){
    assertAstListLength(ast, 3);
    return mkJS2ArgOperator(ast, astToTarget, type, operator);
  });
};
_.each([
  "==", "!=", "===", "!==",
  "<", "<=", ">", ">=",
  "<<", ">>", ">>>",
  "*", "/", "%",
  "|", "^", "&", "in",
  "instanceof"
], function(operator){
  defJSOperator("BinaryExpression", operator);
});
_.each(["&&", "||"], function(operator){
  defJSOperator("LogicalExpression", operator);
});

_.each(["!", "~", "typeof", "void", "delete"], function(operator){
  defTmacro("js/" + operator, function(ast, astToTarget){
    assertAstListLength(ast, 2);
    return mkJS1ArgOperator(ast, astToTarget, operator);
  });
});

_.each(["+", "-"], function(operator){
  defTmacro("js/" + operator, function(ast, astToTarget){
    if(_.size(ast.value) === 2){
      return mkJS1ArgOperator(ast, astToTarget, operator);
    }else if(_.size(ast.value) === 3){
      return mkJS2ArgOperator(ast, astToTarget, "BinaryExpression", operator);
    }else{
      throw new Error("Wrong num args "+_.size(ast.value)+" expected 2 or 3: todo helpful message with line numbers etc...");
    }
  });
});

defTmacro("js/=", function(ast, astToTarget){
  assertAstListLength(ast, 3);
  return {
    type: "AssignmentExpression",
    operator: "=",
    left: astToTarget(ast.value[1]),
    right: astToTarget(ast.value[2])
  };
});

defTmacro("js/var", function(ast, astToTarget){
  var args = ast.value.slice(1);
  if((_.size(args) % 2) !== 0){
    throw new Error("js/var expects an even number of pairs");//TODO be more helpful
  }
  return {
    loc: ast.value[0].loc,
    type: "VariableDeclaration",
    kind: "var",
    declarations: _.map(_.chunk(args, 2), function(pair){
      assertAstType(pair[0], "symbol");
      return {
        loc: pair[0].loc,
        type: "VariableDeclarator",
        id: astToTarget(pair[0]),
        init: astToTarget(pair[1])
      };
    })
  };
});

defTmacro("js/property-access", function(ast, astToTarget){
  assertAstListLength(ast, 3);
  return {
    type: "MemberExpression",
    computed: true,
    object: astToTarget(ast.value[1]),
    property: astToTarget(ast.value[2])
  };
});

defTmacro("js/return", function(ast, astToTarget){
  return {
    loc: ast.value[0].loc,
    type: "ReturnStatement",
    argument: astToTarget(ast.value[1])
  };
});

defTmacro("js/block-statement", function(ast, astToTarget){
  return {
    loc: ast.value[0].loc,
    type: "BlockStatement",
    body: _.map(astToTarget(ast.value.slice(1)), toStatement)
  };
});

defTmacro("js/function", function(ast, astToTarget){
  assertAstListLength(ast, 4);
  assertAstType(ast.value[1], "symbol");
  assertAstType(ast.value[2], "list");
  _.each(ast.value[2].value, function(arg){
    assertAstType(arg, "symbol");
  });

  return {
    loc: ast.value[0].loc,
    type: "FunctionExpression",
    id: ast.value[1].value === "js/null" ? null : astToTarget(ast.value[1]),
    rest: null,
    generator: false,
    expression: false,
    defaults: [],
    params: _.map(ast.value[2].value, astToTarget),
    body: toStatement(astToTarget(ast.value[3]))
  };
});

defTmacro("js/while", function(ast, astToTarget){
  assertAstListLength(ast, 3);
  return {
    "loc": ast.value[0].loc,
    "type": "WhileStatement",
    "test": astToTarget(ast.value[1]),
    "body": toStatement(astToTarget(ast.value[2]))
  };
});

defTmacro("js/ternary", function(ast, astToTarget){
  assertAstListLength(ast, 4);
  return {
    loc: ast.value[0].loc,
    type: "ConditionalExpression",
    test: astToTarget(ast.value[1]),
    consequent: astToTarget(ast.value[2]),
    alternate: astToTarget(ast.value[3])
  };
});

defTmacro("js/if", function(ast, astToTarget){
  assertAstListLength(ast, 4);
  return {
    loc: ast.value[0].loc,
    type: "IfStatement",
    test: astToTarget(ast.value[1]),
    consequent: toStatement(astToTarget(ast.value[2])),
    alternate: toStatement(astToTarget(ast.value[3]))
  };
});

defTmacro("js/try-catch", function(ast, astToTarget){
  assertAstListLength(ast, 4);
  assertAstType(ast.value[2], "symbol");
  return {
    "loc": ast.value[0].loc,
    "type": "TryStatement",
    "block": toStatement(astToTarget(ast.value[1])),
    "guardedHandlers": [],
    "handlers": [{
      "loc": ast.value[2].loc,
      "type": "CatchClause",
      "param": astToTarget(ast.value[2]),
      "body": toStatement(astToTarget(ast.value[3]))
    }],
    "finalizer": null
  };
});

defTmacro("js/array", function(ast, astToTarget){
  return {
    "loc": ast.value[0].loc,
    "type": "ArrayExpression",
    "elements": _.map(ast.value.slice(1), astToTarget)
  };
});

defTmacro("js/object", function(ast, astToTarget){
  return {
    "loc": ast.value[0].loc,
    "type": "ObjectExpression",
    "properties": _.map(_.chunk(ast.value.slice(1), 2), function(pair){
      var key = pair[0];
      assertAstType(key, "string");
      var val = pair[1] || _.assign({}, key, {type: "symbol", value: "js/undefined"});
      return {
        "type": "Property",
        "key": astToTarget(key),
        "value": astToTarget(val),
        "kind": "init"
      };
    })
  };
});

defTmacro("js/new", function(ast, astToTarget){
  return {
    "loc": ast.value[0].loc,
    "type": "NewExpression",
    "callee": astToTarget(ast.value[1]),
    "arguments": _.map(ast.value.slice(2), astToTarget)
  };
});

defTmacro("js/throw", function(ast, astToTarget){
  assertAstListLength(ast, 2);
  return {
    "loc": ast.value[0].loc,
    "type": "ThrowStatement",
    "argument": astToTarget(ast.value[1])
  };
});

module.exports = {
  target_macros: target_macros
};
