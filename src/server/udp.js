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
var UdpDual = require('./udpDual.js');

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

   app.listen = this._appListen.bind(this, app.listen || function(){ return Promise.reject(new Error("no registered transport provider")); });
   app.connect = this._appConnect.bind(this, app.connect || function(){ return Promise.reject(new Error("no registered transport provider")); });
   app.close = this._appClose.bind(this, app.close || function(){ return Promise.resolve(null); });
 
   this.app = app; 
   this._udpDual = null;     
}

IopaUdp.prototype._appListen = function(next, transport, unicastPort, unicastAddress, options){
  if (transport !== "udp:")
    return next(transport, unicastPort, unicastAddress, options);
  
  if (!this.app.properties[SERVER.IsBuilt]) 
    this.app.build();
    
  if (!this._udpDual)
  {
      this._udpDual = new UdpDual(options, this.app.properties[SERVER.Pipeline]);
      this.app.properties[SERVER.Capabilities][IOPA.CAPABILITIES.Udp][SERVER.RawTransport] = this._udpDual;
  }
  
  var that = this;
  return this._udpDual.listen(unicastPort, unicastAddress)
    .then(function(linfo){ 
      that.app.properties[SERVER.Capabilities][IOPA.CAPABILITIES.Udp][SERVER.LocalPort].push(linfo.port);
      return linfo;
    });
}

IopaUdp.prototype._appConnect = function(next, transport, urlStr, defaults){
  if (transport !== "udp:")
    return next(transport, urlStr, defaults);
  
  if (!this.app.properties[SERVER.IsBuilt]) 
    this.app.build();
    
  if (!this._udpDual)
      throw new Error("cannot call app.connect before app.listen on IOPA UDP Transport");

   return this._udpDual.connect(urlStr, defaults);   
}

IopaUdp.prototype._appClose = function(next){  
  if (this._udpDual)
   return   this._udpDual.close().then(next);
   else
   return next();
}

module.exports = IopaUdp;