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

const iopa = require('iopa')
    , udp = require('./index.js')
    , util = require('util');

 //  serverPipeline 
  var app = new iopa.App();
  app.use(function(channelContext, next){
    channelContext["server.RawStream"].pipe(process.stdout);
    return next();  
  });
 
   var server = udp.createServer(app.build());
  
 if (!process.env.PORT)
  process.env.PORT = 5683;

 server.listen(process.env.PORT, process.env.IP)
   .then(function(){
      console.log("Server is on port " + server.port );
      return server.connect("coap://127.0.0.1");
   })
   .then(function(client){
      console.log("Client is on port " + client["server.LocalPort"]);
     console.log("Client is on port " + client["server.LocalPort"]);
      var options = { "iopa.Body": "Hello World\n" }
      return client.fetch("/", options, function (context) {
        context["server.RawStream"].write(context["iopa.Body"]);
      });
   })
   