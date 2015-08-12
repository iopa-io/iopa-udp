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

const iopa = require('iopa')
    , UdpServer = require('./src/udpServer.js')
    , Promise = require('bluebird')
    , util = require('util');

 //  serverPipeline 
  var serverChannelApp = new iopa.App();
  serverChannelApp.use(function(channelContext, next){
    channelContext["server.RawStream"].pipe(process.stdout);
    return next();  
  });
  var serverPipeline = serverChannelApp.build();
 
  //clientChannelPipeline 
  var clientChannelApp = new iopa.App();
  var clientPipeline = clientChannelApp.build();

  var server = new UdpServer({}, serverPipeline, clientPipeline);
  
 if (!process.env.PORT)
  process.env.PORT = 5683;

 server.listen(process.env.PORT, process.env.IP)
   .then(function(){
      console.log("Server is on port " + server.port );
      return server.connect("coap://127.0.0.1");
   })
   .then(function(client){
      console.log("Client is on port " + client["server.LocalPort"]);
      var context = client["server.CreateRequest"]("/", "GET");
      context["iopa.Body"].pipe(context["server.RawStream"] );
      context["iopa.Body"].write("Hello ");
      context["iopa.Body"].end("World\n");
      return null;
   })
   