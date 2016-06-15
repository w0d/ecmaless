var _ = require("lodash");
var e = require("estree-builder");
var escodegen = require("escodegen");
var toStatement = require("../toESTreeStatement");
var symbolToJSIdentifier = require("../symbolToJSIdentifier");

var target_macros = {};

var defTmacro = function(name, fn){
  target_macros[name] = fn;
};

var mkAST = function(ast, type, value){
  return _.assign({}, ast, {type: type, value: value});
};

var literal_symbols = {
  "nil": function(ast){
    return e("void", e.number(0, ast.loc), ast.loc);
  }
};

////////////////////////////////////////////////////////////////////////////////
//primitive $$ecmaless$$ macros

defTmacro("$$ecmaless$$apply", function(ast, astToTarget){
  return e("call", astToTarget(ast.value[1]), _.map(ast.value.slice(2), astToTarget), ast.loc);
});

defTmacro("$$ecmaless$$make-type-symbol", function(ast, astToTarget){
  var symbol = ast.value;
  if(symbol === "nil"){
    return e("void", e.number(0, ast.loc), ast.loc);
  }else if(symbol === "true"){
    return e("true", ast.loc);
  }else if(symbol === "false"){
    return e("false", ast.loc);
  }

  var path = symbol.split(".");
  if(path.length > 1 && _.every(path, function(part){
    return part.trim().length > 0;
  })){
    return astToTarget(mkAST(ast, "list", [
      mkAST(ast, "symbol", "get"),
      mkAST(ast, "symbol", path[0])
    ].concat(_.map(path.slice(1), function(part){
      return mkAST(ast, "string", part);
    }))));
  }

  return e.id(symbolToJSIdentifier(symbol), ast.loc)
});
defTmacro("$$ecmaless$$make-type-number", function(ast, astToTarget){
  var f = parseFloat(ast.value);
  if(f < 0){
    return e("-", e("number", Math.abs(f), ast.loc));
  }
  return e("number", f, ast.loc);
});
defTmacro("$$ecmaless$$make-type-string", function(ast, astToTarget){
  return e("string", ast.value, ast.loc);
});

defTmacro(";", function(ast, astToTarget){
  return undefined;
});

////////////////////////////////////////////////////////////////////////////////
//js macros
defTmacro("[", function(ast, astToTarget){
  return e("array", astToTarget(ast.value.slice(1)), ast.loc);
});

defTmacro("{", function(ast, astToTarget){
  var args = ast.value.slice(1);
  var pairs = _.chunk(args, 2);
  var is_dynamic = _.some(pairs, function(pair){
      var key = pair[0];
      return (key && key.type) !== "string";
  });
  if(is_dynamic){
    return e("call", e("id", "struct", ast.loc), _.map(args, astToTarget), ast.loc);
  }
  return {
    "loc": ast.value[0].loc,
    "type": "ObjectExpression",
    "properties": _.map(pairs, function(pair){
      var key = pair[0];
      var val = pair[1];
      return {
        "type": "Property",
        "key": astToTarget(key),
        "value": val ? astToTarget(val) : e.nil(key.loc),
        "kind": "init"
      };
    })
  };
});
defTmacro("<", function(ast, astToTarget){
  var args = ast.value.slice(1);
  return e("call", e("id", "todo_angled_list", ast.loc), _.map(args, astToTarget), ast.loc);
});

defTmacro("def", function(ast, astToTarget){
  var id = symbolToJSIdentifier(ast.value[1].value);
  if(ast.value.length >= 3){
    return e("var", id, astToTarget(ast.value[2]), ast.loc);
  }
  return e("var", id, astToTarget(mkAST(ast, "symbol", "nil")), ast.loc);
});

