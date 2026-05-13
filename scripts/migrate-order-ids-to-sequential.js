"use strict";

try {
    require("dotenv").config();
} catch (_) {
    /* optional */
}

const fs = require("fs").promises;
const path = require("path");
const { DATA_ROOT, dbPath } = require("../dbPaths");

const ORDER_ID_WIDTH = 8;
const MAX_ORDER_ID = 10 ** ORDER_ID_WIDTH - 1;
const BACKUP_DIR_NAME = "order-id-migration-backups";
const RELATED_JSON_FILES = ["support_tickets.json"];

function formatOrderId(index) {
    if (index < 1 || index > MAX_ORDER_ID) {
        throw new Error(`Order ID range exceeded: ${index}`);
    }
    return String(index).padStart(ORDER_ID_WIDTH, "0");
}

function timestampForPath() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function readJson(fileName) {
    const raw = await fs.readFile(dbPath(fileName), "utf8");
    return JSON.parse(raw);
}

async function writeJson(fileName, data) {
    await fs.writeFile(dbPath(fileName), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function fileExists(fileName) {
    try {
        await fs.access(dbPath(fileName));
        return true;
    } catch (e) {
        if (e.code === "ENOENT") return false;
        throw e;
    }
}

function orderTimestamp(order) {
    const t = Date.parse(order && order.orderDate);
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function buildOrderIdMigration(orders) {
    if (!Array.isArray(orders)) {
        throw new Error("orders.json must be an array");
    }
    if (orders.length > MAX_ORDER_ID) {
        throw new Error(`orders.json has too many rows for ${ORDER_ID_WIDTH}-digit IDs`);
    }

    const seenOldIds = new Set();
    for (const order of orders) {
        if (!order || order.orderId === undefined || order.orderId === null || order.orderId === "") {
            continue;
        }
        const oldId = String(order.orderId);
        if (seenOldIds.has(oldId)) {
            throw new Error(`Duplicate orderId found before migration: ${oldId}`);
        }
        seenOldIds.add(oldId);
    }

    const sorted = orders
        .map((order, index) => ({ order, index, time: orderTimestamp(order) }))
        .sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            return a.index - b.index;
        });

    const oldToNew = new Map();
    let changedCount = 0;

    sorted.forEach(({ order }, index) => {
        const newId = formatOrderId(index + 1);
        const oldId =
            order && order.orderId !== undefined && order.orderId !== null && order.orderId !== ""
                ? String(order.orderId)
                : null;
        if (oldId) oldToNew.set(oldId, newId);
        if (!oldId || oldId !== newId) changedCount++;
        order.orderId = newId;
    });

    return { oldToNew, changedCount };
}

function replaceOrderIdReferences(value, oldToNew, stats) {
    if (Array.isArray(value)) {
        value.forEach((item) => replaceOrderIdReferences(item, oldToNew, stats));
        return;
    }
    if (!value || typeof value !== "object") return;

    Object.keys(value).forEach((key) => {
        if (key === "orderId") {
            const raw = value[key];
            if (raw !== undefined && raw !== null && raw !== "") {
                const replacement = oldToNew.get(String(raw));
                if (replacement) {
                    if (String(raw) !== replacement) stats.changed++;
                    value[key] = replacement;
                } else {
                    stats.unmatched.push(String(raw));
                }
            }
            return;
        }
        replaceOrderIdReferences(value[key], oldToNew, stats);
    });
}

async function backupFiles(fileNames) {
    const backupDir = path.join(DATA_ROOT, BACKUP_DIR_NAME, timestampForPath());
    await fs.mkdir(backupDir, { recursive: true });
    for (const fileName of fileNames) {
        if (await fileExists(fileName)) {
            await fs.copyFile(dbPath(fileName), path.join(backupDir, fileName));
        }
    }
    return backupDir;
}

async function main() {
    const dryRun = process.argv.includes("--dry-run");
    const orders = await readJson("orders.json");
    const related = [];

    for (const fileName of RELATED_JSON_FILES) {
        if (await fileExists(fileName)) {
            related.push({ fileName, data: await readJson(fileName) });
        }
    }

    const { oldToNew, changedCount: orderChangedCount } = buildOrderIdMigration(orders);
    const relatedStats = [];

    for (const item of related) {
        const stats = { changed: 0, unmatched: [] };
        replaceOrderIdReferences(item.data, oldToNew, stats);
        relatedStats.push({ fileName: item.fileName, ...stats });
    }

    let backupDir = null;
    if (!dryRun) {
        backupDir = await backupFiles(["orders.json", ...related.map((item) => item.fileName)]);
        await writeJson("orders.json", orders);
        for (const item of related) {
            await writeJson(item.fileName, item.data);
        }
    }

    console.log(`[order-id-migration] ${dryRun ? "dry-run" : "completed"}`);
    console.log(`[order-id-migration] data root: ${DATA_ROOT}`);
    if (backupDir) console.log(`[order-id-migration] backup: ${backupDir}`);
    console.log(`[order-id-migration] orders updated: ${orderChangedCount}/${orders.length}`);
    relatedStats.forEach((stats) => {
        const unmatched = [...new Set(stats.unmatched)];
        console.log(`[order-id-migration] ${stats.fileName} refs updated: ${stats.changed}`);
        if (unmatched.length > 0) {
            console.log(`[order-id-migration] ${stats.fileName} unmatched refs: ${unmatched.join(", ")}`);
        }
    });
}

main().catch((error) => {
    console.error("[order-id-migration] failed:", error);
    process.exit(1);
});
