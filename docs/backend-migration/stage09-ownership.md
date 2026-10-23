# Stage 09 ownership — approvals and notifications

Stage 09 moves approval workflows, in-app notification APIs and notification preferences to FastAPI. Next.js keeps the browser session and BFF: its route handlers continue checking the existing permissions and request schemas, then forward to the matching authenticated Python route. Approval detail and notification pages read their initial data through the existing backend bridge.

Python owns approval templates, create/list/detail/options, decisions and cancellation; notification list/count/read/read-all/delete/preferences; SMTP singleton settings and connection verification. Approval state changes, audit records and notification intents use the caller's UoW. Document state and `lockVersion` update in the same transaction as approval creation/decision/cancellation. The SMTP connection probe runs after its read session closes.

SMTP password values remain plain singleton text values compatible with the existing mixed migration phase. Reads and writes return an empty password field. Existing stored passwords remain usable when a save carries an empty password. No SMTP delivery or alert generation moved in this stage.

TypeScript retains `POST /api/notifications/smtp/process` and `POST /api/notifications/generate-alerts` as manual delivery/alert processors through Stage 13. Prisma schema and migrations remain the DDL owner. Other unlisted TypeScript consumers are not write owners for Stage 09 APIs.

Verification details, exact test commands, isolated database names, changed paths and known limits are in [stage09-report.md](../../.superpowers/sdd/03-workflows-and-reports/stage09-report.md).
