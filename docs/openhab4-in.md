## openhab-in

Listens to events from a selected openHAB resource (things or items).
    
### Configuration

- ***Name*** *(string)* — Optional. Auto-generated from resource name if empty.
- **Controller** *(openhab4-controller)* — The controller to connect to.
- **Concept** *(string)* — The OpenHAB concept (items/things).
- ***List Filter*** *(string)* — Optional. Text to filter the resource list.
- **Resource** *(string)* — The resource to listen to.
- **Filter events** *(boolean)* — Whether to pass changes only or all events.

### Outputs

- **payload** *(string)* — The new state of the selected item.
- **topic** *(string)* — The resource address (e.g. `items/itemName`).
- **payloadType** *(string)* — The payload type (e.g. `string`).
- **eventType** *(string)* — The type of event (e.g. `ItemStateEvent`).
- **openhab** *(object)* — the event that came in from OpenHAB.

### Details

This node monitors a specific OpenHAB resource (item or thing). It automatically fills the `Resource` dropdown
based on the selected `Controller` and `Concept`. The dropdown list can be filtered by entering a `List filter`.
The `State Changes Only` checkbox controls whether the node will pass on changes only, or all incoming events
regarding the selected resource.

For items, the node passes the incoming event's `state` property into `msg.payload`, and for things `statusInfo/status`.

*Note*: If the configuration of a controller is changed, a deploy is required before the resource list can be displayed.
This is because the controller changes need to be reflected on the server side before the right data can be fetched.
