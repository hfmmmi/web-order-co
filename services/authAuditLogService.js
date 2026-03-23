"use strict";

const fs = require("fs").promises;
const path = require("path");
const { dbPath } = require("../dbPaths");

const ADMIN_AUTH_LOG_PATH = dbPath("logs/admin-auth.json");
const CUSTOMER_AUTH_LOG_PATH = dbPath("logs/customer-auth.json");

async function appendAdminAuthLog(entry) {
    const row = {
        at: new Date().toISOString(),
        ...entry,
        ip: entry.ip || null
    };
    try {
        let list = [];
        try {
            const data = await fs.readFile(ADMIN_AUTH_LOG_PATH, "utf-8");
            list = JSON.parse(data);
        } catch (e) {
            if (e.code !== "ENOENT") console.error("[admin-auth-log] read error:", e.message);
        }
        if (!Array.isArray(list)) list = [];
        list.push(row);
        const dir = path.dirname(ADMIN_AUTH_LOG_PATH);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(ADMIN_AUTH_LOG_PATH, JSON.stringify(list, null, 2));
    } catch (e) {
        console.error("[admin-auth-log] write error:", e.message);
    }
}

async function appendCustomerAuthLog(entry) {
    const row = {
        at: new Date().toISOString(),
        ...entry,
        ip: entry.ip || null
    };
    try {
        let list = [];
        try {
            const data = await fs.readFile(CUSTOMER_AUTH_LOG_PATH, "utf-8");
            list = JSON.parse(data);
        } catch (e) {
            if (e.code !== "ENOENT") console.error("[customer-auth-log] read error:", e.message);
        }
        if (!Array.isArray(list)) list = [];
        list.push(row);
        const dir = path.dirname(CUSTOMER_AUTH_LOG_PATH);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(CUSTOMER_AUTH_LOG_PATH, JSON.stringify(list, null, 2));
    } catch (e) {
        console.error("[customer-auth-log] write error:", e.message);
    }
}

module.exports = { appendAdminAuthLog, appendCustomerAuthLog };
