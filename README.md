# @essenius/node-red-openhab4

## Description

Nodes facilitating integration of [openHAB 4](http://www.openhab.org) with [Node-RED](http://nodered.org), allowing for the use of Node Red as a rules engine for OpenHAB.

Inspired by https://github.com/pdmangel/node-red-contrib-openhab2. Largely rewritten and made to work with openHAB 4, which has a different Rest API from openHAB 2.

This project is work in progress, and not yet available in npm.

## Nodes

### openhab4-controller

Configuration node for communication with an openHAB controller, which is used by all the other nodes.

*Configuration:*
- Name: name for the configuration node (mandatory as referred to by the other nodes)
- Protocol: <kbd>http</kbd> or <kbd>https</kbd>
- Allow Self Signed Certificates: switch off certificate checking (default off)
- Host: the host name or ip address (default localhost)
- Port: the ip port (default <kbd>8080</kbd>)
- Path: the additional base path (default empty)
- Username: the user name to authenticate on openHAB (default empty)
- Password: the password to authenticate (default empty)

### openhab4-in

Listens to state changes of a selected openHAB Item.

*Configuration:*
- Name: the name of the node instance (default empty, then takes over the item name)
- Controller: the openHAB controller
- Filter Items: the filter applied to the dropdown. Empty means no filter.
- Item Name: the name of the item to listen to. Overrides <code>msg.item</code>.

*Output messages (2 channels):*

Channel 1:
- <code>msg.item</code>: the name of the item
- <code>msg.topic</code>: <kbd>StateEvent</kbd>
- <code>msg.payload</code>: the new state of the selected item

Channel 2:
- <code>msg.item</code>: the name of the item
- <code>msg.topic</code>: <kbd>RawEvent</kbd>
- <code>msg.payload</code>:  raw (unprocessed) event for the selected item

### openhab4-health

Monitors the health and status of the openHAB4 controller connection.

*Configuration:*
- Name: the node name (default empty)
- Controller: the openHAB controller

*Output messages (3 channels):*

Channel 1:
- <code>msg.topic</code> : <kbd>ConnectionStatus</kbd>
- <code>msg.payload</code> : connection status (<kbd>ON</kbd> or <kbd>OFF</kbd>)

Channel 2:
- <code>msg.topic</code> : <kbd>ConnectionError</kbd>
- <code>msg.payload</code> : error message

Channel 3:
- <code>msg.topic</code> : <kbd>RawEvent</kbd>
- <code>msg.payload</code> :  raw (unprocessed) event for all items

### openhab4-out

Sends commands or state updates to a selected openHAB Item.

*Configuration:*
- Name: name of the node instance (default empty, then takes over the item name)
- Controller: the openHAB controller
- Filter Items: the filter applied to the dropdown. Empty means no filter. 
- Item Name: the item to set. overrides <code>msg.item</code>.
- Topic: <code>ItemCommand</code> or <code>ItemUpdate</code>. Overrides <code>msg.topic</code>.
- Payload : The command or update value to send to the selected item. Overrides <code>msg.payload</code>.

*Output messages(1 channel):*

Channel 1: if output is successful, the input message is copied to this channel.

### openhab4-get

Gets an openHAB item (i.e. fetch on demand).

*Configuration:*
- Name: the name of the node instance (default empty, then takes over the item name) 
- Controller: the openHAB controller
- Filter Items: the filter applied to the dropdown. Empty means no filter.

- Item Name: the item to get. Overrides <code>msg.item</code>.

*Output messages (1 channel):*

Channel 1:
The input message with addition of:
- <code>msg.payload</code> : the item object (name, label, state, ...)
- <code>msg.payload_in</code> : copy of incoming message payload.

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

## Development Notes

**Important**: When developing/testing, always restart Node-RED after uploading a new package version. Node-RED caches modules in memory and won't use updated code until restarted.