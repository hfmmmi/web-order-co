# Flake監視ログ

不安定（flaky）と判定されたテストスイートを記録する。
`npm run test:flake` 実行時に検出があれば自動追記される。

---
## 2026-02-16T22:01:26.016Z - flake検出
不安定と判定されたスイート:
- tests/a-rank/coverage-auth-orders-admin.api.test.js (22.484 s)
- tests/a-rank/server-env-behavior.api.test.js
- tests/risk-driven/features-visibility-regression.api.test.js
- tests/s-rank/request-validation.api.test.js
- tests/s-rank/session-cookie-security.api.test.js
- tests/a-rank/proxy-login-expiry.api.test.js
- tests/b-rank/product-cart-and-announcements.api.test.js
- tests/s-rank/session-timeout.api.test.js
- tests/b-rank/operations.api.test.js
- tests/a-rank/invite-mail-failure.api.test.js
- tests/a-rank/security-boundaries.api.test.js
- tests/a-rank/cors-configuration.api.test.js
- tests/a-rank/captcha-required-response.api.test.js
- tests/a-rank/proxy-request-concurrency.api.test.js
- tests/b-rank/upload-boundaries.api.test.js
- tests/a-rank/proxy-and-public-settings.api.test.js
- tests/a-rank/json-corruption-recovery.api.test.js
- tests/b-rank/stock-visibility-combinations.api.test.js
- tests/s-rank/auth-audit-log-corruption.api.test.js
- tests/a-rank/proxy-logout-restore.api.test.js
- tests/s-rank/logout-cookie-clear.api.test.js
- tests/a-rank/import-orders-concurrency.api.test.js
- tests/a-rank/recaptcha-verify-failure.api.test.js
- tests/s-rank/auth-audit-and-lock-reset.api.test.js
- tests/a-rank/critical-flows.api.test.js
- tests/s-rank/customers.api.test.js
- tests/risk-driven/regression-risk.api.test.js
- tests/s-rank/auth.api.test.js
- tests/risk-driven/admin-api-authz-regression.api.test.js
- tests/s-rank/orders.api.test.js
- tests/a-rank/shipment-concurrency.api.test.js
- tests/a-rank/order-concurrency.api.test.js
- tests/s-rank/password-changed-notification-failure.api.test.js
- tests/s-rank/admin-settings.api.test.js
- tests/b-rank/shipping-import-concurrency.api.test.js
- tests/a-rank/public-settings-contract.api.test.js
- tests/a-rank/csp-headers.api.test.js
- tests/b-rank/announcements-date-filtering.api.test.js
- tests/a-rank/coverage-auth-orders-admin.api.test.js (24.289 s)

