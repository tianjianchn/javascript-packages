(function(){
'use strict';

var Fiber = require('fibers');
require('./ext-domain');
var domain = require('domain');
var EventEmitter = require('events').EventEmitter;

function processFatal(err){
  if((process.listenerCount && process.listenerCount('uncaughtException')>0)
    || EventEmitter.listenerCount(process, 'uncaughtException')>0){
    process.emit('uncaughtException', err);
  }
  else{
    /*eslint-disable no-console*/
    console.log('process crashed by nbs error: ', err.stack);
    throw err;
    /*eslint-enable no-console*/
  }
}

var defConf = {
  onError: processFatal,
  onSubError: null
};
var conf = {};
for(var k in defConf){
  conf[k] = defConf[k];
}

function isPlainObject(obj) {
  return typeof obj == 'object' && Object.getPrototypeOf(obj) === Object.prototype;
}

var nbs = module.exports = {};

//global conf
nbs.config = function(options){
  if(!options || !isPlainObject(options)) return conf;
  for(var k in options){
    var v = options[k];
    if(k==='onError' && typeof v !== 'function') continue;
    if(k==='onSubError' && (v && typeof v !== 'function')) continue;
    conf[k] = v;
  }
  return conf;
};

nbs.resetConfig = function(){
  for(var k in defConf){
    conf[k] = defConf[k];
  }
  return conf;
};


function run(func, onError, onSubError){
  if(Fiber.current){//already in a fiber stack
    return func();
  }

  var dm = domain.create();
  
  onError = null, onSubError = null;

  var len = arguments.length;
  for(var i=1; i<len; ++i){
    var arg = arguments[i];
    if(typeof arg !== 'function'){
      dm.add(arg);
      continue;
    }

    onError = arg;
    if(i<len-1 && typeof arguments[i+1] === 'function') onSubError = arguments[i+1];
    break;
  }

  onError = onError || conf.onError;
  onSubError = onSubError || conf.onSubError;

  dm.on('error', function(err){
    // console.log('domain error', err.stack);

    //exit the domain
    //dm.remove(members); //don't remove the members, for there may has some async jobs running!
    dm.exit();
    // dm.dispose(); //don't dispose the domain, for there may have some async jobs running!

    var errorHandler = onError;
    if(onSubError && onError!==onSubError){
      onError = onSubError;//for subsequent error handling
    }

    try{
      errorHandler(err);
    }catch(e){
      processFatal(e);
    }

    dm._fiber.terminate();//terminate the fiber, and make it available to release(memory)
  });
  dm.run(func);
}
nbs.run = run;

nbs.express = function(options){
  options || (options = {});
  return function (req, resp, next) {
    run(next, req, resp, function(err){
      if(options.onError){
        options.onError(err, req, resp);
      }
      else{
        next(err);
      }
    }, options.onSubError || function(err){
      /*eslint-disable no-console*/
      console.log('subsequent error in nbs-express:', err.stack);
      /*eslint-enable no-console*/
    });
  };
};

function checkWait(){
  if(process.domain && process.domain._fiber && process.domain.wait){
    if(!Fiber.current) throw new Error('cannot wait in async stack(do NOT ignore this error!)');
  }
  else{
    throw new Error('cannot wait in not-nbs-fiber stack');
  }
}

nbs.wait = function(){
  checkWait();
  return process.domain.wait.apply(process.domain, arguments);
};

nbs.waitF = function(){
  checkWait();
  return process.domain.waitF.apply(process.domain, arguments);
};

nbs.resume = function(){
  if(process.domain && process.domain._fiber && process.domain.resume){
    return process.domain.resume.apply(process.domain, arguments);
  }
  else{
    throw new Error('cannot resume in not-nbs-fiber stack');
  }
};

nbs.pair = function(){
  if(process.domain && process.domain._fiber){
    return process.domain._fiber.pair();
  }
  else{
    throw new Error('cannot create pair in not-nbs-fiber stack');
  }
};

//whether is in the nbs fiber stack, so-called the stack wrapped by nbs
nbs.waitable = function(){
  return !!(Fiber.current && process.domain && process.domain._fiber);
};


nbs.sleep = function(ms){
  nbs.wait(setTimeout(nbs.resume, ms));
};


/**
 * (inspired by `fibers/future`)
 * wrap node-style async functions to instead run in 'sync' style and return the value directly. 
 * this assumes that the last parameter of the function is async callback.
 *
 * if a single function is passed then a wrapped function is created. if an object is passed then a
 * new object is returned with all functions wrapped.
 *
 * there is no way to get the underlying function's return. if you need, please use the unwrapped ones,
 * such as `child_process.execFile`.
 *
 * and you should not call the sync-style function from the wrap, like `readFileSync`, they will
 * block the fiber stack. use `underscore.pick` or `_.omit` to omit the sync-style funcs
 *
 * example:
 * var readFile = nbs.wrap(require('fs').readFile);
 * var nfs = nbs.wrap(_.pick(require('fs'), 'readFile', 'writeFile'));
 * var fileContent = nfs.readFile('example.txt');
 */
nbs.wrap = function(fnOrObj, deepForFn) {
  if (typeof fnOrObj === 'object') {
    var wrapped = Object.create(fnOrObj);
    for(var k in fnOrObj){
      if(wrapped[k] instanceof Function) {
        wrapped[k] = nbs.wrap(wrapped[k], deepForFn);
      }
    }
    return wrapped;
  } else if (typeof fnOrObj === 'function') {
    var fn = function() {
      //avoid leak arguments: https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#32-leaking-arguments
      var $_len = arguments.length; var args = new Array($_len); for(var $_i = 0; $_i < $_len; ++$_i) {args[$_i] = arguments[$_i];}
      args.push(nbs.resume);
      fnOrObj.apply(this, args);
      return nbs.wait();
    };

    // modules like `request` return a function that has more functions as properties. 
    if (deepForFn) {
      var proto = Object.create(fnOrObj);
      for (var pn in fnOrObj) {
        if (fnOrObj.hasOwnProperty(pn) && fnOrObj[pn] instanceof Function) {
          proto[pn] = proto[pn];
        }
      }
      fn.__proto__ = nbs.wrap(proto, false);
    }
    return fn;
  }
};



})();
