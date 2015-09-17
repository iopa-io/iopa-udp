# [![IOPA](http://iopa.io/iopa.png)](http://iopa.io) iopa-udp 

[![Build Status](https://api.shippable.com/projects/55f6fa2c1895ca4474152f9b/badge?branchName=master)](https://app.shippable.com/projects/55f6fa2c1895ca4474152f9b) 
[![IOPA](https://img.shields.io/badge/iopa-middleware-99cc33.svg?style=flat-square)](http://iopa.io)
[![limerun](https://img.shields.io/badge/limerun-certified-3399cc.svg?style=flat-square)](https://nodei.co/npm/limerun/)

[![NPM](https://nodei.co/npm/iopa-udp.png?downloads=true)](https://nodei.co/npm/iopa-udp/)

## About
`iopa-udp` is an API-First User Datagram Protocol (UDP) stack for Internet of Things (IoT), based on the Internet of Protocols Alliance (IOPA) specification 

It servers UDP messages in standard IOPA format and allows existing middleware for Connect, Express and limerun projects to consume/send each mesage.

It is an open-source, standards-based, lighter-weight replacement for other UDP clients and brokers 

Written in plain javascript for maximum portability to constrained devices, and consumes the standard node.js `require('net')` library

Makes UDP connections look to an application like a standard Request Response REST (HTTP-style) message so little or no application changes required to support multiple REST protocols on top of this transport.

## Status

Fully working server and client.

## Installation

    npm install iopa-udp
    
## Install typings for Intellisense (e.g., Visual Studio Code, Sublime TSD plugins, etc.)

    npm run typings


Includes:

### Server Functions

  * listen
  * close
  
### Client Functions
  * connect
  * context.fetch(url, options, callback)
  * context[server.RawStream].write();
  
## Installation

    npm install iopa-udp

 