実行結果:
- Run 1: FAIL (tests/a-rank/coverage-auth-orders-admin.api.test.js (22.484 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js, tests/s-rank/auth-security.api.test.js, tests/s-rank/login-failure-alert-mail.api.test.js, tests/a-rank/server-env-behavior.api.test.js, tests/risk-driven/features-visibility-regression.api.test.js, tests/s-rank/request-validation.api.test.js, tests/s-rank/session-cookie-security.api.test.js, tests/a-rank/proxy-login-expiry.api.test.js, tests/b-rank/product-cart-and-announcements.api.test.js, tests/s-rank/session-timeout.api.test.js, tests/b-rank/operations.api.test.js, tests/a-rank/invite-mail-failure.api.test.js, tests/a-rank/security-boundaries.api.test.js, tests/a-rank/cors-configuration.api.test.js, tests/a-rank/captcha-required-response.api.test.js, tests/s-rank/auth-audit-log.api.test.js, tests/a-rank/proxy-request-concurrency.api.test.js, tests/b-rank/upload-boundaries.api.test.js, tests/a-rank/proxy-and-public-settings.api.test.js, tests/a-rank/json-corruption-recovery.api.test.js, tests/b-rank/stock-visibility-combinations.api.test.js, tests/s-rank/auth-audit-log-corruption.api.test.js, tests/a-rank/proxy-logout-restore.api.test.js, tests/s-rank/logout-cookie-clear.api.test.js, tests/a-rank/import-orders-concurrency.api.test.js, tests/a-rank/recaptcha-verify-failure.api.test.js, tests/s-rank/auth-audit-and-lock-reset.api.test.js, tests/a-rank/critical-flows.api.test.js, tests/s-rank/customers.api.test.js, tests/risk-driven/regression-risk.api.test.js, tests/s-rank/auth.api.test.js, tests/risk-driven/admin-api-authz-regression.api.test.js, tests/s-rank/orders.api.test.js, tests/a-rank/shipment-concurrency.api.test.js, tests/a-rank/order-concurrency.api.test.js, tests/s-rank/password-changed-notification-failure.api.test.js, tests/s-rank/admin-settings.api.test.js, tests/b-rank/shipping-import-concurrency.api.test.js, tests/a-rank/public-settings-contract.api.test.js, tests/a-rank/csp-headers.api.test.js, tests/b-rank/announcements-date-filtering.api.test.js)
- Run 2: FAIL (tests/a-rank/coverage-auth-orders-admin.api.test.js (24.289 s), tests/s-rank/auth-security.api.test.js, tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js, tests/s-rank/login-failure-alert-mail.api.test.js, tests/s-rank/request-validation.api.test.js, tests/a-rank/proxy-login-expiry.api.test.js, tests/b-rank/product-cart-and-announcements.api.test.js, tests/s-rank/auth-audit-log.api.test.js, tests/s-rank/session-cookie-security.api.test.js, tests/a-rank/critical-flows.api.test.js, tests/b-rank/operations.api.test.js, tests/risk-driven/features-visibility-regression.api.test.js, tests/a-rank/cors-configuration.api.test.js, tests/a-rank/proxy-request-concurrency.api.test.js, tests/b-rank/stock-visibility-combinations.api.test.js, tests/a-rank/recaptcha-verify-failure.api.test.js)
- Run 3: FAIL (tests/s-rank/auth-security.api.test.js, tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js, tests/s-rank/login-failure-alert-mail.api.test.js, tests/s-rank/auth-audit-log.api.test.js)

---

## 2026-02-17T09:05:32.845Z - flake検出
不安定と判定されたスイート:
- tests/a-rank/coverage-auth-orders-admin.api.test.js (65.683 s)
- tests/a-rank/kaitori-api.api.test.js (14.198 s)
- tests/s-rank/auth-security.api.test.js (6.444 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (6.023 s)
- tests/s-rank/login-failure-alert-mail.api.test.js (5.224 s)
- tests/b-rank/stock-visibility-combinations.api.test.js
- tests/s-rank/auth-audit-log.api.test.js
- tests/a-rank/proxy-request-concurrency.api.test.js
- tests/b-rank/order-estimate-message.api.test.js

実行結果:
- Run 1: FAIL (tests/a-rank/coverage-auth-orders-admin.api.test.js (65.683 s), tests/a-rank/kaitori-api.api.test.js (14.198 s), tests/s-rank/auth-security.api.test.js (6.444 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (6.023 s), tests/s-rank/login-failure-alert-mail.api.test.js (5.224 s), tests/b-rank/stock-visibility-combinations.api.test.js, tests/s-rank/auth-audit-log.api.test.js, tests/a-rank/proxy-request-concurrency.api.test.js, tests/b-rank/order-estimate-message.api.test.js)
- Run 2: PASS 
- Run 3: PASS 

---

## 2026-02-17T19:32:05.778Z - flake検出
不安定と判定されたスイート:
- tests/a-rank/kaitori-api.api.test.js (13.72 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (6.577 s)
- tests/s-rank/auth-security.api.test.js (6.674 s)
- tests/s-rank/login-failure-alert-mail.api.test.js (6.062 s)
- tests/b-rank/operations.api.test.js
- tests/a-rank/recaptcha-verify-failure.api.test.js
- tests/s-rank/auth-security.api.test.js (10.514 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (6.734 s)
- tests/s-rank/login-failure-alert-mail.api.test.js (5.355 s)
- tests/a-rank/coverage-auth-orders-admin.api.test.js (75.751 s)
- tests/b-rank/stock-visibility-combinations.api.test.js
- tests/a-rank/auth-api-captcha-verify-failure.api.test.js
- tests/a-rank/coverage-auth-orders-admin.api.test.js (57.072 s)

実行結果:
- Run 1: FAIL (tests/a-rank/kaitori-api.api.test.js (13.72 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (6.577 s), tests/s-rank/auth-security.api.test.js (6.674 s), tests/s-rank/login-failure-alert-mail.api.test.js (6.062 s), tests/b-rank/operations.api.test.js, tests/a-rank/recaptcha-verify-failure.api.test.js)
- Run 2: FAIL (tests/s-rank/auth-security.api.test.js (10.514 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (6.734 s), tests/s-rank/login-failure-alert-mail.api.test.js (5.355 s), tests/a-rank/coverage-auth-orders-admin.api.test.js (75.751 s), tests/b-rank/stock-visibility-combinations.api.test.js, tests/a-rank/auth-api-captcha-verify-failure.api.test.js)
- Run 3: FAIL (tests/a-rank/coverage-auth-orders-admin.api.test.js (57.072 s))

---

## 2026-02-18T06:47:31.711Z - flake検出
不安定と判定されたスイート:
- tests/a-rank/kaitori-api.api.test.js (12.841 s)
- tests/b-rank/support-api-boundaries.api.test.js (7.384 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js
- tests/s-rank/login-failure-alert-mail.api.test.js
- tests/s-rank/auth-security.api.test.js
- tests/b-rank/stock-visibility-combinations.api.test.js
- tests/s-rank/auth-audit-log-corruption.api.test.js
- tests/s-rank/auth-audit-log.api.test.js
- tests/a-rank/captcha-required-response.api.test.js
- tests/a-rank/recaptcha-verify-failure.api.test.js
- tests/a-rank/proxy-request-concurrency.api.test.js
- tests/b-rank/product-cart-and-announcements.api.test.js

実行結果:
- Run 1: PASS 
- Run 2: PASS 
- Run 3: FAIL (tests/a-rank/kaitori-api.api.test.js (12.841 s), tests/b-rank/support-api-boundaries.api.test.js (7.384 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js, tests/s-rank/login-failure-alert-mail.api.test.js, tests/s-rank/auth-security.api.test.js, tests/b-rank/stock-visibility-combinations.api.test.js, tests/s-rank/auth-audit-log-corruption.api.test.js, tests/s-rank/auth-audit-log.api.test.js, tests/a-rank/captcha-required-response.api.test.js, tests/a-rank/recaptcha-verify-failure.api.test.js, tests/a-rank/proxy-request-concurrency.api.test.js, tests/b-rank/product-cart-and-announcements.api.test.js)

---

## 2026-02-18T08:23:20.505Z - flake検出
不安定と判定されたスイート:
- tests/a-rank/coverage-auth-orders-admin.api.test.js (83.836 s)
- tests/a-rank/kaitori-api.api.test.js (14.28 s)
- tests/b-rank/products-api-boundaries.api.test.js (12.959 s)
- tests/b-rank/support-api-boundaries.api.test.js (8.923 s)
- tests/s-rank/auth-audit-log.api.test.js
- tests/s-rank/login-failure-alert-mail.api.test.js (5.311 s)
- tests/s-rank/auth-security.api.test.js (6.719 s)
- tests/risk-driven/features-visibility-regression.api.test.js
- tests/a-rank/json-corruption-recovery.api.test.js
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (5.791 s)
- tests/a-rank/captcha-required-response.api.test.js
- tests/s-rank/auth-audit-log-corruption.api.test.js
- tests/a-rank/recaptcha-verify-failure.api.test.js
- tests/a-rank/import-orders-concurrency.api.test.js

実行結果:
- Run 1: PASS 
- Run 2: FAIL (tests/a-rank/coverage-auth-orders-admin.api.test.js (83.836 s), tests/a-rank/kaitori-api.api.test.js (14.28 s), tests/b-rank/products-api-boundaries.api.test.js (12.959 s), tests/b-rank/support-api-boundaries.api.test.js (8.923 s), tests/s-rank/auth-audit-log.api.test.js, tests/s-rank/login-failure-alert-mail.api.test.js (5.311 s), tests/s-rank/auth-security.api.test.js (6.719 s), tests/risk-driven/features-visibility-regression.api.test.js, tests/a-rank/json-corruption-recovery.api.test.js, tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (5.791 s), tests/a-rank/captcha-required-response.api.test.js, tests/s-rank/auth-audit-log-corruption.api.test.js, tests/a-rank/recaptcha-verify-failure.api.test.js, tests/a-rank/import-orders-concurrency.api.test.js)
- Run 3: PASS 

---

## 2026-02-19T01:30:18.611Z - flake検出
不安定と判定されたスイート:
- tests/s-rank/auth-audit-log-corruption.api.test.js (5.706 s)
- tests/s-rank/auth-audit-log.api.test.js (6.174 s)
- tests/a-rank/captcha-required-response.api.test.js (5.958 s)
- tests/b-rank/order-estimate-message.api.test.js
- tests/b-rank/stock-visibility-combinations.api.test.js (5.518 s)
- tests/a-rank/proxy-request-concurrency.api.test.js (5.337 s)
- tests/a-rank/recaptcha-verify-failure.api.test.js
- tests/a-rank/auth-api-captcha-verify-failure.api.test.js (5.299 s)
- tests/s-rank/auth-audit-and-lock-reset.api.test.js (6.732 s)
- tests/s-rank/auth-audit-and-lock-reset.api.test.js (6.76 s)
- tests/a-rank/auth-api-captcha-verify-failure.api.test.js
- tests/a-rank/coverage-auth-orders-admin.api.test.js (167.645 s)
- tests/b-rank/products-api-boundaries.api.test.js (34.058 s)
- tests/a-rank/kaitori-api.api.test.js (21.185 s)
- tests/b-rank/support-api-boundaries.api.test.js (21.079 s)
- tests/s-rank/auth-security.api.test.js (9.092 s)
- tests/a-rank/proxy-and-public-settings.api.test.js
- tests/s-rank/login-failure-alert-mail.api.test.js (14.757 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (10.935 s)
- tests/b-rank/operations.api.test.js
- tests/s-rank/session-timeout.api.test.js
- tests/a-rank/coverage-auth-orders-admin.api.test.js (118.283 s)

実行結果:
- Run 1: FAIL (tests/s-rank/auth-audit-log-corruption.api.test.js (5.706 s), tests/s-rank/auth-audit-log.api.test.js (6.174 s), tests/a-rank/captcha-required-response.api.test.js (5.958 s), tests/b-rank/order-estimate-message.api.test.js, tests/b-rank/stock-visibility-combinations.api.test.js (5.518 s), tests/a-rank/proxy-request-concurrency.api.test.js (5.337 s), tests/a-rank/recaptcha-verify-failure.api.test.js, tests/a-rank/auth-api-captcha-verify-failure.api.test.js (5.299 s), tests/s-rank/auth-audit-and-lock-reset.api.test.js (6.732 s))
- Run 2: FAIL (tests/s-rank/auth-audit-and-lock-reset.api.test.js (6.76 s), tests/a-rank/auth-api-captcha-verify-failure.api.test.js, tests/a-rank/coverage-auth-orders-admin.api.test.js (167.645 s), tests/b-rank/products-api-boundaries.api.test.js (34.058 s), tests/a-rank/kaitori-api.api.test.js (21.185 s), tests/b-rank/support-api-boundaries.api.test.js (21.079 s), tests/s-rank/auth-security.api.test.js (9.092 s), tests/a-rank/proxy-and-public-settings.api.test.js, tests/s-rank/login-failure-alert-mail.api.test.js (14.757 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (10.935 s), tests/b-rank/operations.api.test.js, tests/s-rank/session-timeout.api.test.js)
- Run 3: FAIL (tests/a-rank/coverage-auth-orders-admin.api.test.js (118.283 s))

---

## 2026-02-19T04:37:34.837Z - flake検出
不安定と判定されたスイート:
- tests/a-rank/coverage-auth-orders-admin.api.test.js (100.195 s)
- tests/b-rank/products-api-boundaries.api.test.js (21.266 s)
- tests/a-rank/kaitori-api.api.test.js (16.692 s)
- tests/s-rank/auth-security.api.test.js (7.053 s)
- tests/s-rank/login-failure-alert-mail.api.test.js (5.494 s)
- tests/s-rank/auth-audit-log.api.test.js
- tests/a-rank/proxy-request-concurrency.api.test.js
- tests/a-rank/captcha-required-response.api.test.js
- tests/s-rank/auth-audit-log-corruption.api.test.js
- tests/a-rank/order-concurrency.api.test.js (5.038 s)
- tests/a-rank/coverage-auth-orders-admin.api.test.js (118.255 s)
- tests/a-rank/kaitori-api.api.test.js (23.212 s)
- tests/s-rank/auth-security.api.test.js (10.084 s)
- tests/s-rank/login-failure-alert-mail.api.test.js (7.994 s)
- tests/a-rank/captcha-required-response.api.test.js (6.799 s)
- tests/b-rank/support-api-boundaries.api.test.js (13.797 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (9.216 s)
- tests/a-rank/proxy-and-public-settings.api.test.js
- tests/s-rank/auth-audit-and-lock-reset.api.test.js
- tests/a-rank/auth-api-captcha-verify-failure.api.test.js
- tests/s-rank/orders.api.test.js (33.139 s)
- tests/a-rank/sanitize-admin-name.api.test.js (6.853 s)

実行結果:
- Run 1: PASS 
- Run 2: FAIL (tests/a-rank/coverage-auth-orders-admin.api.test.js (100.195 s), tests/b-rank/products-api-boundaries.api.test.js (21.266 s), tests/a-rank/kaitori-api.api.test.js (16.692 s), tests/s-rank/auth-security.api.test.js (7.053 s), tests/s-rank/login-failure-alert-mail.api.test.js (5.494 s), tests/s-rank/auth-audit-log.api.test.js, tests/a-rank/proxy-request-concurrency.api.test.js, tests/a-rank/captcha-required-response.api.test.js, tests/s-rank/auth-audit-log-corruption.api.test.js, tests/a-rank/order-concurrency.api.test.js (5.038 s))
- Run 3: FAIL (tests/a-rank/coverage-auth-orders-admin.api.test.js (118.255 s), tests/a-rank/kaitori-api.api.test.js (23.212 s), tests/s-rank/auth-security.api.test.js (10.084 s), tests/s-rank/login-failure-alert-mail.api.test.js (7.994 s), tests/s-rank/auth-audit-log.api.test.js, tests/s-rank/auth-audit-log-corruption.api.test.js, tests/a-rank/captcha-required-response.api.test.js (6.799 s), tests/a-rank/proxy-request-concurrency.api.test.js, tests/b-rank/support-api-boundaries.api.test.js (13.797 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (9.216 s), tests/a-rank/proxy-and-public-settings.api.test.js, tests/s-rank/auth-audit-and-lock-reset.api.test.js, tests/a-rank/auth-api-captcha-verify-failure.api.test.js, tests/s-rank/orders.api.test.js (33.139 s), tests/a-rank/sanitize-admin-name.api.test.js (6.853 s))

---

## 2026-02-19T08:44:02.720Z - flake検出
不安定と判定されたスイート:
- tests/a-rank/critical-flows.api.test.js
- tests/a-rank/recaptcha-verify-failure.api.test.js
- tests/s-rank/password-changed-notification-failure.api.test.js
- tests/s-rank/auth-audit-and-lock-reset.api.test.js
- tests/b-rank/order-estimate-message.api.test.js
- tests/a-rank/auth-api-captcha-verify-failure.api.test.js
- tests/a-rank/coverage-auth-orders-admin.api.test.js (106.974 s)
- tests/a-rank/kaitori-api.api.test.js (15.066 s)
- tests/s-rank/auth-security.api.test.js (10.194 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (7.633 s)
- tests/a-rank/cors-configuration.api.test.js (19.336 s)
- tests/a-rank/kaitori-api.api.test.js (26.184 s)
- tests/s-rank/auth-security.api.test.js (11.257 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (11.569 s)
- tests/a-rank/recaptcha-verify-failure.api.test.js (6.482 s)
- tests/b-rank/products-api-boundaries.api.test.js (20.091 s)
- tests/b-rank/support-api-boundaries.api.test.js (14.625 s)
- tests/a-rank/proxy-request-concurrency.api.test.js
- tests/s-rank/login-failure-alert-mail.api.test.js (9.288 s)
- tests/a-rank/captcha-required-response.api.test.js (5.615 s)
- tests/b-rank/operations.api.test.js
- tests/s-rank/auth-audit-log.api.test.js
- tests/a-rank/proxy-login-expiry.api.test.js

実行結果:
- Run 1: FAIL (tests/a-rank/critical-flows.api.test.js, tests/a-rank/recaptcha-verify-failure.api.test.js, tests/s-rank/password-changed-notification-failure.api.test.js, tests/s-rank/auth-audit-and-lock-reset.api.test.js, tests/b-rank/order-estimate-message.api.test.js, tests/a-rank/auth-api-captcha-verify-failure.api.test.js)
- Run 2: FAIL (tests/a-rank/recaptcha-verify-failure.api.test.js, tests/s-rank/auth-audit-and-lock-reset.api.test.js, tests/b-rank/order-estimate-message.api.test.js, tests/a-rank/coverage-auth-orders-admin.api.test.js (106.974 s), tests/a-rank/kaitori-api.api.test.js (15.066 s), tests/s-rank/auth-security.api.test.js (10.194 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (7.633 s), tests/a-rank/cors-configuration.api.test.js (19.336 s))
- Run 3: FAIL (tests/a-rank/kaitori-api.api.test.js (26.184 s), tests/s-rank/auth-security.api.test.js (11.257 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (11.569 s), tests/a-rank/recaptcha-verify-failure.api.test.js (6.482 s), tests/b-rank/products-api-boundaries.api.test.js (20.091 s), tests/b-rank/support-api-boundaries.api.test.js (14.625 s), tests/a-rank/proxy-request-concurrency.api.test.js, tests/s-rank/login-failure-alert-mail.api.test.js (9.288 s), tests/a-rank/auth-api-captcha-verify-failure.api.test.js, tests/a-rank/captcha-required-response.api.test.js (5.615 s), tests/b-rank/operations.api.test.js, tests/s-rank/auth-audit-log.api.test.js, tests/a-rank/proxy-login-expiry.api.test.js)

---

## 2026-04-01T11:24:49.149Z - flake検出
不安定と判定されたスイート:
- tests/b-rank/stock-visibility-combinations.api.test.js
- tests/s-rank/auth-audit-log-corruption.api.test.js
- tests/a-rank/recaptcha-verify-failure.api.test.js
- tests/b-rank/product-cart-and-announcements.api.test.js
- tests/a-rank/auth-api-captcha-verify-failure.api.test.js
- tests/risk-driven/regression-risk.api.test.js
- tests/a-rank/branch-coverage-85-boost-2.unit.test.js

実行結果:
- Run 1: PASS 
- Run 2: PASS 
- Run 3: FAIL (tests/b-rank/stock-visibility-combinations.api.test.js, tests/s-rank/auth-audit-log-corruption.api.test.js, tests/a-rank/recaptcha-verify-failure.api.test.js, tests/b-rank/product-cart-and-announcements.api.test.js, tests/a-rank/auth-api-captcha-verify-failure.api.test.js, tests/risk-driven/regression-risk.api.test.js, tests/a-rank/branch-coverage-85-boost-2.unit.test.js)

---

## 2026-04-01T22:22:33.276Z - flake検出
不安定と判定されたスイート:
- tests/a-rank/auth-api-coverage.api.test.js (8.346 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (5.245 s)
- tests/s-rank/auth-security.api.test.js (6.111 s)
- tests/a-rank/orders-api-delivery-shipper-history.api.test.js (5.913 s)
- tests/s-rank/login-failure-alert-mail.api.test.js (6.239 s)
- tests/b-rank/stock-visibility-combinations.api.test.js
- tests/a-rank/proxy-request-concurrency.api.test.js
- tests/a-rank/branch-coverage-90-admin-plain-password.api.test.js
- tests/b-rank/order-estimate-message.api.test.js
- tests/a-rank/customer-service-import-new-row.unit.test.js
- tests/s-rank/login-failure-alert-mail.api.test.js (5.336 s)
- tests/s-rank/auth-security.api.test.js (5.256 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js
- tests/a-rank/coverage-auth-orders-admin.api.test.js (104.882 s)
- tests/a-rank/kaitori-api.api.test.js (17.683 s)
- tests/b-rank/products-api-boundaries.api.test.js (15.247 s)
- tests/a-rank/recaptcha-verify-failure.api.test.js
- tests/a-rank/sanitize-admin-name.api.test.js
- tests/a-rank/coverage-auth-orders-admin.api.test.js (102.235 s)
- tests/a-rank/kaitori-api.api.test.js (13.968 s)
- tests/s-rank/login-failure-alert-mail.api.test.js (6.969 s)
- tests/s-rank/auth-security.api.test.js (6.915 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (6.454 s)
- tests/a-rank/catalog-branch-coverage-80.api.test.js (14.629 s)
- tests/a-rank/branch-coverage-admin-orders-prices.api.test.js (8.885 s)
- tests/a-rank/branch-coverage-90-price-service.unit.test.js

実行結果:
- Run 1: FAIL (tests/a-rank/auth-api-coverage.api.test.js (8.346 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (5.245 s), tests/s-rank/auth-security.api.test.js (6.111 s), tests/a-rank/orders-api-delivery-shipper-history.api.test.js (5.913 s), tests/s-rank/login-failure-alert-mail.api.test.js (6.239 s), tests/s-rank/auth-audit-log.api.test.js, tests/b-rank/stock-visibility-combinations.api.test.js, tests/a-rank/captcha-required-response.api.test.js, tests/a-rank/proxy-request-concurrency.api.test.js, tests/a-rank/branch-coverage-90-admin-plain-password.api.test.js, tests/b-rank/order-estimate-message.api.test.js, tests/a-rank/customer-service-import-new-row.unit.test.js)
- Run 2: FAIL (tests/s-rank/login-failure-alert-mail.api.test.js (5.336 s), tests/s-rank/auth-security.api.test.js (5.256 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js, tests/s-rank/auth-audit-log.api.test.js, tests/a-rank/captcha-required-response.api.test.js, tests/a-rank/branch-coverage-90-admin-plain-password.api.test.js, tests/a-rank/coverage-auth-orders-admin.api.test.js (104.882 s), tests/a-rank/kaitori-api.api.test.js (17.683 s), tests/b-rank/products-api-boundaries.api.test.js (15.247 s), tests/a-rank/recaptcha-verify-failure.api.test.js, tests/a-rank/sanitize-admin-name.api.test.js)
- Run 3: FAIL (tests/a-rank/coverage-auth-orders-admin.api.test.js (102.235 s), tests/a-rank/kaitori-api.api.test.js (13.968 s), tests/s-rank/login-failure-alert-mail.api.test.js (6.969 s), tests/s-rank/auth-security.api.test.js (6.915 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (6.454 s), tests/a-rank/captcha-required-response.api.test.js, tests/s-rank/auth-audit-log.api.test.js, tests/a-rank/catalog-branch-coverage-80.api.test.js (14.629 s), tests/a-rank/branch-coverage-admin-orders-prices.api.test.js (8.885 s), tests/a-rank/branch-coverage-90-price-service.unit.test.js)

---

## 2026-04-05T02:46:31.942Z - flake検出
不安定と判定されたスイート:
- tests/a-rank/branch-coverage-targeted-p2-product.unit.test.js
- tests/a-rank/price-service-coverage.unit.test.js
- tests/a-rank/coverage-auth-orders-admin.api.test.js (102.103 s)
- tests/a-rank/kaitori-api.api.test.js (22.972 s)
- tests/a-rank/branch-coverage-targeted-p4-routes.api.test.js (19.931 s)
- tests/b-rank/support-api-boundaries.api.test.js (14.494 s)
- tests/a-rank/catalog-branch-coverage-80.api.test.js (14.615 s)
- tests/a-rank/branch-coverage-90-customer-session.api.test.js (15.532 s)
- tests/b-rank/products-api-boundaries.api.test.js (15.549 s)
- tests/a-rank/branch-coverage-90-catalog-pricelist-frequent.api.test.js (13.297 s)
- tests/a-rank/settings-routes-admin-branch-80.api.test.js (16.041 s)
- tests/a-rank/admin-session-routes-branch-80.api.test.js (8.195 s)
- tests/s-rank/auth-security.api.test.js (5.946 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (7.769 s)
- tests/s-rank/login-failure-alert-mail.api.test.js (9.23 s)
- tests/a-rank/orders-api-delivery-shipper-history.api.test.js (7.344 s)
- tests/a-rank/support-api-branch-80.api.test.js (11.587 s)
- tests/a-rank/orders-download-csv-keyword-branches.api.test.js (12.571 s)
- tests/s-rank/auth-audit-log.api.test.js (5.538 s)
- tests/a-rank/proxy-request-concurrency.api.test.js (5.719 s)
- tests/a-rank/recaptcha-verify-failure.api.test.js (6.914 s)
- tests/s-rank/auth-audit-and-lock-reset.api.test.js
- tests/a-rank/proxy-logout-restore.api.test.js (10.374 s)
- tests/b-rank/shipping-import-concurrency.api.test.js (5.069 s)
- tests/a-rank/invite-token-expiry-and-single-use.api.test.js (22.033 s)
- tests/a-rank/branch-coverage-90-admin-plain-password.api.test.js
- tests/b-rank/stock-visibility-combinations.api.test.js
- tests/a-rank/order-service-cancel-release.unit.test.js
- tests/s-rank/auth-audit-log-corruption.api.test.js (5.292 s)
- tests/a-rank/shipment-concurrency.api.test.js
- tests/a-rank/critical-flows.api.test.js
- tests/risk-driven/regression-risk.api.test.js
- tests/a-rank/sanitize-admin-name.api.test.js (6.438 s)
- tests/a-rank/branch-coverage-90-support-csv-mail.unit.test.js
- tests/a-rank/price-service-branches.unit.test.js
- tests/a-rank/coverage-auth-orders-admin.api.test.js (163.065 s)
- tests/a-rank/kaitori-api.api.test.js (36.294 s)
- tests/a-rank/branch-coverage-targeted-p4-routes.api.test.js (21.226 s)
- tests/b-rank/products-api-boundaries.api.test.js (17.802 s)
- tests/a-rank/branch-coverage-90-customer-session.api.test.js (15.943 s)
- tests/a-rank/catalog-branch-coverage-80.api.test.js (12.566 s)
- tests/b-rank/support-api-boundaries.api.test.js (16.457 s)
- tests/a-rank/branch-coverage-90-catalog-pricelist-frequent.api.test.js (12.696 s)
- tests/a-rank/orders-download-csv-keyword-branches.api.test.js (7.555 s)
- tests/a-rank/support-api-branch-80.api.test.js (6.557 s)
- tests/s-rank/login-failure-alert-mail.api.test.js
- tests/a-rank/admin-session-routes-branch-80.api.test.js (9.468 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (5.51 s)
- tests/a-rank/orders-api-delivery-shipper-history.api.test.js (5.953 s)
- tests/a-rank/recaptcha-verify-failure.api.test.js
- tests/a-rank/sanitize-admin-name.api.test.js
- tests/s-rank/auth-security.api.test.js (7.113 s)
- tests/a-rank/proxy-request-concurrency.api.test.js
- tests/s-rank/auth-audit-log.api.test.js
- tests/s-rank/auth-audit-log-corruption.api.test.js
- tests/a-rank/proxy-and-public-settings.api.test.js
- tests/a-rank/customers-routes-branch-80.api.test.js (30.885 s)
- tests/a-rank/support-api-attachments-branches.api.test.js (6.793 s)
- tests/a-rank/proxy-login-expiry.api.test.js
- tests/a-rank/password-reset-request-service-extra.unit.test.js (5.007 s)
- tests/a-rank/captcha-required-response.api.test.js
- tests/a-rank/product-service-internal-buffers.unit.test.js

実行結果:
- Run 1: FAIL (tests/a-rank/branch-coverage-targeted-p2-product.unit.test.js, tests/a-rank/price-service-coverage.unit.test.js)
- Run 2: FAIL (tests/a-rank/coverage-auth-orders-admin.api.test.js (102.103 s), tests/a-rank/kaitori-api.api.test.js (22.972 s), tests/a-rank/branch-coverage-targeted-p4-routes.api.test.js (19.931 s), tests/b-rank/support-api-boundaries.api.test.js (14.494 s), tests/a-rank/catalog-branch-coverage-80.api.test.js (14.615 s), tests/a-rank/branch-coverage-90-customer-session.api.test.js (15.532 s), tests/b-rank/products-api-boundaries.api.test.js (15.549 s), tests/a-rank/branch-coverage-90-catalog-pricelist-frequent.api.test.js (13.297 s), tests/a-rank/settings-routes-admin-branch-80.api.test.js (16.041 s), tests/a-rank/admin-session-routes-branch-80.api.test.js (8.195 s), tests/s-rank/auth-security.api.test.js (5.946 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (7.769 s), tests/s-rank/login-failure-alert-mail.api.test.js (9.23 s), tests/a-rank/orders-api-delivery-shipper-history.api.test.js (7.344 s), tests/a-rank/support-api-branch-80.api.test.js (11.587 s), tests/a-rank/orders-download-csv-keyword-branches.api.test.js (12.571 s), tests/s-rank/auth-audit-log.api.test.js (5.538 s), tests/a-rank/proxy-request-concurrency.api.test.js (5.719 s), tests/a-rank/recaptcha-verify-failure.api.test.js (6.914 s), tests/s-rank/auth-audit-and-lock-reset.api.test.js, tests/a-rank/proxy-logout-restore.api.test.js (10.374 s), tests/b-rank/shipping-import-concurrency.api.test.js (5.069 s), tests/a-rank/invite-token-expiry-and-single-use.api.test.js (22.033 s), tests/a-rank/branch-coverage-90-admin-plain-password.api.test.js, tests/b-rank/stock-visibility-combinations.api.test.js, tests/a-rank/order-service-cancel-release.unit.test.js, tests/s-rank/auth-audit-log-corruption.api.test.js (5.292 s), tests/a-rank/shipment-concurrency.api.test.js, tests/a-rank/critical-flows.api.test.js, tests/risk-driven/regression-risk.api.test.js, tests/a-rank/sanitize-admin-name.api.test.js (6.438 s), tests/a-rank/branch-coverage-90-support-csv-mail.unit.test.js, tests/a-rank/price-service-branches.unit.test.js)
- Run 3: FAIL (tests/a-rank/coverage-auth-orders-admin.api.test.js (163.065 s), tests/a-rank/kaitori-api.api.test.js (36.294 s), tests/a-rank/branch-coverage-targeted-p4-routes.api.test.js (21.226 s), tests/b-rank/products-api-boundaries.api.test.js (17.802 s), tests/a-rank/branch-coverage-90-customer-session.api.test.js (15.943 s), tests/a-rank/catalog-branch-coverage-80.api.test.js (12.566 s), tests/b-rank/support-api-boundaries.api.test.js (16.457 s), tests/a-rank/branch-coverage-90-catalog-pricelist-frequent.api.test.js (12.696 s), tests/a-rank/orders-download-csv-keyword-branches.api.test.js (7.555 s), tests/a-rank/support-api-branch-80.api.test.js (6.557 s), tests/s-rank/login-failure-alert-mail.api.test.js, tests/a-rank/admin-session-routes-branch-80.api.test.js (9.468 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (5.51 s), tests/a-rank/orders-api-delivery-shipper-history.api.test.js (5.953 s), tests/a-rank/recaptcha-verify-failure.api.test.js, tests/a-rank/sanitize-admin-name.api.test.js, tests/s-rank/auth-security.api.test.js (7.113 s), tests/a-rank/proxy-request-concurrency.api.test.js, tests/s-rank/auth-audit-log.api.test.js, tests/s-rank/auth-audit-log-corruption.api.test.js, tests/b-rank/stock-visibility-combinations.api.test.js, tests/risk-driven/regression-risk.api.test.js, tests/a-rank/branch-coverage-90-support-csv-mail.unit.test.js, tests/a-rank/proxy-and-public-settings.api.test.js, tests/a-rank/customers-routes-branch-80.api.test.js (30.885 s), tests/a-rank/support-api-attachments-branches.api.test.js (6.793 s), tests/a-rank/proxy-login-expiry.api.test.js, tests/a-rank/password-reset-request-service-extra.unit.test.js (5.007 s), tests/a-rank/captcha-required-response.api.test.js, tests/a-rank/branch-coverage-targeted-p2-product.unit.test.js, tests/a-rank/product-service-internal-buffers.unit.test.js)

---

## 2026-04-05T02:52:25.672Z - flake検出
不安定と判定されたスイート:
- tests/a-rank/kaitori-api.api.test.js (27.934 s)
- tests/a-rank/customers-routes-branch-80.api.test.js (16.211 s)
- tests/a-rank/branch-coverage-targeted-p4-routes.api.test.js (20.19 s)
- tests/a-rank/branch-coverage-90-customer-session.api.test.js (15.758 s)
- tests/b-rank/products-api-boundaries.api.test.js (15.047 s)
- tests/b-rank/support-api-boundaries.api.test.js (14.659 s)
- tests/a-rank/admin-api-coverage.api.test.js (13.885 s)
- tests/a-rank/catalog-branch-coverage-80.api.test.js (12.429 s)
- tests/a-rank/branch-coverage-90-catalog-pricelist-frequent.api.test.js (13.225 s)
- tests/a-rank/admin-session-routes-branch-80.api.test.js (8.551 s)
- tests/a-rank/support-api-branch-80.api.test.js (5.68 s)
- tests/a-rank/auth-api-coverage.api.test.js (8.468 s)
- tests/a-rank/orders-api-delivery-shipper-history.api.test.js
- tests/s-rank/login-failure-alert-mail.api.test.js
- tests/s-rank/auth-security.api.test.js (6.122 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (6.13 s)
- tests/a-rank/support-api-attachments-branches.api.test.js
- tests/s-rank/auth-audit-log.api.test.js
- tests/a-rank/proxy-and-public-settings.api.test.js
- tests/a-rank/branch-coverage-92-orders-support-catch.api.test.js
- tests/a-rank/prices-import-routes.api.test.js
- tests/a-rank/import-orders-concurrency.api.test.js (8.419 s)
- tests/a-rank/order-concurrency.api.test.js (5.222 s)
- tests/b-rank/shipping-import-concurrency.api.test.js (5.068 s)
- tests/a-rank/order-service-cancel-release.unit.test.js
- tests/a-rank/branch-coverage-targeted-p1-price.unit.test.js
- tests/s-rank/auth-audit-and-lock-reset.api.test.js
- tests/a-rank/sanitize-admin-name.api.test.js (7.815 s)
- tests/a-rank/auth-api-captcha-verify-failure.api.test.js
- tests/a-rank/shipment-concurrency.api.test.js
- tests/a-rank/branch-coverage-100-p0-price.unit.test.js
- tests/a-rank/product-service-coverage.unit.test.js
- tests/a-rank/product-service-excel-rank-columns.unit.test.js (6.548 s)
- tests/a-rank/kaitori-api.api.test.js (34.102 s)
- tests/a-rank/branch-coverage-targeted-p4-routes.api.test.js (29.26 s)
- tests/a-rank/customers-routes-branch-80.api.test.js (25.518 s)
- tests/a-rank/branch-coverage-90-customer-session.api.test.js (16.998 s)
- tests/b-rank/products-api-boundaries.api.test.js (21.955 s)
- tests/a-rank/branch-coverage-90-catalog-pricelist-frequent.api.test.js (16.35 s)
- tests/a-rank/admin-session-routes-branch-80.api.test.js (10.822 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (5.279 s)
- tests/s-rank/auth-security.api.test.js (9.218 s)
- tests/a-rank/support-api-branch-80.api.test.js (6.851 s)
- tests/b-rank/shipping-import-concurrency.api.test.js
- tests/a-rank/orders-api-delivery-shipper-history.api.test.js (6.33 s)
- tests/s-rank/login-failure-alert-mail.api.test.js (6.991 s)
- tests/a-rank/proxy-and-public-settings.api.test.js (5.794 s)
- tests/a-rank/coverage-auth-orders-admin.api.test.js (150.004 s)
- tests/a-rank/branch-coverage-targeted-p6-csvadapter-order.unit.test.js (27.66 s)
- tests/a-rank/branch-coverage-admin-orders-prices.api.test.js (15.283 s)
- tests/a-rank/branch-coverage-90-dense-b.unit.test.js
- tests/a-rank/branch-coverage-90-catalog-customers-admin.api.test.js (10.172 s)
- tests/a-rank/reset-token-single-use-and-expiry.api.test.js
- tests/risk-driven/regression-risk.api.test.js
- tests/a-rank/branch-coverage-90-admin-plain-password.api.test.js
- tests/a-rank/critical-flows.api.test.js
- tests/a-rank/branch-coverage-90-price-service.unit.test.js
- tests/a-rank/recaptcha-verify-failure.api.test.js
- tests/a-rank/product-service-internal-buffers.unit.test.js
- tests/a-rank/coverage-auth-orders-admin.api.test.js (93.011 s)
- tests/a-rank/kaitori-api.api.test.js (23.367 s)
- tests/b-rank/products-api-boundaries.api.test.js (16.207 s)
- tests/a-rank/branch-coverage-90-customer-session.api.test.js (15.531 s)

実行結果:
- Run 1: FAIL (tests/a-rank/kaitori-api.api.test.js (27.934 s), tests/a-rank/customers-routes-branch-80.api.test.js (16.211 s), tests/a-rank/branch-coverage-targeted-p4-routes.api.test.js (20.19 s), tests/a-rank/branch-coverage-90-customer-session.api.test.js (15.758 s), tests/b-rank/products-api-boundaries.api.test.js (15.047 s), tests/b-rank/support-api-boundaries.api.test.js (14.659 s), tests/a-rank/admin-api-coverage.api.test.js (13.885 s), tests/a-rank/catalog-branch-coverage-80.api.test.js (12.429 s), tests/a-rank/branch-coverage-90-catalog-pricelist-frequent.api.test.js (13.225 s), tests/a-rank/admin-session-routes-branch-80.api.test.js (8.551 s), tests/a-rank/support-api-branch-80.api.test.js (5.68 s), tests/a-rank/auth-api-coverage.api.test.js (8.468 s), tests/a-rank/orders-api-delivery-shipper-history.api.test.js, tests/s-rank/login-failure-alert-mail.api.test.js, tests/s-rank/auth-security.api.test.js (6.122 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (6.13 s), tests/a-rank/support-api-attachments-branches.api.test.js, tests/s-rank/auth-audit-log.api.test.js, tests/a-rank/proxy-and-public-settings.api.test.js, tests/a-rank/branch-coverage-92-orders-support-catch.api.test.js, tests/a-rank/prices-import-routes.api.test.js, tests/a-rank/import-orders-concurrency.api.test.js (8.419 s), tests/a-rank/order-concurrency.api.test.js (5.222 s), tests/b-rank/shipping-import-concurrency.api.test.js (5.068 s), tests/a-rank/order-service-cancel-release.unit.test.js, tests/a-rank/branch-coverage-targeted-p1-price.unit.test.js, tests/s-rank/auth-audit-and-lock-reset.api.test.js, tests/a-rank/sanitize-admin-name.api.test.js (7.815 s), tests/a-rank/auth-api-captcha-verify-failure.api.test.js, tests/a-rank/shipment-concurrency.api.test.js, tests/a-rank/branch-coverage-100-p0-price.unit.test.js, tests/a-rank/product-service-coverage.unit.test.js, tests/a-rank/product-service-excel-rank-columns.unit.test.js (6.548 s))
- Run 2: FAIL (tests/a-rank/kaitori-api.api.test.js (34.102 s), tests/a-rank/branch-coverage-targeted-p4-routes.api.test.js (29.26 s), tests/a-rank/customers-routes-branch-80.api.test.js (25.518 s), tests/a-rank/branch-coverage-90-customer-session.api.test.js (16.998 s), tests/b-rank/products-api-boundaries.api.test.js (21.955 s), tests/a-rank/branch-coverage-90-catalog-pricelist-frequent.api.test.js (16.35 s), tests/a-rank/admin-session-routes-branch-80.api.test.js (10.822 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (5.279 s), tests/s-rank/auth-security.api.test.js (9.218 s), tests/a-rank/support-api-branch-80.api.test.js (6.851 s), tests/b-rank/shipping-import-concurrency.api.test.js, tests/a-rank/orders-api-delivery-shipper-history.api.test.js (6.33 s), tests/s-rank/login-failure-alert-mail.api.test.js (6.991 s), tests/a-rank/auth-api-captcha-verify-failure.api.test.js, tests/s-rank/auth-audit-log.api.test.js, tests/s-rank/auth-audit-and-lock-reset.api.test.js, tests/a-rank/proxy-and-public-settings.api.test.js (5.794 s), tests/a-rank/coverage-auth-orders-admin.api.test.js (150.004 s), tests/a-rank/branch-coverage-targeted-p6-csvadapter-order.unit.test.js (27.66 s), tests/a-rank/branch-coverage-admin-orders-prices.api.test.js (15.283 s), tests/a-rank/branch-coverage-90-dense-b.unit.test.js, tests/a-rank/branch-coverage-90-catalog-customers-admin.api.test.js (10.172 s), tests/a-rank/reset-token-single-use-and-expiry.api.test.js, tests/risk-driven/regression-risk.api.test.js, tests/a-rank/branch-coverage-90-admin-plain-password.api.test.js, tests/a-rank/critical-flows.api.test.js, tests/a-rank/branch-coverage-90-price-service.unit.test.js, tests/a-rank/recaptcha-verify-failure.api.test.js, tests/a-rank/product-service-internal-buffers.unit.test.js)
- Run 3: FAIL (tests/a-rank/coverage-auth-orders-admin.api.test.js (93.011 s), tests/a-rank/kaitori-api.api.test.js (23.367 s), tests/b-rank/products-api-boundaries.api.test.js (16.207 s), tests/a-rank/branch-coverage-90-customer-session.api.test.js (15.531 s))

---

## 2026-04-05T07:40:55.474Z - flake検出
不安定と判定されたスイート:
- tests/a-rank/branch-coverage-targeted-p4-routes.api.test.js (22.039 s)
- tests/a-rank/customers-routes-branch-80.api.test.js (18.002 s)
- tests/a-rank/branch-coverage-90-customer-session.api.test.js (17.046 s)
- tests/b-rank/products-api-boundaries.api.test.js (16.274 s)
- tests/a-rank/branch-coverage-80-mopup.api.test.js (17.208 s)
- tests/b-rank/support-api-boundaries.api.test.js (16.132 s)
- tests/a-rank/catalog-branch-coverage-80.api.test.js (13.261 s)
- tests/a-rank/branch-coverage-90-catalog-pricelist-frequent.api.test.js (13.916 s)
- tests/a-rank/admin-session-routes-branch-80.api.test.js (8.581 s)
- tests/a-rank/order-service-90-branches.unit.test.js (7.177 s)
- tests/a-rank/orders-download-csv-keyword-branches.api.test.js (7.085 s)
- tests/s-rank/auth-security.api.test.js (7.823 s)
- tests/a-rank/password-reset-request-service-extra.unit.test.js (8.309 s)
- tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (7.036 s)
- tests/s-rank/login-failure-alert-mail.api.test.js (5.537 s)
- tests/s-rank/auth-audit-log.api.test.js
- tests/a-rank/branch-coverage-100-p0-order.unit.test.js
- tests/a-rank/proxy-and-public-settings.api.test.js
- tests/a-rank/proxy-request-concurrency.api.test.js
- tests/a-rank/branch-coverage-90-dense-b.unit.test.js
- tests/b-rank/order-estimate-message.api.test.js
- tests/a-rank/auth-api-captcha-verify-failure.api.test.js
- tests/s-rank/auth-audit-and-lock-reset.api.test.js
- tests/a-rank/branch-coverage-90-support-csv-mail.unit.test.js
- tests/a-rank/price-service-branches.unit.test.js
- tests/a-rank/branch-coverage-100-p0-price.unit.test.js (6.745 s)
- tests/a-rank/auth-audit-log-service-branches.unit.test.js

実行結果:
- Run 1: PASS 
- Run 2: PASS 
- Run 3: FAIL (tests/a-rank/branch-coverage-targeted-p4-routes.api.test.js (22.039 s), tests/a-rank/customers-routes-branch-80.api.test.js (18.002 s), tests/a-rank/branch-coverage-90-customer-session.api.test.js (17.046 s), tests/b-rank/products-api-boundaries.api.test.js (16.274 s), tests/a-rank/branch-coverage-80-mopup.api.test.js (17.208 s), tests/b-rank/support-api-boundaries.api.test.js (16.132 s), tests/a-rank/catalog-branch-coverage-80.api.test.js (13.261 s), tests/a-rank/branch-coverage-90-catalog-pricelist-frequent.api.test.js (13.916 s), tests/a-rank/admin-session-routes-branch-80.api.test.js (8.581 s), tests/a-rank/order-service-90-branches.unit.test.js (7.177 s), tests/a-rank/orders-download-csv-keyword-branches.api.test.js (7.085 s), tests/s-rank/auth-security.api.test.js (7.823 s), tests/a-rank/password-reset-request-service-extra.unit.test.js (8.309 s), tests/s-rank/session-fixation-and-rate-limit-boundary.api.test.js (7.036 s), tests/s-rank/login-failure-alert-mail.api.test.js (5.537 s), tests/s-rank/auth-audit-log.api.test.js, tests/a-rank/branch-coverage-100-p0-order.unit.test.js, tests/a-rank/proxy-and-public-settings.api.test.js, tests/a-rank/proxy-request-concurrency.api.test.js, tests/a-rank/branch-coverage-90-dense-b.unit.test.js, tests/b-rank/order-estimate-message.api.test.js, tests/a-rank/auth-api-captcha-verify-failure.api.test.js, tests/s-rank/auth-audit-and-lock-reset.api.test.js, tests/a-rank/branch-coverage-90-support-csv-mail.unit.test.js, tests/a-rank/price-service-branches.unit.test.js, tests/a-rank/branch-coverage-100-p0-price.unit.test.js (6.745 s), tests/a-rank/auth-audit-log-service-branches.unit.test.js)

---

