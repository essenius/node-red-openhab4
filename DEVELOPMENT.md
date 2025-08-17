# Development Guide

## Getting Ready

- Clone the repo.
- Install the prerequisites: `npm install`

## Test Flow Generation

```bash
# Windows PowerShell
$env:OPENHAB_HOST="your.openhab.host"
$env:OPENHAB_TEST_ITEM="MyTestItem"
node generate-test-flow.js

# Linux/Mac
OPENHAB_HOST=your.openhab.host OPENHAB_TEST_ITEM="MyTestItem" node generate-test-flow.js
```

If required, you can configure the port `OPENHAB_PORT` (default `8080`) and the protocol via `OPENHAB_PROTOCOL` (default `http`).

This creates `test-flow-generated.json` with your specific configuration that you can import as follows:
1. Copy the content to the clipboard.
2. import into Node-RED via `Menu` → `Import` and then pasting the content.
3. Press `Import`. You will then see a new tab with all the openhab4 nodes, including a controller.
4. Press `Deploy`.

## Testing During Development
1. Make your changes.
2. Update version in `package.json`.
3. Run the unit tests: `npm test`, and make sure they all pass.
4. Run `npm run coverage` to determine code coverage. Check out `coverage/index.html` for details
5. Create new `.tgz`: `npm pack`.
6. if there is a previous version of the module:
   1. Delete any openhab4 nodes (if you use the generated flow, deleting the tab suffices).
   2. Deploy so the nodes are not in use anymore.
   3. Remove the previous openhab4 module from Node-RED via `Menu` → `Manage Palette` and select the `Remove` button associated with the module (If that button isn't there, a node is still active). 
7. Restart Node-RED. This is a critical step if there was a previous version, see below.
8. In the browser, reload, so the client side is fresh too: <kbd>Ctrl-Shift-R</kbd>.
9. Upload the new version via `Menu` → `Manage Palette`, `Install` tab, and then `Upload`. Select the tgz file and then `Upload`.
10. Verify that the right version is installed (see `Menu` → `Manage Palette`, `Nodes` tab).
11. Import the generated test flow as per above and validate that all the nodes are loaded successfully.
12. Test the changes.

### Node-RED Module Caching Issue

**Important**: Node-RED caches Node.js modules in memory and does not automatically reload them when you install/update packages.

#### The Problem
- When you upload a new `.tgz` file to Node-RED without restarting, it continues using the cached version from memory.
- The new code files are written to disk, but Node-RED still executes the old code from `require.cache`.
- This can cause confusion during development when fixes don't seem to take effect.

#### Solution
**Always restart Node-RED after installing/updating the package**

Methods to restart:
1. **Container restart**: `docker restart node-red` (most reliable).
2. **Node-RED admin restart**: Use the restart button in Node-RED admin interface.
3. **Process restart**: Stop and start the Node-RED process.

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
