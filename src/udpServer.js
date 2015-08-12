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
var iopaContextFactory = require('iopa').context.factory;
var dgram = require('dgram');
var util = require('util');
var events = require('events');
var iopaStream = require('iopa-common-stream');
var net = require('net');
var UdpClient = require('./udpClient.js');

Promise.promisifyAll(dgram);

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
function UdpServer(options, serverPipeline, clientPipeline) {
  if (typeof options === 'function') {
    serverPipeline = options;
    options = {};
  }

  this._options = options;

  if (serverPipeline)
  {
    this._appFunc = serverPipeline;
    this.on('data', this._invoke.bind(this));
  }
  
   if (clientPipeline)
  {
    this._udpClient = new UdpClient(options, clientPipeline);
    this._clientMessagePipeline = clientPipeline;
  }
    
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
 
    if (port == undefined) 
    {
     port = 0;
    }
   
  if (this._udp)
       return Promise.reject('Already listening');
       
    if (address && net.isIPv6(address))
      this._options["server.LocalPortType"] = 'udp6';

    if (!this._options["server.LocalPortType"])
     this._options["server.LocalPortType"] = 'udp4'

    if (!this._options["server.LocalPortReuse"])
      this._options["server.LocalPortReuse"] = true;
      
   if (Number(process.version.match(/^v(\d+\.\d+)/)[1])>0.11)
    {
       //RE-USE ADDRESS IF NODE 0.12 OR LATER
       this._udp = dgram.createSocket({"type": this._options["server.LocalPortType"],  "reuseAddr": this._options["server.LocalPortReuse"]})
    }
    else
    {
       this._udp = dgram.createSocket(this._options["server.LocalPortType"]);
    }

    var that = this;
    
    this._udp.on("message", this._onMessage.bind(this));
    
    
    this._port = port;
    this._address = address;
   
   return this._udp.bindAsync(port, address || '0.0.0.0').then(function(){
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
           
        return Promise.resolve(that._linfo);
    });
};

Object.defineProperty(UdpServer.prototype, "port", { get: function () { return this._port; } });
Object.defineProperty(UdpServer.prototype, "address", { get: function () { return this._address; } });

UdpServer.prototype._onMessage = function UdpServer_onMessage(msg, rinfo) {
  var context = iopaContextFactory.createContext();
  context["iopa.Method"] = "UDP";
 
  context["server.TLS"] = false;
  context["server.RemoteAddress"] = rinfo.address;
  context["server.RemotePort"] = rinfo.port;
  context["server.LocalAddress"] = this._address;
  context["server.LocalPort"] = this._port;
  context["server.RawStream"] =  new iopaStream.IncomingMessageStream();
  context["server.RawStream"].append(msg);
  context["server.IsLocalOrigin"] = false;
  context["server.IsRequest"] = true;
  context["server.SessionId"] = rinfo.address + ':' + rinfo.port;
  context["server.InProcess"] = false;
  
  var response = context.response;
  response["server.TLS"] = context["server.TLS"];
  response["server.RemoteAddress"] = context["server.RemoteAddress"];
  response["server.RemotePort"] = context["server.RemotePort"];
  response["server.LocalAddress"] = context["server.LocalAddress"];
  response["server.LocalPort"] = context["server.LocalPort"];
  response["server.RawStream"] = new iopaStream.OutgoingStreamTransform(this._write.bind(this, context.response));
  context.response["udp.RawSocket"] = this._udp;
  response["server.IsLocalOrigin"] = true;
  response["server.IsRequest"] = false;

  this.emit('data', context)
}

UdpServer.prototype._write = function UdpServer_write(context, chunk, encoding, done) { 
  if (typeof chunk === "string") {
              chunk = new Buffer(chunk, encoding);
          }
 
   context["udp.RawSocket"].send(chunk, 0, chunk.length,  context["server.RemotePort"], context["server.RemoteAddress"], done );
 }

UdpServer.prototype._invoke = function UdpServer_invoke(context) {
  context["server.createRequest"] = this.createResponseRequest.bind(this, context);
 
  var that = this;
  var ctx = context;
   context["server.InProcess"] = true;
  return this._appFunc(context).then(function(value){
     ctx["server.InProcess"] = false;
     iopaContextFactory.dispose(ctx);
     that = null;
     ctx = null;
     return value;
  });
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
 * Creates a new IOPA Request using a UDP Url including host and port name
 *
 * @method UdpClient_CreateRequest

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
 * Creates a new IOPA Request using a Udp Url including host and port name
 *
 * @method createRequest

 * @parm {string} urlStr url representation of ://127.0.0.1/hello
 * @parm {string} [method]  request method (e.g. 'GET')
 * @returns {Promise(context)}
 * @public
 */
UdpServer.prototype.createResponseRequest = function UdpServer_createResponseRequest(originalContext, path, method){
  var urlStr = originalContext["iopa.Scheme"] + 
   "://" +
   originalContext["server.RemoteAddress"] + ":" + originalContext["server.RemotePort"] + 
  originalContext["iopa.PathBase"] +
  originalContext["iopa.Path"] + path;
  
  var context = iopaContextFactory.createRequest(urlStr, method); 
 
  context["iopa.Body"] = new iopaStream.OutgoingStream();
  context.response["iopa.Body"] = new iopaStream.IncomingMessageStream();
  
  //REVERSE STREAMS SINCE SENDING REQUEST (e.g., PUBLISH) BACK ON RESPONSE CHANNEL
  context["server.RawStream"] = originalContext.response["server.RawStream"];
  context.response["server.RawStream"] = originalContext["server.RawStream"];
  
  context["iopa.Body"].on("start", function(){
    context["server.InProcess"] = true;
  });
  
  var that = this; 
    
  context["iopa.Body"].on("finish", function(){
     var ctx = context;
     ctx["server.InProcess"] = true;
     return that._clientMessagePipeline(context).then(function(value){
          iopaContextFactory.dispose(ctx);  
       that = null;
       ctx = null;
       return value;
     });
  });
  
  return context;
};

/**
 * @method close
 * Close the underlying socket and stop listening for data on it.
 * 
 * @returns {Promise()}
 * @public
 */
UdpServer.prototype.close = function UdpServer_close() {
   return this._udp.closeAsync();
};

module.exports = UdpServer;