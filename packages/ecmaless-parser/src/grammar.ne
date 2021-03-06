@{%
var flatten = function(toFlatten){
    var isArray = Object.prototype.toString.call(toFlatten) === '[object Array]';

    if (isArray && toFlatten.length > 0) {
        var head = toFlatten[0];
        var tail = toFlatten.slice(1);

        return flatten(head).concat(flatten(tail));
    } else {
        return [].concat(toFlatten);
    }
};

var noop = function(){};
var noopArr = function(){return [];};
var idArr = function(d){return [d[0]];};
var concatArr = function(i, no_wrap){
    if(no_wrap){
        return function(d){
            return d[0].concat(d[i]);
        };
    }
    return function(d){
        return d[0].concat([d[i]]);
    };
};
var idN = function(n){
    return function(d){
        return d[n];
    };
};

var mkLoc = function(d){
    var loc = {};
    var elms = flatten(d);
    var i = 0;
    while(i < elms.length){
        if(elms[i] && elms[i].loc){
            if(!loc.start){
                loc.start = elms[i].loc.start;
                loc.source = elms[i].loc.source;
            }
            loc.end = elms[i].loc.end;
        }
        i += 1;
    }
    return loc;
};

var reserved = {};

var tok = function(type, value){
    if((type === "SYMBOL") && typeof value === "string"){
        reserved[value] = true;
    }
    return {test: function(x){
        if(!x || x.type !== type){
            return false;
        }
        if(value){
            return x.src === value;
        }
        return true;
    }};
};
var tok_NUMBER = tok("NUMBER");
var tok_STRING = tok("STRING");
var tok_DOCSTRING = tok("DOCSTRING");
var tok_SYMBOL = tok("SYMBOL");
var tok_TYPE = tok("TYPE");
var tok_INDENT = tok("INDENT");
var tok_DEDENT = tok("DEDENT");
var tok_NL = tok("NEWLINE");
var tok_COLON = tok("RAW", ":");
var tok_COMMA = tok("RAW", ",");
var tok_DOT = tok("RAW", ".");
var tok_QUESTION = tok("RAW", "?");
var tok_EQ = tok("RAW", "=");
var tok_OPEN_PN = tok("RAW", "(");
var tok_CLOSE_PN = tok("RAW", ")");
var tok_OPEN_SQ = tok("RAW", "[");
var tok_CLOSE_SQ = tok("RAW", "]");
var tok_OPEN_CU = tok("RAW", "{");
var tok_CLOSE_CU = tok("RAW", "}");

var tok_import = tok("SYMBOL", "import");
var tok_as = tok("SYMBOL", "as");
var tok_is = tok("SYMBOL", "is");
var tok_export = tok("SYMBOL", "export");

var tok_def = tok("SYMBOL", "def");

var tok_fn = tok("SYMBOL", "fn");
var tok_return = tok("SYMBOL", "return");

var tok_if = tok("SYMBOL", "if");
var tok_else = tok("SYMBOL", "else");

var tok_case = tok("SYMBOL", "case");

var tok_while = tok("SYMBOL", "while");
var tok_break = tok("SYMBOL", "break");
var tok_continue = tok("SYMBOL", "continue");

var tok_nil = tok("SYMBOL", "nil");
var tok_true = tok("SYMBOL", "true");
var tok_false = tok("SYMBOL", "false");

var tok_or = tok("SYMBOL", "or");
var tok_and = tok("SYMBOL", "and");
var tok_not = tok("SYMBOL", "not");

var tok_ann = tok("SYMBOL", "ann");
var tok_alias = tok("SYMBOL", "alias");
var tok_enum = tok("SYMBOL", "enum");
var tok_Fn = tok("TYPE", "Fn");

var isReserved = function(src){
    return reserved[src] === true;
};

var tok_EQEQ = tok("RAW", "==");
var tok_NOTEQ = tok("RAW", "!=");
var tok_LT = tok("RAW", "<");
var tok_LTEQ = tok("RAW", "<=");
var tok_GT = tok("RAW", ">");
var tok_GTEQ = tok("RAW", ">=");
var tok_PLUS = tok("RAW", "+");
var tok_PLUSPLUS = tok("RAW", "++");
var tok_MINUS = tok("RAW", "-");
var tok_TIMES = tok("RAW", "*");
var tok_DIVIDE = tok("RAW", "/");
var tok_MODULO = tok("RAW", "%");

var mkType = function(d, type, value){
    return {
        loc: mkLoc(d),
        type: type,
        value: value,
    };
};

var mkMemberExpression = function(loc, method, object, path){
    return {
        loc: loc,
        type: "MemberExpression",
        object: object,
        path: path,
        method: method,
    };
};

var unaryOp = function(d){
    return {
        loc: mkLoc(d),
        type: "UnaryOperator",
        op: d[0].src,
        arg: d[1],
    };
};

var infixOp = function(d){
    return {
        loc: mkLoc(d),
        type: "InfixOperator",
        op: d[1].src,
        left: d[0],
        right: d[2],
    };
};


%}


