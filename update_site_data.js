#!/usr/bin/env node
const path = require('path');
const { runUpdate } = require('./scripts/build-from-sheet');

runUpdate({
  htmlPaths: [path.join(__dirname, 'index.html')]
}).catch(error => {
  console.error('Auto update failed.');
  console.error(`Details: ${error.message}`);
  process.exit(1);
});
