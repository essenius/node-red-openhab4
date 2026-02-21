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

const { httpRequest, setDefaults } = require('../lib/connectionUtils');
const { setupControllerHandler } = require('../lib/controllerHandler');
const { CONCEPTS } = require('../lib/constants');
const { registerOpenHabAdminSite } = require('./admin');

/** Handler for the httpAdmin request to get all OpenHAB items. This is used to populate the dropdowns in the controller and other nodes */
function createResourceHandler(RED, endpoint, httpRequestFn = httpRequest) {
    return async function(req, res) {
        const controller = RED.nodes.getNode(req.query.controller);

        if (!controller) return res.status(404).send(`Controller '${req.query.controller}' not found`);

        // grab the config from the controller handler
        const config = controller.handler.config;
        const result = await _fetchResources(config, endpoint, httpRequestFn);

        if (result.status !== 200) return res.status(result.status).send(result.message);

        res.send(result.data);
    };
}

async function _fetchResources(config, endpoint, httpRequestFn) {
    const url = config.url + endpoint;
    const result = await httpRequestFn(url, config);

    if (!result.ok) {
        // if we get an error, we return the error message and status code. 
        // We need to make sure the errors are valid, so we replace negative numbers by 500.
        return {
            status: !result.status || result.status < 0 ? 500 : result.status,
            message: result.message
        };
    }

    return {
        // no data is not expected, but we handle it nonetheless
        status: result.data ? 200 : 204,
        data: result.data
    };
}

function stripProtocol(url) {
    return url.replace(/^https?:\/\//i, '');
}

/** Controller module for OpenHAB, which sets up the controller node and handles the items request */
function controllerModule(RED) {
    registerOpenHabAdminSite(RED);

    // start a web service for enabling the node configuration ui to retrieve the available openHAB items

    RED.httpAdmin.get(CONCEPTS.adminUrl(CONCEPTS.ITEMS), createResourceHandler(RED, CONCEPTS.baseUrl(CONCEPTS.ITEMS)));
    RED.httpAdmin.get(CONCEPTS.adminUrl(CONCEPTS.THINGS), createResourceHandler(RED, CONCEPTS.baseUrl(CONCEPTS.THINGS)));

    function createControllerNode(config) {
        RED.nodes.createNode(this, config);

        const mergedConfig = setDefaults({ ...config, ...(this.credentials) });

        this.name = config.name || stripProtocol(mergedConfig.url);
        this.handler = setupControllerHandler(this, mergedConfig);
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
module.exports = controllerModule;