main -> NL:? Statement_list:?
{% function(d){
    return d[1] || [];
} %}


################################################################################
# Statement

Statement_list ->
      Statement NL {% idArr %}
    | Statement_list Statement NL {% concatArr(1) %}


Statement ->
      Define {% id %}
    | ExpressionStatement {% id %}
    | Return {% id %}
    | If {% id %}
    | While {% id %}
    | Break {% id %}
    | Continue {% id %}
    | Case {% id %}
    | Annotation {% id %}
    | TypeAlias {% id %}
    | Enum {% id %}
    | ImportBlock {% id %}
    | ExportBlock {% id %}


ExpressionStatement -> Expression
{% function(d){
    return {
        loc: mkLoc(d),
        type: "ExpressionStatement",
        expression: d[0],
    };
} %}


Return -> %tok_return Expression:?
{% function(d){
    return {
        loc: mkLoc(d),
        type: "Return",
        expression: d[1],
    };
} %}



Define -> %tok_def Identifier %tok_EQ Expression
{% function(d){
    return {
        loc: mkLoc(d),
        type: "Define",
        id: d[1],
        init: d[3],
    };
} %}


If -> %tok_if Expression Block (NL %tok_else (If | Block)):?
{% function(d){
    var else_block = d[3] && d[3][2] && d[3][2][0];
    if(else_block && else_block.type === "Block"){
        else_block = else_block;
    }
    return {
        loc: mkLoc(d),
        type: "If",
        test: d[1],
        then: d[2],
        "else": else_block,
    };
} %}


While -> %tok_while Expression Block
{% function(d){
    return {
        loc: mkLoc(d),
        type: "While",
        test: d[1],
        block: d[2],
    };
} %}


Break -> %tok_break
    {% function(d){return {loc: d[0].loc, type: "Break"};} %}


Continue -> %tok_continue
    {% function(d){return {loc: d[0].loc, type: "Continue"};} %}


Case -> %tok_case Expression %tok_COLON NL INDENT CaseBlock:* DEDENT
{% function(d){
    return {
        loc: mkLoc(d),
        type: "Case",
        to_test: d[1],
        blocks: d[5],
    };
} %}


CaseBlock -> Expression Block NL
{% function(d){
    return {
        loc: mkLoc(d),
        type: "CaseBlock",
        value: d[0],
        block: d[1],
    };
} %}




Block -> %tok_COLON NL INDENT Statement_list DEDENT
{% function(d){
    return {
        loc: mkLoc(d),
        type: "Block",
        body: d[3],
    };
} %}

################################################################################
# Modules

ImportBlock -> %tok_import %tok_COLON NL INDENT Import:+ DEDENT
{% function(d){
    return {
        loc: mkLoc(d),
        type: "ImportBlock",
        modules: d[4],
    };
} %}


