/*
 * Copyright (c) 2015 Limerun Project Contributors
 * Portions Copyright (c) 2015 Internet of Protocols Assocation (IOPA)
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
var Promise = require('bluebird');
var net = require('net');
var util = require('util');
var events = require('events');
var dgram = require('dgram');

var iopaStream = require('iopa-common-stream');
var iopaContextFactory = require('iopa').context.factory;

Promise.promisifyAll(dgram);

/* *********************************************************
 * IOPA UDP CLIENT (GENERIC)  
 * ********************************************************* */

 /**
 * Creates a new IOPA Request using a UDP Url including host and port name
 *
 * @method UdpClient

 * @parm {object} options not used
 * @parm {string} urlStr url representation of ://127.0.0.1:8200
 * @public
 * @constructor
 */
function UdpClient(options, clientMessagePipeline) { 
   events.EventEmitter.call(this);
  
  this._options = options;
  this._clientMessagePipeline = clientMessagePipeline;
  
  this._connections = {};
  }

util.inherits(UdpClient, events.EventEmitter);

/**
 * Creates a new IOPA Request using a UDP Url including host and port name
 *
 * @method connect

 * @parm {object} options not used
 * @parm {string} urlStr url representation of ://127.0.0.1:8200
 * @public
 * @constructor
 */
UdpClient.prototype.connect = function UdpServer_connect(urlStr){
  var channelContext = iopaContextFactory.createRequest(urlStr, "UDP");
  
  var addressType;
  
  if (net.isIPv6(channelContext["server.RemoteAddress"]))
       addressType = 'udp6'
  else
      addressType = 'udp4';
      
  var _udp = dgram.createSocket(addressType);
  channelContext["udp.RawSocket"] = _udp;

  channelContext["udp._BaseUrl"] = urlStr;
 
  channelContext["server.CreateRequest"] = UdpClient_CreateRequest.bind(this, channelContext);
  channelContext["server.SessionId"] = channelContext["server.RemoteAddress"] + ":" + channelContext["server.RemotePort"];
  
  this._connections[channelContext["server.SessionId"]] = channelContext;
           
  channelContext["server.RawStream"] = new iopaStream.OutgoingStreamTransform(this._write.bind(this, channelContext));
  channelContext["server.RawStream"].on('finish', this._disconnect.bind(this, channelContext, null));
  
  _udp.on("error", this._disconnect.bind(this, channelContext) );
  
  _udp.on("message", function (msg, rinfo) {
      channelContext.response["server.RemoteAddress"] = rinfo.address;
      channelContext.response["server.RemotePort"] = rinfo.port;
      channelContext.response["server.RawStream"].append(msg);
    });
  
  return new Promise(function(resolve, reject){
           _udp.bind(0, null, function(){
              var _linfo = _udp.address();
              channelContext["server.LocalPort"] = _linfo.port;
              channelContext["server.LocalAddress"] = _linfo.address;
              channelContext["server.Id"] = channelContext["server.LocalAddress"] + ':' + channelContext["server.LocalPort"];
              var response = channelContext.response;
              response["server.TLS"] = channelContext["server.TLS"];
              response["server.RawStream"] = new iopaStream.IncomingMessageStream();
              response["server.IsLocalOrigin"] = false;
              response["server.IsRequest"] = false;
              response["server.LocalAddress"] = channelContext["server.LocalAddress"];
              response["server.LocalPort"] = channelContext["server.LocalPort"];
              resolve(channelContext);
           });
     });
 };
 
UdpClient.prototype._write = function UdpServer_write(context, chunk, encoding, done) { 
  if (typeof chunk === "string") {
              chunk = new Buffer(chunk, encoding);
          }
 
   context["udp.RawSocket"].send(chunk, 0, chunk.length,  context["server.RemotePort"], context["server.RemoteAddress"], done );
 }

/**
 * Creates a new IOPA Request using a UDP Url including host and port name
 *
 * @method TcpClient_CreateRequest

 * @parm {string} urlStr url representation of ://127.0.0.1/hello
 * @parm {string} [method]  request method (e.g. 'GET')
 * @returns {Promise(context)}
 * @public
 */
function UdpClient_CreateRequest(channelContext, path, method){
  var urlStr = channelContext["udp._BaseUrl"] + path;
  var context = iopaContextFactory.createRequest(urlStr, method); 
   
  context["iopa.Body"] = new iopaStream.OutgoingStream();
  context.response["iopa.Body"] = new iopaStream.IncomingMessageStream();
  
  context["server.TLS"] = channelContext["server.TLS"];
  context["server.RemoteAddress"] = channelContext["server.RemoteAddress"];
  context["server.RemotePort"] = channelContext["server.RemotePort"] ;
  context["server.LocalAddress"] = channelContext["server.LocalAddress"];
  context["server.LocalPort"] = channelContext["server.LocalPort"]; 
  context["server.RawStream"] = channelContext["server.RawStream"];    
  context["server.Id"] = channelContext["server.Id"];  
  context["server.SessionId"] = channelContext["server.SessionId"];
   
  context.response["server.TLS"] = channelContext.response["server.TLS"];    
  context.response["server.RemoteAddress"] = channelContext.response["server.RemoteAddress"];    
  context.response["server.RemotePort"] = channelContext.response["server.RemotePort"];    
  context.response["server.LocalAddress"] = channelContext.response["server.LocalAddress"];    
  context.response["server.LocalPort"] = channelContext.response["server.LocalPort"];    
  context.response["server.RawStream"] = channelContext.response["server.RawStream"];  
  context.response["server.Id"] = channelContext["server.Id"]; 
  context.response["server.SessionId"] = channelContext["server.SessionId"];
     
  context["server.IsLocalOrigin"] = true;
  context["server.IsRequest"] = true;
  context.response["server.IsLocalOrigin"] = false;
  context.response["server.IsRequest"] = false;
  
  context["iopa.Body"].on("start", function(){
    context["server.InProcess"] = true;
  });
  
  var that = this; 
 
  context["iopa.Body"].on("finish", function(){
     var ctx = context;
     ctx["server.InProcess"] = true;
     return that._clientMessagePipeline(context).then(function(value){
         ctx["iopa.Events"].emit("server.RequestComplete", ctx);
         ctx["server.InProcess"] = false;
         iopaContextFactory.dispose(ctx);
       that = null;
       ctx = null;
     });
  });
  
  return context;
};

/**
 * @method _disconnect
 * Close the  channel context
 * 
 * @public
 */
UdpClient.prototype._disconnect = function UdpClient_disconnect(channelContext, err) {
    channelContext["iopa.Events"].emit("server.Disconnect");
    channelContext["iopa.CallCancelledSource"].cancel('server.Disconnect');
    channelContext["udp.RawSocket"].close();
    delete this._connections[channelContext["server.SessionId"]];
    iopaContextFactory.dispose(channelContext);
}

/**
 * @method close
 * Close all the underlying sockets
 * 
 * @returns void;
 * @public
 */
UdpClient.prototype.close = function UdpClient_close() {
   for (var key in this._connections)
      this._disconnect(this._connections[key], null);
  
  this._connections = {};
};


module.exports = UdpClient;