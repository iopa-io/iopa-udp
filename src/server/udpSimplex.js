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
var iopa = require('iopa');
var dgram = require('dgram');
var util = require('util');
var events = require('events');
var iopaStream = require('iopa-common-stream');
var net = require('net');

const IOPA = iopa.constants.IOPA,
  SERVER = iopa.constants.SERVER

const packageVersion = require('../../package.json').version;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/* ***********************************************************************
 * IOPA UDP SIMPLEX SERVER AND CLIENT ON SAME PORT 
 * Unicast or Multicast+Unicast
 * *********************************************************************** */
var seq = 0;

/**
 * Representes UDP Server
 *
 * @class UdpSimple
 * @param options (object)  {currently unusued}
 * @param appFunc (function(context))   delegate to which to call with all new inbound requests
 * @event request function(context)    alternative way to get inbound requests
 * @event error function(err, args)
 * @constructor
 * @public
 */
function UdpSimplex(options, appFunc) {
  _classCallCheck(this, UdpSimplex);

  if (typeof options === 'function') {
    appFunc = options;
    options = {};
  }

  events.EventEmitter.call(this);

  if (typeof options == 'string'){
    this._id = options;
    options = {};
    options[SERVER.Id] = this._id  
  } else
  {
     options = options || {};
     this._id = options[SERVER.Id] || (seq++).toString();
  }
    
  this._options = options;
  this._factory = new iopa.Factory(options);

  this._appFunc = appFunc;
  this._connectFunc = this._appFunc.connect || function (context) { return Promise.resolve(context) };
  this._createFunc = this._appFunc.create || function (context) { return context };
  this._dispatchFunc = this._appFunc.dispatch || function (context) { return Promise.resolve(context) };

  this._udp = null;
   
  this._connections = {};
}

util.inherits(UdpSimplex, events.EventEmitter)

/**
 * @method listen
 * Create socket and bind to local port to listen for incoming requests
 *
 * @param {Integer} [port] Port on which to listen
 * @param {String} [address] Local host address on which to listen
 * @returns {Promise} 
 * @public
 */
UdpSimplex.prototype.listen = function UdpSimplex_listen(port, address, options) {
  options = options || {};
  iopa.util.shallow.merge(options, this._options);

  if (port == undefined) {
    address = 0;
  }

  if (this._udp)
    return new Promise(function (resolve, reject) {
      reject("Already listening");
    });

  if (address && net.isIPv6(address))
    options[SERVER.LocalPortType] = 'udp6';

  if (!options[SERVER.LocalPortType])
    options[SERVER.LocalPortType] = 'udp4'

  if (!options[SERVER.LocalPortReuse])
    options[SERVER.LocalPortReuse] = true;

  if (Number(process.version.match(/^v(\d+\.\d+)/)[1]) > 0.11) {
    //RE-USE ADDRESS IF NODE 0.12 OR LATER
    this._udp = dgram.createSocket({ type: options[SERVER.LocalPortType], "reuseAddr": options[SERVER.LocalPortReuse] })
  }
  else {
    this._udp = dgram.createSocket(this._options[SERVER.LocalPortType]);
  }

  this._udp.on("message", this._onMessage.bind(this));
  var that = this;

  return new Promise(function (resolve, reject) {
    that._udp.bind(port, address || null,
      function () {
        that._linfo = that._udp.address();
        that._port = that._linfo.port;
        that._address = that._linfo.address;
       
        var el;
        if (typeof options[SERVER.MulticastAddress] == 'object' && util.isArray(options[SERVER.MulticastAddress])) {
            for (var n = 0; n < options[SERVER.MulticastAddress].length; n++) {
              el = options[SERVER.MulticastAddress][n];
              that._udp.setBroadcast(true);
              that._udp.setMulticastTTL(128);
              // that._multicastUDP.setMulticastLoopback(true);
              if (typeof el == 'string') {
                that._udp.addMembership(el);
                that._multicastAddress = el;
              }
              else if (typeof el == 'object' && util.isArray(el)) {
                that._udp.addMembership(el[0], el[1]);
                    that._multicastAddress = el[0];
              }
            }
          }
          else if (typeof options[SERVER.MulticastAddress] == 'string') {
            el = options[SERVER.MulticastAddress];
                that._udp.addMembership(el);
                that._multicastAddress = el;
          }

        resolve(that._linfo);
      });
  });
};

Object.defineProperty(UdpSimplex.prototype, SERVER.LocalPort, { get: function () { return this._port; } });
Object.defineProperty(UdpSimplex.prototype, SERVER.LocalAddress, { get: function () { return this._address; } });
Object.defineProperty(UdpSimplex.prototype, SERVER.MulticastAddress, { get: function () { return this._multicastAddress; } });
Object.defineProperty(UdpSimplex.prototype, "port", { get: function () { return this._port; } });
Object.defineProperty(UdpSimplex.prototype, "address", { get: function () { return this._address; } });
Object.defineProperty(UdpSimplex.prototype, SERVER.RawTransport, { 
  get: function () { return this; },
  set: function(value) {   
    this._write = value._write.bind(value);
    this.connect = value.connect.bind(value);
      } });

