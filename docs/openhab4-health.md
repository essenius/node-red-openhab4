## openhab4-health

Monitors the health and status of the openHAB4 controller connection.
    
### Configuration
- ***Name*** *(string)* — Optional. Auto-generated from resource name if empty.
- **Controller** *(openhab4-controller)* — The controller to connect to.

### Outputs

1. Connection Status
  - **payload** *(string)* — `ON` (connected) or `OFF` (disconnected).
  - **topic** *(string)* — `ConnectionStatus`.  

2. Connection Errors
  - **payload** *(object)* — will usually contain type (type of issue), status (HTTP status code) and a brief message.
  - **topic** *(string)* — `GlobalError`.
  - **context** *(object)* — More details where the issue happened, for troubleshooting. Usually contains originating node and topic.

### Details

This node provides system-level monitoring of the openHAB connection. 

Output 1 provides the connection status. 
If the connection breaks down, a message with the payload 'OFF' will be sent here. When the connection is re-established, 'ON' will be sent.

Output 2 provides details when it detected errors. These can be system level errors such as connectino problems, or they can be 
domain level errors such as wrong item names in get or out nodes.