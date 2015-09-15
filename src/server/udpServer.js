/*
 * Copyright (c) 2015 Internet of Protocols Alliance (IOPA)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// DEPENDENCIES
var iopaContextFactory = require('iopa').factory;
var dgram = require('dgram');
var util = require('util');
var events = require('events');
var iopaStream = require('iopa-common-stream');
var net = require('net');
var UdpClient = require('./udpClient.js');

const constants = require('iopa').constants,
  IOPA = constants.IOPA,
  SERVER = constants.SERVER

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/* *********************************************************
 * IOPA UDP SERVER (GENERIC)  
 * ********************************************************* */

/**
 * Representes UDP Server
 *
 * @class UdpServer
 * @param options (object)  {currently unusued}
 * @param appFunc (function(context))   delegate to which to call with all new inbound requests
 * @event request function(context)    alternative way to get inbound requests
 * @event error function(err, args)
 * @constructor
 * @public
 */
function UdpServer(options, appFunc) {
  _classCallCheck(this, UdpServer);

  if (typeof options === 'function') {
    appFunc = options;
    options = {};
  }
  
  options = options || {};
  this._options = options;

  this._appFunc = appFunc;
  this.on(IOPA.EVENTS.Request, this._invoke.bind(this));
  
   this._udpClient = new UdpClient(options);
}

util.inherits(UdpServer, events.EventEmitter)

/**
 * @method listen
 * Create socket and bind to local port to listen for incoming requests
 *
 * @param {Integer} [port] Port on which to listen
 * @param {String} [address] Local host address on which to listen
 * @returns {Promise} 
 * @public
 */
UdpServer.prototype.listen = function UdpServer_listen(port, address) {

  if (port == undefined) {
    port = 0;
  }

  if (this._udp)
     return new Promise(function(resolve, reject){
     reject("Already listening");
      });

  if (address && net.isIPv6(address))
    this._options["server.LocalPortType"] = 'udp6';

  if (!this._options["server.LocalPortType"])
    this._options["server.LocalPortType"] = 'udp4'

  if (!this._options["server.LocalPortReuse"])
    this._options["server.LocalPortReuse"] = true;

  if (Number(process.version.match(/^v(\d+\.\d+)/)[1]) > 0.11) {
    //RE-USE ADDRESS IF NODE 0.12 OR LATER
    this._udp = dgram.createSocket({ type: this._options["server.LocalPortType"], "reuseAddr": this._options["server.LocalPortReuse"] })
  }
  else {
    this._udp = dgram.createSocket(this._options["server.LocalPortType"]);
  }

  var that = this;

  this._udp.on("message", this._onMessage.bind(this));

  this._port = port;
  this._address = address;

  return new Promise(function (resolve, reject) {
    that._udp.bind(port, address || '0.0.0.0',
      function () {
        that._linfo = that._udp.address();
        that._port = that._linfo.port;
        that._address = that._linfo.address;

        var el;

        if (typeof that._options["server.LocalPortMulticast"] == 'object' && util.isArray(that._options["server.LocalPortMulticast"])) {
          for (var n = 0; n < that._options["server.LocalPortMulticast"].length; n++) {
            el = that._options["server.LocalPortMulticast"][n];
            that._udp.setBroadcast(true);
            that._udp.setMulticastTTL(128);
            // that._udp.setMulticastLoopback(true);
            if (typeof el == 'string') {
              that._udp.addMembership(el);
            }
            else if (typeof el == 'object' && util.isArray(el)) {
              that._udp.addMembership(el[0], el[1]);
            }
          }
        }
        else if (typeof that._options["server.LocalPortMulticast"] == 'string') {
          el = that._options["server.LocalPortMulticast"];
          that._udp.addMembership(el);
        }

        resolve(that._linfo);
      });
  });

};

Object.defineProperty(UdpServer.prototype, "port", { get: function () { return this._port; } });
Object.defineProperty(UdpServer.prototype, "address", { get: function () { return this._address; } });

