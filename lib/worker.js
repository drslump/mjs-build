// Compilation worker module. It's designed to be used from a forked process 
// responding to action requests from the parent.

var mjs = require('meta-script/lib/mjs.js');

// Detect if we are running as a child process
var parent, child;
if (process.connected) {
  child = process;
} else {
  // Emulate child process event interface
  var EE = require('events').EventEmitter;
  parent = new EE();
  child = new EE();
  // Allow queued tasks to run between compilation requests
  parent.send = function (obj) {
    setImmediate(function () {
      child.emit('message', obj);
    });
  };
  child.send = function (obj) {
    setImmediate(function() {
      parent.emit('message', obj);
    });
  };
  parent.pid = process.pid;
  module.exports = parent;
}

// Notify its readiness
child.send(process.pid);

child.on('message', function (argv) {
  
  var result = {
    exitcode: null,
    stdout: '',
    stderr: ''
  };

  var old_stdout_write = process.stdout.write,
      old_stderr_write = process.stderr.write,
      old_exit = process.exit;
  try {
    process.stdout.write = function (msg) {
      result.stdout += msg;
    };
    process.stderr.write = function (msg) {
      result.stderr += msg;
    };
    process.exit = function (exitcode) {
      result.exitcode = exitcode;
    };

    mjs(argv);

  } finally {
    process.stdout.write = old_stdout_write;
    process.stderr.write = old_stderr_write;
    process.exit = old_exit;
  }

  child.send(result);

  // Force garbage collection while we wait for next action
  global.gc && global.gc();
});
