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

const { ConsumerNodeBase } = require('./consumerNodeBase');

class OutNode extends ConsumerNodeBase {
    getNodeType() {
        return 'Out';
    }

    setupNodeLogic() {
    }

    handleInput(msg) {
        const item = this.config.itemname || msg.item || "";
        const topic = this.config.topic || msg.topic || null;
        const payload = this.config.payload || msg.payload || null;
        if (!item) {
            this.node.setStatusError("no item specified");
            this.node.error("No item specified. Set item in configuration or provide msg.item");
            return;
        }

        if (payload === null) {
            this.node.setStatusError("no payload specified");
            this.node.error("No payload specified. Set payload in configuration or provide msg.payload");
            return;
        }

        this.node.setStatusWorking(`sending '${payload}'`);
        var response = this.controller.control(item, topic, payload, this.node);
        if (!(response instanceof Error)) {
            this.node.setStatusOK(`sent ${payload}`);
            this.node.send(msg);
        }
    }

    cleanup() {
        this.node.log("Out node cleanup");
        this.node.setStatusDisconnected();
    }
}

function setupOutNode(node, config, controller) {
    return new OutNode(node, config, controller).setupNode();
}

module.exports = { setupOutNode };
