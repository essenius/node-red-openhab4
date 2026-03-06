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

'use strict';

const path = require('node:path');

function registerOpenHabAdminSite(RED) {
    const staticPath = path.join(__dirname, '..', 'static');

    RED.httpAdmin.get('/openhab4-static/:file', (req, res) => {
        const filePath = path.join(staticPath, req.params.file);
        res.sendFile(filePath);
    });
}

module.exports = { registerOpenHabAdminSite };
