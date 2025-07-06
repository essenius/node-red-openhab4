# Development Guide

## Node-RED Module Caching Issue

**Important**: Node-RED caches Node.js modules in memory and does not automatically reload them when you install/update packages.

### The Problem
- When you upload a new `.tgz` file to Node-RED without restarting, it continues using the cached version from memory
- The new code files are written to disk, but Node-RED still executes the old code from `require.cache`
- This can cause confusion during development when fixes don't seem to take effect

### Solution
**Always restart Node-RED after installing/updating the package**

Methods to restart:
1. **Container restart**: `docker restart node-red` (most reliable)
2. **Node-RED admin restart**: Use the restart button in Node-RED admin interface
3. **Process restart**: Stop and start the Node-RED process

### Testing During Development
1. Make code changes
2. Update version in `package.json` 
3. Create new `.tgz`: `npm pack`
4. Upload to Node-RED
5. **Restart Node-RED** ← Critical step
6. Test the changes

### Verifying the Fix
You can verify that new code is loaded by:
- Checking Node-RED logs for the new version number
- Adding temporary log statements to verify new code paths
- Using our test scripts outside of Node-RED to verify fixes work

## Testing

### Standalone Testing
Use `test-modernization.js` to test module loading and basic functionality without Node-RED:
```bash
node test-modernization.js
```

### openHAB Connection Testing
Use `test-out-node.js` to test actual openHAB communication:

**Option 1: Environment variables (recommended)**
```bash
# Windows PowerShell
$env:OPENHAB_HOST="your.host.ip"; node test-out-node.js

# Linux/Mac  
OPENHAB_HOST=your.host.ip node test-out-node.js
```

**Option 2: Default localhost**
```bash
node test-out-node.js
```

### Node-RED Test Flow Generation
Generate a test flow with your openHAB configuration:

```bash
# Windows PowerShell
$env:OPENHAB_HOST="your.host.ip"; node generate-test-flow.js

# Linux/Mac
OPENHAB_HOST=your.host.ip node generate-test-flow.js
```

This creates `test-flow-generated.json` that you can import into Node-RED.

See `TEST-CONFIG.md` for more configuration options.

### Node-RED Integration Testing
1. Install the package in Node-RED
2. Restart Node-RED
3. Create a test flow with the nodes
4. Verify functionality in the Node-RED environment

## Common Issues

### "Unexpected end of JSON input" 
- Usually caused by empty responses from openHAB (normal for commands/updates)
- Fixed in connectionUtils.js by handling empty JSON responses
- May also occur in EventSource message parsing if malformed events are received
- Enhanced error handling added to controller and events logic

### Module Import Errors
- Check that all required files exist
- Verify package.json node-red configuration
- Ensure all dependencies are installed

### Status/UI Issues
- Check that statusUtils.js is properly imported
- Verify HTML files load static resources correctly
- Ensure label functions use the centralized naming logic
