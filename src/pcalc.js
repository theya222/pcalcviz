/* eslint-disable */

// pcalc.js -- pcalc module v1
/********** print for debugging can be commented out *
var P = require("./print.js");
var print = P.print;
var concat = P.concat;
/***************************************************************/

/**
 * The externally exposed object Dlist provides a simple dependency structure for variables in a probability network. For example, if Dlist contains the following: {'X':null,'Y':['X'],'Z':['X','Y']}, then this represents that variable X has no dependencies, that Y depends on X and that Z depends on both X and Y.
 */
var Dlist={};   // global variable dependency list


//var US={"id":"us",nonp:{}};   // expose for debugging

/*********************************************************************
// calculate and update results. The Content parameter expects
// any text with formulas in backticks.  However, it returns
// html text. The following example strings could be given to
// calcvars as Content:
var WG = "`pr Rain=0.2` `pr Sprinkler:Rain=0.01` `pr Sprinkler:-Rain=0.4` `pr Wet:-Sprinkler,-Rain=0` `pr Wet:-Sprinkler,Rain=0.8` `pr Wet:Sprinkler,-Rain=0.9` `pr Wet:Sprinkler,Rain=0.99` `%pr Wet?` ";
var Simple = "<p>`probability of Y given X is 50%`</p><p>`probability of X is 50%`</p><p>So, the `%probability of Y?`</p>";
var Loop = "`pr X:Y=0.5` `pr Y:X=0.5` `pr Y?`";
var Unbalanced = "`pr X=0.5";
var Black = "`pr Plane=10%` `pr Drone=5%` `pr Intercept:Plane=85%` `pr Intercept: -Plane=10%` `pr Report: Drone=95%` `pr Report: -Drone=5%` `pr RusExpert: Plane=80%` `pr RusExpert: -Plane=40%` `pr USExpert: Drone=70%` `pr USExpert: -Drone=20%` `pr Radar:Drone=95%` `pr Radar: Plane=90%` `pr Radar: -(Plane or Drone) =0.5%` `%pr Plane: (Intercept & Report & Radar &  -RusExpert & -USExpert)`";
/********************************************************************/

/**
 * Process the text in Content, and calculate all the formulas in backticks in the content. Return the text, but now with the formulas (and possible results) in <code>...</code> tags.
 *
 * Broadly, calcvars first uses :func:`tickconvert` to convert the formulas in backticks to tagged formulas, as well as extract a formula list.  Then, it sorts the formulas in order of dependencies (of variables).  The third step is to actually interpret the formulas and store the results in an object called Rlist.  Lastly, we process the Rlist and plug any results from the formulas into the appropriate place in the html text (the right place was previously placemarked by tickconvert.  Basically, it created a tag called <fi> for every formula, numbered i, where the result should go). After placing the results, we return the resulting html string.
 *
 * Calcvars is a "top level" function that you can play with from the node commandline.  So, start node and `.load pcalc.js`. Then, try `calcvars("<p>\`probability of Y given X is 50%\`</p><p>\`probability of X is 50%\`</p><p>So, the \`%probability of Y?\`</p>")`. The result will be a string with html text, where the backticks have been replaced by html `<code>` tags, including `<span>` tags for formulas and results.  The formula and result classes have a suffix of 'A', 'B' or 'C'. These indicate respectively whether the formula is an "assignment" (i.e. has an "=" or the keyword "is"), or a formula that needs hiding as soon as a result is available, or a formula that needs display together with the result.  Having different class names for each of these cases makes it easy to control the display with stylesheets.
 *
 * @param {string} Content - text as html string, which may contain calculator formulas inside backticks
 * @return {string} same content is returned, but now formulas are marked up inside <code>...</code> tags, including possible results
 */
function calcvars( Content){
    // convert and sort formulas
    Content = tickconvert(Content);
    var Rlist={};
    var Userspace = {"id":"Userspace",nonp:{}};
    //var Userspace=US;

    try{
        var Fs = sortfs(Content.formulas);
        Rlist = calcs(Fs,Userspace);
    } catch(e){
        var f = Object.keys(Content.formulas)[0];
        Rlist[f] = {result:e};
    }

    // substitute results
    Content.html = Content.html.replace(/<"([^"]*)">/gi, function(_,x){
        var res = " ";  // space, because other utils might remove empty spans
        if(x in Rlist){
            res += Rlist[x].result;
            if(Content.formulas[x]["F"][0] == "%"){ res+="%"; }
        }
        return res;
    });


    // for "explanation", could add appendix of tables of (conditional) probabilities

    return Content.html;
}

// calculate all formulas in sorted formula list: [[h,fid,formula]...]
// return result list: {'f0':res0, 'f1':res1,...}
/**
 * Process a (sorted) list of formulas of the structure `[[h,fid,formula]...]`, where `h` is the sort key (variable dependency "height"), `fid` is the formula identifier of the form `f01`, and `formula` is a string with the formula text in the pcalc syntax.
 *
 * The sorted list will have two major groups of probability formulas: assignments and calculations.  Assignments are processed first and used to build the equivalent of a Bayes network.  This network is then "completed" using :func:`completor`. Among other things, the completor function checks if any conditional variable has an incomplete set of conditions, in which case it uses a "noisy-or" procedure to complete the conditions.  The completor function also makes a list of variables that each conditional variable depends on, and binary-count ordered probabilities for all combinations of those variables.  All this is stored in the Net object, whose reference was passed into the calcs function.   When the Net object is complete, the calcs function will calculate the results of the remaining calculation functions.
 *
 * @param {array} fs - sorted list of formulas
 * @param {object} Net - a probability network object, for example `{"id":"mynet", nonp:{}, "X":{true:0.5}, "Y":[[0.6, "X"],[0.2, [not,"X"]]] }`
 * @return {object} the calcs result is an object with formula ids as keys and the formula result as value -- only for formulas that actually have results. result structure: `{'f0':res0, 'f1':res1,...}`
 */
function calcs(fs, Net){

    var Res={};
    var fsrest = [];

    // process probability assignment formulas first
    for(var i=0; i<fs.length; ++i){
        if(fs[i][2].search(/=|\s+is\s+/)!=-1){
            try{
                pcalc(fs[i][2],Net);
            } catch(e) {
                if(type(Res[fs[i][1]])=="Undefined"){ Res[fs[i][1]]={result:null}; }
                Res[fs[i][1]].result = e;
            }
        } else {
            fsrest.push(fs[i]);
        }
    }

    // now ensure the probability network is complete
    completor(Net);

    // now process the remaining probability calculations
    for(i=0; i<fsrest.length; ++i){
        try{
            if(type(Res[fsrest[i][1]])=="Undefined"){ Res[fsrest[i][1]]={result:null}; }
            Res[fsrest[i][1]].result = pcalc(fsrest[i][2],Net);
        } catch(e) {
            if(type(Res[fsrest[i][1]])=="Undefined"){ Res[fsrest[i][1]]={result:null}; }
            Res[fsrest[i][1]].result = e;
        }
    }

    return Res;
}


/**
 * Sort formulas in order of maximum "height" of variables. Given an object  `Fs={ 'f1':{'F':'prob X=0.5'}, 'f2':{'F': 'prob Y=0.5'}...}` return `[[height,fid,F]...`
 *
 * The "height" is the recursively calculated length of dependent variables that appear in the conditions that a variable depends on.  A simple definition like `pr X=0.5` means that the variable X does not depend on any  other variable, and so has a length of zero.  In `pr Y given X=0.5`, the variable Y depends on X, and so has a length of 1.  In `pr Z given X or Y = 0.7`, the variable Z depends on X and Y, of which Y has the longer dependency length, and so Z has a length of one more than Y (i.e. length of Z = 2).  Formulas that are not assignments, but simple calculations are given an arbitrarily long  length (1000) so that they come last in the sort order.  That is because calculations need to be performed after all assignments have been evaluated.
 *
 * Along the way, the sort function also creates a global object called :func:`Dlist`, which contains a dependency list for each variable.  For example, {'X':null, 'Y':['X'], 'Z':['X','Y']}.   The object is global and exported, in order to support external modules such as the diagram generator.  Internally, the sort routine uses Sets to update the Dlist (to avoid appending duplicate variables), but later converts the Dlist back to a simple object.
 *
 * The relationship between Dlist and sorting the formulas is that a formula height is the height of its highest variable (as with the X,Y,Z example above).  So, first we need to calculate the height of each variable in a formula, and then determine the highest of those variables.
 *
 * @param {object} Fs - object that contains formulas
 * @return {array} result is a sorted array of formulas `[[h,fid,formula]...]`, with an integer (h) "variable dependency height" as the sorting key
 */
function sortfs(Fs){
//  var Dlist={};     // variable dependency list, usually declared globally
    Dlist={};
    var DHlist={};    // variable dependency height list
    var fvars=[];     // temporary variable list
    var result=[];    // sort result
    var tempset= new Set();   // temporary Set
    var doesAssign= false;    // temp: does formula assign to a variable?
    // var hasGiven= false;      // temp: does formula have a conditional probability?
    var d=null;               // temp variable
    var f=0;                  // index var

    // build up the variable dependency table
    for(var fid in Fs){
        fvars = Fs[fid].F.match(/([A-Z]\w*)/g) || [];
        Fs[fid]["vars"] = fvars;

        // initialise dependency height for assignments and simple calcs
        // simple calcs should always come after assignments, so init height=1000
        doesAssign = Fs[fid].F.match(/(?:=|\s+is\s+)/);
        Fs[fid]["height"] = doesAssign ? 0 : 1000 ;

        // update variable dependency table
        // the reason for using sets here is to avoid duplicate variables
        // in the dependency list
        if(doesAssign && fvars != []){
            if(fvars[0] in Dlist){  // there was already an entry for this var
                tempset = new Set(fvars.slice(1));
                Dlist[fvars[0]] = new Set([...Dlist[fvars[0]],...tempset]);
            } else {  // a new entry for this var
                Dlist[fvars[0]] = new Set( fvars.slice(1) );
            }
        }

        // calculate "height" of each dependent variable in each formula
        d=null;
        for(d in Dlist){
            try{ DHlist[d] = height(d,Dlist, new Set); } catch(e){ throw "error: variable dependency issue"; }

        }
        // calculate "height" of each formula as max height of all vars in
        // the formula.
        for(f in Fs){
            for( var k in Fs[f].vars){
                d= Fs[f].vars[k];
                if(typeof(DHlist[d]) != "undefined" && DHlist[d] > Fs[f].height){
                    Fs[f].height = DHlist[d];
                }
            }
        }
    }

    // put all the information together into a formula list sorted by height
    for(f in Fs){
        result.push([Fs[f].height,f,Fs[f].F]);
    }

    result = result.sort(function(a,b){return a[0]-b[0];});
    return result;

}

/** Given a node name (key) and a simple dependency structure (D), recursively calculate the dependency length for the node. Keep track which nodes have already been visited (curpath), because we don't want to get stuck in infinite loops.  As a result, the dependency structure is treated as an acyclic graph.
 *
 * @param {string} node - the node in the graph for which we want to calculate the "height"
 * @param {object} D - a simple dependency structure, e.g. {'X':null, 'Y':['X'], 'Z':['X','Y']}
 * @param {array} curpath - a list of already visited nodes
 * @return {integer} integer that represents the dependency "height", where 0 is "no dependencies"
*/
function height(node,D,curpath){
    if(!(node in D) || D[node]==[]) return 0;
    // if(curpath.has(node)) throw "error (dependency loop) for "+node;

    curpath.add(node);
    var maxheight = 0;
    for(var n of D[node]){
        maxheight = Math.max(maxheight,height(n,D,curpath)) + 1;
    }
    return maxheight;
}


