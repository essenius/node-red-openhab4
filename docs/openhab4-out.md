## openhab4-out

Sends commands or state updates to an openHAB item.

### Configuration
- ***Name*** *(string)* — Optional. Auto-generated from resource name if empty.
- **Controller** *(openhab4-controller)* — The controller to connect to.
- ***List Filter*** *(string)* — Optional. Text to filter the item list with.
- ***Item name*** *(string)* — Optional. The item to send a command or update to. This is a dropdown that is populated from OpenHAB.
- ***Action*** *(string)* — Optional. The type of action (Command or Update).
- ***Payload*** *(string)* — Optional. The value to send.
- **Priority** *(string)* — Whether message properties override config properties (Message First) or vice versa.

### Inputs
- ***payload*** *(string)* — The payload to send.
- ***topic*** *(string)* — The address of the item to send the command or update to.
- ***action*** *(object)* — the type of action (Command or Update).

### Outputs

- **payload** *(string)* — The payload that was sent.
- **topic** *(string)* — The address of the item that received the action.
- **action** *(object)* — the action that was used.
- **input** *(object)*  — The original input message.

### Details
This node sends actions (commands or state updates) to openHAB items:
- `Command`: Sends a command to an item (e.g., turn a switch ON/OFF).
- `Update`: Updates the state of an item directly.

It will only generate output if the operation was sent successfully.

At least one value for each of the pairings is required:

| Configuration | Message       |
|---------------|---------------|
| `Item Name`   | `msg.topic`   |
| `Payload`     | `msg.payload` |
| `Action`      | `msg.action`  |  

- If, for any of these, both are provided, `Priority` will define which one will be used. If it is `Message First` then the message wins, otherwise the configuration wins.
- The `msg.topic` property can contain the address (`items/ItemName`) or item name only.
- The item name field gets its dropdown values from the OpenHAB server. For that to work, the controller must be configured correctly.

*Note*: If the configuration of a controller is changed (e.g. updated URL or changed credentials), then a deploy is required before the resource list can be displayed.
This is because the controller changes need to be reflected on the server side before the right data can be fetched.
