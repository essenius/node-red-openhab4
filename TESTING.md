# Testing the Node-RED OpenHAB4 Nodes

## 📋 Installation & Testing Steps

### 1. Install the Nodes in Node-RED

1. pack the module into a .tgz file 
```bash
# Navigate to your Node-RED user directory (usually ~/.node-red)
npm pack
# Restart Node-RED
```
2. If replacing a previous version, delete all related nodes in Node Red (including the controller), deploy, and then uninstall the previous version via Manage Palette and select the Remove button associated with the module. If that button isn't there, a node is still active.

3. Restart Node Red, and reload the site (<kbd>Ctrl-Shift-R</kbd>). Especially restarting Node Red is important, as Node Red will hold on to the previous version if you don't do this.

4. Install the new version via Manage Palette, Install tab, and then Upload. Select the tgz file and then Upload.

### 2. Import Test Flow

1. Copy the contents of `test-flow.json`
2. In Node-RED, go to Menu → Import
3. Paste the JSON and click Import
4. Deploy the flow

### 3. Configure for Your OpenHAB Instance

1. Double-click the "OpenHAB Controller" node
2. Update the configuration:
   - **Protocol**: http or https
   - **Host**: Your OpenHAB server IP/hostname
   - **Port**: Usually 8080
3. Update the item names in the test nodes to match your OpenHAB items

### 4. Test the Semantic Status System

1. Check that the nodes appear in palette: Look for "openhab4-*" nodes under "home automation"
1. **Consistent status colors**: All nodes use the same color scheme
2. **Meaningful status text**: Status messages clearly indicate what's happening
3. **Proper functionality**: Nodes connect, receive events, and get item states correctly

## 🐛 Troubleshooting

**If nodes don't appear in palette:**
- Check Node-RED logs for import errors
- Verify package.json registration
- Restart Node-RED before installation
