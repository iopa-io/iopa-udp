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
var UdpClient = require('./udpClient.js');

const IOPA = iopa.constants.IOPA,
  SERVER = iopa.constants.SERVER

const packageVersion = require('../../package.json').version;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/* ***********************************************************************
 * IOPA UDP DUAL UNICAST SERVER/CLIENT AND OPTIONAL MULTICAST SERVER 
 * 
 * Note: unicast server/client is kept on a different port than multicast
 * as most multicast protocols used by IOPA are for discovery and 
 * may well be shared amongst multip servers running on a single host
 * machine.  This is in part because Berkley sockets require a multicast
 * socket to also own the unicast socket with same port. 
 * *********************************************************************** */

/**
 * Representes UDP Server
 *
 * @class UdpDual
 * @param options (object)  {currently unusued}
 * @param appFunc (function(context))   delegate to which to call with all new inbound requests
 * @event request function(context)    alternative way to get inbound requests
 * @event error function(err, args)
 * @constructor
 * @public
 */
function UdpDual(options, appFunc) {
  _classCallCheck(this, UdpDual);

  if (typeof options === 'function') {
    appFunc = options;
    options = {};
  }

  events.EventEmitter.call(this);

  options = options || {};
  this._options = options;
  this._factory = new iopa.Factory(options);

  this._appFunc = appFunc;
  this._connect = this._appFunc.connect || function (context) { return Promise.resolve(context) };
  this._dispatch = this._appFunc.dispatch || function (context) { return Promise.resolve(context) };

  this._unicastUDP = null;
  this._multicastUDP = null;
  
  this._connections = {};
}

util.inherits(UdpDual, events.EventEmitter)

/**
 * @method listen
 * Create socket and bind to local port to listen for incoming requests
 *
 * @param {Integer} [port] Port on which to listen
 * @param {String} [address] Local host address on which to listen
 * @returns {Promise} 
 * @public
 */
UdpDual.prototype.listen = function UdpDual_listen(unicastPort, unicastAddress, options) {
  options = options || {};
  iopa.util.shallow.merge(options, this._options);

  if (unicastPort == undefined) {
    unicastPort = 0;
  }

  if (this._unicastUDP)
    return new Promise(function (resolve, reject) {
      reject("Already listening");
    });

  if (unicastAddress && net.isIPv6(unicastAddress))
    options[SERVER.LocalPortType] = 'udp6';

  if (!options[SERVER.LocalPortType])
    options[SERVER.LocalPortType] = 'udp4'

  if (!options[SERVER.LocalPortReuse])
    options[SERVER.LocalPortReuse] = true;

  if (Number(process.version.match(/^v(\d+\.\d+)/)[1]) > 0.11) {
    //RE-USE ADDRESS IF NODE 0.12 OR LATER
    this._unicastUDP = dgram.createSocket({ type: options[SERVER.LocalPortType], "reuseAddr": options[SERVER.LocalPortReuse] })
  }
  else {
    this._unicastUDP = dgram.createSocket(this._options[SERVER.LocalPortType]);
  }

  this._unicastUDP.on("message", this._onMessage.bind(this, false));
  var that = this;

  var unicastPromise = new Promise(function (resolve, reject) {
    that._unicastUDP.bind(unicastPort, unicastAddress || '0.0.0.0',
      function () {
        that._linfo = that._unicastUDP.address();
        that._unicastPort = that._linfo.port;
        that._unicastAddress = that._linfo.address;

        resolve(that._linfo);
      });
  });

  if (options[SERVER.MulticastPort]) {
    this._multicastUDP = dgram.createSocket(this._options[SERVER.LocalPortType]);   // always use IPANY for multicast
    this._multicastUDP.on("message", this._onMessage.bind(this, true));

    var multicastPromise = new Promise(function (resolve, reject) {
      that._multicastUDP.bind(options[SERVER.MulticastPort],
        function () {
          var linfo2 = that._multicastUDP.address();
          that._multicastPort = linfo2.port;
       
          var el;

          if (typeof options[SERVER.MulticastAddress] == 'object' && util.isArray(options[SERVER.MulticastAddress])) {
            for (var n = 0; n < options[SERVER.MulticastAddress].length; n++) {
              el = options[SERVER.MulticastAddress][n];
              that._multicastUDP.setBroadcast(true);
              that._multicastUDP.setMulticastTTL(128);
              // that._multicastUDP.setMulticastLoopback(true);
              if (typeof el == 'string') {
                that._multicastUDP.addMembership(el);
                that._multicastAddress = el;
              }
              else if (typeof el == 'object' && util.isArray(el)) {
                that._multicastUDP.addMembership(el[0], el[1]);
                    that._multicastAddress = el[0];
              }
            }
          }
          else if (typeof options[SERVER.MulticastAddress] == 'string') {
            el = options[SERVER.MulticastAddress];
                 that._multicastUDP.addMembership(el);
                that._multicastAddress = el;
          }

          resolve(true);
        });
    });
    return Promise.all([unicastPromise, multicastPromise]).then(function (values) { return values[0] });

  } else
    return unicastPromise;
};

