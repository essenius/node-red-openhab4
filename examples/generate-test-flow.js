#!/usr/bin/env node

// Copyright 2025 Rik Essenius
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under the License is
// distributed on an "AS IS" BASIS WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and limitations under the License.

// Script to generate test-flow.json with environment-specific configuration

const fs = require('fs');
const path = require('path');

// Get configuration from environment variables or use defaults
const config = {
  protocol: process.env.OPENHAB_PROTOCOL || 'http',
  host: process.env.OPENHAB_HOST || 'localhost',
  port: process.env.OPENHAB_PORT || '8080',
  testItem: process.env.OPENHAB_TEST_ITEM || 'TestSwitch'
};

// Test flow template
const testFlow = [
    {
        "id": "test-flow-tab",
        "type": "tab",
        "label": "OpenHAB4 Test Flow",
        "disabled": false,
        "info": "Test flow for  OpenHAB4 nodes"
    },
    {
        "id": "in-node",
        "type": "openhab4-in",
        "z": "test-flow-tab",
        "name": "",
        "controller": "controller-node",
        "itemname": config.testItem,
        "x": 100,
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
        "name": "",
        "controller": "controller-node",
        "itemname": config.testItem,
        "x": 290,
        "y": 300,
        "wires": [
            ["debug-get"]
        ]
    },
    {
        "id": "out-node",
        "type": "openhab4-out",
        "z": "test-flow-tab",
        "controller": "controller-node",
        "itemname": config.testItem,
        "topic": "",
        "payload": "",
        "x": 350,
        "y": 500,
        "wires": [
            ["debug-out"]
        ]
    },
    {
        "id": "events-node",
        "type": "openhab4-events",
        "z": "test-flow-tab",
        "controller": "controller-node",
        "x": 100,
        "y": 400,
        "wires": [
            ["debug-events"]
        ]
    },
    {
        "id": "health-node",
        "type": "openhab4-health",
        "z": "test-flow-tab",
        "name": "Health Monitor",
        "controller": "controller-node",
        "x": 100,
        "y": 600,
        "wires": [
            ["debug-health-status"],
            ["debug-health-error"],
            ["debug-health-raw"]
        ]
    },
    {
        "id": "inject-get",
        "type": "inject",
        "z": "test-flow-tab",
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
        "x": 100,
        "y": 300,
        "wires": [
            ["get-node"]
        ]
    },
    {
        "id": "inject-command",
        "type": "inject",
        "z": "test-flow-tab",
        "name": "",
        "props": [
            {
                "p": "payload"
            },
            {
                "p": "topic",
                "vt": "str"
            }
        ],
        "repeat": "",
        "crontab": "",
        "once": false,
        "onceDelay": 0.1,
        "topic": "ItemCommand",
        "payload": "ON",
        "payloadType": "str",
        "x": 130,
        "y": 480,
        "wires": [
            ["out-node"]
        ]
    },
    {
        "id": "inject-update",
        "type": "inject",
        "z": "test-flow-tab",
        "name": "",
        "props": [
            {
                "p": "payload"
            },
            {
                "p": "topic",
                "vt": "str"
            }
        ],
        "repeat": "",
        "crontab": "",
        "once": false,
        "onceDelay": 0.1,
        "topic": "ItemUpdate",
        "payload": "OFF",
        "payloadType": "str",
        "x": 120,
        "y": 520,
        "wires": [
            ["out-node"]
        ]
    },
    {
        "id": "debug-state",
        "type": "debug",
        "z": "test-flow-tab",
        "name": "Debug In Channel 1",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "true",
        "targetType": "full",
        "statusVal": "",
        "statusType": "auto",
        "x": 320,
        "y": 180,
        "wires": []
    },
    {
        "id": "debug-raw",
        "type": "debug",
        "z": "test-flow-tab",
        "name": "Debug In Channel 2",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "true",
        "targetType": "full",
        "statusVal": "",
        "statusType": "auto",
        "x": 320,
        "y": 220,
        "wires": []
    },
    {
        "id": "debug-get",
        "type": "debug",
        "z": "test-flow-tab",
        "name": "Debug Get",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "true",
        "targetType": "full",
        "statusVal": "",
        "statusType": "auto",
        "x": 490,
        "y": 300,
        "wires": []
    },
    {
        "id": "debug-out",
        "type": "debug",
        "z": "test-flow-tab",
        "name": "Debug Out",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "true",
        "targetType": "full",
        "statusVal": "",
        "statusType": "auto",
        "x": 550,
        "y": 500,
        "wires": []
    },
    {
        "id": "debug-events",
        "type": "debug",
        "z": "test-flow-tab",
        "name": "Debug Events",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "true",
        "targetType": "full",
        "statusVal": "",
        "statusType": "auto",
        "x": 300,
        "y": 400,
        "wires": []
    },
    {
        "id": "debug-health-status",
        "type": "debug",
        "z": "test-flow-tab",
        "name": "Debug Health Status",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "true",
        "targetType": "full",
        "statusVal": "",
        "statusType": "auto",
        "x": 350,
        "y": 580,
        "wires": []
    },
    {
        "id": "debug-health-error",
        "type": "debug",
        "z": "test-flow-tab",
        "name": "Debug Health Error",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "true",
        "targetType": "full",
        "statusVal": "",
        "statusType": "auto",
        "x": 350,
        "y": 620,
        "wires": []
    },
    {
        "id": "debug-health-raw",
        "type": "debug",
        "z": "test-flow-tab",
        "name": "Debug Health Raw",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "true",
        "targetType": "full",
        "statusVal": "",
        "statusType": "auto",
        "x": 340,
        "y": 660,
        "wires": []
    },
    {
        "id": "controller-node",
        "type": "openhab4-controller",
        "z": "test-flow-tab",
        "name": "openhab4",
        "protocol": config.protocol,
        "host": config.host,
        "port": config.port
    }
];

// Write the test flow to file
const outputPath = path.join(__dirname, 'test-flow-generated.json');
fs.writeFileSync(outputPath, JSON.stringify(testFlow, null, 2));

console.log('Generated test flow with configuration:');
console.log(`   Host: ${config.host}`);
console.log(`   Port: ${config.port}`);
console.log(`   Protocol: ${config.protocol}`);
console.log(`   Test Item: ${config.testItem}`);
console.log('Written to:', outputPath);
console.log('');
console.log('To use different settings:');
console.log('   OPENHAB_HOST=your.host.ip OPENHAB_TEST_ITEM=YourItem node generate-test-flow.js');
console.log('');
console.log('To import into Node-RED:');
console.log('   1. Copy the contents of test-flow-generated.json');
console.log('   2. In Node-RED, go to Menu > Import');
console.log('   3. Paste the JSON and click Import');
