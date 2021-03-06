DEPRECATED! non-blocking synchronization(nbs:) in nodejs
=================================

**DEPRECATED**


I do not like Promise, yes I promise. This package is extended from [fibers](https://www.npmjs.com/package/fibers) and [domain](https://nodejs.org/docs/v0.10.40/api/domain.html), with much more friendly api(`run`/`wait`/`resume`), much more stronger error handling, much more tolerable for nested run, and aslo working in sync-callback.

### Features

* use `run`/`wait`/`resume` to archive fiber functionality, avoid callback hell
* without explicit reference to call `wait` and `resume`
* strong error handle and subsequent error handle for any scene, like thrown in sync/async callback, thrown before `resume` 
* tolerable nested run, no matter whether you call `resume` in n-th callback, run another fiber stack in async mode, or even wait another fiber stack paused!
* using `pair.resume` and `pair.wait` for a synchronous callback is ok!
* supply express middleware to wrap every request
* use `nbs.wrap` to wrap the node core module's async function run as 'sync' style, like `var data = fs.readFile(xxx)`

### Installation

```
npm install --save nbs
```

### Simple usage

```javascript
var nbs = require('../index'), wait = nbs.wait, resume = nbs.resume;
var fs = nbs.wrap(require('fs'));//wrap the node module

nbs.run(function(){
  var fileContent = fs.readFile('xxx');//it will return the file data directly

  nbs.sleep(1000);//sleep 1s

  //return value from the callback
  setTimeout(function(){
    resume(null, 'wake up');
  }, 1000);
  console.log(wait());//wake up
});
```

### Used with express

```js
app.use(nbs.express());//error will be redirected to error middleware
app.get('/sleep', function(req, resp){
  nbs.sleep(1000);
  resp.send('wake up').end();
});
```

with custom error handling:
```js
app.use(nbs.express({
  //custom error handler
  onError: function(err, req, resp){
    resp.status(500).send(err.message).end();
  },
  //if supplied, then the subsequent error will be caught by this listener
  onSubError: function(err){
    console.log('caught subsequent error');
  }
}));
app.get('/sleep', function(req, resp){
  nbs.sleep(1000);
  resp.send('wake up').end();
});
```

### Run with synchronous callback

```js
function funcWithSyncCallback(cb){
  cb();
}

nbs.run(function(){
  console.log('start');

  var pair = nbs.pair();
  funcWithSyncCallback(function(){
    pair.resume();
  });
  pair.wait();//will not hung here!

  console.log('end');
});
```

### Parallel the async

```js
function get(url, cb){//get the response data from url
  //cb(err, data)
}

nbs.run(function(){
  get('url1', resume);
  get('url2', resume);
  get('url3', resume);

  //data1 may not be the url1's result! it can be url2/url3's result too. 
  //you should not rely on that. same to data2/data3
  var data1 = wait();
  var data2 = wait();
  var data3 = wait();

  console.log(data1, data2, data3);
});
```

### More usages!

Please refer to the [test cases](https://github.com/kiliwalk/nbs/tree/master/test) to get more usage examples, like configuration, error handling, nested run, parallel run, etc.

### API

#### `nbs.config(options)`

set the global configuration. options has:

* `onError`: `function(err)`. the error handler. defaut handler will emit process's uncaughtException event if there is listener at this event or it will crash the process(domain's behavior).
* `onSubError`: `function(err)`. the subsequenct error handler. default is null. if you supplied one, then the subsequent error from the nbs will be caught by it. subsequent errors are mainly caused by the async jobs.

#### `nbs.resetConfig()`
reset the global config.

#### `nbs.run(func, [emitter1, emitter2, ...], [errorHandler], [subErrorHandler])`
create a nbs-fiber stack, make the `func` to run in this stack, and any error thrown in this func and its async callbacks will be caught! 

* `func`: the target function that its subsequent call chain need to be run as-like 'sync'
* `emitterN`: you can put the event emitters into this nbs to catch their error. see `domain.bind`
* `errorHandler`: error handler only used by this nbs-fiber stack
* `subErrorHandler`: subsequenct error handler only used by this nbs-fiber stack

#### `nbs.wait([param1, param2, ...])`
pause the nbs-fiber stack. wait should be used with resume and they must be **in pairs**. 
the params will be returned by the **next-pair**'s resume method.
wait will return the pair resume's params, and assume that the first param is error or null. 
if it's error, then throw it. if not, then return the remain parts of the resume params. if 
the resume params's length = 2, then return the second param to adapt node-style callback. see:
```js
setTimeout(function(){
  resume(null, 'a');
});
wait();//return 'a'

setTimeout(function(){
  resume(null, 'a', 'b');
});
wait();//return ['a', 'b']

setTimeout(function(){
  resume(new Error('xxx'));
});
wait();//throw the error

//adapt to node-style callback
var fileContent = wait(fs.readFile('xxx', resume));
```

#### `nbs.waitF(...)`
same as `nbs.wait()`. the difference is `waitF` will return the pair resume's full params.
```js
setTimeout(function(){
  resume('a');
});
waitF();//return 'a'

setTimeout(function(){
  resume('a', 'b');
});
waitF();//return ['a', 'b']
```

#### `nbs.resume([param1, param2, ...])`
resume the paused nbs-fiber stack. the params will be returned by **this-pair**'s wait method;
if the first param is an Error, then the **pair** wait method will throw the error, same to the first param is arguments object and the arguments's first param is an Error.

#### `nbs.waitable()`
check whether current stack is in the nbs-fiber stack

#### `nbs.sleep(ms)`
sleep the current stack with the specified miliseconds. same as `wait(setTimeout(resume, ms))`.

#### `nbs.express([options])`
express middleware. if you put it in express, then the domain-middleware is not needed anymore. options has:

* `onError`: `function(err, req, resp)`. default handler will redirect the error to the next error middleware of express
* `onSubError`: `function(err)`. there is no req and resp in the function. it's useful to record the subsequenct error.

#### `nbs.wrap(functionOrObject, [deepTheFunction])`
wrap node-style async functions to instead run in 'sync' style and return the value directly. 
this assumes that the last parameter of the function is async callback.

if a single function is passed then a wrapped function is created. if an object is passed then a
new object is returned with all functions wrapped.

there is no way to get the underlying function's return. if you need, please use the unwrapped ones,
such as `child_process.execFile`'s return `child`.

and you should not call the sync-style function from the wrap, like `readFileSync`, they will
block the fiber stack. use `underscore.pick` or `_.omit` to omit the sync-style functions.

```js
var readFile = nbs.wrap(require('fs').readFile);
var fs = nbs.wrap(_.pick(require('fs'), 'readFile', 'writeFile'));
var request = nbs.wrap(require('request'), true);//wrap request and request.get ...

var fileContent = readFile('example.txt');
var fileContent = fs.readFile('example.txt');
```

### Coverage
run command `npm run test-cov` .
```
=============================== Coverage summary ===============================
Statements   : 98.08% ( 204/208 )
Branches     : 93.46% ( 100/107 )
Functions    : 100% ( 35/35 )
Lines        : 98.92% ( 183/185 )
================================================================================
```

### Benchmark with cps

run command `npm run bench` to compare the `setTimeout(fn, 0)` operation

```
cps: 64.55777921239509 op/s 15.49 ms/op
nbs: 64.76683937823834 op/s 15.44 ms/op
```


### License :

Licensed under MIT

Copyright (c) 2015 [kiliwalk](https://github.com/kiliwalk)
