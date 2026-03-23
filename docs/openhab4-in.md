## openhab-in

Listens to events from a selected openHAB resource (things or items).
    
### Configuration

- ***Name*** *(string)* — Optional. Auto-generated from resource name if empty.
- **Controller** *(openhab4-controller)* — The controller to connect to.
- **Concept** *(string)* — The OpenHAB concept (items/things).
- ***List Filter*** *(string)* — Optional. Text to filter the resource list.
- **Resource** *(string)* — The resource to listen to.
- **Event Types** *(boolean)* - the event types to pass on.
- **Filter events** *(boolean)* — Whether to pass changes only or all events.

### Outputs

- **payload** *(string)* — The new state of the selected item.
- **topic** *(string)* — The resource address (e.g. `items/itemName`).
- **payloadType** *(string)* — The payload type (e.g. `String`).
- **event** *(string)* — the event name as passed in the OpenHAB topic (e.g. `state`) 
- **eventType** *(string)* — The type of event (e.g. `ItemStateEvent`).
- **openhab** *(object)* — the event that came in from OpenHAB.

### Details

This node monitors a specific OpenHAB resource (item or thing). It automatically fills the `Resource` dropdown
based on the selected `Controller` and `Concept`. The dropdown list can be filtered by entering a `List filter`.

For items, the node passes the incoming event's `state` property into `msg.payload`, and for things `statusInfo/status`.

With event types, if `All` is chosen, all events for the resource will trigger the output. If not, only the selected event types will be passed on. 
Notes:
- The `state` event covers both item `state` and thing `status` event types. 
- the `changed` events cover item `statechanged`, and thing `statuschanged`.
- `added`, `updated` and `removed` are life cycle events (when things or items are added, updated or removed) that aren't used a lot typically.
- `Initialized` is not a real OpenHAB event, but it is the event that happens at the start-up of the module (e.g. with a deploy), 
  fetching the current state from OpenHAB. 
- An item update from an out node will trigger a `changed` event, not an `updated` event.

The `State Changes Only` checkbox controls whether the node will pass on changes only, or all (selected) events for the resource regardless of the value. For example, if you choose only `command` in `Event Types` with `state changes only` checked in `Filter Events`, then a command will only trigger the node if a previous command had a different value. If `state changes only` is off, then even commands with the same value will get passed on.

Typical use is selecting `All` event types with `State Changes only` selected. Then only events that will change the state of the node (i.e., carry a different value than the currently stored value) will get passed on. 

### Controller configuration changes

If the configuration of a controller is changed, a deploy is required before the resource list can be displayed.
This is because the controller changes need to be reflected on the server side before the right data can be fetched.
