

function main(argv, done) {
  var minimist = require('minimist');

  var opts = minimist(argv);
  var sources = opts._;

  if (opts['h'] || opts['help']) {
    console.log([
      '',
      'Usage: mjs build [command options...] [mjs options...] <sources>',
      '',
      ' Command specific options:',
      '',
      '                 --force  Force compilation of all files [default: off]',
      '          --parallel[=n]  Parallelize compilation [default: off]',
      '',
      ' run `mjs --help` to see standard compiler options',
      ''
    ].join('\n'));
    return done(0);
  }

  if (!sources.length) {
    console.error('No source files given');
    return done(1);
  }

  var poolSize = opts.parallel ? parseInt(opts.parallel, 10) : 1;
  if (opts.parallel && !poolSize) {
    // NOTE: Forking in node is expensive on time and memory. So let's
    //       be a bit conservative in the number of workers we will spawn.
    poolSize = Math.max(
      1, 
      Math.min(
        Math.round(sources.length / 3),
        require('os').cpus().length - 1
      )
    );
  }

  var Pool = require('./lib/pool').ForkPool;
  var pool = new Pool(__dirname + '/lib/worker.js', poolSize);

  // Remove build specific options from the argv
  var args = [];
  Object.keys(opts).forEach(function (k) {
    if (k === '_' || k === 'parallel' || k === 'force') return;
    if (opts[k] === true)
      args.push('--' + k);
    else if (opts[k] === false)
      args.push('--no-' + k);
    else
      args.push('--' + k + '="' + opts[k] + '"');
  });

  args = args.concat([
    '--verbose',
  ]);

  var fs = require('fs');
  var crypto = require('crypto');

  var MetaData = require('./lib/metadata').MetaData;

  var waiting = sources.length;
  function checkWaiting() {
    if (--waiting === 0) {        
      pool.close();
      done(0);
    }    
  }

  sources.forEach(function (source) {

    var outFile = source.replace(/\.mjs$/, '.js');

    var metadata = MetaData.fromFile(outFile);
    if (!opts['force'] && metadata && metadata.isValid()) {
      console.log('Skipping ' + source + ', metadata is valid');
      checkWaiting();
      return;
    }

    // Trigger compilation
    pool.send(args.concat(['--out', outFile, source]), function (result) {

      if (result.exitcode !== 0) {
        result.stderr = result.stderr.replace(/^\d+ error.*$\n/m, ''); 
        process.stderr.write(result.stderr);
      } else {
        metadata = new MetaData();
        metadata.init(source);
        metadata.save(outFile);
      }

      checkWaiting();
    });
  });

}

module.exports = main;