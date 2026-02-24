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

const { setDefaults } = require("../lib/connectionUtils");
const { setupControllerHandler } = require("../lib/controllerHandler");
const { CONCEPTS } = require("../lib/constants");
const { registerOpenHabAdminSite } = require("./admin");

/*
async function _fetchResources(config, endpoint, requestFn) {
    const url = config.url + endpoint;
    const result = await requestFn(url, config);

    if (!result.ok) {
        return {
            status: !result.status || result.status < 0 ? 500 : result.status,
            message: result.message
        };
    }

    return {
        status: result.data ? 200 : 204,
        data: result.data
    };
} */

function createResourceHandler(RED, type) {

    return async function (req, res) {
        const controller = RED.nodes.getNode(req.query.controller);

        if (!controller) {
            return res.status(404).send(`Controller '${req.query.controller}' not found`);
        }
        const endpoint = CONCEPTS.baseUrl(type);
        const handler = controller.handler;
        const response = await handler.getResources(type, endpoint);
        if (!response.ok) {
            console.log(`getting ${type} at ${endpoint} failed`);
        }
        if (response.data) {
            res.send(response.data);
        } else {
            console.log("error", response);
            res.status(response.status).send(response.message);
        }
    };
}

/** Factory to create controller module with injectable dependencies */
function createControllerModule({
    setupHandler = setupControllerHandler,
    registerAdminSite = registerOpenHabAdminSite
} = {}) {

    function controllerModule(RED) {

        registerAdminSite(RED);

        // start a web service for enabling the node configuration ui to retrieve the available openHAB items

        RED.httpAdmin.get(CONCEPTS.adminUrl(CONCEPTS.ITEMS), createResourceHandler(RED, CONCEPTS.ITEMS));

        RED.httpAdmin.get(CONCEPTS.adminUrl(CONCEPTS.THINGS), createResourceHandler(RED, CONCEPTS.THINGS));

        function createControllerNode(config) {
            RED.nodes.createNode(this, config);

            const mergedConfig = setDefaults({ ...config, ...(this.credentials) });
            console.log("createControllerNode config", mergedConfig);
            this.name = config.name;
            this.hash = config.hash;
            this.handler = setupHandler(this, mergedConfig);
        }

        RED.nodes.registerType("openhab4-controller", createControllerNode, {
            credentials: {
                token: { type: "password" },
                username: { type: "text" },
                password: { type: "password" }
            }
        });
    }

    controllerModule.createResourceHandler = createResourceHandler;

    return controllerModule;
}

/* Production export */
module.exports = createControllerModule();

/* Test factory export */
module.exports._create = createControllerModule;
