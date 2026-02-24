# @essenius/node-red-openhab4

## Description

Nodes facilitating integration of [openHAB 4](http://www.openhab.org) with [Node-RED](http://nodered.org) v4 and higher, allowing for the use of Node Red as a rules engine for OpenHAB.

Inspired by https://github.com/pdmangel/node-red-contrib-openhab2. Largely rewritten and made to work with openHAB 4+, which has a different Rest API from openHAB 2 (e.g. now supports auth).

## Nodes

### openhab4-controller

Configuration node for communication with an openHAB controller, which is used by all the other nodes.

*Configuration:*
- Name: name for the configuration node (mandatory as referred to by the other nodes)
- URL: the base URL of OpenHAB, e.g. <kbd>https://my-openhab:8443/</kbd>
- Certificates / Allow self signed: switch off certificate checking (default: off, i.e. checking is on)
- Token: the token to use for authentication (bearer)
- Username: if token is not used, user name and password can be used for basic authentication (default empty, means no authentication)
- Password: the password to authenticate (default empty)
- Event Filter: the events to be captured in a comma separated list, using * as wildcard (e.g. `*/items/*` for all item events)
- Retry timeout: the timeout in milliseconds after which the system stops retrying to connect. Empty means keep trying forever.

### openhab4-in

Listens to state changes of a selected openHAB Item.

*Configuration:*
- Name: the name of the node instance (default empty, then takes over the item name)
- Controller: the openHAB controller
- Concept: the OpenHAB concept (Things, Items)
- List Filter: the filter applied to the resource dropdown. Empty means no filter.
- Resource: the name of the item to listen to.
- Filter Events / State changes only: only pass on events that changed the value.

*Output messages:*

- <code>msg.topic</code>: concept/resource, e.g.<kbd>items/myItem</kbd>
- <code>msg.payload</code>: the new state of the selected item
- <code>msg.payloadType</code>: the type of the value, e.g. String
- <code>msg.eventType</code>: the type of the value, e.g. String
- <code>msg.openhab</code>: the incoming event from OpenHAB along with name, full_name and concept.

### openhab4-health

Monitors the health and status of the openHAB4 controller connection.

*Configuration:*
- Name: the node name (default empty)
- Controller: the openHAB controller

*Output messages (2 channels):*

Channel 1:
- <code>msg.topic</code> : <kbd>ConnectionStatus</kbd>
- <code>msg.payload</code> : OpenHAB connection status (<kbd>ON</kbd> = online, <kbd>OFF</kbd> = offline).

Channel 2:
- <code>msg.topic</code> : <kbd>ConnectionError</kbd>
- <code>msg.payload</code> : the error message

### openhab4-out

Sends commands or state updates to a selected openHAB Item.

*Configuration:*
- Name: name of the node instance (default empty, then takes over the item name)
- Controller: the openHAB controller
- Filter Items: the filter applied to the dropdown. Empty means no filter. 
- Item Name: the item to set. overridden by <code>msg.topic</code>.
- Operation: <code>command</code> or <code>update</code>. Overriden by<code>msg.openhabControl.operation</code>.
- Payload : The value to send to the selected item. Overriden by <code>msg.payload</code>.

*Output messages(1 channel):*

If output to OpenHAB is successful, the input message is copied to the output channel, augmented with the used parameters.
The input message is copied into <kbd>inputMessage</kbd>.

### openhab4-get

Gets an openHAB item (i.e. fetch on demand).

*Configuration:*
- Name: the name of the node instance (default empty, then takes over the item name) 
- Controller: the openHAB controller
- Concept: the OpenHAB concept (e.g. Things/Items)
- List Filter: the filter applied to the dropdown. Empty means no filter.
- Resource: the name of the resource to get. Overridden by <code>msg.topic</code>.

*Output messages (1 channel):*

Channel 1:
The input message, augmented with the parameters actually used, and:
- <code>msg.openhab</code> : the response received from OpenHAB
- <code>msg.inputMessage</code> : copy of incoming message payload.

## Test flow

An example flow is provided in examples/test-flow-localhost.json. This expects the OpenHAB server at http://localhost:8080 and uses an item called TestItem.
it will create a separate tab with a couple of flows that use all the nodes. There is also a test flow generator which uses environment variables for OpenHAB protocol, server, port and test item. See [DEVELOPMENT.md](DEVELOPMENT.md) for more details.

## Development Guide

See [DEVELOPMENT.md](DEVELOPMENT.md).

## Release notes

### v0.2.74

- Nodes openhab4-controller and openhab4-get working 
- First push to GitHub

### v0.2.91
- openhab4-in working
- loads of code optimizations

### v0.2.93
- openhab4-out added
- Fixed JSON parsing error ("Unexpected end of JSON input") when openHAB returns empty responses for successful commands
- Improved error handling for EventSource message parsing in controller and events nodes
- Enhanced robustness against malformed JSON in event streams

### v0.2.96
- openhab4-health added

### v0.2.101
- reduced duplication
- eliminated clutter
- fixed errors with node names, resulting in IDs being used in debug window.

### v0.2.120
- implemented item filter for get, in and out nodes
- cleaned up documentation
  
### v0.2.145
- support for https and basic authentication

### v0.2.147
- added unit testing framework (mocha, chai@4, node-red-node-test-helper, sinon, proxyquire) and initial unit tests

### v0.2.212
- branch coverage over 90%, several defects fixed, refactored for better testability and duplication elimination, enabled ESLint
  
### v0.2.223
- Introduced last run timestamp with status

### v0.9.0
- First pre-release on npm

### v0.9.2
- Dependency fixes, added example for localhost.

### v0.9.5
- Fixed bug in item retrieval for in/out/get node definition (eliminated duplicates).

### v0.10.14
- Major overhaul to support OpenHAB 2 and allow other concepts besides items. Breaking change: in node now only has one output channel.
 
## Dependency restrictions

As this is a commonjs project, chai needs to stay at version 4, and node-fetch at version 2. Newer versions do not support commonjs.
The dependency on eventsource 3 introduces a dependency on node 18, which causes this node to require at least Node Red 4.
