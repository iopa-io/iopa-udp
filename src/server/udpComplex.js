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
      
      var multicastPromise = server2.listen(multicastOptions[SERVER.MulticastPort], null, multicastOptions)
      .then(function(linfo){ 
        return linfo;
      });
      
      return Promise.all([unicastPromise, multicastPromise]).then(function(values){return values[0]});
  }
  else
     return next(unicastPort, unicastAddress, multicastOptions)
      .then(function(linfo){ 
        return linfo;
      });
}

function UdpComplex_serverClose(server, next){
    if (server.multicastServer)
       return server.multicastServer.close().then(next);
    else
      return next();
}

module.exports = UdpComplex;