Import -> String %tok_COLON NL INDENT ImportName:+ DEDENT NL
{% function(d){
    return {
        loc: mkLoc(d),
        type: "Import",
        path: d[0],
        names: d[4],
    };
} %}


ImportName -> ImportName_parts NL
{% function(d){
    d = d[0];
    var name = d[0];
    if(name.type === "RAW"){// *
        name = null;
    }
    return {
        loc: mkLoc(d),
        type: "ImportName",
        name: name,
        as: (d[1] && d[1][1]) || null,
        is: (d[2] && d[2][1]) || null,
    };
} %}


ImportName_parts ->
      Identifier (%tok_as Identifier):? (%tok_is TypeExpression):?
    | Type (%tok_as Type):?
    | %tok_TIMES (%tok_as Identifier):?


ExportBlock -> %tok_export %tok_COLON NL INDENT ExportName:+ DEDENT
{% function(d){
    return {
        loc: mkLoc(d),
        type: "ExportBlock",
        names: d[4],
    };
} %}


ExportName -> (Identifier | Type | %tok_TIMES) NL
{% function(d){
    var name = d[0][0];
    if(name.type === "RAW"){// *
        name = null;
    }
    return {
        loc: mkLoc(d),
        type: "ExportName",
        name: name,
    };
} %}


################################################################################
# Types 

Annotation -> %tok_ann Identifier %tok_EQ TypeExpression
{% function(d){
    return {
        loc: mkLoc(d),
        type: "Annotation",
        id: d[1], 
        def: d[3], 
    };
} %}


TypeAlias -> %tok_alias Type %tok_EQ TypeExpression
{% function(d){
    return {
        loc: mkLoc(d),
        type: "TypeAlias",
        id: d[1],
        value: d[3],
    };
} %}


Enum -> %tok_enum Type %tok_COLON NL INDENT EnumVariant_list NL DEDENT
{% function(d){
    return {
        loc: mkLoc(d),
        type: "Enum",
        id: d[1],
        variants: d[5],
    };
} %}


EnumVariant_list ->
      EnumVariant {% idArr %}
    | EnumVariant_list NL EnumVariant {% concatArr(2) %}


EnumVariant -> Type %tok_OPEN_PN TypeExpression_list %tok_CLOSE_PN
{% function(d){
    return {
        loc: mkLoc(d),
        type: "EnumVariant",
        tag: d[0],
        params: d[2],
    };
} %}


TypeExpression ->
      Type {% id %}
    | TypeVariable {% id %}
    | StructType {% id %}
    | FunctionType {% id %}


Type -> %tok_TYPE TypeParams:?
{% function(d){
    return {
        loc: mkLoc(d),
        type: "Type",
        value: d[0].src,
        params: d[1] || [],
    };
} %}


TypeParams -> %tok_LT TypeExpression_list %tok_GT {% idN(1) %}

TypeExpression_list ->
      null {% noopArr %}
    | TypeExpression_list_body {% id %}


TypeExpression_list_body ->
      TypeExpression {% idArr %}
    | TypeExpression_list_body COMMA TypeExpression {% concatArr(2) %}


TypeVariable -> Identifier
{% function(d){
    return {
        loc: mkLoc(d),
        type: "TypeVariable",
        value: d[0].value,
    };
} %}


StructType -> %tok_OPEN_CU KeyValPairsType %tok_CLOSE_CU
{% function(d){
    return {
        loc: mkLoc(d),
        type: "StructType",
        pairs: d[1],
    };
} %}


KeyValPairsType ->
      KeyValPairsType_body {% id %}
    | NL INDENT KeyValPairsType_body_nl DEDENT NL {% idN(2) %}


KeyValPairsType_body ->
      KeyValPairType {% idArr %}
    | KeyValPairsType_body COMMA KeyValPairType {% concatArr(2) %}


