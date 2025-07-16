/*

// Simple test script to debug the out node JSON issue
const { OpenhabConnection } = require('./lib/openhabConnection');

// Mock Node-RED node for testing
const mockNode = {
  log: (msg) => console.log(`[LOG] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`),
  emit: (event, data) => console.log(`[EMIT] ${event}:`, data),
  status: (status) => console.log(`[STATUS]`, status),
  setStatus: function() {},
  setStatusConnected: function() { this.status({fill: "green", shape: "dot", text: "connected"}); },
  setStatusError: function(msg) { this.status({fill: "red", shape: "ring", text: msg}); },
  setStatusWorking: function(msg) { this.status({fill: "blue", shape: "dot", text: msg}); },
  setStatusOK: function(msg) { this.status({fill: "green", shape: "dot", text: msg}); }
};

// Test configuration - adjust these values to match your openHAB setup
// You can override these via environment variables:
// OPENHAB_HOST=your.host.ip OPENHAB_PORT=8080 node test-out-node.js
const config = {
  protocol: process.env.OPENHAB_PROTOCOL || 'http',
  host: process.env.OPENHAB_HOST || 'localhost',
  port: process.env.OPENHAB_PORT || 8080,
  path: process.env.OPENHAB_PATH || '',
  username: process.env.OPENHAB_USERNAME || '',
  password: process.env.OPENHAB_PASSWORD || ''
};

async function testOutNode() {
  console.log('🧪 Testing out node with debug logging...');
  console.log(`📍 Connecting to: ${config.protocol}://${config.host}:${config.port}`);
  
  if (config.host === 'localhost') {
    console.log('ℹ️  Using default localhost. Set OPENHAB_HOST environment variable to test with remote openHAB.');
  }
  
  const connection = new OpenhabConnection(config, mockNode);
  
  try {
    console.log('\n📤 Testing item command...');
    const result = await connection.controlItem('ub_warning', 'ItemCommand', 'ON');
    console.log('✅ Command successful, result:', result);
  } catch (error) {
    console.log('❌ Command failed:', error.message);
    console.log('Full error:', error);
  }
  
  try {
    console.log('\n📤 Testing item update...');
    const result = await connection.controlItem('ub_warning', 'ItemUpdate', 'OFF');
    console.log('✅ Update successful, result:', result);
  } catch (error) {
    console.log('❌ Update failed:', error.message);
    console.log('Full error:', error);
  }
}

testOutNode().catch(console.error);
*/