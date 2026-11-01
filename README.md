# Trading Journal

A multi-account prop firm trading journal for tracking performance, consistency, risk, and account progress.

## Features
- Overview dashboard with realized P&L, win rate, profit factor, average R-multiple, expectancy, consistency score, and drawdown.
- Trade log with filters, position size, trade notes, risk details, and editable records.
- Optional trade image attachments (JPG, PNG, WEBP, GIF; maximum 8 MB per image).
- Calendar P&L heatmap, cumulative realized P&L chart, and drawdown tracking.
- Analytics for trading performance, account rankings, risk usage, and consistency limits.
- Playbook for documenting trading setups.
- Multiple prop-firm accounts with firm, account type, stage, status, starting balance, risk limits, and profit targets.
- CSV and JSON data export, plus JSON import.
- Local autosave and authenticated server-side journal persistence.

## Project structure
- `public/` — browser application, stylesheets, and brand asset.
- `api/journal.js` — authenticated journal read/write endpoint.
- `api/trade-media.js` — authenticated trade-image upload and deletion endpoint.
- `migrations/001_journal.sql` — PostgreSQL table migration.

## Runtime requirements
The API handlers use Hatchable runtime modules (`hatchable`) for authenticated member access, PostgreSQL, and private object storage. Deploy through a compatible Hatchable project/runtime with the corresponding database table and private storage configured.

## Notes
- P&L and account-health calculations use recorded trades; no live broker or prop-firm feed is connected by default.
- Trade media is stored privately and served through temporary signed URLs.
- This repository contains application source; it does not include credentials, user journal data, or deployed database contents.
