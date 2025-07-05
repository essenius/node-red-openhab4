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

const path = require("path");
const express = require("express");   // <— pull in express

console.log("[admin.js] File loaded.");

module.exports = function(RED) {
  // 1) compute the folder that holds your JS (one level up into /static)
  const staticPath = path.join(__dirname, "..", "static");

  // 2) mount ALL files in that folder under /openhab4/*
  RED.httpAdmin.use("/openhab4", express.static(staticPath));

  // any other admin‐side setup…  
};
/*

const path = require("path");


module.exports = function (RED) {
  console.log("[admin.js] invoked");

  const constantsPath = path.join(__dirname, "static", "constants.js");
  console.log("[admin.js] constantsPath =", constantsPath);

  RED.httpAdmin.get("/openhab4/constants.js", (req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.sendFile(constantsPath, (err) => {
      if (err) {
        console.error("[admin.js] sendFile error:", err);
        res.status(err.status || 500).send("Failed to load constants.js");
      } else {
        console.log("[admin.js] constants.js sent successfully");
      }
    }); 
  });
};

*/