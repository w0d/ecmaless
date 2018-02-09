var _ = require("lodash");
var ast = require("./ast");
var test = require("tape");
var parser = require("./");

var rmLoc = function(ast){
    if(_.isPlainObject(ast)){
        if(!_.isEqual(_.keys(ast), ["loc", "ast"])){
            throw "AST tree should only have {loc, ast} properties";
        }
        return _.mapValues(ast.ast, rmLoc);
    }
    if(_.isArray(ast)){
        return _.map(ast, rmLoc);
    }
    return ast;
};

var S = ast.Symbol;

test("expression", function(t){
    var tst = function(src, expected){
        var r = parser(src);
        if(r.type !== "Ok"){
            t.fail(JSON.stringify(r));
            return;
        }
        var ast = rmLoc(r.tree);
        t.deepEquals(ast, expected);
    };
    var tstErr = function(src, expected){
        var r = parser(src);
        if(r.type === "Ok"){
            t.fail("Should have failed: " + expected);
            return;
        }
        t.equals(r.message+"|"+r.loc.start+"-"+r.loc.end, expected);
    };

    tst("123", ast.Number(123));
    tst("\"a\"", ast.String("a"));
    tst("\"a\\\"b\"", ast.String("a\"b"));
    tst("\"a\\\\b\"", ast.String("a\\b"));

    tst("foo", ast.Symbol("foo"));

    tst("a+b", ast.Infix("+", S("a"), S("b")));
    tst("aorb", S("aorb"));
    tst("a or b", ast.Infix("or", S("a"), S("b")));

    tstErr("a + + b", "Expected an expression|4-5");

    tstErr("=", "Expected an expression|0-1");
    tstErr("= a", "Expected an expression|0-1");
    tstErr("a =", "Expected `(end)`|2-3");

    tstErr("or", "Expected an expression|0-2");

    tstErr("a +", "Expected an expression|3-3");

    tstErr("a b", "Expected `(end)`|2-3");


    tst("a + b + c", ast.Infix("+", ast.Infix("+", S("a"), S("b")), S("c")));
    tst("a + b * c", ast.Infix("+", S("a"), ast.Infix("*", S("b"), S("c"))));
    tst("(a + b) * c", ast.Infix("*", ast.Infix("+", S("a"), S("b")), S("c")));

    tst("not a", ast.Prefix("not", S("a")));
    tst("not a or b", ast.Infix("or", ast.Prefix("not", S("a")), S("b")));
    tst("a or not b == c", ast.Infix("or", S("a"), ast.Infix("==", ast.Prefix("not", S("b")), S("c"))));

    tst("a - b", ast.Infix("-", S("a"), S("b")));
    tst("a - - b", ast.Infix("-", S("a"), ast.Prefix("-", S("b"))));

    tstErr("-", "Expected an expression|1-1");
    tstErr("not", "Expected an expression|3-3");

    tstErr("(a", "Expected `)`|2-2");

    tst("a()", ast.ApplyFn(S("a"), []));
    tst("a(b + (c))", ast.ApplyFn(S("a"), [ast.Infix("+", S("b"), S("c"))]));
    tst("a(b())", ast.ApplyFn(S("a"), [ast.ApplyFn(S("b"), [])]));

    tst("fn() a", ast.Function([], S("a")));
    tst("fn(a, b) c", ast.Function([S("a"), S("b")], S("c")));

    tstErr("fn a", "Expected `(`|3-4");
    tstErr("fn(", "Expected a parameter symbol|3-3");
    tstErr("fn(+)", "Expected a parameter symbol|3-4");
    tstErr("fn(a", "Expected `)`|4-4");
    tstErr("fn(a + b)", "Expected `)`|5-6");
    tstErr("fn(1)", "Expected a parameter symbol|3-4");

    t.end();
});

test("ast shape", function(t){

    t.deepEquals(parser("a"), {
        type: "Ok",
        tree: {
            loc: {start: 0, end: 1},
            ast: {type: "Symbol", value: "a"}
        }
    });

    t.deepEquals(parser("not a"), {
        type: "Ok",
        tree: {
            loc: {start: 0, end: 3},
            ast: {
                type: "Prefix",
                op: "not",
                value: {
                    loc: {start: 4, end: 5},
                    ast: {type: "Symbol", value: "a"}
                }
            }
        }
    });

    t.deepEquals(parser("a + b"), {
        type: "Ok",
        tree: {
            loc: {start: 2, end: 3},
            ast: {
                type: "Infix",
                op: "+",
                left: {
                    loc: {start: 0, end: 1},
                    ast: {type: "Symbol", value: "a"}
                },
                right: {
                    loc: {start: 4, end: 5},
                    ast: {type: "Symbol", value: "b"}
                },
            },
        },
    });

    t.deepEquals(parser("(a)"), {
        type: "Ok",
        tree: {
            loc: {start: 1, end: 2},
            ast: {type: "Symbol", value: "a"}
        },
    });

    t.deepEquals(parser("a(b)"), {
        type: "Ok",
        tree: {
            loc: {start: 1, end: 2},
            ast: {
                type: "ApplyFn",
                callee: {
                    loc: {start: 0, end: 1},
                    ast: S("a"),
                },
                args: [
                    {
                        loc: {start: 2, end: 3},
                        ast: S("b"),
                    }
                ],
            }
        },
    });

    t.end();
});
