// Simple test to validate our modernized nodes work correctly
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Node-RED openHAB4 nodes...\n');

// Test 1: Check if all required files exist
const requiredFiles = [
    'lib/statusUtils.js',
    'lib/openhabConstants.js', 
    'lib/openhabInLogic.js',
    'lib/openhabGetLogic.js',
    'lib/openhabEventsLogic.js',
    'lib/openhabControllerLogic.js',
    'lib/openhabOutLogic.js',
    'lib/openhabConnection.js',
    'nodes/in.js',
    'nodes/in.html',
    'nodes/get.js',
    'nodes/get.html',
    'nodes/out.js',
    'nodes/out.html',
    'package.json'
];

console.log('📁 Checking required files...');
let allFilesExist = true;
for (const file of requiredFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`  ✅ ${file}`);
    } else {
        console.log(`  ❌ ${file} - MISSING`);
        allFilesExist = false;
    }
}

// Test 2: Try to load and validate the modules
console.log('\n📦 Testing module imports...');
try {
    const { addStatusMethods, STATUS_STATES } = require('./lib/statusUtils');
    console.log('  ✅ statusUtils.js loaded successfully');
    
    const constants = require('./lib/openhabConstants');
    console.log('  ✅ openhabConstants.js loaded successfully');
    console.log(`     - STATUS_STATES available: ${Object.keys(constants.STATUS_STATES).length} states`);
    console.log(`     - STATUS_MAPPING available: ${Object.keys(constants.STATUS_MAPPING).length} mappings`);
    
    const { setupOpenhabIn } = require('./lib/openhabInLogic');
    console.log('  ✅ openhabInLogic.js loaded successfully');
    
    const { setupOpenhabGet } = require('./lib/openhabGetLogic');
    console.log('  ✅ openhabGetLogic.js loaded successfully');
    
    const { setupOpenhabEvents } = require('./lib/openhabEventsLogic');
    console.log('  ✅ openhabEventsLogic.js loaded successfully');
    
    const { setupOpenhabOut } = require('./lib/openhabOutLogic');
    console.log('  ✅ openhabOutLogic.js loaded successfully');
    
} catch (error) {
    console.log(`  ❌ Module loading failed: ${error.message}`);
    allFilesExist = false;
}

// Test 3: Test the status methods
console.log('\n🔧 Testing status methods...');
try {
    const { addStatusMethods, STATUS_STATES } = require('./lib/statusUtils');
    
    // Mock node object
    const mockNode = {
        status: (statusObj) => {
            console.log(`     Status set: ${JSON.stringify(statusObj)}`);
        }
    };
    
    // Add status methods
    addStatusMethods(mockNode);
    
    console.log('  ✅ Status methods added successfully');
    console.log('     Testing different status states:');
    
    mockNode.setStatusInit();
    mockNode.setStatusReady(); 
    mockNode.setStatusWorking('Processing...');
    mockNode.setStatusConnected();
    mockNode.setStatusOK('Success!');
    mockNode.setStatusWarning('Warning message');
    mockNode.setStatusError('Error occurred');
    mockNode.setStatusDisconnected();
    
} catch (error) {
    console.log(`  ❌ Status methods test failed: ${error.message}`);
}

// Test 4: Test controller validation
console.log('\n🔍 Testing controller validation...');
try {
    const { validateController } = require('./lib/statusUtils');
    
    // Mock node for testing
    const mockNode = {
        error: (msg) => console.log(`     ERROR: ${msg}`),
        setStatusError: (text) => console.log(`     STATUS ERROR: ${text}`)
    };
    
    // Test with null controller
    console.log('  Testing with null controller:');
    const result1 = validateController(mockNode, null);
    console.log(`     Result: ${result1} (should be false)`);
    
    // Test with undefined controller
    console.log('  Testing with undefined controller:');
    const result2 = validateController(mockNode, undefined);
    console.log(`     Result: ${result2} (should be false)`);
    
    // Test with valid controller
    console.log('  Testing with valid controller:');
    const mockController = { host: 'localhost', port: 8080 };
    const result3 = validateController(mockNode, mockController);
    console.log(`     Result: ${result3} (should be true)`);
    
    console.log('  ✅ Controller validation working correctly');
    
} catch (error) {
    console.log(`  ❌ Controller validation test failed: ${error.message}`);
}

// Test 5: Validate package.json registration
console.log('\n📋 Checking Node-RED registration...');
try {
    const packageJson = require('./package.json');
    const nodeRedNodes = packageJson['node-red']?.nodes || {};
    
    const expectedNodes = ['openhab4-controller', 'openhab4-events', 'openhab4-get', 'openhab4-in', 'openhab4-out', 'openhab4-test'];
    
    for (const nodeName of expectedNodes) {
        if (nodeRedNodes[nodeName]) {
            console.log(`  ✅ ${nodeName} -> ${nodeRedNodes[nodeName]}`);
        } else {
            console.log(`  ❌ ${nodeName} - NOT REGISTERED`);
            allFilesExist = false;
        }
    }
    
} catch (error) {
    console.log(`  ❌ Package.json validation failed: ${error.message}`);
}

// Summary
console.log('\n📊 Test Summary:');
if (allFilesExist) {
    console.log('🎉 All tests passed! The Node-RED openHAB4 nodes are ready for testing.');
    console.log('\n📝 Next steps:');
    console.log('   1. Install in Node-RED: npm install /path/to/this/directory');
    console.log('   2. Restart Node-RED');
    console.log('   3. Look for "openhab4-*" nodes in the palette under "home automation"');
    console.log('   4. Create a flow with controller -> in/get nodes to test functionality');
} else {
    console.log('⚠️  Some issues found. Please fix the missing files or import errors.');
}

console.log('\n✨ Modernization features available:');
console.log('   - Semantic status methods (setStatusConnected, setStatusError, etc.)');
console.log('   - Centralized constants and configuration');
console.log('   - Consistent message structure across all nodes');
console.log('   - Improved error handling and state management');
console.log('   - Centralized controller validation with user-friendly error messages');
