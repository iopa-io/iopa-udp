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

var UdpComplex = require('./src/server/udpComplex.js');
var Middleware = require('./src/server/udp.js');
var UdpSimplex = require('./src/server/udpSimplex.js');

module.exports = Middleware;
module.exports.createServer = function(options, appFunc){return new UdpComplex(options, appFunc);}
module.exports.Server = UdpComplex;
module.exports.Simple = UdpSimplex;
