## openhab4-get
Retrieves the current state of an openHAB item on demand.
    
### Configuration
- ***Name*** *(string)* — Optional. Auto-generated from resource name if empty.
- **Controller** *(openhab4-controller)* — The controller to connect to.
- **Concept** *(string) — The OpenHAB concept (items/things). Pairs with `msg.topic` (together with `Resource`).
- ***List Filter*** *(string)* — Optional. Text to filter the item list with.
- ***Resource*** *(string)* — Optional. The openhab resource to retrieve the value of. Pairs with `msg.topic` (togeter with `Concept`).
- **Priority** *(string)* — Whether message properties override config properties (Message First) or vice versa.

### Inputs
- ***topic*** *(string)* The address (e.g. items/itemName) of the resource to retrieve. Optional if configured in the node.

### Outputs

- **payload** *(string)* — The retrieved resource value.
- **topic** *(string)* — The address (e.g. `items/itemName`) of the resource that was queried.
- **payloadType** *(string)* — The payload type (e.g. `string`).
- **eventType** *(string)* — The type of event (e.g. `ItemStateEvent`).
- **openhab** *(object)* — the retrieved resource data from OpenHAB. Note that this is a different format than the events provide.
- **input** *(object)* the incoming message

### Details

This node fetches the current state of an openHAB item or thing. The resource address can be specified either in the 
`Concept`/`Resource` pair in the node configuration, or in the `msg.topic` property. The priority setting determines 
which takes precedence if both are provided. Use this node if you want to fetch the current state of a resource,
rather than get notified if it changes (in which case the openhab-in node would be better suited).

*Note*: If the configuration of a controller is changed, a deploy is required before the resource list can be displayed.
This is because the controller changes need to be reflected on the server side before the right data can be fetched.