UdpSimplex.prototype._onMessage = function UdpSimplex_onMessage(msg, rinfo) {
  var context = this._factory.createContext();
  context[IOPA.Method] = IOPA.METHODS.data;
  context[SERVER.Id] = this._id;
  context[SERVER.TLS] = false;
  context[SERVER.RemoteAddress] = rinfo.address;
  context[SERVER.RemotePort] = rinfo.port;
  context[SERVER.LocalAddress] = this._address; 
  context[SERVER.LocalPort] = this._port;  
  context[SERVER.RawStream] =  new iopaStream.IncomingMessageStream();
  context[SERVER.RawStream].append(msg);
  context[SERVER.IsLocalOrigin] = false;
  context[SERVER.IsRequest] = true;
  context[SERVER.SessionId] = context[SERVER.LocalAddress] + ":" + context[SERVER.LocalPort] + "-" + context[SERVER.RemoteAddress] + ":" + context[SERVER.RemotePort];
 
  var response = context.response;
   response[SERVER.Id] = this._id;
 
  response[SERVER.TLS] = context[SERVER.TLS];
  response[SERVER.RemoteAddress] = context[SERVER.RemoteAddress];
  response[SERVER.RemotePort] = context[SERVER.RemotePort];
  response[SERVER.LocalAddress] = context[SERVER.LocalAddress];
  response[SERVER.LocalPort] = context[SERVER.LocalPort];
  response[SERVER.RawStream] = new iopaStream.OutgoingStreamTransform(this._write.bind(this, context.response));
  response[SERVER.IsLocalOrigin] = true;
  response[SERVER.IsRequest] = false;

  context.create = this._create.bind(this, context, response);
  context.dispatch = this._dispatchFunc;

  context.using(this._appFunc);
}

/**
 * Creates a new IOPA Request using a UDP Url including host and port name
 *
 * @method connect

 * @parm {object} options not used
 * @parm {string} urlStr url representation of ://127.0.0.1:8200
 * @public
 * @constructor
 */
UdpSimplex.prototype.connect = function UdpSimplex_connect(urlStr, defaults) {
  defaults = defaults || {};
  defaults[IOPA.Method] = defaults[IOPA.Method] || IOPA.METHODS.connect;
  var channelContext = this._factory.createRequest(urlStr, defaults);
  channelContext[SERVER.Id] = this._id;
 
  channelContext[SERVER.LocalPort] = this._port;
  channelContext[SERVER.LocalAddress] = this._address;
  
  channelContext[SERVER.OriginalUrl] = urlStr;
  
  channelContext.create = this._create.bind(this, channelContext, channelContext);
  channelContext.dispatch = this._dispatchFunc;
    
  channelContext[SERVER.Disconnect] = this._disconnect.bind(this, channelContext);

  channelContext[SERVER.RawStream] = new iopaStream.OutgoingStreamTransform(this._write.bind(this, channelContext));
  channelContext[SERVER.RawStream].on('finish', this._disconnect.bind(this, channelContext, null));
  
  channelContext[SERVER.SessionId] = channelContext[SERVER.LocalAddress] + ":" + channelContext[SERVER.LocalPort] + "-" + channelContext[SERVER.RemoteAddress] + ":" + channelContext[SERVER.RemotePort];
  this._connections[channelContext[SERVER.SessionId]] = channelContext;
 
  var that = this;
  return new Promise(function (resolve, reject) {resolve(that._connectFunc(channelContext));});   
};

UdpSimplex.prototype._write = function UdpSimplex_write(context, chunk, encoding, done) {
  if (typeof chunk === "string" || chunk instanceof String) {
    chunk = new Buffer(chunk, encoding);
  }
  this._udp.send(chunk, 0, chunk.length, context[SERVER.RemotePort], context[SERVER.RemoteAddress], done);
}

/**
* Create a new IOPA Request, optionally using a UDP Url 
*
* @method create

* @param path string representation of /hello
* @param options object dictionary to override defaults
* @returns context
* @public
*/
UdpSimplex.prototype._create = function UdpSimplex_create(channelContext, transportContext, path, options) {
  var urlStr = channelContext[IOPA.Scheme] +
    "//" +
    channelContext[SERVER.RemoteAddress] + ":" + channelContext[SERVER.RemotePort] +
    channelContext[IOPA.PathBase] +
    channelContext[IOPA.Path];
    
  if (path) urlStr += path;
  
  var context = channelContext[SERVER.Factory].createRequest(urlStr, options);
  channelContext[SERVER.Id] = this._id;
 
  channelContext[SERVER.Factory].mergeCapabilities(context, channelContext);
  context[SERVER.SessionId] = channelContext[SERVER.SessionId];

  context[SERVER.LocalAddress] = transportContext[SERVER.LocalAddress];
  context[SERVER.LocalPort] = transportContext[SERVER.LocalPort];
  context[SERVER.RawStream] = transportContext[SERVER.RawStream];
  context.dispatch = this._dispatchFunc.bind(this, context);
  
  return  this._createFunc(context);
};

/**
 * @method _disconnect
 * Close the  channel context
 * 
 * @public
 */
UdpSimplex.prototype._disconnect = function UdpSimplex_disconnect(channelContext, err) {
  if (channelContext[IOPA.CancelToken].isCancelled)
     return;
     
   channelContext[IOPA.Events] = null;
   channelContext[SERVER.CancelTokenSource].cancel(IOPA.EVENTS.Disconnect);
   delete this._connections[channelContext[SERVER.SessionId]];
   channelContext.dispose();
}
 
/**
 * @method close
 * Close the underlying socket and stop listening for data on it.
 * 
 * @returns {Promise()}
 * @public
 */
UdpSimplex.prototype.close = function UdpSimplex_close() {
  
    for (var key in this._connections)
      this._disconnect(this._connections[key], null);

   this._connections = {};
  
   this._udp.close();
   this.emit("close");
  
   this._udp = undefined;
   return Promise.resolve(null);
};

module.exports = UdpSimplex;