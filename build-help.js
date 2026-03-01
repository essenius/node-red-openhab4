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

const fs = require('node:fs');
const path = require('node:path');

const NODES = [
    'openhab4-controller',
    'openhab4-in',
    'openhab4-get',
    'openhab4-out',
    'openhab4-health',
    'openhab4-events',
];
const SRC_DIR = path.join(__dirname, 'nodes');
const STAGING_DIR = path.join(__dirname, 'dist');
const DOCS_DIR = path.join(__dirname, 'docs');

const DIST_NODE_DIR = path.join(STAGING_DIR, 'nodes');

// --- Transform helpers ---
const PROPERTY_REGEX = /^- (\*{2,3})(.*?)\1 \*\((.*?)\)\* — (.*)$/gm;

function stripTopH2(md) {
    return md.replace(/^## .*$/m, '').trimStart();
}

function transformForNodeRed(md) {
    return stripTopH2(md).replace(PROPERTY_REGEX, (_, stars, name, type, desc) => {
        const isOptional = stars.length === 3;
        const formattedName = isOptional ? `*${name}*` : name;
        return `: ${formattedName} (${type}) : ${desc}`;
    });
}

function wrap(nodeName, content) {
    return `<script type="text/markdown" data-help-name="${nodeName}">
${content}
</script>`;
}

// --- Main build ---

function build(nodeName) {
    const shortName = nodeName.replace(/^openhab4-/, ''); // "in", "out"
    const jsFile = path.join(SRC_DIR, `${shortName}.js`);
    const htmlFile = path.join(SRC_DIR, `${shortName}.html`);

    const srcHtml = fs.readFileSync(htmlFile, 'utf8');
    const md = fs.readFileSync(path.join(DOCS_DIR, `${nodeName}.md`), 'utf8');
    const transformedHelp = wrap(nodeName, transformForNodeRed(md));
    const outputHtml = srcHtml.replace('{{HELP}}', transformedHelp);

    // Ensure staging folder exists
    fs.mkdirSync(DIST_NODE_DIR, { recursive: true });
    fs.writeFileSync(path.join(DIST_NODE_DIR, `${shortName}.html`), outputHtml);
    fs.copyFileSync(jsFile, path.join(DIST_NODE_DIR, `${shortName}.js`));

    console.log(`Built ${nodeName} (short name ${shortName}) → package-staging/nodes`);
}

// --- Copy static folders and docs ---
function copyFolder(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        if (fs.lstatSync(srcPath).isDirectory()) copyFolder(srcPath, destPath);
        else fs.copyFileSync(srcPath, destPath);
    }
}

// --- Build everything ---

NODES.forEach(build);
copyFolder(path.join(__dirname, 'lib'), path.join(STAGING_DIR, 'lib'));
copyFolder(path.join(__dirname, 'static'), path.join(STAGING_DIR, 'static'));
copyFolder(DOCS_DIR, path.join(STAGING_DIR, 'docs'));
fs.copyFileSync(path.join(__dirname, 'package.json'), path.join(STAGING_DIR, 'package.json'));
fs.copyFileSync(path.join(__dirname, 'README.md'), path.join(STAGING_DIR, 'README.md'));
const exampleSourceFolder = path.join(__dirname, 'examples');
const exampleStagingFolder = path.join(STAGING_DIR, 'examples');
fs.mkdirSync(exampleStagingFolder, { recursive: true });

const examplesToInclude = ['test-flow-localhost.json', 'generate-test-flow.js'];

examplesToInclude.forEach((file) => {
    fs.copyFileSync(path.join(exampleSourceFolder, file), path.join(exampleStagingFolder, file));
});
