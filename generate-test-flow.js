#!/usr/bin/env node
// Script to generate test-flow.json with environment-specific configuration

const fs = require('fs');
const path = require('path');

// Get configuration from environment variables or use defaults
const config = {
  protocol: process.env.OPENHAB_PROTOCOL || 'http',
  host: process.env.OPENHAB_HOST || 'localhost',
  port: process.env.OPENHAB_PORT || '8080',
  username: process.env.OPENHAB_USERNAME || '',
  password: process.env.OPENHAB_PASSWORD || ''
};

// Test flow template
const testFlow = [
    {
        "id": "test-flow-tab",
        "type": "tab",
        "label": "OpenHAB4 Test Flow",
        "disabled": false,
        "info": "Test flow for modernized OpenHAB4 nodes"
    },
    {
        "id": "controller-node",
        "type": "openhab4-controller",
        "z": "test-flow-tab",
        "name": "OpenHAB Controller",
        "host": config.host,
        "port": config.port,
        "protocol": config.protocol,
        "username": config.username,
        "password": config.password,
        "x": 200,
        "y": 100
    },
    {
        "id": "in-node",
        "type": "openhab4-in",
        "z": "test-flow-tab",
        "name": "Item State Monitor",
        "controller": "controller-node",
        "itemname": "ub_warning",
        "x": 200,
        "y": 200,
        "wires": [
            ["debug-state"],
            ["debug-raw"]
        ]
    },
    {
        "id": "get-node",
        "type": "openhab4-get",
        "z": "test-flow-tab",
        "name": "Get Item State",
        "controller": "controller-node",
        "itemname": "ub_warning",
        "x": 200,
        "y": 300,
        "wires": [
            ["debug-get"]
        ]
    },
    {
        "id": "out-node",
        "type": "openhab4-out",
        "z": "test-flow-tab",
        "name": "Send Command",
        "controller": "controller-node",
        "itemname": "ub_warning",
        "topic": "",
        "payload": "",
        "x": 200,
        "y": 500,
        "wires": [
            ["debug-out"]
        ]
    },
    {
        "id": "events-node",
        "type": "openhab4-events",
        "z": "test-flow-tab",
        "name": "All Events",
        "controller": "controller-node",
        "x": 200,
        "y": 400,
        "wires": [
            ["debug-events"]
        ]
    },
    {
        "id": "inject-get",
        "type": "inject",
        "z": "test-flow-tab",
        "name": "Test Get",
        "props": [
            {
                "p": "payload"
            }
        ],
        "repeat": "",
        "crontab": "",
        "once": false,
        "onceDelay": 0.1,
        "topic": "",
        "payload": "",
        "payloadType": "date",
        "x": 50,
        "y": 300,
        "wires": [
            ["get-node"]
        ]
    },
    {
        "id": "inject-command",
        "type": "inject",
        "z": "test-flow-tab",
        "name": "Send ON",
        "props": [
            {
                "p": "payload"
            },
            {
                "p": "topic"
            }
        ],
        "repeat": "",
        "crontab": "",
        "once": false,
        "onceDelay": 0.1,
        "topic": "ItemCommand",
        "payload": "Test Alert",
        "payloadType": "str",
        "x": 50,
        "y": 480,
        "wires": [
            ["out-node"]
        ]
    },
    {
        "id": "inject-update",
        "type": "inject",
        "z": "test-flow-tab",
        "name": "Send UPDATE",
        "props": [
            {
                "p": "payload"
            },
            {
                "p": "topic"
            }
        ],
        "repeat": "",
        "crontab": "",
        "once": false,
        "onceDelay": 0.1,
        "topic": "ItemUpdate",
        "payload": "",
        "payloadType": "str",
        "x": 50,
        "y": 520,
        "wires": [
            ["out-node"]
        ]
    },
    {
        "id": "debug-state",
        "type": "debug",
        "z": "test-flow-tab",
        "name": "State Changes",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "payload",
        "targetType": "msg",
        "statusVal": "",
        "statusType": "auto",
        "x": 450,
        "y": 180,
        "wires": []
    },
    {
        "id": "debug-raw",
        "type": "debug",
        "z": "test-flow-tab",
        "name": "Raw Events",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "payload",
        "targetType": "msg",
        "statusVal": "",
        "statusType": "auto",
        "x": 450,
        "y": 220,
        "wires": []
    },
    {
        "id": "debug-get",
        "type": "debug",
        "z": "test-flow-tab",
        "name": "Get Response",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "payload",
        "targetType": "msg",
        "statusVal": "",
        "statusType": "auto",
        "x": 450,
        "y": 300,
        "wires": []
    },
    {
        "id": "debug-out",
        "type": "debug",
        "z": "test-flow-tab",
        "name": "Command Response",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "payload",
        "targetType": "msg",
        "statusVal": "",
        "statusType": "auto",
        "x": 450,
        "y": 500,
        "wires": []
    },
    {
        "id": "debug-events",
        "type": "debug",
        "z": "test-flow-tab",
        "name": "All Events",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "payload",
        "targetType": "msg",
        "statusVal": "",
        "statusType": "auto",
        "x": 450,
        "y": 400,
        "wires": []
    }
];

// Write the test flow to file
const outputPath = path.join(__dirname, 'test-flow-generated.json');
fs.writeFileSync(outputPath, JSON.stringify(testFlow, null, 2));

console.log('🔧 Generated test flow with configuration:');
console.log(`   Host: ${config.host}`);
console.log(`   Port: ${config.port}`);
console.log(`   Protocol: ${config.protocol}`);
console.log(`📄 Written to: ${outputPath}`);
console.log('');
console.log('💡 To use different settings:');
console.log('   OPENHAB_HOST=your.host.ip node generate-test-flow.js');
console.log('');
console.log('📋 To import into Node-RED:');
console.log('   1. Copy the contents of test-flow-generated.json');
console.log('   2. In Node-RED, go to Menu > Import');
console.log('   3. Paste the JSON and click Import');
