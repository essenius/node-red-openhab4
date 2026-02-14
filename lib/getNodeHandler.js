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

const { ConsumerNodeHandler } = require('./consumerNodeHandler');
const { OPERATION, STATE } = require('./constants');

/** GetNode class for handling OpenHAB item retrieval */
class GetNodeHandler extends ConsumerNodeHandler {

    setupNodeLogic() {
        this.enableInputHandling();
    }

    /** Override to handle input messages. It will prepare a message for OpenHAB, send it out, and wait for the response. */
    async handleInput(msg) {
        // if the incoming message has a topic, we will try to split it into concept and identifier. 
        // If not, we will use the concept and identifier from the configuration.
        let { valid, concept, identifier } = this.parseTopic(msg.topic);
        if (!valid) {
            concept = this.config.concept;
            identifier = this.config.identifier;
        }

        this.setStatus(STATE.WAITING, "requesting...");
        const response = await this.controller.handler.control(this.getConceptType(concept), identifier, OPERATION.GET);
        this._handleGetResponse(msg, response);
    }

    /** Parse the response from OpenHAB, convert it to a message, and send that out.
     * If an error occurs, set the node status to error and log the error message. */
    _handleGetResponse(request, response) {

        if (!response.ok) {
            this.setStatus(STATE.ERROR, "request failed");
            return;
        }
        if (!response.data) {
            this.setStatus(STATE.ERROR, "empty response");
            return;
        }

        const message = {
            ...request,
            ...response.data,
            inputMessage: request
        }


        this.setValueStatus(message.payload);

        const outMsg = this.createMessage({ message });
        this.node.send(outMsg);
    }
}

/** Entry point to create and setup the GetNode. Called by the get node registration. */
function setupGetNodeHandler(node, config, controller) {
    return new GetNodeHandler(node, config, controller).setupNode();
}

module.exports = { GetNodeHandler, setupGetNodeHandler };