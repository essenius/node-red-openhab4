// Copyright 2025-2026 Rik Essenius
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

const { setupEventsNodeHandler } = require('../lib/eventsNodeHandler');

function registerOpenHabEventsNode(RED) {
  function createEventsNode(config) {
    RED.nodes.createNode(this, config);

    const controller = RED.nodes.getNode(config.controller);
    setupEventsNodeHandler(this, config, controller);
  }

  RED.nodes.registerType("openhab4-events", createEventsNode);
};

module.exports = registerOpenHabEventsNode; 