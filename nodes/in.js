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

"use strict";

const { setupInNode } = require('../lib/inLogic');

module.exports = function (RED) {
    function createInNode(config) {
        RED.nodes.createNode(this, config);
        const controller = RED.nodes.getNode(config.controller);
        setupInNode(this, config, controller, { generateId: RED.util.generateId });
    }

    RED.nodes.registerType("openhab4-in", createInNode);
};