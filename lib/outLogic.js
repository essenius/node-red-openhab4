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
        this.node.setStatusReady();
    }

    handleInput(msg) {
        const item = (this.config.itemname && this.config.itemname.length > 0) ? this.config.itemname : msg.item;
        const topic = (this.config.topic && this.config.topic.length > 0) ? this.config.topic : msg.topic;
        const payload = (this.config.payload && this.config.payload.length > 0) ? this.config.payload : msg.payload;

        if (!item) {
            this.node.setStatusError("no item specified");
            this.node.error("No item specified. Set item in configuration or provide msg.item");
            return;
        }

        if (payload === undefined || payload === null) {
            this.node.setStatusError("no payload specified");
            this.node.error("No payload specified. Set payload in configuration or provide msg.payload");
            return;
        }

        this.node.setStatusWorking("sending...");

        this.controller.control(
            item,
            topic,
            payload,
            () => {
                this.node.setStatusOK("sent");
                this.node.send(msg);
            },
            (err) => {
                this.node.setStatusError(String(err));
                this.node.error(`Failed to send to item '${item}': ${err}`);
            }
        );
    }

    cleanup() {
        this.node.log("Out node cleanup");
        this.node.setStatusDisconnected();
    }
}

function setupOutNode(node, config, controller) {
    return new OutNode(node, config, controller);
}

module.exports = { setupOutNode };
