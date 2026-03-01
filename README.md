# @essenius/node-red-openhab4

## Description

Nodes facilitating integration of [openHAB](http://www.openhab.org) with [Node-RED](http://nodered.org) v4 and higher, allowing for the use of Node Red as a rules engine for OpenHAB.

Inspired by https://github.com/pdmangel/node-red-contrib-openhab2. Largely rewritten and made to work with openHAB 4+, which has a slightly different Rest API from openHAB 2, and supports authentication.

## Nodes

### Controller
- [openhab4-controller](docs/openhab4-controller.md) controls the connection with OpenHAB

### Input / Output
- [openhab4-in](docs/openhab4-in.md) - listens to a single resource (item or thing)
- [openhab4-get](docs/openhab4-get.md) - requests the status of a single resource (item or thing)
- [openhab4-out](docs/openhab4-out.md) - sends a command or an update to an item

### Diagnostics
- [openhab4-health](docs/openhab4-health.md) - reports on the connection status and errors
- [openhab4-events](docs/openhab4-events.md) - listen to the (potentially filtered) event stream

## Test flow

An [example flow](examples/test-flow-localhost.json) is provided. This expects the OpenHAB server at `http://localhost:8080` and uses an item called `TestItem`.
Copy the content into the clipboard, and import it into Node-Red (via `Ctrl-i`). it will create a separate tab with a couple of flows that use all the nodes. 

There is also a [test flow generator](examples/generate-test-flow.js) which uses environment variables for OpenHAB protocol, server, port and test item. See [development.md](docs/development.md) for more details.

## Development Guide
See [development.md](docs/development.md).

## Release notes

### v0.2.74
- Nodes openhab4-controller and openhab4-get working 
- First push to GitHub

### v0.9.0
- First pre-release on npm

### v0.9.2
- Dependency fixes, added example for localhost.

### v0.9.5
- Fixed bug in item retrieval for in/out/get node definition (eliminated duplicates).

### v0.10.29
- Major overhaul to support OpenHAB 2 and allow other concepts besides items. 
- Breaking changes: interfaces changed to be more aligned with Node Red conventions. Now requires Node Red 4.
 
## Dependency restrictions
- As this is a commonjs project, chai needs to stay at version 4, and node-fetch at version 2. Newer versions do not support commonjs.
- The dependency on eventsource 3 introduces a dependency on Node.JS v18, which causes this node to require at least Node-Red v4.