UdpServer.prototype._onMessage = function UdpServer_onMessage(msg, rinfo) {
  var context = iopaContextFactory.createContext();
  context[IOPA.Method] = "UDP";
 
  context[SERVER.TLS] = false;
  context[SERVER.RemoteAddress] = rinfo.address;
  context[SERVER.RemotePort] = rinfo.port;
  context[SERVER.LocalAddress] = this._address;
  context[SERVER.LocalPort] = this._port;
  context[SERVER.RawStream] =  new iopaStream.IncomingMessageStream();
  context[SERVER.RawStream].append(msg);
  context[SERVER.IsLocalOrigin] = false;
  context[SERVER.IsRequest] = true;
  context[SERVER.SessionId] = rinfo.address + ':' + rinfo.port;
  context[SERVER.RawTransport] = this._udp;
 
  var response = context.response;
  response[SERVER.TLS] = context[SERVER.TLS];
  response[SERVER.RemoteAddress] = context[SERVER.RemoteAddress];
  response[SERVER.RemotePort] = context[SERVER.RemotePort];
  response[SERVER.LocalAddress] = context[SERVER.LocalAddress];
  response[SERVER.LocalPort] = context[SERVER.LocalPort];
  response[SERVER.RawStream] = new iopaStream.OutgoingStreamTransform(this._write.bind(this, context.response));
  response[SERVER.RawTransport] = this._udp;
  response[SERVER.IsLocalOrigin] = true;
  response[SERVER.IsRequest] = false;

  this.emit(IOPA.EVENTS.Request, context)
}

UdpServer.prototype._write = function UdpServer_write(context, chunk, encoding, done) { 
  if (typeof chunk === "string" || chunk instanceof String) {
              chunk = new Buffer(chunk, encoding);
          }
 
   context[SERVER.RawTransport].send(chunk, 0, chunk.length,  context[SERVER.RemotePort], context[SERVER.RemoteAddress], done );
 }

UdpServer.prototype._invoke = function UdpServer_invoke(context) {
  context[SERVER.Fetch] = this.requestResponseFetch.bind(this, context);
  return iopaContextFactory.using(context, this._appFunc);
};

/**
 * Creates a new IOPA UDP Client Connection using URL host and port name
 *
 * @method conect

 * @parm {string} urlStr url representation of Request://127.0.0.1:8002
 * @returns {Promise(context)}
 * @public
 */
UdpServer.prototype.connect = function UdpServer_connect(urlStr){
    return this._udpClient.connect(urlStr);
};

/**
 * Fetches a new IOPA Request using a UDP Url including host and port name
 *
 * @method fetch

 * @param path string representation of ://127.0.0.1/hello
 * @param options object dictionary to override defaults
 * @param pipeline function(context):Promise  to call with context record
 * @returns Promise<null>
 * @public
 */
UdpServer.prototype.requestResponseFetch = function UdpServer_requestResponseFetch(originalContext, path, options, pipeline) {
  var originalResponse = originalContext.response; 
 
  if (typeof options === 'function') {
    pipeline = options;
    options = {};
  }
  
  var urlStr = originalContext[IOPA.Scheme] +
    "//" +
    originalResponse[SERVER.RemoteAddress] + ":" + originalResponse[SERVER.RemotePort] +
    originalContext[IOPA.PathBase] +
    originalContext[IOPA.Path] + path;

  var context = iopaContextFactory.createRequestResponse(urlStr, options);
  var response = context.response;
  
  //REVERSE STREAMS SINCE SENDING REQUEST (e.g., PUBLISH) BACK ON RESPONSE CHANNEL
  context[SERVER.RawStream] = originalResponse[SERVER.RawStream];
  response[SERVER.RawStream] = originalContext[SERVER.RawStream];

  context[SERVER.LocalAddress] = originalResponse[SERVER.LocalAddress];
  context[SERVER.LocalPort] = originalResponse[SERVER.LocalPort]; 
  context[SERVER.SessionId] = originalResponse[SERVER.SessionId];

  response[SERVER.LocalAddress] = response[SERVER.LocalAddress];
  response[SERVER.LocalPort] = response[SERVER.LocalPort]; 
  response[SERVER.SessionId] = response[SERVER.SessionId];
};
  
/**
 * @method close
 * Close the underlying socket and stop listening for data on it.
 * 
 * @returns {Promise()}
 * @public
 */
UdpServer.prototype.close = function UdpServer_close() {
   this._udpClient.close();
   this._udp.close();
   this._udpClient = undefined;
   this._udp = undefined;
   return Promise.resolve(null);
};

module.exports = UdpServer;