## openhab4-events

Monitors the openHAB event bus and outputs events as they occur.

### Configuration

- ***Name*** *(string)* — Optional. Auto-generated from resource name if empty.
- **Controller** *(openhab4-controller)* — The controller to connect to.
- ***Event Filter*** *(string)* — Optional. Address to filter the events with (e.g. `items/*`).

### Outputs

- **topic** *(string)* — The resource address (e.g. `items/itemName`).
- **payload** *(string)* — The retrieved value of the resource.
- **payloadType** *(string)* — The payload type (e.g. `string`).
- **eventType** *(string)* — The type of event (e.g. `ItemStateEvent`).
- **openhab** *(object)* — the event that came in from OpenHAB.

### Details
    
This node connects to the OpenHAB event bus, and forwards all events that pass the filter.
    
Common event types include:
- `ItemStateChangedEvent` - When an item's state changes
- `ItemCommandEvent` - When a command is sent to an item
- `GroupItemStateChangedEvent` - When a group item's state changes
- `ItemUpdatedEvent` - When an item is updated

You will typically only use this event if you want to listen to more resources at the same time. 
It is more or less a last resort. For most workflows, the openhab-in node is probably better suited.
