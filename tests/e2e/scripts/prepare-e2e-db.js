const { backup, seedForE2E } = require("./e2eDbManager");

async function main() {
    await backup();
    await seedForE2E();
    console.log("[E2E] DB backup and seed completed.");
}

main().catch((err) => {
    console.error("[E2E] prepare failed:", err);
    process.exit(1);
});
