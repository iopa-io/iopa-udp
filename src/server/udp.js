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
var UdpServer = require('./udpServer.js');

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

   app.listen = this._appListen.bind(this, app.listen || function(){ return Promise.reject(new Error("no registered transport provider")); });
   app.connect = this._appConnect.bind(this, app.connect || function(){ return Promise.reject(new Error("no registered transport provider")); });
   this.app = app; 
   this._udpServer = null;     
}

IopaUdp.prototype._appListen = function(next, transport, port, address, options){
  if (transport !== "udp:")
    return next(transport, port, address, options);
  
  if (!this.app.properties[SERVER.IsBuilt]) 
    this.app.build();
    
  if (!this._udpServer)
  {
      this._udpServer = new UdpServer(options, this.app.properties[SERVER.Pipeline]);
      this.app.properties[SERVER.Capabilities][IOPA.CAPABILITIES.Udp]["server.Instance"] = this._udpServer;
  }
  
  return this._udpServer.listen(port, address);   
}

IopaUdp.prototype._appConnect = function(next, transport, urlStr, defaults){
  if (transport !== "udp:")
    return next(transport, urlStr, defaults);
  
  if (!this.app.properties[SERVER.IsBuilt]) 
    this.app.build();
    
  if (!this._udpServer)
  {
      this._udpServer = new UdpServer({}, this.app.properties[SERVER.Pipeline]);
      this.app.properties[SERVER.Capabilities][IOPA.CAPABILITIES.Udp]["server.Instance"] = this._udpServer;
  }

   return this._udpServer.connect(urlStr, defaults);   
}

module.exports = IopaUdp;