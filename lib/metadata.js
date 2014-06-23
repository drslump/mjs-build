var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var VERSION = require('../package.json').version;


function readLastLine (fpath) {
  try {
    var stat = fs.statSync(fpath);
    var fd = fs.openSync(fpath, 'r');
  } catch (e) {
    return '';
  }

  var buffer = new Buffer(1);
  var line = '';
  while (true) {
    var read = fs.readSync(fd, buffer, 0, buffer.length, stat.size - buffer.length - line.length);
    if (!read) break;
    if (buffer[0] === 0x0A && line.length > 0) break;
    line = String.fromCharCode(buffer[0]) + line;
  }

  return line;
}


function MetaData () {
  this.version = VERSION;
  this.timestamp = (new Date).toISOString();
  this.source = null;
  this.deps = [];
}

MetaData.fromFile = function (fpath) {
  var line = readLastLine(fpath);
  if (-1 === line.indexOf('//# mjsMetadataURL=')) {
    return null;
  }
  var parts = line.split(',');
  var buffer = new Buffer(parts[2], 'base64');
  var data = JSON.parse(buffer.toString());
  var result = new MetaData();
  result.timestamp = data.timestamp;
  result.deps = data.deps || [];

  // Convert relative to absolute path 
  result.deps.forEach(function (dep) {
    dep.filename = path.resolve(path.dirname(fpath), dep.filename);
  });

  return result;
};

MetaData.prototype.init = function (filename) {
  var code = fs.readFileSync(filename);
  var md5 = crypto.createHash('md5').update(code).digest('hex');

  this.deps = [{
    filename: filename,
    checksum: md5
  }];
};

MetaData.prototype.isValid = function () {
  for (var i=0; i < this.deps.length; i++) {
    var code = fs.readFileSync(this.deps[i]['filename']);
    var md5 = crypto.createHash('md5').update(code).digest('hex');
    if (md5 !== this.deps[i]['checksum']) {
      console.log('Invalid dep', this.deps[i]);
      return false;
    }
  }

  return true;
};

MetaData.prototype.save = function (fpath) {
  var result = {
    version: this.version,
    timestamp: this.timestamp,
    deps: this.deps
  };

  // Convert dependencies to relative paths
  result.deps.forEach(function (dep) {
    dep.filename = path.relative(path.dirname(fpath), dep.filename);
  });

  var output = '\n//# mjsMetadataURL=data:application/json;charset=utf-8,base64,'
  output += new Buffer(JSON.stringify(result)).toString('base64');

  fs.appendFileSync(fpath, output);
};


exports.MetaData = MetaData;