KeyValPairsType_body_nl ->
      KeyValPairType COMMA NL {% idArr %}
    | KeyValPairsType_body_nl KeyValPairType COMMA NL {% concatArr(1) %}


KeyValPairType -> Symbol %tok_COLON TypeExpression
{% function(d){
    return [d[0], d[2]];
} %}


FunctionType -> %tok_Fn %tok_OPEN_PN  TypeExpression_list %tok_CLOSE_PN
    TypeExpression
{% function(d){
    return {
        loc: mkLoc(d),
        type: "FunctionType",
        params: d[2],
        "return": d[4],
    };
} %}


################################################################################
# Expression

Expression -> AssignmentExpression {% id %}


AssignmentExpression -> ConditionalExpression {% id %}
    | MemberExpression %tok_EQ AssignmentExpression
{% function(d){
    return {
        loc: mkLoc(d),
        type: "AssignmentExpression",
        op: d[1].src,
        left: d[0],
        right: d[2],
    };
} %}


ConditionalExpression -> exp_or {% id %}
    | exp_or %tok_QUESTION exp_or %tok_COLON exp_or
{% function(d){
    return {
        loc: mkLoc(d),
        type: "ConditionalExpression",
        test: d[0],
        consequent: d[2],
        alternate: d[4],
    };
} %}


exp_or -> exp_and {% id %}
    | exp_or %tok_or exp_and {% infixOp %}


exp_and -> exp_comp {% id %}
    | exp_and %tok_and exp_comp {% infixOp %}


exp_comp -> exp_sum {% id %}
    | exp_comp %tok_EQEQ  exp_sum {% infixOp %}
    | exp_comp %tok_NOTEQ exp_sum {% infixOp %}
    | exp_comp %tok_LT    exp_sum {% infixOp %}
    | exp_comp %tok_LTEQ  exp_sum {% infixOp %}
    | exp_comp %tok_GT    exp_sum {% infixOp %}
    | exp_comp %tok_GTEQ  exp_sum {% infixOp %}


exp_sum -> exp_product {% id %}
    | exp_sum %tok_PLUS     exp_product {% infixOp %}
    | exp_sum %tok_MINUS    exp_product {% infixOp %}
    | exp_sum %tok_PLUSPLUS exp_product {% infixOp %}


exp_product -> UnaryOperator {% id %}
    | exp_product %tok_TIMES  UnaryOperator {% infixOp %}
    | exp_product %tok_DIVIDE UnaryOperator {% infixOp %}
    | exp_product %tok_MODULO UnaryOperator {% infixOp %}


UnaryOperator -> MemberExpression {% id %}
    | %tok_PLUS  UnaryOperator {% unaryOp %}
    | %tok_MINUS UnaryOperator {% unaryOp %}
    | %tok_not   UnaryOperator {% unaryOp %}


MemberExpression -> PrimaryExpression {% id %}
    | MemberExpression %tok_DOT Symbol
      {% function(d){
          return mkMemberExpression(mkLoc(d), "dot", d[0], d[2]);
      } %}

    | MemberExpression %tok_OPEN_SQ Expression %tok_CLOSE_SQ
      {% function(d){
          return mkMemberExpression(mkLoc(d), "index", d[0], d[2]);
      } %}


PrimaryExpression ->
      Number {% id %}
    | String {% id %}
    | Docstring {% id %}
    | Identifier {% id %}
    | Nil {% id %}
    | Boolean {% id %}
    | Function {% id %}
    | Application {% id %}
    | Array {% id %}
    | Struct {% id %}
    | %tok_OPEN_PN Expression %tok_CLOSE_PN {% idN(1) %}
    | EnumValue {% id %}


Application -> MemberExpression %tok_OPEN_PN Expression_list %tok_CLOSE_PN
{% function(d){
    return {
        loc: mkLoc(d),
        type: "Application",
        callee: d[0],
        args: d[2],
    };
} %}


