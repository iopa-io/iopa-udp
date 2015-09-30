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
var UdpSimplex = require('./udpSimplex.js');
var util = require('util');

const IOPA = iopa.constants.IOPA,
      SERVER = iopa.constants.SERVER

/* *********************************************************
 * IOPA UDP MIDDLEWARE
 * ********************************************************* */
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * Representes UDP Server
 *
 * @class UdpServer
 * @param app The IOPA AppBuilder dictionary
 * @constructor
 * @public
 */
function UdpComplex(options, appFunc) { 
  _classCallCheck(this, UdpComplex);
   options = options || {};
 
  UdpSimplex.call(this, options, appFunc);
  
  this.listen = UdpComplex_serverListen.bind(this, this, this.listen.bind(this));
  this.options = options;
  this.appFunc = appFunc;
  this.close = UdpComplex_serverClose.bind(this, this, this.close.bind(this));
}

util.inherits(UdpComplex, UdpSimplex);

function UdpComplex_serverListen(server, next, unicastPort, unicastAddress, multicastOptions){
  multicastOptions = multicastOptions || {};
  
   if (multicastOptions[SERVER.MulticastPort] && (multicastOptions[SERVER.MulticastPort] !== unicastPort))
  {
      var unicastPromise = next(unicastPort, unicastAddress)
      .then(function(linfo){ 
       return linfo;
      });
 
      var server2 = new UdpSimplex(server.options, server.appFunc);
      server.multicastServer = server2;
      server2[SERVER.RawTransport] = this[SERVER.RawTransport];
      
      var multicastPromise = server2.listen(multicastOptions[SERVER.MulticastPort], null, multicastOptions)
      .then(function(linfo){ 
        return linfo;
      });
      
      return Promise.all([unicastPromise, multicastPromise]).then(function(values){return values[0]});
  } else if (multicastOptions[SERVER.MulticastPort] && multicastOptions[SERVER.UnicastServer])
  {
      this[SERVER.RawTransport] = multicastOptions[SERVER.UnicastServer][SERVER.RawTransport];
      return next(unicastPort, unicastAddress, multicastOptions) 
  }
  else
     return next(unicastPort, unicastAddress, multicastOptions);

}

function UdpComplex_serverClose(server, next){
    if (server.multicastServer)
       return server.multicastServer.close().then(next);
    else
      return next();
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
UdpComplex.prototype._fetchBindUnicast = function UdpSimplex_Fetch(channelContext, ignore, path, options, pipeline) {
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

module.exports = UdpComplex;