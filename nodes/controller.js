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

const { httpRequest, getConnectionString, setDefaults } = require("../lib/connectionUtils");
const { setupControllerNode } = require('../lib/controllerLogic');
const { ENDPOINTS } = require("../lib/constants");

function createItemsHandler() {
    return async function (request, response) {
        // request.query also contains the credentials, so we can use it to fetch items
        const config = setDefaults(request.query);
        const url = getConnectionString(config) + ENDPOINTS.ITEMS;
        const result = await httpRequest(url, config);
        if (!result.data) {
            return response.status(result.status).send(result.message);
        }
        response.send(result.data);
    };
}

function controllerModule(RED) {
    const maybeFn = require("./admin");
    maybeFn(RED);

    // start a web service for enabling the node configuration ui to retrieve the available openHAB items

    RED.httpAdmin.get("/openhab4/items", createItemsHandler());
     
    function createControllerNode(config) {
        RED.nodes.createNode(this, config);
        // somewhat ugly duplication from consumerNodeBase.js, but controller doesn't inherit from it.
        const mergedConfig = setDefaults({ ...config, ...(this.credentials || {}) });
        this.name = config.name || `openhab4 (${config.host})`;
        setupControllerNode(this, mergedConfig);
    }

    RED.nodes.registerType("openhab4-controller", createControllerNode, {
        credentials: {
            username: { type: "text" },
            password: { type: "password" }
        }
    });
}

controllerModule.createItemsHandler = createItemsHandler;
module.exports = controllerModule;