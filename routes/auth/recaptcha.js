const https = require("https");

/**
 * reCAPTCHA v2 トークンを検証する
 * @param {string} token - フロントから送られた response トークン
 * @param {string} secretKey - サイトのシークレットキー
 * @returns {Promise<boolean>}
 */
function verifyRecaptcha(token, secretKey) {
    if (!token || !secretKey) return Promise.resolve(false);
    return new Promise((resolve) => {
        const postData = new URLSearchParams({ secret: secretKey, response: token }).toString();
        const req = https.request(
            {
                hostname: "www.google.com",
                path: "/recaptcha/api/siteverify",
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": Buffer.byteLength(postData)
                }
            },
            (res) => {
                let body = "";
                res.on("data", (chunk) => {
                    body += chunk;
                });
                res.on("end", () => {
                    try {
                        const json = JSON.parse(body);
                        resolve(json.success === true);
                    } catch (e) {
                        resolve(false);
                    }
                });
            }
        );
        req.on("error", () => resolve(false));
        req.setTimeout(5000, () => {
            req.destroy();
            resolve(false);
        });
        req.write(postData);
        req.end();
    });
}

module.exports = { verifyRecaptcha };
