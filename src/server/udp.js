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
var UdpSimple = require('./udpSimple.js');

const IOPA = iopa.constants.IOPA,
      SERVER = iopa.constants.SERVER
	  
const packageVersion = require('../../package.json').version;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/* *********************************************************
 * IOPA UDP MIDDLEWARE
 * ********************************************************* */

/**
 * Representes UDP Server
 *
 * @class UdpServer
 * @param app The IOPA AppBuilder dictionary
 * @constructor
 * @public
 */
function IopaUdp(app) {
  _classCallCheck(this, IopaUdp);

   app.properties[SERVER.Capabilities][IOPA.CAPABILITIES.Udp] = {};
   app.properties[SERVER.Capabilities][IOPA.CAPABILITIES.Udp][SERVER.Version] = packageVersion;
   app.properties[SERVER.Capabilities][IOPA.CAPABILITIES.Udp][SERVER.LocalPort] =[];

   app.createServer = this._appCreateServer.bind(this, app.createServer || function(){ return Promise.reject(new Error("no registered transport provider")); });
  
   this.app = app; 
 }

IopaUdp.prototype._appCreateServer = function(next, transport, unicastPort, unicastAddress, options){
  if (transport !== "udp:")
    return next(transport, unicastPort, unicastAddress, options);
    
   options = options || {};
  
  if (!this.app.properties[SERVER.IsBuilt]) 
    this.app.build();   
   
  var that = this;
  var server = new UdpSimple(options, this.app.properties[SERVER.Pipeline]);
 
  var unicastPromise = server.listen(unicastPort, unicastAddress)
    .then(function(linfo){ 
      that.app.properties[SERVER.Capabilities][IOPA.CAPABILITIES.Udp][SERVER.LocalPort].push(linfo.port);
      return linfo;
    });
    
  if (options[SERVER.MulticastPort] && (options[SERVER.MulticastPort] !== unicastPort))
  {
      var server2 = new UdpSimple(options, this.app.properties[SERVER.Pipeline]);
      server.multicastServer = server2;
      
      var multicastPromise = server2.listen(options[SERVER.MulticastPort])
      .then(function(linfo){ 
      that.app.properties[SERVER.Capabilities][IOPA.CAPABILITIES.Udp][SERVER.LocalPort].push(linfo.port);
      return linfo;
      });
      
      return Promise.all(unicastPromise, multicastPromise).then(function(values){return server; });
      
  }
  else
     return unicastPromise.then(function(){return server; });
}

module.exports = IopaUdp;