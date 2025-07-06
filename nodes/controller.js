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

const { fetchOpenHAB, getConnectionString } = require("../lib/connectionUtils");
const { setupControllerNode } = require('../lib/controllerLogic');

module.exports = function (RED) {
    console.log("[controller.js] loading admin");
    const maybeFn = require("./admin");
    console.log("[controller.js] typeof admin:", typeof maybeFn);
    maybeFn(RED);

    // start a web service for enabling the node configuration ui to query for available openHAB items

    RED.httpAdmin.get("/openhab4/items", async (request, response) => {
        const config = request.query;
        const url = getConnectionString(config) + "/rest/items";

        const result = await fetchOpenHAB(url);

        if (result.retry) {
            // should be status 503, but let's be flexible
            return response.status(result.status).send(`OpenHAB returned ${result.status} for '${url}'`);
        }

        if (result.error) {
            return response.status(500).send(`Fetch error: '${result.error.message}'`);
        }

        response.send(result.data);
    });

    function createControllerNode(config) {
        RED.nodes.createNode(this, config);
        const host = config.host || 'unknown';
        this.name = config.name || `openhab4-controller (${host})`;
        setupControllerNode(this, config);
    }
    RED.nodes.registerType("openhab4-controller", createControllerNode, {
        credentials: {
            username: { type: "text" },
            password: { type: "password" }
        }
    });
};