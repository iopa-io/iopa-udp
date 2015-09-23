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
    , udp = require('../index.js')
     , util = require('util')
    , Events = require('events')
    , BufferList = require('bl');
    
var should = require('should');

describe('#UdpServer()', function() {
       var server;
       var events = new Events.EventEmitter();
       var data = new BufferList();
        
       before(function(done){
        
        //  serverPipeline 
          var app = new iopa.App();
          app.use(function(channelContext, next){
            channelContext["server.RawStream"].on("data", function(chunk){
               events.emit("test.Data", chunk);
               data.append(chunk);
            });
             return next();  
          });
            
          server = udp.createServer({}, app.build());
  
         if (!process.env.PORT)
          process.env.PORT = 5683;
          
        server.listen(process.env.PORT, process.env.IP)
          .then(function(){
           done();
           });
 
      });
      
    it('server should listen', function() {
        console.log("Server is on port " + server.port );
    });
    
  
    it('client should connect and server should receive client packets', function(done) {
        server.connect("coap://127.0.0.1")
       .then(function (client) {
                console.log("Client is on port " + client["server.LocalPort"]);
                events.on("test.Data", function (data) {
                    data.toString().should.equal('Hello World');
                    done();
                });
                client["server.Fetch"]("/",
                    { "iopa.Method": "GET", "iopa.Body": new BufferList() },
                    function (context) {
                        try{
                        context["iopa.Body"].pipe(context["server.RawStream"]);
                        context["iopa.Body"].write("Hello World");
                         } catch (ex) {
                            console.log(ex);
                            return Promise.reject(ex);
                        }
                    });
            })
    });
    
    it('server should close', function() {
        server.close();
    });
 
    it('server disconnects, client should error', function(done) {
      
          //serverPipeline 
          var app = new iopa.App();
          app.use(function(channelContext, next){
              return next().then(function(){ return new Promise(function(resolve, reject){
                 channelContext["udpPacketServer.SessionClose"] = resolve;
                 channelContext["udpPacketServer.SessionError"] = reject;
                }); 
            });
          });

          var server3 = udp.createServer(app.build());
  
         if (!process.env.PORT)
           process.env.PORT = 1883;
          
        server3.listen(process.env.PORT, process.env.IP)
          .then(function(){
                return server3.connect("coap://127.0.0.1")
              })
          .then(function(client){
             client["iopa.CancelToken"].onCancelled(function(reason){ 
               reason.should.equal("disconnect");
               done();
             });
                       
              server3.close();
              return null;
          });
    });
    
});