/**
 * Convert a text (html) string with formulas in backticks, to a text (html) string where formulas are in code,span formulas, and span result tags
 *
 * Note 1: the function processes a text string character-by-character from the last character to the first.  It does this, because it is easier to identify create the starting html tags (e.g. code etc.) if you already have the formula contents.  However, this means that creating "types" for the result tags is a separate step, because trying to do it in the same (major) loop can result in an error where the type from a prior formula gets attached to the the result tag.
 *
 * The code structure for the formulas is as follows:
 *
 *  * the `<code>` tag has a class of "pcalc"
 *  * the formula is wrapped in a `<span>` tag with a class of "formulaA", "formulaB" or "formulaC". The "A" suffix is used for assignment formulas, for example `pr X = 50%`.  The "B" suffix is used for calculation formulas that do not have a question mark at the end, for example `pr X`.  The "C" suffix is used for calculation formulas that _do_ have a question mark at the end, for example `pr X?`.  These suffixes enable the users to indicate whether they want a calculation to show the formula together with the result (option C), or to hide the formula and only show the result (option B).  Assignment formulas (option A) are always shown.  Having these options encoded as class types enables us to control the display via CSS.
 *  * the result is wrapped in a `<span>` tag with a class of "resultA", "resultB" or "resultC", with the same meaning as the formula tags
 *
 * Note 2: we do a minimal check for having an even number of backticks.  An uneven one means that there is a backtick missing.
 *
 * Note 3: backticks can be escaped in the source text in the usual way -- prefix the backtick with a backslash
 *
 * Note 4: part of the reason for using regex to do the transformation is so that we do not rely on DOM processing.  This avoids possible cross site scripting malware, and also makes the pcalc module more independent from any IO interfacing.
 *
 * @param {string} s - the (html) text string that contains formulas in backticks
 * @return {string} the html string where formulas are now inside `<code>` and `<span>` tags
 */
function tickconvert(s){
    Dlist={};             // reset the global variable dependency list
    var Fs={};            // init formula list
    var result="";
    var invar=false;      // are we inside <code></code> tags?
    var k=s.length;       // position in s of last </code> tag
    var formula="";       // any formula text extracted from s
    var nticks=0;         // number of ticks
    var fid=0;            // formula id
    var amp= /&amp;/g;    // html special character for ampersand
    var nbsp = /&nbsp;/g; // html special character for hardspace
    var hardspace = new RegExp(String.fromCharCode(160), "g");
    var ftype = "-A";

    for(var i=s.length - 1; i>=0; --i){
        if(s[i]=="`" && (i==0 || (s[i-1]) !="\\")){ //Note: backticks can be escaped as usual
            ++nticks;
            if(invar){
                formula = s.substring(i+1,k).replace(hardspace," ").replace(nbsp," ").replace(amp,"&");
                ftype = formula.search(/=|\s+is\s+/)==-1 ?  (formula.search(/\?/)==-1? "B" : "C") : "A";
                Fs["f"+fid] = {"F":formula};
                result = "<code class=\"pcalc"+ftype+"\">"
               + "<span class=\"formula"+ftype+"\" id=\"f"+fid+"\">"
               + result;
                invar = false;
                ++fid;
            } else {
                result = "</span>"
               + "<span class=\"result\" id=\"r"+fid+"\"><\"f"+fid+"\"></span>"
               + "</code>"
               + result;
                k = i;
                invar = true;
            }
        } else {
            result = s[i] + result;
            if(s[i]=="`" && i>0 && s[i-1]=="\\"){
                --i;         // skip the backslash that escapes the backtick
            }
        }
    }

    // append type to result class based on ftype
    const formu = /<span\s+class="formula(.)"\s+id="([^"]*)"\s*>([^<]*)<\/span>\s*<span\s+class="result"/gi;
    result = result.replace(formu,function(_,ftype,fid,f){
        return "<span class=\"formula"+ftype+"\" id=\""+fid+"\">"+f+"</span><span class=\"result"+ftype+"\"";
    });

    // check if formula ticks are balanced
    if( (nticks % 2) == 0){
        return {"html":result, formulas:Fs };
    } else {
        return {"html":s.replace(/<\/body>/,"<b>unbalanced formula tick marks</b></body>"), formulas:null };
    }
}

/**
 * Remove html formatting of formulas and results, and put formulas back inside backticks
 *
 * @param {string} s - a text string with formulas inside <code> tags
 * @return {string} a string where the code and span tags are removed (including any results) and formulas are inside backticks
 */
function resetcode(s){
    Dlist = null;       // reset global variable dependency list
    const startcode = /<code\s+class\s*=\s*"pcalc.">\s*<span\s+class="formula."\s+id="[^"]*"[^>]*>/gi;
    const endcode = /<\/span>\s*<span\s+class="result."\s+id="[^"]*"[^>]*>[^<]*<\/span>\s*<\/code>/gi;

    // also check for explanation in the appendix

    return s.replace(startcode,"`").replace(endcode,"`");
}

/**
 * A helper function for highlight results, if the editor/webpage itself doesn't already take care of such highlighting
 *
 * @param {string} s - html string with formulas already inside <code> tags
 * @return {string} - same html string, but with "highlight" styling added to the resultB classes (results where the formula does not display)
 */
