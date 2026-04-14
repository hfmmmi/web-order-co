"use strict";

/**
 * Jest 全体の前に 1 回だけ実行。CI では tests/_sandbox_data が gitignore のため空のままになり、
 * products.json 欠如でユニットテストが ENOENT になるのを防ぐ。
 */
const path = require("path");

module.exports = async function jestGlobalSetup() {
    if (!process.env.DATA_DIR) {
        process.env.DATA_DIR = path.join(__dirname, "_sandbox_data");
    }
    process.env.DATA_DIR = path.resolve(process.env.DATA_DIR);

    const { seedBaseData } = require("./helpers/testSandbox");
    await seedBaseData();
};
