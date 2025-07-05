# @essenius/node-red-openhab4

## Description

Nodes facilitating integration of [openHAB 4](http://www.openhab.org) with [Node-RED](http://nodered.org), allowing for the use of Node Red as a rules engine for OpenHAB.

Inspired by https://github.com/pdmangel/node-red-contrib-openhab2. Largely rewritten and made to work with openHAB, 4 which has a different Rest API from openHAB 2.

This project is work in progress, and not yet available in npm.

## Nodes

### openhab4-controller

Configuration node for communication with an openHAB controller.

*Configuration:*
- Name : name for the configuration node (mandatory as referred to by the other nodes)
- Protocol : "http" or "https"
- Host : the host name or ip address (default localhost)
- Port : the ip port (default 8080)
- Path : the additional base path (default empty)
- Username : the user name to authenticate on openHAB (default empty)
- Password : the password to authenticate (default empty)

### openhab4-in

Listens to state changes of a selected openHAB Item.

*Configuration:*
- Name: the name of the node instance (default empty, then takes over the item name)
- Controller: the openHAB controller
- Item: the name of the item to listen to. Overrides <kbd>msg.item</kbd>.

*Output messages (2 channels):*

Channel 1:
- <kbd>msg.item</kbd>: the name of the item
- <kbd>msg.topic</kbd>: "StateEvent"
- <kbd>msg.payload</kbd>: the new state of the selected item

Channel 2:
- <kbd>msg.item</kbd>: the name of the item
- <kbd>msg.topic</kbd>: "RawEvent"
- <kbd>msg.payload</kbd>:  raw (unprocessed) event for the selected item

### openhab4-monitor

Monitors the openhab2-controller node.

*Configuration:*
- Name: the node name (default empty)
- Controller: the openHAB controller

*Messages injected in NodeRED flows (3 channels):*

Channel 1:
- <kbd>msg.topic</kbd> : "ConnectionStatus"
- <kbd>msg.payload</kbd> : connection status ('ON' or 'OFF')

Channel 2:
- <kbd>msg.topic</kbd> : "ConnectionError"
- <kbd>msg.payload</kbd> : error message

Channel 3:
- <kbd>msg.topic</kbd> : "RawEvent"
- <kbd>msg.payload</kbd> :  raw (unprocessed) event for all items

### openhab4-out

Sends commands or state updates to a selected openHAB Item.

*Configuration:*
- Name: name of the node instance (default empty, then takes over the item name)
- Controller: the openHAB controller
 
Overriding the input message if set:
- Item: the item to set. overrides <kbd>msg.item</kbd>.
- Topic: <kbd>ItemCommand</kbd> or <kbd>ItemUpdate</kbd>. Overrides <kbd>msg.topic</kbd>.
- Payload : The command or update value to send to the selected item. Overrides <kbd>msg.payload</kbd>.

*Output messages(1 channel):*

Channel 1: if output is successful, the input message is copied to this channel.

### openhab4-get

Gets an openHAB item (i.e. fetch on demand).

*Configuration:*
- Name: the name of the node instance (default empty, then takes over the item name) 
- Controller: the openHAB controller
- Item: the item to get. Overrides <kbd>msg.item</kbd>.

*Output messages (1 channel):*

Channel 1:
The input message with addition of:
- <kbd>msg.payload</kbd> : the item object (name, label, state, ...)
- <kbd>msg.payload_in</kbd> : copy of incoming message payload.

## Release notes

### v0.2.74

- Nodes openhab4-controller and openhab4-get working 
- First push to GitHub
