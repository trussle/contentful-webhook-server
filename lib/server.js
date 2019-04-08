var http = require('http');
var auth = require('basic-auth');
var jsonBody = require('body/json');

module.exports = createServer;

var httpServer;
var options = {
  path: '/',
  username: '',
  password: ''
};

var HEADERS = {
  TOPIC: 'x-contentful-topic',
  CONTENT_TYPE: 'content-type'
};

var EVENTS = {
  ERROR: 'ContentManagement.error',
  ALL_SUCCESSFUL_REQUESTS: 'ContentManagement.*'
};

function createServer(opts) {
  if (opts && opts.path) {
    options.path = opts.path;
  }
  if (opts && opts.username) {
    options.username = opts.username;
  }
  if (opts && opts.password) {
    options.password = opts.password;
  }
  httpServer = http.createServer(handleRequest);
  httpServer.mountAsMiddleware = handleRequest;
  return httpServer
}

async function handleRequest(req, res) {
  var path = req.url.split('?').shift();
  var topic = req.headers[HEADERS.TOPIC];
  var err;
  var incomingUsername = '';
  var incomingPassword = '';
  var incomingCredentials;

  // Handle non matching path
  if (path !== options.path) {
    err = new Error('The request does not match the path');
    httpServer.emit(EVENTS.ERROR, err, req);
    return404();
    return;
  }

  // Handle incorrect methods
  if (req.method !== 'POST') {
    err = new Error('The request did not use the POST method');
    httpServer.emit(EVENTS.ERROR, err, req);
    return404();
    return;
  }

  // Handle missing topic
  if (!topic) {
    return return400('X-Contentful-Topic not specified in request');
  }

  // Verify credentials
  incomingCredentials = auth(req);
  if (incomingCredentials) {
    incomingUsername = incomingCredentials.name;
    incomingPassword = incomingCredentials.pass;
  }
  if ((incomingUsername !== options.username) || (incomingPassword !== options.password)) {
    err = new Error('Unauthorized: request contained invalid credentials')
    httpServer.emit(EVENTS.ERROR, err, req, incomingCredentials);
    return returnAccessDenied();
  }

  // Parse json body
  try {
    await parseJsonBody(req);
  } catch (err) {
    return400(err);
  }

  // Emit topic and wildcard event
  httpServer.emit(topic, req);
  httpServer.emit(EVENTS.ALL_SUCCESSFUL_REQUESTS, topic, req);

  // Return 200 OK
  res.writeHead(200, {'content-type': 'application/json'});
  res.end('{"ok":true}');

  function return400(message) {
    res.writeHead(400, {'content-type': 'application/json'});
    res.end(JSON.stringify({error: message}));
  }

  function returnAccessDenied() {
    res.writeHead(401, {'WWW-Authenticate': 'Basic realm="Contentful webhooks"'});
    res.end();
  }

  function return404() {
    res.statusCode = 404;
    res.end();
  }

  function parseJsonBody(req) {
    const contentType = req.headers[HEADERS.CONTENT_TYPE];
    const validContentTypes = ["application/json", "application/vnd.contentful.management.v1+json"];

    return new Promise((resolve, reject) => {
      if (validContentTypes.includes(contentType)) {
        // Parse request body
        jsonBody(req, res, (err, body) => {
          if (err) {
            reject(err.message)
          } else {
            req.body = body;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}
