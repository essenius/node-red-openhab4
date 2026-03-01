## openhab4-controller

Configuration node for communication with an openHAB4 controller.

### Configuration
    
    ### Configuration

- ***Name*** *(string)* — Optional. Auto-generated from url if empty.
- **URL** *(string)* — The URL of the OpenHAB server to connect to.
- **Certificates / ALlow Self Signed** *(boolean)* — Whether to allow self signed certificates (option disabled with HTTP).
- ***Token*** *(string)* — Optional. API token for authenticated OpenHAB servers (option disabled with HTTP).
- ***User name*** *(string)* — Optional. User name for basic authentication in case API tokens are not possible (Disabled if token is filled in). 
- ***Password*** *(password)* — Optional. Password for basic authentication. 
- **Event Filter** *(string)* — Comma separated list of topics, e.g. `*/items/*` for all item events (default `*` for no filtering).
- ***Retry Timeout*** *(number)* — Elapsed time in milliseconds after which an HTTP call fails (empty: retrying forever).
- 
- **Filter events** *(boolean)* — Whether to pass changes only or all events.

### Details
This configuration node defines the connection parameters for an openHAB4 server. 
It is referenced by all other openHAB4 nodes in your flows.
    
- *Authentication*: If a `Token` is provided, bearer authentication will be used. If a `User Name` (and `Password`) are provided, HTTP Basic Authentication will be used. If all are empty, no authentication is used.
- *Event Stream*: The controller manages the Server-Sent Events (SSE) connection for real-time event monitoring used by event, health and in nodes. 
A filter can be applied if e.g. you are only interested in item events and want to limit the bandwidth usage between OpenHAB and Node-Red. 
- *Multiple Controllers*: You can create multiple controller configurations to connect to different openHAB instances or use different authentication credentials.
- *Retry timeout*: this is for indiviual HTTP calls used by the get and out nodes, not for the event stream (which will always retry indefinitely).
- The controller can cope with OpenHAB versions 2 and above, and has been tested with versions 2.5.9 and 4.3.5.