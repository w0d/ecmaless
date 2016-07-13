var _ = require("lodash");
var test = require("tape");
var parser = require("./");

var rmLoc = function(ast){
  if(_.isPlainObject(ast)){
    return _.mapValues(_.omit(ast, "loc"), rmLoc);
  }
  if(_.isArray(ast)){
    return _.map(ast, rmLoc);
  }
  return ast;
};

var mk = {};
mk.num = function(value){
  return {type: "Number", value: value};
};
mk.str = function(value){
  return {type: "String", value: value};
};
mk.id = function(value){
  return {type: "Identifier", value: value};
};
mk.sym = function(value){
  return {type: "Symbol", value: value};
};
mk.def = function(id, init){
  return {type: "Define", id: id, init: init};
};
mk.fn = function(params, body){
  return {type: "Function", params: params, body: body};
};
mk.app = function(callee, args){
  return {type: "Application", callee: callee, args: args};
};
mk.arr = function(value){
  return {type: "Array", value: value};
};
mk.struct = function(value){
  return {type: "Struct", value: value};
};
mk.ddd = function(value){
  return {type: "DotDotDot", value: value};
};
mk.mem = function(method, object, path){
  return {type: "MemberExpression", object: object, path: path, method: method};
};
mk.cond = function(test, consequent, alternate){
  return {
    type: "ConditionalExpression",
    test: test,
    consequent: consequent,
    alternate: alternate
  };
};
mk.infix = function(op, left, right){
  return {
    type: "InfixOperator",
    op: op,
    left: left,
    right: right
  };
};

var mkv = function(v){
  if(_.isNumber(v)){
    return mk.num(v);
  }else if(_.isString(v)){
    return mk.str(v);
  }else if(_.isPlainObject(v)){
    return mk.struct(_.flatten(_.map(v, function(v, k){
      return [mkv(k + ""), v];
    })));
  }else if(_.isArray(v)){
    return mk.arr(v);
  }
  return v;
};

test("parser", function(t){
  var tst = function(src, expected){
    var ast = parser(src);
    t.deepEquals(rmLoc(ast), expected);
  };
  var tstFail = function(src){
    try{
      parser(src);
      t.ok(false, "This should have thrown a parsing exception");
    }catch(e){
      t.ok(true);
    }
  };

  tst("123", mk.num(123));
  tst("\"ok\"", mk.str("ok"));
  tst("\"\\\"that\\\"\n\"", mk.str("\"that\"\n"));

  tst("def a", mk.def(mk.id("a")));
  tst("def a = 1.2", mk.def(mk.id("a"), mk.num(1.2)));

  tst("[]", mk.arr([]));
  tstFail("[,]");
  tst("[1, 2, 3]", mk.arr([mk.num(1), mk.num(2), mk.num(3)]));
  tst("[1, 2, 3,]", mk.arr([mk.num(1), mk.num(2), mk.num(3)]));
  tstFail("[1, 2, 3,,]");
  tstFail("[,1, 2, 3]");

  tst("{}", mkv({}));
  tst("{\"a\": 1}", mkv({a: mkv(1)}));
  tst("{\"a\": 1,}", mkv({a: mkv(1)}));
  tst("{a: 1}", mk.struct([mk.sym("a"), mkv(1)]));
  tst("{def: 1}", mk.struct([mk.sym("def"), mkv(1)]));
  tst("{1: \"a\"}", mk.struct([mkv(1), mkv("a")]));

  tstFail("fn \n    a");
  tstFail("fn []\n    a");
  tst("fn args:\n    a", mk.fn(mk.id("args"), [mk.id("a")]));
  tst("fn []:\n    a", mk.fn([], [mk.id("a")]));
  tst("fn[]:\n    a", mk.fn([], [mk.id("a")]));
  tst("fn [  ] :\n    a", mk.fn([], [mk.id("a")]));
  tstFail("fn [,]:\n    a");
  tstFail("fn [1]:\n    a");
  tstFail("fn [1, 2]:\n    a");
  tst("fn [a]:\n    a", mk.fn([mk.id("a")], [mk.id("a")]));
  tst("fn [a,]:\n    a", mk.fn([mk.id("a")], [mk.id("a")]));
  tst("fn [a, b]:\n    a", mk.fn([mk.id("a"), mk.id("b")], [mk.id("a")]));
  tst("fn [a,b,]:\n    a", mk.fn([mk.id("a"), mk.id("b")], [mk.id("a")]));
  tst("fn [a, b...]:\n    a", mk.fn([mk.id("a"), mk.ddd(mk.id("b"))], [mk.id("a")]));
  tst("fn [a, b...]:\n    a", mk.fn([mk.id("a"), mk.ddd(mk.id("b"))], [mk.id("a")]));

  tst("add()", mk.app(mk.id("add"), []));
  tstFail("add(,)");
  tst("add(1, 2)", mk.app(mk.id("add"), [mkv(1), mkv(2)]));
  tst("add(1, 2,)", mk.app(mk.id("add"), [mkv(1), mkv(2)]));
  tst("add  (1)", mk.app(mk.id("add"), [mkv(1)]));

  tst("(1)", mkv(1));

  tst("a.b.c", mk.mem("dot", mk.mem("dot", mk.id("a"), mk.id("b")), mk.id("c")));
  tst("a[b][0]", mk.mem("index", mk.mem("index", mk.id("a"), mk.id("b")), mkv(0)));

  tst("a?1:2", mk.cond(mk.id("a"), mkv(1), mkv(2)));
  tst("a ? 1 : 2", mk.cond(mk.id("a"), mkv(1), mkv(2)));
  //Don't nest these without parans!
  tstFail("1?2?3:4:5");
  tstFail("1?2:3?4:5");
  tst("1?2:(3?4:5)", mk.cond(mkv(1), mkv(2), mk.cond(mkv(3), mkv(4), mkv(5))));

  _.each([
    "||",
    "&&",
    "==",
    "!=",
    "+",
    "-",
    "*",
    "/",
    "%",
  ], function(op){
    tst("1 " + op + " 2", mk.infix(op, mkv(1), mkv(2)));
  });

  t.end();
});
