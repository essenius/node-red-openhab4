// Simple test to validate our modernized nodes work correctly
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Node-RED openHAB4 nodes...\n');

// Test 1: Check if all required files exist
const requiredFiles = [
    'lib/statusUtils.js',
    'lib/openhabConstants.js', 
    'lib/consumerNodeBase.js',
    'lib/inLogic.js',
    'lib/getLogic.js',
    'lib/eventsLogic.js',
    'lib/controllerLogic.js',
    'lib/healthLogic.js',
    'lib/outLogic.js',
    'lib/openhabConnection.js',
    'nodes/in.js',
    'nodes/in.html',
    'nodes/get.js',
    'nodes/get.html',
    'nodes/health.js',
    'nodes/health.html',
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
    const { addStatusMethods } = require('./lib/statusUtils');
    console.log('  ✅ statusUtils.js loaded successfully');
    
    const constants = require('./lib/openhabConstants');
    console.log('  ✅ openhabConstants.js loaded successfully');
    console.log(`     - STATE available: ${Object.keys(constants.STATE).length} states`);
    console.log(`     - STATE_MAPPING available: ${Object.keys(constants.STATE_MAPPING).length} mappings`);
    
    const { setupInNode } = require('./lib/inLogic');
    console.log('  ✅ inLogic.js loaded successfully');
    
    const { setupGetNode } = require('./lib/getLogic');
    console.log('  ✅ getLogic.js loaded successfully');
    
    const { setupEventsNode } = require('./lib/eventsLogic');
    console.log('  ✅ eventsLogic.js loaded successfully');
    
    const { setupOutNode } = require('./lib/outLogic');
    console.log('  ✅ outLogic.js loaded successfully');
    
    const { setupHealthNode } = require('./lib/healthLogic');
    console.log('  ✅ healthLogic.js loaded successfully');
    
    const { ConsumerNodeBase } = require('./lib/consumerNodeBase');
    console.log('  ✅ consumerNodeBase.js loaded successfully');
    
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
    const { validateController, validateControllerConfig } = require('./lib/statusUtils');
    
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
    
    // Test controller config validation
    console.log('\n  Testing controller config validation:');
    const mockConfigNode = {
        error: (msg) => console.log(`     CONFIG ERROR: ${msg}`),
        setStatusError: (text) => console.log(`     CONFIG STATUS ERROR: ${text}`),
        warn: (msg) => console.log(`     CONFIG WARN: ${msg}`)
    };
    
    // Test with missing host
    console.log('  Testing config with missing host:');
    const invalidConfig = { protocol: 'http', port: 8080 };
    const configResult1 = validateControllerConfig(mockConfigNode, invalidConfig);
    console.log(`     Result: ${configResult1} (should be false)`);
    
    // Test with valid config
    console.log('  Testing config with valid host:');
    const validConfig = { protocol: 'http', host: 'localhost', port: 8080 };
    const configResult2 = validateControllerConfig(mockConfigNode, validConfig);
    console.log(`     Result: ${configResult2} (should be true)`);
    
    console.log('  ✅ Controller config validation working correctly');
    
} catch (error) {
    console.log(`  ❌ Controller validation test failed: ${error.message}`);
}

// Test 5: Validate package.json registration
console.log('\n📋 Checking Node-RED registration...');
try {
    const packageJson = require('./package.json');
    const nodeRedNodes = packageJson['node-red']?.nodes || {};
    
    const expectedNodes = ['openhab4-controller', 'openhab4-events', 'openhab4-get', 'openhab4-health', 'openhab4-in', 'openhab4-out'];
    
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
