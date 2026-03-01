## openhab4-out
Sends commands or state updates to an openHAB item.

### Configuration
- ***Name*** *(string)* — Optional. Auto-generated from resource name if empty.
- **Controller** *(openhab4-controller)* — The controller to connect to.
- ***List Filter*** *(string)* — Optional. Text to filter the item list with.
- ***Item name*** *(string)* — Optional. The item to send a command or update to. Pairs with `msg.topic` (appending `items/`).
- ***Operation*** *(string)* — Optional.The type of operation: `Command` or `Update`. Pairs with `msg.openhabControl.operation`.
- ***Payload*** *(string)* — Optional. The value to send. Pairs with `msg.payload`.
- **Priority** *(string)* — Whether message properties override config properties (Message First) or vice versa.

### Inputs
- ***payload*** *(string)* — The payload to send (pairs with `Payload`).
- ***topic*** *(string)* — The address of the item to send the command/update to (e.g. `items/myItem`). Only items are supported; if no slash is included, it is assumed to be an item name.
- ***openhabControl.operation*** *(string)* — The type of operation: `command` or `update`.

### Outputs

- **payload** *(string)* — The payload that was sent.
- **topic** *(string)* — The address (items/itemName) of the item that received the command/update.
- **openhabControl.operation** *(string)* — The type of operation that was performed
- **input*** *(object)*  — The original input message

### Details
This node sends commands or state updates to openHAB items:</p>
- `Command`: Sends a command to an item (e.g., turn a switch ON/OFF)
- `Update`: Updates the state of an item directly

Only items can be used in this node, but to keep consistency with the other nodes. `msg.topic` still supports the `items/itemname` format. It can also be just the item name. 

The node requires either `Item Name` or `msg.topic` to be provided. If both are provided, `Priority` will define which one wins.
The same goes for `Payload` / `msg.payload` and `Operation` / `msg.openhabControl.operation`. 
    
The node will only generate output if the command/update was sent successfully. 

*Note*: If the configuration of a controller is changed, a deploy is required before the resource list can be displayed.
This is because the controller changes need to be reflected on the server side before the right data can be fetched.
