const h = require('highland'),
  nodeFetch = require('node-fetch'),
  readline = require('readline');

function streamFetch() {
  return h(nodeFetch.apply(this, arguments));
}

function streamFetchJson() {
  return streamFetch.apply(this, arguments)
    .flatMap(errIfNotOk)
    .flatMap(res => h(res.json()));
}

function streamFetchText() {
  return streamFetch.apply(this, arguments)
    .flatMap(errIfNotOk)
    .flatMap(res => h(res.text()));
}

function errIfNotOk(res) {
  if (res.ok) return h.of(res);
  return h(res.text()) // you must read the response to close the client
    .map(() => {
      const err = new Error(`Request to ${arguments[0]} failed`);
      
      err.status = res.status;
      throw err;
    });
}

/**
* Read from stdin
* @return {Stream} of stdin lines
**/
function readStdin() {
  const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    }),
    stream = h();

  rl.on('line', line => stream.write(line));
  rl.on('close', () => stream.end());
  return stream;
}

module.exports.streamFetch = streamFetch;
module.exports.streamFetchJson = streamFetchJson;
module.exports.streamFetchText = streamFetchText;
module.exports.readStdin = readStdin;