Struct -> %tok_OPEN_CU KeyValPairs %tok_CLOSE_CU
{% function(d){
    return {
        loc: mkLoc(d),
        type: "Struct",
        value: d[1],
    };
} %}


KeyValPairs ->
      null {% noopArr %}
    | KeyValPairs_body {% id %}
    | NL INDENT KeyValPairs_body_nl DEDENT NL {% idN(2) %}


KeyValPairs_body ->
      KeyValPair {% id %}
    | KeyValPairs_body COMMA KeyValPair {% concatArr(2, true) %}


KeyValPairs_body_nl ->
      KeyValPair COMMA NL {% id %}
    | KeyValPairs_body_nl KeyValPair COMMA NL {% concatArr(1, true) %}


KeyValPair -> Symbol %tok_COLON Expression
{% function(d){
    return [d[0], d[2]];
} %}


Array -> %tok_OPEN_SQ Expression_list %tok_CLOSE_SQ
{% function(d){
    return {
        loc: mkLoc(d),
        type: "Array",
        value: d[1],
    };
} %}


Expression_list ->
      null {% noopArr %}
    | Expression_list_body {% id %}
    | NL INDENT Expression_list_body_nl DEDENT NL {% idN(2) %}


Expression_list_body ->
      Expression {% idArr %}
    | Expression_list_body COMMA Expression {% concatArr(2) %}


Expression_list_body_nl ->
      Expression NL:? COMMA NL {% idArr %}
    | Expression_list_body_nl Expression NL:? COMMA NL {% concatArr(1) %}


Function -> %tok_fn Params Block
{% function(d){
    return {
        loc: mkLoc(d),
        type: "Function",
        params: d[1],
        block: d[2],
    };
} %}


Params ->
      %tok_OPEN_PN                     %tok_CLOSE_PN {% noopArr %}
    | %tok_OPEN_PN Params_body COMMA:? %tok_CLOSE_PN {% idN(1) %}


Params_body ->
      Param {% idArr %}
    | Params_body COMMA Param {% concatArr(2) %}


Param -> Identifier {% id %}


EnumValue -> (Type %tok_DOT):? Type %tok_OPEN_PN Expression_list %tok_CLOSE_PN
{% function(d){
    return {
        loc: mkLoc(d),
        type: "EnumValue",
        enum: d[0] && d[0][0],
        tag : d[1],
        params: d[3],
    };
} %}


Number -> %tok_NUMBER
{% function(d){
    return mkType(d, "Number", parseFloat(d[0].src) || 0);
} %}


String -> %tok_STRING
{% function(d){
    var value = d[0].src
        .replace(/(^")|("$)/g, "")
        .replace(/\\"/g, "\"")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        ;
    return mkType(d, "String", value);
} %}


Docstring -> %tok_DOCSTRING
{% function(d){
    var value = d[0].src.replace(/(^""")|("""$)/g, "").replace(/\\"/g, "\"");
    return mkType(d, "Docstring", value);
} %}


Identifier -> %tok_SYMBOL
{% function(d, start, reject){
    var src = d[0].src;
    if(isReserved(src)){
        return reject;
    }
    return mkType(d, "Identifier", src);
} %}


Nil -> %tok_nil
{% function(d){
    return {loc: d[0].loc, type: "Nil"};
} %}


Boolean -> (%tok_true | %tok_false)
{% function(d){
    var t = d[0][0];
    return {loc: t.loc, type: "Boolean", value: t.src === "true"};
} %}


Symbol -> %tok_SYMBOL
{% function(d){
    return mkType(d, "Symbol", d[0].src);
} %}


INDENT -> %tok_INDENT {% id %}
DEDENT -> %tok_DEDENT {% id %}

COMMA -> %tok_COMMA {% id %}

NL -> %tok_NL {% id %}
