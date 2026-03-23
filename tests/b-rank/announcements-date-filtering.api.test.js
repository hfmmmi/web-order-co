jest.mock("../../services/mailService", () => ({
    sendOrderConfirmation: jest.fn().mockResolvedValue({ success: true }),
    sendSupportNotification: jest.fn().mockResolvedValue({ success: true }),
    sendInviteEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordChangedNotification: jest.fn().mockResolvedValue({ success: true }),
    sendLoginFailureAlert: jest.fn().mockResolvedValue({ success: true })
}));

const request = require("supertest");
const { app } = require("../../server");
const {
    backupDbFiles,
    restoreDbFiles,
    seedBaseData
} = require("../helpers/testSandbox");

describe("Bランク: お知らせの日付境界フィルタ", () => {
    let backup;
    const OriginalDate = global.Date;
    const FIXED_MS = OriginalDate.parse("2026-01-01T12:00:00.000Z");

    beforeAll(async () => {
        backup = await backupDbFiles();
    });

    afterAll(async () => {
        await restoreDbFiles(backup);
    });

    beforeEach(async () => {
        await seedBaseData();
        // jest.useFakeTimers は supertest / Express と相性が悪くタイムアウトするため、
        // サーバー側の new Date() / Date.now() のみ固定する
        global.Date = class extends OriginalDate {
            constructor(...args) {
                if (args.length === 0) {
                    super(FIXED_MS);
                } else {
                    super(...args);
                }
            }
            static now() {
                return FIXED_MS;
            }
        };
    });

    afterEach(() => {
        global.Date = OriginalDate;
    });

    test("start/end の境界とタイムゾーン付き日時を正しく評価する", async () => {
        const adminAgent = request.agent(app);
        await adminAgent.post("/api/admin/login").send({ id: "test-admin", pass: "AdminPass123!" });

        const save = await adminAgent.put("/api/admin/settings").send({
            announcements: [
                {
                    id: "future-start",
                    title: "未来開始",
                    body: "まだ表示しない",
                    type: "info",
                    target: "customer",
                    category: "general",
                    enabled: true,
                    startDate: "2026-01-01T12:00:01.000Z",
                    endDate: null,
                    linkUrl: "",
                    linkText: ""
                },
                {
                    id: "start-boundary",
                    title: "開始境界",
                    body: "表示する",
                    type: "info",
                    target: "customer",
                    category: "general",
                    enabled: true,
                    startDate: "2026-01-01T12:00:00.000Z",
                    endDate: null,
                    linkUrl: "",
                    linkText: ""
                },
                {
                    id: "end-boundary",
                    title: "終了境界",
                    body: "境界時刻は表示する",
                    type: "warning",
                    target: "customer",
                    category: "general",
                    enabled: true,
                    startDate: null,
                    endDate: "2026-01-01T12:00:00.000Z",
                    linkUrl: "",
                    linkText: ""
                },
                {
                    id: "past-end",
                    title: "過去終了",
                    body: "表示しない",
                    type: "warning",
                    target: "customer",
                    category: "general",
                    enabled: true,
                    startDate: null,
                    endDate: "2026-01-01T11:59:59.000Z",
                    linkUrl: "",
                    linkText: ""
                },
                {
                    id: "tz-start-boundary",
                    title: "TZ開始境界",
                    body: "JST表記でも表示する",
                    type: "info",
                    target: "customer",
                    category: "general",
                    enabled: true,
                    startDate: "2026-01-01T21:00:00+09:00",
                    endDate: null,
                    linkUrl: "",
                    linkText: ""
                },
                {
                    id: "no-date",
                    title: "常時表示",
                    body: "日付未設定",
                    type: "info",
                    target: "customer",
                    category: "general",
                    enabled: true,
                    startDate: null,
                    endDate: null,
                    linkUrl: "",
                    linkText: ""
                }
            ]
        });
        expect(save.statusCode).toBe(200);
        expect(save.body.success).toBe(true);

        const pub = await request(app).get("/api/settings/public");
        expect(pub.statusCode).toBe(200);

        const ids = pub.body.announcements.map((a) => a.id);
        expect(ids).toContain("start-boundary");
        expect(ids).toContain("end-boundary");
        expect(ids).toContain("tz-start-boundary");
        expect(ids).toContain("no-date");
        expect(ids).not.toContain("future-start");
        expect(ids).not.toContain("past-end");
    });
});
