const { seedForE2E } = require("./e2eDbManager");

async function main() {
    await seedForE2E();
    console.log("[E2E] DB seed completed (tests/e2e/.e2e_data).");
}

main().catch((err) => {
    console.error("[E2E] prepare failed:", err);
    process.exit(1);
});
