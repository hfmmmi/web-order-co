/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: "node",
    testMatch: ["**/tests/**/*.test.js"],
    collectCoverageFrom: [
        "routes/**/*.js",
        "services/**/*.js",
        "middlewares/**/*.js",
        "utils/priceCalc.js",
        "utils/excelReader.js"
    ],
    coveragePathIgnorePatterns: [
        "/node_modules/",
        "/tests/"
    ],
    coverageThreshold: {
        // Phase1: 分岐が安定して70%超えたら global を branches: 70 に変更（docs/test-plan-saas-ready.md §4.2）
        global: {
            lines: 80,
            branches: 67
        },
        "middlewares/validate.js": { lines: 90, branches: 70 },
        "utils/priceCalc.js": { lines: 99, branches: 99 },
        "routes/auth-api.js": { lines: 80, branches: 66 },
        "routes/orders-api.js": { lines: 90, branches: 62 },
        "routes/admin-api.js": { lines: 80, branches: 62 }
    }
};