Object.defineProperty(UdpDual.prototype, SERVER.LocalPort, { get: function () { return this._unicastPort; } });
Object.defineProperty(UdpDual.prototype, SERVER.LocalAddress, { get: function () { return this._unicastAddress; } });
Object.defineProperty(UdpDual.prototype, SERVER.MulticastPort, { get: function () { return this._multicastPort; } });
Object.defineProperty(UdpDual.prototype, SERVER.MulticastAddress, { get: function () { return this._multicastAddress; } });

UdpDual.prototype._onMessage = function UdpServer_onMessage(isMulticast, msg, rinfo) {
  var context = this._factory.createContext();
  context[IOPA.Method] = IOPA.METHODS.data;
 
  context[SERVER.TLS] = false;
  context[SERVER.RemoteAddress] = rinfo.address;
  context[SERVER.RemotePort] = rinfo.port;
  context[SERVER.LocalAddress] = this._unicastAddress;  // always use unicast for replies and subsequent sends even if received on multicast
  context[SERVER.LocalPort] = this._unicastPort;  // always use unicast for replies and subsequent sends even if received on multicast
  context[SERVER.RawStream] =  new iopaStream.IncomingStream();
  context[SERVER.RawStream].append(msg);
  context[SERVER.IsMulticast] = isMulticast;
  context[SERVER.IsLocalOrigin] = false;
  context[SERVER.IsRequest] = true;
  context[SERVER.SessionId] = context[SERVER.LocalAddress] + ":" + context[SERVER.LocalPort] + "-" + context[SERVER.RemoteAddress] + ":" + context[SERVER.RemotePort];
  context[SERVER.RawTransport] = this._unicastUDP;   // always use unicast for replies and subsequent sends even if received on multicast
 
  var response = context.response;
  response[SERVER.TLS] = context[SERVER.TLS];
  response[SERVER.RemoteAddress] = context[SERVER.RemoteAddress];
  response[SERVER.RemotePort] = context[SERVER.RemotePort];
  response[SERVER.LocalAddress] = context[SERVER.LocalAddress];
  response[SERVER.LocalPort] = context[SERVER.LocalPort];
  response[SERVER.RawStream] = new iopaStream.OutgoingStreamTransform(this._write.bind(this, context.response));
  response[SERVER.RawTransport] = this._unicastUDP;  // always use unicast for replies and subsequent sends even if received on multicast
  response[SERVER.IsMulticast] = false;   // always use unicast for replies and subsequent sends even if received on multicast
  response[SERVER.IsLocalOrigin] = true;
  response[SERVER.IsRequest] = false;

  context[SERVER.Fetch] = this._fetch.bind(this, context, response);
  context[SERVER.Dispatch] = this._dispatch;

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
UdpDual.prototype.connect = function UdpDual_connect(urlStr, defaults) {
  defaults = defaults || {};
  defaults[IOPA.Method] = defaults[IOPA.Method] || IOPA.METHODS.connect;
  var channelContext = this._factory.createRequest(urlStr, defaults);

  if (defaults[SERVER.IsMulticast])
  {
     channelContext[SERVER.RawTransport] = this._multicastUDP;   
     channelContext[SERVER.LocalPort] = this._multicastPort;
     channelContext[SERVER.LocalAddress] = this._multicastAddress;
  } else
  {
        channelContext[SERVER.RawTransport] = this._unicastUDP;    // default send on unicast
        channelContext[SERVER.LocalPort] = this._unicastPort;
        channelContext[SERVER.LocalAddress] = this._unicastAddress;
  }
  
  channelContext[SERVER.OriginalUrl] = urlStr;
  
  channelContext[SERVER.Fetch] = this._fetch.bind(this, channelContext, channelContext);
  channelContext[SERVER.Dispatch] = this._dispatch;
  channelContext[SERVER.Disconnect] = this._disconnect.bind(this, channelContext);

  channelContext[SERVER.RawStream] = new iopaStream.OutgoingStreamTransform(this._write.bind(this, channelContext));
  channelContext[SERVER.RawStream].on('finish', this._disconnect.bind(this, channelContext, null));
  
  channelContext[SERVER.SessionId] = channelContext[SERVER.LocalAddress] + ":" + channelContext[SERVER.LocalPort] + "-" + channelContext[SERVER.RemoteAddress] + ":" + channelContext[SERVER.RemotePort];
  this._connections[channelContext[SERVER.SessionId]] = channelContext;
 
  var that = this;
  return new Promise(function (resolve, reject) {resolve(that._connect(channelContext));});   
};

UdpDual.prototype._write = function UdpDual_write(context, chunk, encoding, done) {
  if (typeof chunk === "string" || chunk instanceof String) {
    chunk = new Buffer(chunk, encoding);
  }
  context[SERVER.RawTransport].send(chunk, 0, chunk.length, context[SERVER.RemotePort], context[SERVER.RemoteAddress], done);
}

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
UdpDual.prototype._fetch = function UdpDual_Fetch(channelContext, transportContext, path, options, pipeline) {
  if (typeof options === 'function') {
    pipeline = options;
    options = {};
  }
  
  var urlStr = channelContext[IOPA.Scheme] +
    "//" +
    channelContext[SERVER.RemoteAddress] + ":" + channelContext[SERVER.RemotePort] +
    channelContext[IOPA.PathBase] +
    channelContext[IOPA.Path] + path;
  
  var context = channelContext[SERVER.Factory].createRequest(urlStr, options);
  channelContext[SERVER.Factory].mergeCapabilities(context, channelContext);
  context[SERVER.SessionId] = channelContext[SERVER.SessionId];

  context[SERVER.LocalAddress] = transportContext[SERVER.LocalAddress];
  context[SERVER.LocalPort] = transportContext[SERVER.LocalPort];
  context[SERVER.RawStream] = transportContext[SERVER.RawStream];
 
  return context.using(function () {
    var value = channelContext[SERVER.Dispatch](context);
    pipeline(context);
    return value;
  });
};

/**
 * @method _disconnect
 * Close the  channel context
 * 
 * @public
 */
UdpDual.prototype._disconnect = function UdpDual_disconnect(channelContext, err) {
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
UdpDual.prototype.close = function UdpServer_close() {
   for (var key in this._connections)
      this._disconnect(this._connections[key], null);

   this._connections = {};
  
   this._unicastUDP.close();
   
   if (this._multicastUDP)
       this._multicastUDP.close();
   this._unicastUDP = undefined;
   this._multicastUDP = undefined;
   return Promise.resolve(null);
};

module.exports = UdpDual;