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
const NODE_DIR = path.join(__dirname, 'nodes');
const DIST_DIR = path.join(__dirname, 'dist');
const DOCS_DIR = path.join(__dirname, 'docs');

const DIST_NODE_DIR = path.join(DIST_DIR, 'nodes');

// Matches markdown property lines like:
//
//   - **payload** *(string)* — Description
//   - **topic** *(string) — Description   (missing trailing * tolerated)
//
// Supports:
// - Indented list items
// - **required** and ***optional*** markers
// - Minor spacing variations
// - Hyphen (-) or em-dash (—) separators
//
// Capture groups:
//   1 = emphasis marker (** or ***)
//   2 = property name
//   3 = type
//   4 = description
const PROPERTY_REGEX = /^\s*-\s+(\*{2,3})(.*?)\1\s+\*\((.*?)\)\*?\s*[—-]\s+(.*)$/gm;

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
    const htmlFile = path.join(NODE_DIR, `${shortName}.html`);

    const srcHtml = fs.readFileSync(htmlFile, 'utf8');
    const md = fs.readFileSync(path.join(DOCS_DIR, `${nodeName}.md`), 'utf8');
    const transformedHelp = wrap(nodeName, transformForNodeRed(md));
    const outputHtml = srcHtml.replace('{{HELP}}', transformedHelp);
    if (!srcHtml.includes('{{HELP}}')) {
        throw new Error(`{{HELP}} placeholder not found in ${shortName}.html`);
    }
    // overwrite the existing file
    fs.writeFileSync(path.join(DIST_NODE_DIR, `${shortName}.html`), outputHtml);

    console.log(`Built ${nodeName} (short name ${shortName}) → dist/nodes`);
}

// clean up package.json

function cleanupPackageConfig(configFileSource, configFileTarget) {
    const pkg = JSON.parse(fs.readFileSync(configFileSource, 'utf8'));

    // remove dev-only sections
    delete pkg.scripts;
    delete pkg.devDependencies;
    delete pkg.nyc;
    // write cleaned package.json to dist
    fs.writeFileSync(configFileTarget, JSON.stringify(pkg, null, 2));
}

// --- Copy folder contents recursively ---
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

// selectively copy examples
function copyExamples() {
    const exampleSourceFolder = path.join(__dirname, 'examples');
    const exampleStagingFolder = path.join(DIST_DIR, 'examples');
    fs.mkdirSync(exampleStagingFolder, { recursive: true });

    const examplesToInclude = ['test-flow-localhost.json', 'generate-test-flow.js'];
    examplesToInclude.forEach((file) => {
        fs.copyFileSync(path.join(exampleSourceFolder, file), path.join(exampleStagingFolder, file));
    });
}

// --- Build everything ---

fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_NODE_DIR, { recursive: true });
copyFolder(NODE_DIR, DIST_NODE_DIR);

// overwrite the html files
NODES.forEach(build);

copyFolder(path.join(__dirname, 'lib'), path.join(DIST_DIR, 'lib'));
copyFolder(path.join(__dirname, 'static'), path.join(DIST_DIR, 'static'));
copyFolder(DOCS_DIR, path.join(DIST_DIR, 'docs'));
cleanupPackageConfig(path.join(__dirname, 'package.json'), path.join(DIST_DIR, 'package.json'));
fs.copyFileSync(path.join(__dirname, 'README.md'), path.join(DIST_DIR, 'README.md'));

copyExamples();
