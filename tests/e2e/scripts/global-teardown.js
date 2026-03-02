const { restore } = require("./e2eDbManager");

module.exports = async function globalTeardown() {
    await restore();
    console.log("[E2E] DB restore completed.");
};