function highlight(s){
    const code = /<code\s+class\s*=\s*"pcalcB">\s*<span\s+class="formulaB"\s+id="([^"]*)"\s*>([^<]*)<\/span>\s*<span\s+class="resultB"\s+id="([^"]*)"\s*>([^<]*)<\/span>\s*<\/code>/gi;
    return s.replace(code,function(_,fid,f,rid,res){
        return "<code class=\"pcalcB\"><span class=\"formulaB\" id=\""+fid+"\" style=\"display:none\">"+f+"</span><span class=\"resultB\" id=\""+rid+"\" style=\"background-color:yellow\">"+res+"</span></code>";
    });
}


// pcalc FORMULA INTERPRETER MODULE SOURCE -- INCLUDED FOR PACKAGING

/**
 * The top level interface to the formula interpreter. Interpret the formula in the context of the referenced probability network. Probability assignment formulas will update the network.  For example, a formula like 'pr X is 50%` will create (or update) the network U with `U["X"] = {true: 0.5}`.  Since `U` is an object passed by reference, the original network is updated.
 *
 * @param {string} S - a text string with single formula to interpret
 * @param {object} U - the structure (object passed by reference) to hold the probability network
 */
function pcalc(S,U={"id":null,nonp:{}}){
    // console.log(U);
    return pcalctok(tokenise(S),U);
}

/**
 * Remove whitespace, separate tokens, numbers and symbols. Aside from symbols like asterisk, plus sign, etc., the tokeniser separates out "tokens" which start with a letter and are followed by letters, digits or an underscore.  These tokens are later interpreted as function names or variables.
 *
 * Example: `tokenise('pr Y given X is 50%')` on the node commandline will result in `[ 'pr', 'Y', 'given', 'X', 'is', 50, '%' ]`
 *
 * Note 1: We pre-calculate numbers, including negative numbers. So, the minus sign in front of a number turns the number into a negative number.
 *
 * Note 2: question mark is counted as space. This is used by the html interface (see :func:`calcs`) as a placemarker to decide whether to display the formula together with the result.
 *
 * @param {string} s - the formula in text
 * @return {array} a list of tokens, numbers and symbols
 */
function tokenise(s){
    var result=[];
    var space, token, number, exponent, symbol;
    while(s != ""){
        space = s.match(/^[ ?\t\n]+/);
        if(space){ s = s.substring(space[0].length); }
        token = s.match(/^[A-Z_][A-Z0-9_]*/i);
        if(token){
            result.push(token[0]);
            s = s.substring(token[0].length);
        }
        number = s.match(/^-?(?:\.[0-9]+|[0-9]+(?:\.[0-9]+)?)/);
        if(number){
            s = s.substring(number[0].length);
            exponent = s.match(/^e-?(?:\.[0-9]+|[0-9]+(?:\.[0-9]+)?)/);
            if(exponent){
                s = s.substring(exponent[0].length);
                result.push(Math.pow(number[0],exponent[0].substring(1)));
            } else { result.push(parseFloat(number[0])); }
        }
        symbol = s.match(/^[^A-Z0-9_ ?\t\n]/i);
        if(symbol){
            result.push(s[0]);
            s=s.substring(1);
        }
    }
    return result;
}

/**
 * Interpret the tokens of a probability formula and possibly update the user object that contains probability variables and their values and conditions. This function is essentially the start of a recursive descent interpreter for probability math formulas.  You can see in this function that formulas are either "definitions" or "expressions".  In other words, the grammar in this function is:
 *
 * ::
 *
 *     pcalctok --> definition | expression
 *
 *
 * @param {array} s - array of tokens to interpret
 * @param {object} U - "User space" object that contains variables, especially probability variables and their values and conditions.
 */
function pcalctok(s,U){
    var res=null;

    res = definition(s,U);
    if(!res.err){ return res.val; }

    res = expression(s,null,U);
    if(res.err==-1){ return res.val; }
    else{ return res.err;}
}


/**
 * Interpret a "definition" (i.e. assignment) formula and update the user space if needed with any new variables
 *
 * A definition can be either a simple probability definition, a conditional probability definition, or a non-probability variable assignment. So, the grammar for a definition is:
 *
 * ::
 *
 *    definition --> probf, (pdef_simple | pdef_given)
 *                 | vardef
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {object} U - "User space" object that contains variables, especially probability variables and their values and conditions.
 */
function definition(s,U){
    var res=null;

    res = probf(s);
    if(!res.err){
        s=res.tail;

        res = pdef_simple(s,U);
        if(!res.err){ return res; }

        res = pdef_given(s,U);

        return res;
    }

    res = vardef(s,U);

    return res;
}

// probability definition grammar:
// pdef -> "(" pdef ")" | pdef_simple | pdef_given


/**
 * Interpret a non-probability variable definition (i.e. assignment)
 *
 * grammar:
 *
 * ::
 *
 *    vardef --> vname, ("=" | "is"), expression
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {object} U - "User space" object that contains variables, especially probability variables and their values and conditions.
 */
function vardef(s,U){
    var res=null;
    var varname, value;

    res = vname(s);
    if(!res.err){ varname=res.val; s=res.tail; } else{ return res; }

    res = token(s,["=","is"]);
    if(!res.err){ s=res.tail; } else{ return res; }

    res = expression(s,null,U);
    if(!res.err || res.err==-1){ value=res.val; s=res.tail;} else{ return res; }

    U.nonp[varname] = value;
    return {err: false, val: value, tail: s};
}



/**
 * Interpret the probability functor (i.e. keyword that signals the start of a probability formula). No user space needs to be passed to this interpretation, because we don't update the userspace upon seeing this keyword.  It simply acts as a signal in the processing of a formula.
 *
 * grammar:
 *
 * ::
 *
 *    probf --> ("probability of" | "chance of" | "chance" | "probability" | "prob" | "pr")
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 */
function probf(s){
    if(s.length >= 2 && (s[0]=="probability" || s[0]=="chance") && s[1]=="of"){
        return {err: false, val: true, tail: s.slice(2)};
    }

    if(s.length >0 && (s[0]=="chance" || s[0]=="probability" || s[0]=="prob" || s[0]=="pr") ){
        return {err: false, val: true, tail: s.slice(1)};
    }

    return {err:"no probf", val: null, tail: s};
}



/**
 * Interpret simple probability definitions (after the `prob` keyword), like `X=50%`
 *
 * grammar:
 *
 * ::
 *
 *    pdef_simple --> pvname, ("=" | "is"), expression
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {object} U - user space object where variable definitions are stored
 * @return {object} interpreter result object
 */
function pdef_simple(s,U){
    //    console\.log("** simple probability definition. s="+s);
    var res=null;
    var varname, value;

    res = pvname(s);
    if(!res.err){ varname=res.val; s=res.tail; } else{ return res; }
    //    console.log("*** pdef_simple. varname="+varname);

    res = token(s,["=","is"]);
    if(!res.err){ s=res.tail; } else{ return res; }

    res = expression(s,null,U);
    //    console.log("** back in pdef_simple. value="+res.val);
    if(!res.err || res.err==-1){ value=res.val; s=res.tail;} else{ return res; }

    // create variable in probability network (U) if it doesn't exist already
    // the structure for unconditional probability variables is
    // e.g.     "R" :   { true: 0.20 }
    if(typeof(U[varname])=="undefined"){
        U[varname] = { true: null };
    }
    U[varname].true = value;
    return {err: false, val: U[varname].true, tail: s};
}


/**
 * Interpret conditional probability definitions (after the `prob` keyword), like `X given Y=50%`
 *
 * grammar:
 *
 * ::
 *
 *    pdef_simple --> pargiven, ("=" | "is"), expression
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {object} U - user space object where variable definitions are stored
 * @return {object} interpreter result object
 */
function pdef_given(s,U){
    //    console.log("** conditional probability definition. s="+s);
    var res=null;
    var varname, pexpr, value;

    res=pargiven(s);
    if(!res.err){
        varname=res.varname;
        pexpr=res.val;
        //        console.log("*** back in pdef_given from pgiven. varname="+varname+" pexpr="+pexpr);
        res={err:false, val:pexpr, tail:res.tail};
        s=res.tail;
    } else {return res;}

    res = token(s,["=","is"]);
    if(!res.err){ s=res.tail; } else{ return res; }

    //    console.log("** onto numeric expression");
    res = expression(s,null,U);
    //    console.log("** back in pdef_given. value="+res.val);
    if(!res.err || res.err==-1){ value=res.val; s=res.tail;} else{ return res; }

    // if the probability variable doesn't exist in the network (U), then create
    // and entry.  The format for conditional probability variables is
    // e.g. "S" :   { [formulas]:   [   [0.01, logic_expression], [0.4, [not, logic_expression]]] }
    // Formulas are a disjunctive list of conditional probabilities, where the first value is
    // the conditional probability and the remainder of the list is the condition as a logic expression
    if(typeof(U[varname])=="undefined"){
    // console.log("creating "+varname);
        U[varname] = {[formulas]: []};
    }
    // console.log("U["+varname+"][formulas].push(["+value+","+pexpr+"])");
    U[varname][formulas].push([value,pexpr]);
    return {err: false, val: U[varname][formulas][U[varname][formulas].length-1][0], tail: s};
}


// the probability given part can be wrapped in parentheses, like pr(X:Y)=0.5
// grammar for that: pargiven -> "(" pargiven ")" | pgiven
/**
 * Interpret conditional probability variable that comes before the condition (i.e. before "given"). Pargiven takes care of the parentheses that may wrap the conditional part, for example in `pr(X given Y)=0.5`
 *
 * grammar:
 *
 * ::
 *
 *    pargiven --> "(" pargiven ")"
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @return {object} interpreter result object
 */
function pargiven(s){
    var value, varname;
    var res=token(s,["("]);
    if(!res.err){
    //        console.log("*** in pargiven parenthesis. res.tail="+res.tail);
        res=pargiven(res.tail);
        //        console.log("*** returned from pargiven. res.tail="+res.tail+" res.varname="+res.varname);
        if(!res.err){
            value=res.val;
            varname=res.varname;
            //            console.log("*** returned from pargiven. res.tail="+res.tail+" res.varname="+varname);
            res=token(res.tail,[")"]);
            if(!res.err){
                res.val=value;
                res.varname=varname;
            }
            return res;
        }
    }

    res=pgiven(s);
    return res;
}

/**
 * Interpret conditional probability variable that comes before the condition (i.e. before "given").
 *
 * grammar:
 *
 * ::
 *
 *    pgiven --> vname, (":" | "given")
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @return {object} interpreter result object
 */
function pgiven(s){
    var res={};
    var varname;

    res = vname(s);
    if(!res.err){ varname=res.val; s=res.tail; } else{ return res; }

    res = token(s,[":","given"]);
    if(!res.err){
        res = pexp(res.tail,"");
        if(!res.err || res.err==-1){ res.varname=varname; }
    }

    return res;
}

/**
 * Interpret a probability variable that may be wrapped in parentheses, as in `pr(X)=0.5`
 *
 * grammar:
 *
 * ::
 *
 *    pvname --> "(" pvname ")" | vname
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @return {object} interpreter result object
 */
function pvname(s){
    var value;
    var res=token(s,["("]);
    if(!res.err){
        res=pvname(res.tail);
        if(!res.err){
            value=res.val;
            res=token(res.tail,[")"]);
            if(!res.err){res.val=value;}
            return res;
        }
    }

    res=vname(s);
    return res;
}

/**
 * Interpret a variable name
 *
 * grammar:
 *
 * ::
 *
 *    vname --> pvname
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @return {object} interpreter result object
 */
function vname(s){
    //    console.log("** vname");
    if(s.length>0 && typeof(s[0])=="string" && s[0][0]>="A" && s[0][0]<="Z"){
        return {err: false, val: s[0], tail:s.slice(1)};
    } else{
        return {err:"no vname", val:null, tail:s};
    }
}


/**
 * Interpret an arithmetic expression, including functions of numbers, of which probability functions are are one type.
 *
 * grammar:
 *
 * ::
 *
 *  expression -> term asop | asop
 *  term -> factor emdop
 *  factor -> "(" expression ")" | FUNC
 *  asop -> "+" term asop | "-" term asop | EMPTY
 *  emdop -> "^" factor emdop | "*" factor emdop | "/" factor emdop | EMPTY
 *
 *
 * Note-1: some parts of an expression may be empty, like the "add or subtract" operator part.  That means the return value parameter "err" has a special value (-1) which signals a non-error empty return.  In practice, this means that the return of "errors" for the purpose of notifying users of "expectations" in the expression is not very applicable, because it is hard to decide between an expected symbol and a legitimate empty return.
 *
 * Note-2: the FUNC factor encapsulates functions of numbers, of which the sub-grammar of probability functions is one type. So, you could comment out the probability function part in :func:`func` and have just an arithmetic interpreter.
 *
 * Note-3: the structure of each of these interpreter functions is to test whether the next elements of the token stream (i.e. parameter "s") matches some expected token(s) and if so, return with a value.  If it doesn't match, then code drops to the next section of the function to try something else.  So, each test consists only of an if...return.  There is usually no explicit "...else ", just a "continue to the next lines of code if the test was unsuccessful".
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {*} V - current value in the recursive interpretation of an expression.  May be array or number
 * @param {object} U - user space object where variable definitions are stored
 * @return {object} interpreter result object
 */
function expression(s,V,U){
    // console.log("** expression. V="+V);
    var res=term(s,V,U);
    if(!res.err || res.err==-1){
        // console.log("** back in expression from term. res.val="+res.val);
        res=asop(res.tail,res.val,U);
        if(!res.err || res.err==-1){
            return {err:res.err, val:res.val, tail:res.tail};
        }
    }

    // console.log("** expression didn't start with term.");
    if(V==null){V=0;}
    res=asop(s,V+0,U);
    if(!res.err || res.err==-1){
        return {err:res.err, val:res.val, tail:res.tail};
    }

    // since asop can be EMPTY, it will always succeed here
}

/**
 * Interpret an arithmetic term
 *
 * grammar (see also the full grammar of arithmetic expressions):
 *
 * ::
 *
 *  term -> factor emdop
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {*} V - current value in the recursive interpretation of an expression.  May be array or number
 * @param {object} U - user space object where variable definitions are stored
 * @return {object} interpreter result object
 */
function term(s,V,U){
    // console.log("** term. V="+V);
    var res=factor(s,V,U);
    if(!res.err){
    //        console.log("** back in term from factor ok. res.val="+res.val);
        res=emdop(res.tail,res.val,U);
        if(!res.err || res.err==-1){
            return {err:res.err, val:res.val, tail:res.tail};
        }
    }
    //    console.log("** back in term, but err from factor or emdop= "+res.err);
    //    if(res.err==-1){ console.log("** term stopped on factor. value="+res.val)};
    return res;
}

/**
 * Interpret an arithmetic factor
 *
 * grammar (see also the full grammar of arithmetic expressions):
 *
 * ::
 *
 *  factor -> "(" expression ")" | FUNC
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {*} V - current value in the recursive interpretation of an expression.  May be array or number
 * @param {object} U - user space object where variable definitions are stored
 * @return {object} interpreter result object
 */
function factor(s,value,U){
    // console.log("** factor. V="+value);

    // factor is either a parenthesised expression
    var res=token(s,["("]);
    if(!res.err){
    //        console.log("** inside parenth expression. res.tail="+res.tail);
        res=expression(res.tail,value,U);
        //        console.log("** back inside parenth expression. res.val="+res.val+" res.err="+res.err);
        if(!res.err || res.err==-1){
            value=res.val;
            //            console.log("** back inside parenth expression. exp value="+value);
            res=token(res.tail,[")"]);
            if(!res.err || res.err==-1){
                //              console.log("** completed parenth expression");
                return {err:false, val:value, tail:res.tail};
            } else {
                //              console.log("** no closing parenth. returning with error");
                return {err:"Expected ), got "+res.tail, val:res.val, tail:res.tail};
            }
        }
    }

    // ...or a number or function
    res=func(s,U);
    if(!res.err){
    //        console.log("** factor is a number. val="+res.val);
        return {err:false, val:res.val, tail:res.tail};
    }

    // otherwise terminate
    //    console.log("** neither parenth nor func")
    return {err:res.err, val:value, tail:s};
}

/**
 * Interpret an arithmetic "add or subtract" subterm
 *
 * grammar (see also the full grammar of arithmetic expressions):
 *
 * ::
 *
 *  asop -> "+" term asop | "-" term asop | EMPTY
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {*} V - current value in the recursive interpretation of an expression.  May be array or number
 * @param {object} U - user space object where variable definitions are stored
 * @return {object} interpreter result object
 */
function asop(s,startval,U){
    //    console.log("** asop. V="+startval);
    if(s.length <=0) { return {err:-1, val:startval, tail:[]};}
    var res, value;

    res=token(s,"+");
    if(!res.err){
    //        console.log("** in asop. it's addition. tail="+res.tail);
        res=term(res.tail,startval,U);
        if(!res.err || res.err==-1){
            value=startval+res.val;
            //            console.log("** addition result="+value);
            return asop(res.tail,value,U);
        } else {
            return {err:"no term",val:startval,tail:s};
        }
    }

    //    console.log("maybe substraction? s[0]="+s[0]);
    res=number(s);
    if(!res.err && res.val<=0){
    //        console.log("** special minus condition. s[0]="+s[0]);
        s[0] = 0-s[0]; s.unshift("-");
    }
    res=token(s,"-");
    if(!res.err){
    //        console.log("** in asop. it's subtraction. tail="+res.tail);
        res=term(res.tail,startval,U);
        if(!res.err || res.err==-1){
            value=startval-res.val;
            //            console.log("** subtraction result="+value);
            return asop(res.tail,value,U);
        }
    }

    // otherwise empty
    //    console.log("** not + or - so empty");
    return {err:false, val:startval, tail:s};
}


/**
 * Interpret an "exponentiation, multiply or divide" subterm
 *
 * grammar (see also the full grammar of arithmetic expressions):
 *
 * ::
 *
 *  emdop -> "^" factor emdop | "*" factor emdop | "/" factor emdop | EMPTY
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {*} value - current value in the recursive interpretation of an expression.  May be array or number
 * @param {object} U - user space object where variable definitions are stored
 * @return {object} interpreter result object
 */
function emdop(s,value,U){
    //    console.log("** emdop. V="+value);
    if(s.length <=0) { return {err:-1, val:value, tail:[]}; }
    var res;

    //    console.log("** emdop, about to check for operators.");
    res=token(s,["^"]);
    if(!res.err){
    //      console.log("** it's exponentiation");
        res=factor(res.tail,value,U);
        if(!res.err || res.err==-1){
            //        console.log("** returned from factor. expon result="+Math.pow(value,res.val));
            value=Math.pow(value,res.val);
            res=emdop(res.tail,value,U);
            if(!res.err || res.err==-1){
                return {err:false, val:res.val, tail:res.tail};
            }
        } else {
            return {err:"no term",val:value,tail:s};
        }
    }

    res=token(s,["*"]);
    if(!res.err){
    //      console.log("** it's multiplication");
        res=factor(res.tail,value,U);
        if(!res.err || res.err==-1){
            //        console.log("** returned from factor. mult result="+value*res.val);
            value=value*res.val;
            res=emdop(res.tail,value,U);
            if(!res.err || res.err==-1){
                return {err:false, val:res.val, tail:res.tail};
            }
        } else {
            return {err:"no term",val:null,tail:s};
        }
    }

    res=token(s,["/"]);
    if(!res.err){
    //      console.log("** it's division");
        res=factor(res.tail,value,U);
        if(!res.err || res.err==-1){
            //        console.log("** returned from factor. div result="+value/res.val);
            value=value/res.val;
            res=emdop(res.tail,value,U);
            if(!res.err || res.err==-1){
                return {err:false, val:res.val, tail:res.tail};
            }
        } else {
            return {err:"no term",val:null,tail:s};
        }
    }

    // otherwise error (but that could indicate the end of the expression)
    //    console.log("** no emd op, so return empty");
    return {err:false, val:value, tail:s};
}


/**
 * Interpret a token (non-variable symbol) in an arithmetic expression.
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {array} toks - the list of strings that token has to be in, in order to be considered a valid token
 * @return {object} interpreter result object
 */
function token(s,toks){
    if(s.length>0 && toks.indexOf(s[0]) > -1){
        return {err:false, val:s[0], tail: s.slice(1)};
    } else {
        return {err:"no tok",val:null,tail:s};
    }
}

/**
 * Interpret a function term
 *
 * grammar (see also the full grammar of arithmetic expressions):
 *
 * ::
 *
 *  func --> "round" | "rounded"
 *          | "percent" | "%"
 *          | number
 *          | probf, pexpression
 *          | vname
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {object} U - user space object where variable definitions are stored
 * @return {object} interpreter result object
 */
function func(s,U){
    // console.log("** function or number");
    //var value;

    var res = token(s,["round", "rounded"]);
    if(!res.err){
        res= expression(res.tail,null,U);
        if(!res.err || res.err==-1){
            return {err:false, val:Math.round(res.val), tail:res.tail};
        }
    }

    res = token(s,["percent", "%"]);
    if(!res.err){
        res= expression(res.tail,null,U);
        if(!res.err || res.err==-1){
            return {err:false, val:Math.round(100*res.val), tail:res.tail};
        }
    }

    //    console.log("** got to number s="+s);
    res = number(s);
    if(!res.err) {return res;}

    res = probf(s,U);
    if(!res.err){
        res = pexpression(res.tail,U);
        if(!res.err) {return res;}
    }

    res=vname(s);
    if(!res.err && res.val in U.nonp){
        res.val = U.nonp[res.val];
        //        console.log("** found variable: "+res.val+" tail="+res.tail);
        return res;
    }

    return {err:"no number or function",val:null,tail:s};
}

/**
 * Interpret a number
 *
 * grammar (see also the full grammar of arithmetic expressions):
 *
 * ::
 *
 *  number --> NUMBER, ["%"]
 *
 * @param {array} s - list (array) of tokens to interpret
 * @return {object} interpreter result object
 */
function number(s){
    if(s.length>0 && typeof(s[0])=="number"){
    //        console.log("** number ="+s[0]);
        var res=token(s.slice(1),["%"]);
        if(!res.err){
            //            console.log("** found percent");
            return {err: false, val:s[0]/100, tail:res.tail};
        } else {
            return {err: false, val:s[0], tail: s.slice(1)};
        }
    } else { return {err:"no number",val:null,tail:s}; }
}

/**
 * Interpret probability expressions, which appear after signalling a probability statement in the main arithmetic grammar as a function (see above), or may appear recursively in conditional probability expressions (e.g. after the "given" keyword).
 *
 * grammar (see also the full grammar of arithmetic expressions):
 *
 * ::
 *
 *  pexpression -> pexp | vpargiven      // evaluation only happens here
 *  pexp -> pterm poperation
 *  pterm -> "-" pterm | plogic
 *  plogic -> "(" pterm ")" | vname
 *  poperation -> "&" pexp | "|" pexp | EMPTY
 *  vpargiven -> "(" vpargiven ")" | vgiven
 *  vgiven -> pexp (":" | "given") pexp
 *
 *  Note: evaluation of a probability expression only happens at the "top level" (in pexp or vpargiven).  At this point we call :func:`prob` to evaluate the expression in the context of the user space object that defines the probability variables (and network of dependencies -- i.e. the Bayesnet).  The remainder of the grammar is actually only parsing the probability expresssion.
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {object} U - user space object where variable definitions are stored
 * @return {object} interpreter result object
 */
function pexpression(s,U){
    // console.log("*** pexpression. s= "+s);
    var X=null;
    if(s.length <=0) { return {err:-1, val:null, tail:[]}; }

    // a conditional probability value
    var res=vpargiven(s,null,U);
    if(!res.err || res.err==-1){
    //        console.log("*** return from vgiven. value="+res.val);
        return res;
    }

    // otherwise, a probability logic expression
    res=pexp(s,"");
    if(!res.err || res.err==-1){
        // console.log("*** returned from pexp. res.val="+res.val);
        //X = type(res.val) != "Array" ? [res.val] : res.val;
        X = res.val;
        return {err:false, val:prob(X,U), tail:res.tail};
    }

    // or neither
    //    console.log('*** neither vgiven nor pexp');
    return res;
}

/**
 * Interpret conditional variables in probability expressions, which is really :func:`vgiven` but possibly wrapped in parentheses.
 *
 * grammar (see also the full grammar of probability expressions):
 *
 * ::
 *
 *  vpargiven -> "(" vpargiven ")" | vgiven
 *
 * Note that this mirrors :func:`pargiven` in conditional probability assignments, but is kept separate to avoid unintended cross-overs in the interpretation.
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {*} value - current value in the recursive interpretation of an expression.  May be array or number
 * @param {object} U - user space object where variable definitions are stored
 * @return {object} interpreter result object
 */
function vpargiven(s,value,U){
    // console.log("*** vpargiven");

    // either we have opening parenthesis
    var res = token(s,["("]);
    if(!res.err){
        res = vpargiven(res.tail,value,U);
        if(!res.err){
            value = res.val;
            res=token(res.tail,[")"]);
            if(!res.err){
                res.val=value;
                //console.log("*** found closing parenth. res.value="+res.val);
                return res;
            }
        }
    }

    // ... or vgiven
    //console.log("*** no parenth, so try vgiven. s="+s);
    res=vgiven(s,value,U);
    //console.log("*** got vgiven. res.value="+res.val);
    return res;
}

/**
 * Interpret conditional variables in probability expressions.
 *
 * grammar (see also the full grammar of probability expressions):
 *
 * ::
 *
 *  vgiven -> "(" vpargiven ")" | vgiven
 *
 *  Note that this mirrors :func:`pgiven` in conditional probability assignments, but is kept separate to avoid unintended cross-overs in the interpretation.
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {*} value - current value in the recursive interpretation of an expression.  May be array or number
 * @param {object} U - user space object where variable definitions are stored
 * @return {object} interpreter result object
 */
function vgiven(s,value,U){
    // console.log("*** vgiven. s="+s);
    var pexpval=null;
    // var pval=0.0;

    //logic variable
    // console.log("**** try pexp");
    var res = pexp(s);
    if(!res.err){
        pexpval=res.val;

        // console.log("**** got pexp="+pexpval);
        res=token(res.tail,[":","given"]);
        if(!res.err){
            // console.log("**** got given token");
            res=pexp(res.tail,"");
            if(!res.err || res.err==-1){
                // console.log("**** got given expr. will evaluate [given,"+pexpval+","+res.val+"]");

                value= prob([given,pexpval,res.val],U);
                //        console.log("******    expr="+value);
                return {err:res.err, val:value, tail:res.tail};
            } else {
                return {err:"no expression",val:value,tail:s};
            }
        }
    }

    // otherwise not vgiven
    return res;
}

/**
 * Interpret a non-assignment probability expressions
 *
 * grammar (see also the full grammar of probability expressions):
 *
 * ::
 *
 *  pexp -> pterm poperation
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {*} value - current value in the recursive interpretation of an expression.  May be array or number
 * @return {object} interpreter result object
 */
function pexp(s,value){
    // console.log("*** pexp. s= "+s);

    var res=pterm(s,value);
    if(!res.err || res.err==-1){
        value = res.val;
        res=poperation(res.tail,value);
    }

    return res;
}

/**
 * Interpret probability term
 *
 * grammar (see also the full grammar of probability expressions):
 *
 * ::
 *
 *  pterm -> "-" pterm | plogic
 *
 * Note that this mirrors :func:`pargiven` in conditional probability assignments, but is kept separate to avoid unintended cross-overs in the interpretation.
 *
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {*} value - current value in the recursive interpretation of an expression.  May be array or number
 * @param {object} U - user space object where variable definitions are stored
 * @return {object} interpreter result object
 */
function pterm(s,value){
    //    console.log("*** pterm");
    if(s.length <=0) { return {err:-1, val:value, tail:[]}; }

    // Negated expression
    var res=token(s,["-","not","no"]);
    if(!res.err){
    //      console.log("*** got negation");
        res=pterm(res.tail);

        if(!res.err){
            return {err:false, val:[not,res.val], tail:res.tail};
        } else {
            return {err:"no logic",val:value,tail:s};
        }

    }
    //...or positive expression
    //    console.log("*** got positive expression");
    res=plogic(s,value);

    // otherwise just return
    return res;
}


/**
 * Interpret a logic expression in a probability expression
 *
 * grammar (see also the full grammar of probability expressions):
 *
 * ::
 *
 *  plogic -> "(" pterm ")" | vname
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {*} value - current value in the recursive interpretation of an expression.  May be array or number
 * @return {object} interpreter result object
 */
function plogic(s,value){
    //    console.log("*** plogic");

    // Parenthesised expression
    var res=token(s,["("]);
    if(!res.err){
    //      console.log("*** it's a parenthesised expression");
        res=pexp(res.tail,value);
        if(!res.err){
            value=res.val;
            res=token(res.tail,[")"]);
            if(!res.err){
                return {err:false, val:value, tail:res.tail};
            } else {
                return {err:"no )",val:value,tail:s};
            }
        }
    }

    //...or a variable
    //    console.log("*** no parentheses, try vname")
    res=vname(s);
    if(!res.err){ return res;  }
    return {err:"no var or expression",val:value,tail:s};
}

/**
 * Interpret a logical operation as a sub expression of probability logic
 *
 * grammar (see also the full grammar of probability expressions):
 *
 * ::
 *
 *  poperation -> "&" pexp | "|" pexp | EMPTY
 *
 * @param {array} s - list (array) of tokens to interpret
 * @param {*} value - current value in the recursive interpretation of an expression.  May be array or number
 * @return {object} interpreter result object
 */
function poperation(s,value){
    //    console.log("*** poperation");

    var res=token(s,["&",",","and"]);
    if(!res.err){
    //        console.log("*** it's conjunction. in value="+value);
        res=pexp(res.tail);
        if(!res.err){
            return {err:false, val:[and,value,res.val],tail:res.tail};
        }
    }

    res=token(s,["|","or"]);
    if(!res.err){
    //        console.log("*** it's disjunction");
        res=pexp(res.tail);
        if(!res.err){
            return {err:false, val:[or,value,res.val],tail:res.tail};
        }
    }

    //    console.log("*** empty");
    return {err:false, val:value, tail:s};

}

// DNF MODULE SOURCE included for packaging
// dnf.js -- transform propositional logic into Disjunctive Normal Form and
// calculate probability based on defined probability variables supplied in a
// "Bayesian Network".  The network is interpreted as "noisy OR" -- i.e.
// parents are presumed independent unless explicitly linked in the ancestor
// network.

// constants for logic formula operators.  Use of constants make it easier to change the symbols,
// and make the formulas more readable.
const and="and";
const or="or";
const not="not";
const given="given";
const divide="divide";
const formulas="#";      // special key for formulas in the probability network
const probs="probs";
const vars="vars";


/**
 * Complete the conditional probabilities for any incomplete variable, using the "noisy-or" negation of the product of negations.
 *
 * Outline: First we make a list of every variable in the network for reference, and store that in the object as `vars`. for every variable in the network, check if it is "complete" -- that is, if all logical combinations of its dependencies have been listed, together with their conditional probabilities. For example, if variable Y has a dependency, `[0.5,'X']`, then for completeness it should also have a dependency for its logical opposite, like `[0.2,[not,'X']]`. If the conditions are incomplete, then we collect all the defined conditions and make a list of all the combinations of those conditions, calling each combination a "Factor".  The probability of a factor is the negation (i.e. one minus) of the product of negations of each positive condition in the factor.  This is the so called "noisy or" approach.  For example, if variable `Z` has the conditions `[ [0.2,'X'], [0.8,'Y']]`, then to complete the conditions we first calculate all the factors:
 *
 * .. code-block:: js
 *
 *      [0,[not,'X'],[not,'Y']],    // no positive conditions in this factor, so prob = 0
 *      [0.2,[not,'X'],'Y']         // one positive condition in this factor, so prob = 1-0.8 = 0.2
 *      [0.8,'X',[not,'Y']]         // one positive condition in this factor, so prob = 1-0.2 = 0.8
 *      [0.84,'X','Y']              // two positive conditions, so prob = 1-(1-0.2)*(1-0.8) = 0.84
 *
 * The combinations of factors are identified by the two inner for loops (using `i` and `j`) as the indices.  We cycle through the factors (using `i`) and for each factor cycle through the factors again (using `j`), in order to build the combination `[and,Factor(i),Factor(j)]`.  Note that the factors are arbitrary formulas, so we use :func:`dnf` to standardise the formula.  This may mean that the formulas reduce to `[]`, so we only push the factor if it has content.  The resulting list (`Combos`) is the replacement for the conditional formulas, which are now completed.
 *
 * Whether or not the completed variables were calculated through the noisy-or process, or whether they were predefined, we ensure that all conditional variables are DNF by applying :func:`condnf`. Lastly, we make a simple list of the probabilities in binary count order of the variables in the conditions (we look up the combination in the list of factors, and use the listed probability if the combination matches the factor).  Essentially what this means is that we don't really need the conditions themselves anymore -- we simply simply look up the probability by using the binary count index of the relevant combination of variables. For example, if we're interested in the conditional probability of `[and,'X',[not,'Y']]`, then we get `Z.probs[2]`  because `X,not Y` == `10` in binary, which equals `2` as the index.  We keep the conditional formulas (i.e. factors) in the probability network object for reference.
 *
 * @param {object} Net - the probability variable network. The orginal object (passed by reference) is updated.
 * @return {boolean} - success or failure of completion
 */
function completor(Net){
    if(type(Net)!="Object"){return false;}

    var Factors = [];
    var Combos=[];
    var C=null;
    var Prob;
    var Vs=Object.keys(Net);
    var X=null;
    const Vardef = /^[A-Z]/;

    // Ensure that Net has its variable list
    Net[vars]=[];
    for(var k=0; k<Vs.length; ++k){ if(Vardef.test(Vs[k])){ Net[vars].push(Vs[k]); }  }
    Net[vars] = Net[vars].sort();

    // check that all conditional variables are complete
    for(var v in Net){
        // go through all the variables in Net that have conditional dependency formulas
        if(v!="id" && v!="nonp" && type(Net[v][formulas])!="Undefined"){
            // record all variables that a conditional variable depends on
            Net[v][vars]=getvars(Net[v][formulas]);

            // if the conditions are not complete, then use "noisy-or" to complete them
            if(!orcomplete(v,Net)){
                // console.log("treating "+v);
                // get the factors (i.e. each of the conditional formulas) of variable v
                Factors =[];
                for(var i=0; i<Net[v][formulas].length; ++i){
                    Factors.push(Net[v][formulas][i]);  // we might want to retain the Ps
                }
                // create all combinations of Factors
                if(Factors.length==1){
                    //console.log("1 factor: "+Factors[0]);
                    Net[v][formulas]=[[0,[not,Factors[0][1]]], Factors[0]];
                } else {
                    Combos=[];
                    for(i=0; i<Math.pow(2,Factors.length); ++i){
                        C=[and];
                        Prob = 0;
                        for(var j=0; j<Factors.length; ++j){
                            if(i & Math.pow(2,j)){
                                X = Factors[j][1];
                                C.push(X);
                                Prob += Math.log(1-Factors[j][0]);
                            } else {
                                C.push( [not].concat(Factors[j].slice(1)) );
                            }
                        }
                        C = dnf(C);
                        if(C.length>0){
                            Prob = 1-Math.exp(Prob);
                            Combos.push([Prob,C]);
                        }
                    }
                    Net[v][formulas]=Combos;
                }
            }
            Net[v][formulas]=condnf(v,Net);

            Net[v][probs]=[];
            for(j=0; j<Net[v][formulas].length; ++j){
                Net[v][probs].push(Net[v][formulas][j][0]);  // all we need to keep from the unit conjunctions is their probability (sorted)
            }
        }
    }

    return true;
}

//
/**
 * Transform conditions of conditional variables to DNF
 *
 * We ensure that the conditions of a conditional variable in a probability network are of the simple form of a (disjunctive) list of all combinations of dependent variables. For example, consider the following example:
 *
 * .. code-block:: js
 *
 *   const simple ={id:"simple",nonp:{},
 *                  X:{true:0.2},
 *                  Y:{true:0.8},
 *                  Z:{["#"]:[ [0.8,[and,"X","Y"]], [0.3,[or,[and,"X",[not,"Y"]],[and,[not,"X"],"Y"]]] ]}};
 *
 * Variable `Z` has two conditions, each of which is already DNF.  We're going to cycle through all combinations of the dependent variables of Z (the outer for loop, indexed by `h`) -- so, `[-X,-Y],[-X,Y],[X,-Y]` and `[X,Y]` (in abbreviated notation).  Each combination is initialised with a probability of 0.  The next inner loop (indexed by `k`), cycles through each of the conditional formulas (called Combos).
 *
 * The first of the Combos is `[0.8,[and,"X","Y"]]` of which `[and,"X","Y"]` is the condition itself. The condition does not start with "or" and has all the variables that `Z` depends on, so we skip most of the inner loop, going for a simple comparison against the current variable combination (`h`).  That is, we calculate the index of Combo and compare against `h`.  If there is a match, then we append Combo as the probability and formula for that variable combination.
 *
 *  The next Combo `[0.3,[or,[and,"X",[not,"Y"]],[and,[not,"X"],"Y"]]]` does start with an "or", so we drop into the further inner loops that consider each term of the "or" clause. For each term, we create a possible sublist of terms expanded with missing variables. Then, for the expanded list we compare each term against the current variable combination. If there is a match, we append the subterm (and its probabilty inherited from the orignal Combo) as the probability formula for that variable combination.
 *
 * @param {string} V - variable in the probability network whose conditions we're transforming
 * @param {object} Net  - the probability network
 * @return {array} the transformed list of conditionsl formulas
 */
function condnf(V,Net){
    if(type(Net)!="Object"){return false;}

    var W=null, Y=null, Z=null;
    var Formulas =[];
    var Combos=[];
    var C=[];      // an individual combo


    var Vars = []; // notational convenience: the conditional variables of v
    // ensure that all conditional variables are complete
    Combos= Net[V][formulas];
    Vars=getvars(Net[V][formulas]);
    Formulas = new Array(Math.pow(2,Vars.length));

    for(var h=0; h<Math.pow(2,Vars.length); ++h){
        Y = x2v(h,Vars);
        Formulas[h]=[0,Y];
        //console.log("checking var combination "+h+": ["+Y+"]");
        inner: for(var k=0; k<Combos.length; ++k){
            //console.log("...against combo "+k+": ["+Combos[k][1]+"], with dnf:");
            C = dnf(Combos[k][1]);
            //console.log(C);
            if(typet(C)==or || getvars(C).length < Vars.length){
                C = typet(C)==or? C: [or,C];
                for(var m=1; m < C.length; ++m){
                    //console.log("......against combo term "+m+" ["+C[m]+"]");
                    Z= allvars(C[m],Vars);
                    for(var n=0; n<Z.length; ++n){
                        W = v2x(Z[n],Vars);
                        //console.log(".........against expansion of term: ["+Z[n]+"] == "+W);
                        if(h == W){
                            //console.log(".........match. P="+Combos[k][0]);
                            Formulas[h][0]=Combos[k][0];
                            break inner;
                        }
                    }
                }
            } else {
                W = vars2x(C,Vars);
                //console.log("...index of combo is "+W);
                if(h == W){
                    //console.log(".........match. P="+Combos[k][0]);
                    Formulas[h][0]=Combos[k][0];
                    break inner;
                }
            }
        }
    }
    return Formulas;
}


/**
 * Check if the conditions of a conditional probability are complete, i.e. all logical combinations of variables are specified
 *
 * From my notes of 2018-06-20: My original thought for "or complete" was that a variable that was conditionally defined wouldn't need "noisy-or" treatment (negated sum of negated products of the positive conditional variables) if the disjunctive collection of dependencies "cancelled" each other out.  That is, the the conjunction of dependent clauses would resolve to empty. For example, if Y has two conditions, `[0.9,X],[0.5,-X]` then the conditions of Y are complete, because `[and,X,[not,X]]` resolves to `[]`.  However, that didn't work, because one clause can cancel many other clauses.  For example, if Z is dependent on Y and X, then a clause like `[and,[not,X],[not,Y]]` can cancel all of `[and,X,Y]`, `[and,[not,X],Y]` and `[and,X,[not,Y]]`.

 * So then I thought to do pairwise comparison: that is, a clause can only cancel one other term.  If there are left-over uncancelled terms, then that signals incompleteness.  But that didn't work either, because some terms can be under-specificed.  As the firefox example showed, some conditions can be incomplete.  For example, if the variable `Radar` has the following conditions `[0.3, [and,North,High]]`, `[0.1, [and,North,-High]]`, `[0.05, -North]`.  The last condition is an "incomplete" specification of `[0.05, -North, -High]` and `[0.05, -North, High]`.  When the condition is expanded into the two conditions, the conditional set is complete.

 * This led me to the current version of `orcomplete()`, where I check if any of the conditions overlap -- when expanded with all combinations of possibly missing variables from that condition.  If that is the case, then the conditional set is too general (i.e. underspecified) and needs noisy-or treatment to complete it.
 *
 * @param {string} V - variable for which we're checking "or completeness" of the conditions
 * @param {object} Net  - probability network
 * @return {boolean} returns `true` if the conditions of variable V in Net are complete
 */
function orcomplete(V,Net){
    if(type(Net)!="Object") throw "Unknown variable network";
    var Fs = lookup(V,Net,formulas);
    if(!Fs) { return true; }  // no formulas is treated as "complete"
    var Vars = getvars(Fs);
    var X=null;
    var B = new BitArray(Math.pow(2,Vars.length));
    var complete=true;
    var F=[];
    orcloop: for(var i=0; i<Fs.length; ++i){
        F= allvars(dnf(Fs[i][1]),Vars);
        //console.log("allvars for factor Fs["+i+"]: ["+Fs[i]+"] are: ");
        //print(F);
        for(var j=0; j<F.length; ++j){
            X = vars2x(F[j],Vars);
            //console.log("...F["+j+"]: ["+F[j]+"] with index: "+X);
            if(!B.getbit(X)){
                //console.log("......first encounter. set bit.");
                B.setbit(X);
            } else {
                //console.log("...... seen before. Fs["+i+"] is too general: incomplete");
                complete=false;
                break orcloop;
            }
        }
    }
    return complete;
}



/**
 * Convert logical formula to Disjunctive Normal Form, including resolution of contradictions and removal of duplications.
 *
 * This function is an iterative wrapper around :func:distand, because `distand` won't distribute an "and" generated by :func:distnot. This :func:`dnf` function will iterate until now further changes occur in the formula.
 *
 * @param {array} Formula - logical formula as list (array) in prefix form, with operators "and","or","not",and relation "divide"
 * @param {integer} max - maximum number of iterations to obtain disjunctive normal form
 * @return {array} returns a formula that is the transformation of `Formula` into Disjunctive Normal Form
 */
function dnf(Formula, max=10){
    var X=distand(Formula);
    var Y=null;
    for(var i=0; i<max; ++i){
        Y= distand(X);
        if(!equals(X,Y)){
            X= type(Y)=="Array"? Y.slice(0) : Y;
        } else {
            break;
        }
    }

    if(type(X)=="Array" && Y.length==1 && type(X[0])=="Array"){ X=X[0]; }
    return X;
}

/**
 * Recursively look for places to distribute "and" over "or" in or a simple variable, e.g. "X". Expects list of formulas, but will handle single formula.
 *
 * For example:
 *
 * .. code-block:: js
 *
 *      distand([or,[not,[and,'X',[not,'Y']]],'X',[or,'A','B']])
 *
 *      // result is:
 *
 *      [ [ 'or', 'Y', 'A', 'B' ] ]
 *
 * The parameter `L` is type checked to ensure that it is a list of terms, where a term is either a simple variable or a list (array) consisting of an operator ("and","or","not","given","divide"), followed by any number of arguments (which themselves are terms).  The `for` loop of the code processes each term, taking different actions depending on the type of the term.  Two types get special attention: "not" and "and".  The "not" term is passed into the :func:`distnot` function, which pushes negations inwards until they next to a simple variable.  For example, `[not,[and,"X","Y"]]` is transformed to `[or,[not,"X"],[not,"Y"]]`.
 *
 * Processing the "and" term is the main game.  For the "and" term, we first separate all "or" subterms from non-"or" subterms.  This is achieved with the :func:`orsfirst` function. Next, if there were less than two or-subterms, we reconstruct the "and" term. If there were 2 or more or-subterms, we generate all combinations of the or-subterm arguments with :func:`combos`.  Each of these combinations (with the non-or subterms appended) are the new "and" terms. For example,
 *
 * .. code-block:: js
 *
 *      distand([and, [or,"A","B"],[or,"C","D"],"X","Y"])
 *
 *      // results in:
 *
 *      [ [ 'or',
 *         [ 'and', 'A', 'C', 'X', 'Y' ],
 *         [ 'and', 'A', 'D', 'X', 'Y' ],
 *         [ 'and', 'B', 'C', 'X', 'Y' ],
 *         [ 'and', 'B', 'D', 'X', 'Y' ] ] ]
 *
 * Note that along the way, we also remove contradictory "and" clauses and omit duplicate subterms within "or" term.
 *
 * @param {array} L - list of formulas
 * @param {string} curop - the "current operator" if :func:`distand` was recursively called from within processing another "or" or "and"
 * @return {array} returns a formula that is one transformation further towards Disjunctive Normal Form (DNF)
 */
function distand(L,curop=null){
    if(type(L) != "Array" || type(L[0])=="undefined" ){ return L; } // not a list, so return unchanged
    if([and,or].includes(typet(L)) && curop==L[0]){  return distand(L.slice(1),curop); }
    if([and,or,not,given].includes(typet(L))){ return distand([L]); }
    var Res=[], Res1=[];
    var Others=[];
    var X=null, Y=null, Z=null, V=null;
    var h=null, i=null, j=null;
    var dup = false, contra=false;

    // process all terms
    for(i=0; i<L.length; ++i){
        if( ["Variable","String"].includes(typet(L[i])) ){     // primitives, so just append
            Res.push(L[i]);
        } else if(typet(L[i])==not){
            if(typet(L[i][1])!="Variable"){
                X = distnot(L[i],curop);
                if(curop == typet(X)){
                    Res = Res.concat(X.slice(1));
                } else if(typet(X)!="Undefined"){ Res.push(X); }
            } else { Res.push(L[i]); }
        } else if( typet(L[i])==or  ){                               // search further in "or" subterms
            //console.log("or term: ["+L[i]+"]");
            X = distand(L[i].slice(1),or);
            //console.log("   ...after distand of or slice: ["+X+"]");
            // remove duplications
            Res1=[];
            for(h=0; h<X.length; ++h){
                dup = false;
                for(j=0; j<Res1.length; ++j){
                    //console.log("   against "+Res1[j]);
                    if(equals(X[h],Res1[j])){ dup=true; break; }
                    if(equals(X[h],distnot([not,Res1[j]]))){ dup=true; Res1.splice(j,1); break;}
                }
                if(!dup){ Res1.push(X[h]); }
            }
            //console.log("   Res1 after dup removal: ["+Res1+"]");
            if(Res1.length>1){
                if(curop==or){ Res=Res.concat(Res1); }
                else { Res.push([or].concat(Res1)); }
            } else if(Res1.length==1){Res=Res.concat(Res1); }
            //console.log("Res is now: ");
            //console.log(Res);
        } else if( typet(L[i])==given ){                              // change "given" into "divide" and search
            X = distand([and,L[i][1],L[i][2]]);
            Y = distand(L[i][2]);
            if(curop==and && X.length>0){
                // check that X isn't cancelled by other "and" terms. e.g. F=[and,[not,'X'],[given,'X','Y']]
                Others = L.slice(0,i).concat(L.slice(i+1));
                contra=false;
                for(var k=0;k<Others.length; ++k){
                    Z= distand([and,Others[k],X[0]]);
                    if(Z.length==0){ contra=true; break;}
                }
                if(contra){ Res=[]; break;}
            }
            if(X.length>0){
                Res.push([divide,X[0], typet(Y)=="Variable"? Y: Y[0] ]);
            } else if (X.length==0 && Y.length==0){
                Res.push( [divide,[],[]] );
            } else if(curop==and){ Res=[]; break; }                 // resolution rule: []/Y => []
        } else if( typet(L[i])==divide){                              // search further in "divide" subterms
            X = distand(L[i][1]);
            Y = distand(L[i][2]);
            if(X.length>0){
                Res.push([divide,X[0], typet(Y)=="Variable"? Y: Y[0] ]);
            } else if (X.length==0 && Y.length==0){
                Res.push( [divide,[],[]] );
            }
        } else if( typet(L[i])==and){                                  // a possible "and" term to distribute
            Z = orsfirst(L[i].slice(1));  // split subterms into "or" terms and others

            X = distand(Z.rest,and);
            for(j=0;j<X.length;++j){
                // extract ors from rest resulting from distand
                if(typet(X[j])==or){
                    Z.ors.push(X[j]);
                    X.splice(j,1);
                }
            }

            // remove duplications and contradictions in the non-or terms
            //console.log("rest term: ");
            //console.log(X);
            Y=[];
            for(h=0; h<X.length; ++h){
                dup = false;
                contra =false;
                for(j=0; j<Y.length; ++j){
                    if(equals(X[h],Y[j])){ dup=true; break; }
                    if(equals(X[h],distnot([not,Y[j]]))){ contra=true; Y=[]; break;}
                }
                if(contra){ break;}
                if(!dup){ Y.push(X[h]); }
            }

            // try or-distribution, incl. over rest of terms (Y)
            if(Z.ors.length== 0){         // no or-terms, just use the rest
                Res1=Y;
                if(contra && curop==and){Res=[]; break; }
            } else if(Z.ors.length == 1){ // a single or-term. Flip "and" and "or" and search the subterms
                Res1=[];
                for(j=1; j<Z.ors[0].length; ++j){
                    Res1.push( [and, Z.ors[0][j]].concat(Y) );
                }
                //console.log("  Redistributed or term:");
                //console.log(Res1);
                V=distand(Res1,or);
                if(V.length>1){
                    Res1= [[or].concat( V )];
                } else if(V.length==1){ Res1=V; }
                //console.log("  distand over resdistrib or term:");
                //console.log(Res1);
            } else {                        // the main game: multiple or-terms to distribute the and over
                X = combos([and].concat(Z.ors));
                //console.log("Combos: ");
                //console.log(X);
                Res1=[];
                for(j=1; j<X.length; ++j){
                    if(typet(X[j])==and){
                        Res1.push(X[j].concat(Y));
                    } else { Res1.push([and,X[j]].concat(Y)); }
                }

                V=distand(Res1,or);
                if(V.length>1){
                    Res1= [[or].concat( V )];
                } else if(V.length==1){ Res1=V; }
            }
            if(Res1.length>1){
                if(curop==and){ Res= Res.concat(Res1); }
                else { Res.push([and].concat(Res1)); }
            } else if(Res1.length==1){Res=Res.concat(Res1);
            } else if(curop==and){ Res=[]; }

            //console.log("Res to return: ");
            //console.log(Res);

        } else { throw "illegal term type  in formula: " + L[i]; }
    }

    return Res;
}

/**
 * recursively look for "not" in a formula, and distribute "not" over "and" or "or" expects a single Formula, but can handle singular nesting of the formula. Returns Formulas unchanged if not distribution is possible.
 *
 * @param {array} F - a single formula, like `[not,[or,"X","Y"]]`
 * @return {array} returns a formula in Negation Normal Form, i.e. where all "not" terms have been pushed inwards until they are next to simple variables
 */
function distnot(F){
    if(type(F) != "Array"){return F; }
    if(F.length==1 && type(F[0])=="Array"){ return distnot(F[0]); }
    var Res = [];
    if(F[0] == not){
        if( type(F[1]) == "Array" && F[1].length >2 && (F[1][0]==or || F[1][0] == and) ){
            Res = F[1][0]==or ? [and] : [or];
            for(var i=1; i<F[1].length; ++i){
                Res.push(distnot([not,F[1][i]]));
            }
        } else if( type(F[1]) == "Array" && F[1].length == 2 & F[1][0] == not){
            Res = F[1][1];
        } else {
            Res = F;
        }
    } else if(F[0]==or || F[0]==and){
        var Res1=[F[0]];
        for( i=1; i<F.length; ++i){
            Res1.push(distnot(F[i]));
        }
        Res= Res.concat(Res1);
    } else {
        Res = F;
    }
    return Res;
}


/**
 * Move all non-or clauses to the end of the formula.
 *
 * @param {array} F - logical formula like `[and,"X","Y",[or,"A","B"]]`
 * @return {object} returns an object where "ors" is a list of all or-terms, and "rest" is a list of the remaining terms
 */
function orsfirst(F){
    var Ors = [];
    var Rest = [];

    for(var i=0; i<F.length; ++i){
        if( F[i]!=null && F[i][0]==or ){ Ors.push(F[i]); }
        else { Rest.push(F[i]); }
    }
    return {"ors":Ors,"rest":Rest};
}

/**
 * Lookup value of a variable, or of a conditional.  For example, `lookup('Rain',wg)` or `lookup([given,'Sprinkler',[not,'Rain']],wg)`
 *
 * When looking up a single variable, the function simple uses the variable name as a key into the `Net` object.  When looking up a conditional formula, it uses the dependent variable as a key, and then linearly looks through the conditional formulas.
 *
 * @param {array} F - string of "Variable" type, or
 * @param {object} Net - probability network
 * @param {*} val - particular value to look for: `true`, `formulas`, or `logic`. The latter reconstructs formulas into a single disjunctive formula.
 *
 * Todo: :func:`lookup` should also be able to lookup negations of variables i.e. `lookup([not,'Rain'],wg)`
 */
function lookup(F,Net,val=true){
    if(type(Net) != "Object"){ return false; }
    var res = false;

    if(type(F)=="String" && (F in Net)){
        if(val in Net[F]){ res = Net[F][val]; }
        else if( val==false && val!=formulas && true in Net[F]){ res = 1 - Net[F][true]; }
        else if( (val==true || val=="logic") && !(val in Net[F]) && formulas in Net[F] ){
            //console.log("lookin for formulas...");
            if(formulas in Net[F]){
                res = [];
                for(var i=0; i<Net[F][formulas].length; ++i){
                    res.push([given,F,Net[F][formulas][i][1]]);
                }
                res = res.length>1? [or].concat(res) : res[0];
            } else {
                res = [or,F,[not,F]];
            }
        }
    } else if(type(F) == "Array" && F.length > 2 && F[0] == given){
        if( F[1] in Net && formulas in Net[F[1]]){
            for(var f=0; f<Net[F[1]][formulas].length; ++f){
                if(equals(Net[F[1]][formulas][f][1],F[2])){
                    res = Net[F[1]][formulas][f][0];
                    break;
                }
            }
        }
    }
    return res;
}

/**
 * Generate all maximally sized combinations of a formula with sub-junctions and switch functors.  In other words, distribute "or" over "and" or vice versa.
 * For example, `combos([and,[or,A,B],[or,C,D],[or,E,F]])` results in `[or,[and,A,C,E],[and,A,C,F],[and,A,D,E],[and,A,D,F],[and,B,C,E],[and,B,C,F],[and,B,D,E],[and,B,D,F]]`
 *
 * @param {array} List - logic formula, especially one with "or" or "and" subterms.
 * @return {array} returns logic formula where disjunctive or conjunctive subterms have been recombined
 */
function combos(List){
    if(type(List)=="Array"){
        if(List.length==1){
            if([and,or].includes(typet(List[0]))){ return combos(List[0]); }
            else { return List; }
        }
    }
    var Res = List;
    if([and,or].includes(List[0]) && List.length > 2 && [and,or].includes(typet(List[1])) &&  List[1].length > 1){
        Res = [ List[0]==or ? and : or ];
        var op = List[0];
        var C = combos0(List.slice(2));
        for(var i=1; i<List[1].length; ++i){
            for(var j=0; j<C.length; ++j){
                if([given,not,divide].includes(typet(C[j]))){
                    Res.push( [op,List[1][i],C[j]] );
                } else {
                    Res.push( [op,List[1][i]].concat(C[j]) ) ;
                }
            }
        }
    }
    return Res;
}

/**
 * Core recursive function for :func:`combos`
 *
 * @param {array} List - logic formula, especially one with "or" or "and" subterms.
 * @return {array} returns logic formula where disjunctive or conjunctive subterms have been recombined
 */
function combos0(List){
    if(type(List)!="Array" || typet(List[0])=="Undefined"){ return List; }
    if(List.length==1 && [and,or].includes(typet(List[0]))){ return List[0].slice(1); }

    var Res = [];
    var C = combos0(List.slice(1));
    var j= 0;

    if(type(List[0])!="Array" || [given,not,divide].includes(typet(List[0]))){ // exception terms
        for(j=0; j<C.length; ++j){
            if([given,not,divide].includes(typet(C[j]))){
                Res.push( [List[0],C[j]]);
            } else {
                Res.push( [List[0]].concat( C[j] ));
            }
        }
    } else {  // this is the real core: how to recursively combine
        for(var i=1; i<List[0].length; ++i){
            for(j=0; j<C.length; ++j){
                if([given,not,divide].includes(typet(C[j]))){
                    Res.push( [List[0][i],C[j]]);
                } else {
                    Res.push( [List[0][i]].concat( C[j] ));
                }
            }
        }
    }
    return Res;
}

/**
 * Check if a term has a particular value (which may be another term). Expects a Negation Normal Form (NNF) list of terms,  NOT A FORMULA, because it needs to examine the term type to decide how to handle the search. The parameter "cond" controls if conditional terms need to be searched in general, for disjunctive lists, don't search the conditionals, but for conjunctive lists, do.
 *
 * @param {*} X - string of type "Variable" or term
 * @param {array} V  - term to search in
 * @param {boolean} cond  - boolean to control whether to search within conditional terms
 * @return {boolean} returns true if V contains X.
 */
function has(X,V,cond=false){
    var T=null;
    var h=null;
    if( type(X) != "Array"){ return false; }
    //console.log("\ndoes the following list have ( "+V+" ) if tail consideration is "+cond);
    //console.log(X);
    for(var i=0; i<X.length; ++i){
        T = typet(X[i]);
        //console.log("...typet of term "+i+" is "+T);
        //console.log("check if term ( "+X[i]+" ) equals ( "+V+" )");
        if( equals(X[i],V)){
            //console.log("...found an equal term for ("+V+" )");
            return {pos:i,type:null};
        } else if(T==or || T==and ){
            //console.log("...not equal. Checking inside an 'or','and' term");
            h=has(X[i].slice(1),V,cond);
            if(h){
                //console.log("...back from and/or subterm: success, it was in there");
                return {pos:i,type:h.type};
            }
            //console.log("...back from and/or subterm: not in there.");
        } else if( cond && (T==given || T==divide || (T==not && (typet(X[i][1])==given || typet(X[i][1])==divide)) )){
            //console.log("...checking inside a given,divide or [not,given/divide] term");
            var Given = T==not? X[i][1] : X[i];
            //console.log("...the Given term: "+Given);
            T = typet(Given);
            var Depvartail = (T==given || T==divide) ? [Given[1],Given[2]] : [Given[1][1],Given[1][2]];
            var Depvar = Depvartail[0];
            var Tail = Depvartail[1];
            //console.log("...compare search term ("+V+") against the dependent Var: "+Depvar);
            if(equals(Depvar,V)){ return {pos:i,type:null}; }
            else{
                //console.log("...Not equal to dep var. Look in given/divide tail: "+Tail);
                //tail = dnf(tail[1])[0];
                //console.log("   ...dnf of tail is: "+tail);
                if(Tail[0]==and || Tail[0]==or){
                    //console.log("   ...tail is and/or. Do tail terms ("+Tail.slice(1)+") contain search term ("+V+") ?");
                    if(has(Tail.slice(1),V,cond)){ return {pos:i,type:Tail[0]}; }
                } else {
                    //console.log("   ...tail is not and/or. Is it equal to search term ("+V+")?");
                    //if(equals(Tail,dnf(V)[0])){ return {pos:i,type:null}; }
                    if(equals(Tail,V)){ return {pos:i,type:null}; }
                }
            }
        }
    }
    return false;
}


// compare two lists, unordered except for [0] or "given", or objects recursively down to strings or numbers
/**
 * Compare two formulas (arrays), unordered except for the first element (i.e. the operator in formulas) or where the formula is a conditional. The :func:`equals` function will also compare objects.
 *
 * @param {array} X - first formula to compare with...
 * @param {array} Y - ...second formula
 * @return {boolean} - `true` if X equals Y, otherwise `false`
 */
function equals(X,Y){
    //console.log("     *** comparing ( "+X+" ) with ( "+Y+" )");
    //console.log("\n\nComparing the following: ");
    //console.log(X);
    //console.log("----- with ----");
    //console.log(Y);
    //console.log("---------------");
    var len=0;          // temp var for length
    var typeX = type(X);
    var A = [];
    var B = [];
    //console.log("   compare types...");
    if(typeX != type(Y)){ return false; }
    if(typeX == "String" || typeX == "Number"){
        //console.log("   strings..");
        return X==Y;
    } else if (typeX == "Array"){
        len = X.length;
        if(len != Y.length){ return false; }

        //console.log("   zero length...");
        if(len < 1){ return true; }

        //console.log("   element 0...");
        // The first element is a special case, because it's positionally bound
        if(len==1){ return equals(X[0],Y[0]); }
        if(!equals(X[0],Y[0])){ return false; }

        // If the first element was "given" or "divide", then the second
        // element is also positionally bound
        if(X[0]==given || X[0]==divide){
            if(!equals(X[1],Y[1])){ return false; }
            A = type(X[2])=="Array"? X[2]: [X[2]];
            B = type(Y[2])=="Array"? Y[2]: [Y[2]];
            len = A.length;
            if(len != B.length){return false; }
        } else {
            A = X.slice(1);
            B = Y.slice(1);
            len = A.length;
        }
        //console.log("   ...remaining elements...");
        for(var i=0; i<len; ++i){
            if( !has(A,B[i]) ){ return false; }
        }
        //console.log("   ............");
        return true;
    } else if(typeX == "Object"){
        len = Object.keys(X).length;
        if(len != Object.keys(Y).length){ return false; }
        for(var k in X){
            if(!(k in Y) || !equals(X[k],Y[k])){ return false; }
        }
        return true;
    } else { return false; }
}

/**
 * Determine the type of a term in a formula
 *
 * @param {*} T - string of type "Variable" or term (i.e. array where first element is an operator)
 * @return {string} the term type of T
 */
function typet(T){
    var Termtype = type(T);
    var Vardef = /^[A-Z]/;     // variables have to start with a uppercase letter
    if( type(T) == "Array" && T.length > 0) { Termtype = T[0]; }
    else if( type(T) == "String" && T.length > 0){
        var C = T[0];
        if( Vardef.test(C) ){ Termtype = "Variable"; }
    }
    return Termtype;
}

// genertic js type function
/**
 * Determine the javascript type of the value of X
 *
 * @param {*} X - any valid js type
 * @return {string} type of X
 */
function type(X){ return Object.prototype.toString.call(X).slice(8,-1); }


// PROBABILITY CALCULATION SECTION

/**
 * Process a DNF probability formula and calculate the resulting numerical probability
 *
 * @param {array} Formula - a DNF formula
 * @param {object} Net  - a probability network object
 * @return {real} - probability
 *
 * Note 1: expects that rules for conditional transformations (i.e. "given" to "divide") is handled by DNF processing -- so, no divides-by-zero
 */
function prob(Formula,Net){
    var F=dnf(Formula);
    if([and,not,"Variable"].includes(typet(F))){
        return jprobs([or,F],Net);
    } else if(typet(F)==divide){
        if(F[1].length==0 && F[2].length==0){ return 1; }
        else{
            var X = prob(F[1],Net);
            var Y = prob(F[2],Net);
            return X/Y;
        }
    } else if(typet(F)==or){
        return jprobs(F,Net);
    } else throw "no DNF formula: can not calculate probability";
}

/**
 * calculate the probabilities of a (disjunctive) list of conjunctions. Expects a disjunction (DNF).
 *
 * The simplest case is something like `[or, [and,[not,'X'],[not,'Y']], [and,[not,'X'],'Y'], [and,'X',[not,'Y']], [and,'X','Y'] ]`. Here we convert every conjunction to its index value, based on whether a variable is true in the term. So, for the terms in the example, the binary values would be 00,01,10,11, respectively -- meaning index values of 0,1,2,3. We then look up the probability associated with that index (i.e. with that combination of variables) in the probability network.
 *
 * Two complications need to be handled.  One is missing variables.  For example, if we encounter a term `X` by itself, then we might need to expand that to `[or,[and,'X',[not,'Y']],[and,'X','Y']]`, depending on which variables are present in the probability network. This expansion is handled by the function :func:`allvars`. When this happens, we have to process each expanded term separately, which is handled in the inner `for` loop.
 *
 * The second complication is that, if we expand terms, we have to avoid processing duplicates.  This is handled by marking each term that we've already encountered in a bitmap and skipping over terms whose bit is already set.
 *
 * @param {array} F - disjunction formula
 * @param {object} Net - probability network
 * @return {real} - probability
 */
function jprobs(F,Net){
    if(type(Net)!="Object") throw "no probability network";
    var Varlist = Net.vars;
    if(type(Varlist)=="Undefined") throw "no variables given in the probability network "+Net.id;
    if([and,not].includes(typet(F))){ F = [F]; }
    else if(typet(F)==or){ F=F.slice(1); }
    else throw "formula not DNF";
    var B= new BitArray(Math.pow(2,Net.vars.length));

    var L=[];
    var X=null;
    var P=null;
    //var Ps=[];
    var Ps=0;
    for(var i=0; i<F.length; ++i){
        L = allvars( typet(F[i][0])=="Variable" || typet(F[i])==not ? F[i]: F[i].slice(1) ,Varlist);
        //L = allvars( typet(F[i][0])=="Variable"? F[i]: F[i].slice(1) ,Varlist);
        for(var j=0; j<L.length; ++j){
            X=vars2x(L[j],Varlist);
            if(!B.getbit(X)){
                B.setbit(X);
                P=product(jprob(L[j],Net));
                //Ps.push(P);       // for debugging: see the list of probabilities
                Ps += P;
            }
        }
    }
    B=null; // release memory
    return Ps;
}

/**
 * Lookup the joint probability of a conjunction of simple terms.
 *
 * @param {array} Vars - a conjunction of variables or negations of variables
 * @param {object} Net - a probability network
 * @return {real}  returns the probability of the conjunction
 */
function jprob(Vars, Net){
    if(type(Net)!="Object") throw "no probability network";
    if(type(Vars)!="Array"){ return jprob([Vars],Net); }
    var Ps=[];
    var P=null;
    var X=null, Y=null;
    var Vs=[];
    var Varlist = Net.vars;
    var neg = false;
    var V=null;
    if(type(Varlist)=="Undefined") throw "no variables listed in probability network "+Net;
    for(var i=0; i<Vars.length; ++i){
        neg=false;
        if(typet(Vars[i])==not){
            neg=true;
            V=Vars[i][1];
        } else { V=Vars[i]; }
        if(typet(V)=="Variable"){
            P = lookup(V,Net);
            if(!P) throw "unknown variable in formula: "+V;
            if(type(P)=="Number"){ Ps.push( neg? 1-P : P); }
            else{
                Vs=Net[V].vars;
                if(type(Vs)=="Undefined") throw "probability network incomplete in variable "+ Vars[i];
                X = v2x(Vars);          // get the index value of the variable combination
                Y = x2x(X,Vs,Varlist);  // transform to an index value relative to all possible variables
                P = Net[V].probs[Y];    // lookup the probability of that index in the probability network
                if(type(P)=="Undefined") throw "probability undefined for "+Vars[i];
                Ps.push( neg? 1-P : P);
            }
        } else throw "term should only have variables or their negations";
    }
    return Ps;
}

//
//
//
/**
 * Expand a variable combination in a formula to include all combinations when some possible variables are missing. Expects L to be a conjunction of variables or their negations.
 * For example, `allvars(['X'],['X','Y'])` will return `[[X,[not,'Y']],['X','Y']]`
 *
 * @param {array} L - list of variables or negations of variables
 * @param {array} Vars - list of possible variables
 * @return {array} returns an expanded list of terms if any variables were missing from the original
 */
function allvars(L,Vars){
    var F = typet(L)=="Variable" || typet(L)==not? [L] : L;
    var Missing =[];
    var Res = [];
    var Vs = getvars(F);
    for(var i=0; i<Vars.length; ++i){
        if(!(Vs.includes(Vars[i]))){ Missing.push(Vars[i]); }
    }
    Missing = bcombos(Missing);
    for(i=0;i<Missing.length;++i){
        Res.push(F.concat(Missing[i]));
    }
    return Res;
}

/**
 * Extract all variables from a list
 *
 * @param {array} L - formula or list. Variables are defined as alphanumeric strings that start with an uppercase letter.
 */
function getvars(L){
    var Res = {};  // used to avoid duplicates
    var Vs=getvars0(L,Res);
    Res =null;
    return Vs;
}

/**
 * Recursive subfunction to extract all variables from a list
 *
 * @param {array} L - formula or list. Variables are defined as alphanumeric strings that start with an uppercase letter.
 * @param {array} Res - already collected variables
 */
function getvars0(L,Res){
    if(typet(L)=="Variable"){return [L]; }
    if(type(L)!="Array"){return []; }
    var Vs = [];
    for(var i=0;i<L.length;++i){
        if(typet(L[i])=="Variable"){
            Res[L[i]]=null;
        } else if([not,and,or].includes(typet(L[i]))){
            Vs = getvars0(L[i],Res);
            for(var j=0;j<Vs.length;++j){ Res[Vs[j]]=null; }
        } else if(typet(L[i])==given){
            Res[L[i][1]]=null;
            Vs = getvars0(L[i][2],Res);
            for(j=0;j<Vs.length;++j){ Res[Vs[j]]=null; }
        } else if(typet(L[i])==divide){
            Vs = getvars0(L[i][1],Res);
            for(j=0;j<Vs.length;++j){ Res[Vs[j]]=null; }
            Vs = getvars0(L[i][2],Res);
            for(j=0;j<Vs.length;++j){ Res[Vs[j]]=null; }
        } else if(type(L[i])=="Array"){
            Vs = Vs.concat( getvars0(L[i],Res));
        }
    }
    return Object.keys(Res).sort();
}

/**
 * All positive and negative combinations of a list of variables, e.g. [X,Y] becomes [ [[not,X],[not,Y]], [[not,X],Y], [X,[not,Y]], [X,Y] ]
 *
 * @param {array} L - list of variables
 * @return {array} returns all positive and negative combinations of a list of variables
 */
function bcombos(L){
    var Res=[];
    var C =[];
    for(var i=0, Len=Math.pow(2,L.length); i<Len; ++i){  // calc Len only once
        C=[];
        for(var j=0;j<L.length;++j){
            C.push(i & Math.pow(2,j)? L[j] : [not,L[j]]);
        }
        Res.push(C);
    }
    return Res;
}

/**
 * Translate an index of a binary-count ordered list into the boolean combination of variables.  For example, if the alphabetically sorted variable list is X,Y then [not,X],[not,Y] = 0, [not,X],Y = 1, X,[not,Y]=2 and X,Y=3.
 *
 * @param {integer} X - index for binary-count ordered list of variable combinations
 * @param {array} Vs - list of strings of type "Variable"
 * @return {array} returns the boolean combination of variables that represents the index value
 */
function x2v(X, Vs){
    var Varlist=Vs.sort();
    var Res=[and];
    var Y = X % Math.pow(2,Varlist.length);
    var maxbits = Varlist.length-1;
    for(var i=0; i<Varlist.length; ++i){
        Res.push(  Y & Math.pow(2,maxbits-i) ? Varlist[i] : [not,Varlist[i]] );
    }
    return Res.length<3? Res.length<2? [] : Res[1] : Res;
}

/**
 * Convert an index that represents the combination of boolean variables (from the variables list Vs) into a list of variable combinations from the list Varlist.
 *
 * The idea here is that Vs is a subset of Varlist, so that the index of the sublist might match more than one combination of variables in Varlist.  For example, if Vs=[X,Y] and Varlist=[X,Y,Z], then the index value of 2 represents [[not,X],Y] in the combinations from Vs.  However, that expands into [ [[not,X],Y,[not,Z]], [[not,X],Y,Z] ] relative to the larger set of variables in Varlist.
 *
 * @param {integer} X - index for a binary-count ordered list of variable combinations
 * @param {array} Vs - list of strings of type "Variable"
 * @param {array} Varlist - complete list of available strings of type "Variable"
 * @return {array} returns the boolean combination of variables that represents the index
 */
function x2vsub(X, Vs, Varlist){
    var Res=[and];
    var Y = X % Math.pow(2,Varlist.length);
    var maxbits = Varlist.length-1;
    for(var i=0; i<Varlist.length; ++i){
        if(Vs.indexOf(Varlist[i])>-1){
            Res.push(  Y & Math.pow(2,maxbits-i) ? Varlist[i] : [not,Varlist[i]] );
        }
    }
    return Res;
}


/**
 * Convert a term list (i.e. list of variables or their negations) to a binary count order index. For example, [not,X],[not,Y] = 0, [not,X],Y = 1, X,[not,Y]=2 and X,Y=3
 *
 * First we extract all variables from the list, which we then use to get the index of the particular combination.
 *
 * @param {array} Terms - list of variables or negations of variables
 * @return {integer} returns the index value of the given boolean combination of variables
 */
function v2x(Terms){
    var Vs = getvars(Terms);  // sorted list of variables
    return vars2x(Terms,Vs);
}

/**
 * Convert a term list (i.e. list of variables or their negations) to a binary count order index, based on a list of variables. For example, for the variable list [X,Y], we have the following indices for boolean combinations of the variables: [not,X],[not,Y] = 0, [not,X],Y = 1, X,[not,Y]=2 and X,Y=3
 *
 * First we extract all variables from the list, which we then use to get the index of the particular combination.
 *
 * @param {array} T - the given boolean combination variables or negations of variables
 * @param {array} Vs - the list of possible variables
 * @return {integer} returns the index value of the given boolean combination of variables
 */
function vars2x(T,Vs){
    var Terms = typet(T)=="Variable" || typet(T)==not ? [T] : T;
    var Res = 0;
    var maxbits = Vs.length-1;
    for(var j=0; j<Terms.length; ++j){
        if(typet(Terms[j])=="Variable") {
            Res |= Math.pow(2,maxbits-Vs.indexOf(Terms[j]));
        }
    }
    return Res;
}

/**
 * Convert index of boolean combination of variables from a (sub)list into the indices for a (super)set of variables. See also :func:`x2vsub`
 *
 * @param {integer} X - index representing a boolean combination of variables
 * @param {array} Vs - list of variables used in X
 * @param {array} Varlist - (larger) list of available variables
 * @return {ingeger} -
 */
function x2x(X,Vs,Varlist){
    return v2x(x2vsub(X,Vs,Varlist));
}

/**
 * Multiply probabilities in a list using log transformation
 *
 * @param {array} L - list of real values (0 <= x <=1) i.e. probabilities
 * @return {real} returns the product of the values in the list
 */
function product(L){
    var Sum=0;
    for(var i=0; i<L.length; ++i){ Sum += Math.log(L[i]); }
    return Math.exp(Sum);
}

// small version of BitArrays
// object constructor for BitArray
/**
 * Simple BitArray implementation
 *
 * Methods: `zero` to zero out all bits, `setbit` to set a bit, `getbit` to get the value of a bit, `unsetbit` to set a bit to zero, `getones` to get a list of indices of all the bits that are set to `true`, `bitsum` to get the total number of bits that are set to one.
 *
 * @param {integer} totalbits - total number of bits that the BitArray should cover -- i.e. the minimum size of the bitarray in bits. The actual size is sometimes larger, because the array is implemented in 8-bit increments (bytes).
 */
function BitArray(totalbits) {
    this.className = "BitArray";
    this.cells = Math.ceil(totalbits / 8);
    this.bits = this.cells * 8;
    this.val = new Uint8Array(this.cells);
    const ipow = [128, 64, 32, 16, 8, 4, 2, 1]; // alt for Math.pow(2,7-i)

    // initialise buffer bits to zero
    this.zero = function () {
        for (var i = 0; i<this.cells; ++i) {
            this.val[i] = 0;
        }
        return 0;
    };

    // set a particular bit
    this.setbit = function (index) {
        var i = index / 8 >> 0; // index div 8
        if (index < this.bits && i <= this.cells) {
            this.val[i] = this.val[i] | ipow[index % 8];
            return (true);
        } else return (false);
    };

    // unset a particular bit
    this.unsetbit = function (index) {
        var i = index / 8 >> 0; // index div 8
        if (index < this.bits && i <= this.cells) {
            this.val[i] &= ~ipow[index % 8];
            return (true);
        } else return (false);
    };

    // get value of a particular bit
    this.getbit = function (index) {
        var i = index / 8 >> 0; // index div 8
        if (index < this.bits && i <= this.cells) {
            return ((this.val[i] & ipow[index % 8]) != 0);
        } else return (false);
    };

    // get indices for all the set bits
    this.getones = function(){
        var ret = [];
        for(var i=0; i<this.bits; ++i){
            if(this.getbit(i)) ret.push(i);
        }
        return ret;
    };

    // sum up number of bits that are set
    this.bitsum = function () {
        var sum = 0;
        for (var i = 0, len = this.cells; i < len; ++i) {
            var n = this.val[i];
            for (var b = 0, l = 8; b < l; ++b) {
                sum = sum + ((n & ipow[b]) != 0);
            }
        }
        return (sum);
    };

}



export default {calcvars, highlight, resetcode, pcalc, tickconvert, sortfs, Dlist: () => Dlist};

