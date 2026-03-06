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

I'll assume you are running Node-RED in a container. If not, adjust restart procedures accordingly.

1. Make your changes.
2. Update version in `package.json`.
3. Run the unit tests: `npm test`, and make sure they all pass.
4. Run `npm run coverage` to determine code coverage. Check out `coverage/index.html` for details
5. Create new package: `npm run pack:dist`    
6. If you prefer updating via the command line on the server hosting your Node-Red instance (recommended):
   1. Upload the package to the server: `scp ./essenius-node-red-openhab4-0.10.29.tgz user@server:/home/user`.
   2. Login to the server hosting Node-RED: `ssh user@server`.
   3. Make sure that the folder you copy this into is accessible to the container in folder `/data` (using your docker run or docker compose)
   4. Install the new package (assuming your Node-RED container is called `node-red`): 
   `docker exec -it node-red sh -c "cd /data && npm install /data/essenius-node-red-openhab4-0.10.30.tgz"`
   5. Restart Node-RED: `docker restart node-red`. This is a critical step if there was a previous version, see below.
   6. In the NODE-RED browser window, reload, so the client side is fresh too: `Ctrl-Shift-R`.
   7. Check that the new version is installed via `Menu` → `Manage Palette`, `Nodes`.
   8. Optionally, check the docker logs via `docker logs node-red -f`.

7. If you want to use the Node-Red user interface for installing the new version, it is a bit more involved:
   1. if there is a previous version of the module:
      1. If you still need them, export the flows that use openHAB nodes (no need if you only use the generated test flow).
      2. Delete these flows (if you use the generated flow, deleting the tab suffices).
      3. Deploy, so the nodes are not in use anymore.
      4. Remove the old `openhab4` module from Node-RED via `Menu` → `Manage Palette` and select the `Remove` button associated with the module (If that button isn't there, a node is still active).
      5. Restart Node-RED.
   2. In the browser, reload, so the client side is fresh: `Ctrl-Shift-R`.
   3.  Upload the new version via `Menu` → `Manage Palette`, `Install` tab, and then `Upload`. Select the package (`.tgz` file) and then `Upload`.
   4.  Chech that the right version is installed via `Menu` → `Manage Palette`, `Nodes`.
   5.  Import the generated test flow and/or the exported flows as per above, and validate that all the nodes are loaded successfully.
   6.  Test the changes.

### Node-RED Module Caching Issue

**Important**: Node-RED caches Node.js modules in memory and does not automatically reload them when you install/update packages.

- When you install a new package into Node-RED without restarting, it continues using the cached version from memory.
- The new code files are written to disk, but Node-RED still executes the old code from `require.cache`.
- This can cause confusion during development when fixes don't seem to take effect.
- **Therefore, always restart Node-RED after installing/updating the package**

## Documentation

To reduce duplication, node documentation is maintained in the [docs](.) folder. There is a markdown file for each of the nodes, which can be viewed online
directly. The script [build-help.js](../build-help.js) converts this format into a help section for the node's HTML file in the [nodes](../nodes) folder.
It is run as part of the packaging process.

The html files in the node folder have a placeholder {{HELP}} where this section will be inserted. 
THe convention is that the markdown files use the full name `openhab4-nodeName.md` while the html files are called `nodeName.html`. The build script takes care of this mapping as well.

## Packaging

The packaging process creates a throwaway [dist](../dist) folder containing the files to be packaged.
If you run the package command `npm run pack:dist` this will all be done automatically.
