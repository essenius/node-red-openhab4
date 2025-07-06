# Test Configuration Example

To run the test scripts with your own openHAB instance, you have several options:

## Test Flow Generation

### Option 1: Generate test flow with environment variables (Recommended)
```bash
# Windows PowerShell
$env:OPENHAB_HOST="your.openhab.host"
$env:OPENHAB_PORT="8080"
node generate-test-flow.js

# Linux/Mac
OPENHAB_HOST=your.openhab.host OPENHAB_PORT=8080 node generate-test-flow.js
```

This creates `test-flow-generated.json` with your specific configuration that you can import into Node-RED.

### Option 2: Manual editing
Edit `test-flow.json` directly and change the controller node's host/port settings.

## Test Scripts

### Option 1: Environment Variables (Recommended)
```bash
# Windows PowerShell
$env:OPENHAB_HOST="your.openhab.host"
$env:OPENHAB_PORT="8080"
node test-out-node.js

# Linux/Mac
OPENHAB_HOST=your.openhab.host OPENHAB_PORT=8080 node test-out-node.js
```

## Option 2: Create a local test-config.js file
Create a file named `test-config.js` (it will be ignored by git):

```javascript
module.exports = {
  protocol: 'http',
  host: 'your.openhab.host.ip',
  port: 8080,
  path: '',
  username: 'your_username',    // if authentication is required
  password: 'your_password'     // if authentication is required
};
```

Then modify test scripts to use it:
```javascript
let config;
try {
  config = require('./test-config.js');
} catch (e) {
  config = {
    protocol: process.env.OPENHAB_PROTOCOL || 'http',
    host: process.env.OPENHAB_HOST || 'localhost',
    port: process.env.OPENHAB_PORT || 8080,
    path: process.env.OPENHAB_PATH || '',
    username: process.env.OPENHAB_USERNAME || '',
    password: process.env.OPENHAB_PASSWORD || ''
  };
}
```

## Option 3: Default localhost
If you're running openHAB locally, the default configuration should work:
```bash
node test-out-node.js
```

## Available Environment Variables
- `OPENHAB_PROTOCOL`: http or https (default: http)
- `OPENHAB_HOST`: hostname or IP address (default: localhost)
- `OPENHAB_PORT`: port number (default: 8080)
- `OPENHAB_PATH`: additional base path (default: empty)
- `OPENHAB_USERNAME`: username for authentication (default: empty)
- `OPENHAB_PASSWORD`: password for authentication (default: empty)