defTmacro("fn", function(ast, astToTarget){
  var id;
  var params;
  var stmts;
  if(ast.value[1].type === "list"){
    params = _.map(ast.value[1].value.slice(1), "value");
    stmts = ast.value.slice(2);
  }else{
    id = symbolToJSIdentifier(ast.value[1].value);
    params = _.map(ast.value[2].value.slice(1), "value");
    stmts = ast.value.slice(3);
  }
  var param_expand_i = -1;
  _.each(params, function(param, i){
    if(/\.\.\.$/.test(param)){
      if(param_expand_i >= 0){
        throw new Error('At most one paramater can have ...');
      }
      param_expand_i = i;
    }
  });
  if(param_expand_i >= 0){
    var param_after_i = param_expand_i + 1;
    while(param_after_i < params.length){
      stmts.unshift(mkAST(ast, "list", [
        mkAST(ast, "symbol", "def"),
        mkAST(ast, "symbol", params[param_after_i]),
        mkAST(ast, "list", [
          mkAST(ast, "symbol", "get"),
          mkAST(ast, "symbol", "arguments"),
          mkAST(ast, "list", [
            mkAST(ast, "symbol", "-"),
            mkAST(ast, "list", [
              mkAST(ast, "symbol", "get"),
              mkAST(ast, "symbol", "arguments"),
              mkAST(ast, "string", "length")
            ]),
            mkAST(ast, "number", params.length - param_after_i)
          ])
        ])
      ]));
      param_after_i++;
    }
    stmts.unshift(mkAST(ast, "list", [
      mkAST(ast, "symbol", "def"),
      mkAST(ast, "symbol", params[param_expand_i].substring(0, params[param_expand_i].length - 3)),
      mkAST(ast, "list", [
        mkAST(ast, "list", [
          mkAST(ast, "symbol", "get"),
          mkAST(ast, "symbol", "Array"),
          mkAST(ast, "string", "prototype"),
          mkAST(ast, "string", "slice"),
          mkAST(ast, "string", "call")
        ]),
        mkAST(ast, "symbol", "arguments"),
        mkAST(ast, "number", param_expand_i),
        mkAST(ast, "list", [
          mkAST(ast, "symbol", "-"),
          mkAST(ast, "list", [
            mkAST(ast, "symbol", "get"),
            mkAST(ast, "symbol", "arguments"),
            mkAST(ast, "string", "length")
          ]),
          mkAST(ast, "number", params.length - (param_expand_i + 1))
        ])
      ])
    ]));
    params = params.slice(0, param_expand_i);
  }
  params = _.map(params, symbolToJSIdentifier);
  var estree_stmts = _.compact(_.map(stmts, astToTarget));
  var body = _.map(estree_stmts, function(estree, i){
    if(i < (estree_stmts.length - 1)){
      return toStatement(estree);
    }
    return e("return", estree, estree.loc);
  });
  return e("function", params, body, id, ast.loc);
});

_.each({
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "/",
  "%": "%",
  "===": "===",
  "lt": "<",
  "gt": ">",
  "lte": "<=",
  "gte": ">=",
  "and": "&&",
  "or": "||",
}, function(js_op, mac_name){
  defTmacro(mac_name, function(ast, astToTarget){
    var args = _.map(ast.value.slice(1), astToTarget);
    if(args.length === 0){
      return e("number", 0, ast.loc);
    }else if(args.length === 1){
      return args[0];
    }
    var cur_group = args[0];
    _.each(args.slice(1), function(arg){
      cur_group = e(js_op, cur_group, arg, ast.loc);
    });
    return cur_group;
  });
});

defTmacro("not", function(ast, astToTarget){
  return e("!", astToTarget(ast.value[1]), ast.loc);
});

defTmacro("set!", function(ast, astToTarget){
  return e("=", astToTarget(ast.value[1]), astToTarget(ast.value[2]), ast.loc);
});

defTmacro("get", function(ast, astToTarget){
  var args = _.map(ast.value.slice(1), astToTarget);
  if(args.length === 0){
    return astToTarget(mkAST(ast, "symbol", "nil"));
  }else if(args.length === 1){
    return args[0];
  }
  var cur_group = args[0];
  _.each(args.slice(1), function(arg){
    cur_group = e("get", cur_group, arg, ast.loc);
  });
  return cur_group;
});

defTmacro("'", function(ast, astToTarget){
  var val = ast.value[1];
  if(val.type === "list"){
    return e("object", {
      type: e("string", "list", ast.loc),
      value: e("array", _.map(val.value, astToTarget), ast.loc),
      loc: e("json", val.loc, ast.loc),
    }, ast.loc);
  }
  return e("json", val, ast.loc);
});

defTmacro("`", function(ast, astToTarget){
  var val = ast.value[1];
  return e("json", val, ast.loc);
});

defTmacro("if", function(ast, astToTarget){
  var args = _.compact(_.map(ast.value.slice(1), astToTarget));
  var nil = astToTarget(mkAST(ast, "symbol", "nil"));
  return e("?", args[0] || nil, args[1] || nil, args[2] || nil, ast.loc);
});

defTmacro("while", function(ast, astToTarget){
  var args = _.compact(_.map(ast.value.slice(1), astToTarget));
  var cond = args[0];
  var body = _.map(args.slice(1), toStatement);
  return e("while", cond, e("block", body, ast.value[0].loc), ast.value[0].loc);
});

module.exports = function(macros){
  var this_instance_t_macros = _.assign({}, target_macros, macros || {});

  this_instance_t_macros["defmacro"] = function(ast, astToTarget){
    var name = ast.value[1];
    var args = ast.value[2];
    var body = ast.value[3];

    var fn_args = _.map(args.value.slice(1), function(arg){
      return symbolToJSIdentifier(arg.value);
    });
    var fn_body = escodegen.generate(e("return", astToTarget(body), body.loc));
    var fn = new (Function.prototype.bind.apply(Function, [Function].concat(fn_args.concat([fn_body]))));

    this_instance_t_macros[name.value] = function(ast, astToTarget){
      return astToTarget(fn.apply(null, ast.value.slice(1)));
    };

    return undefined;
  };
  return {
    target_macros: this_instance_t_macros
  };
};
