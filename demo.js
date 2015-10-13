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


global.Promise = require('bluebird');

const iopa = require('iopa'),
    iopaStream = require('iopa-common-stream'),
    IopaUdp = require('./index.js'),
    util = require('util');

 //  serverPipeline 
  var app = new iopa.App();
  app.use(IopaUdp);

  app.channeluse(function(channelContext, next){
    console.log("CHANNEL");
     channelContext["server.RawStream"].pipe(process.stdout);
   
    return next();
  });
  
  app.use(function(channelContext, next){
    console.log("INVOKE");
    channelContext["server.RawStream"].pipe(process.stdout);
    return next();  
  });
  
  app.connectuse(function(channelContext, next){
    console.log("CONNECT");
    return next();
  });
  
      
 app.createuse(function(context, next){
    console.log("CREATE");
    context["iopa.Body"] = new iopaStream.OutgoingStream();
    context["iopa.Body"].once("finish", context.dispatch.bind(this, context));  
    return next();
  });
  
  app.dispatchuse(function(context, next){
    console.log("DISPATCH");
    context["iopa.Body"].pipe(context["server.RawStream"])
    return next();
  });
   
 if (!process.env.PORT)
  process.env.PORT = 5683;

 var server = app.createServer("udp:");
 
 server.listen(process.env.PORT, process.env.IP)
   .then(function(linfo){
      console.log("Server is on port " + server["server.LocalPort"] );
      return server.connect("coap://127.0.0.1");
   })
   .then(function(client){
      console.log("Client is on port " + client["server.LocalPort"]);
       context = client.create("/").end("Hello World\n");
    });
   