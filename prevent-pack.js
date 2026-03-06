console.error(`
❌ Do not run 'npm pack' from the project root.
Use:

    npm run pack:dist

This ensures dist is built correctly before packaging.
`);
process.exit(1);
