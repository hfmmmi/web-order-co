/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: "node",
    testTimeout: 30000,
    setupFiles: ["<rootDir>/tests/setupJestDataDir.js"],
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
        global: {
            lines: 85,
            branches: 80
        },
        "middlewares/validate.js": { lines: 90, branches: 70 },
        "utils/priceCalc.js": { lines: 99, branches: 99 }
    }
};
