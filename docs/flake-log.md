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

