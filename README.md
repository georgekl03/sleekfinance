# SleekFinance

SleekFinance is a dark-themed personal finance and budgeting workspace. Stage 3 expands the app with a
multi-step imports wizard, mapping profiles, FX handling, duplicate detection, manual exchange rate
management, and configurable import defaults layered on top of the Stage 2 data models and logging.

## Requirements

- Node.js 18+
- npm 9+
- Python 3.8+ (used by the enhanced launcher and log writer)

## Quickstart

On macOS and Linux use the Python launcher for a single-command setup that installs dependencies
(when required), starts Vite, and writes all output to `logs/sleekfinance-dev.log`.

```bash
python3 launch.py
```

On Windows run the bundled batch script:

```bat
start.bat
```

If you prefer a POSIX shell wrapper you can still run:

```bash
./start.sh
```

Both commands default to the Vite dev server at `http://localhost:5173`. Use any email/password
combination to sign in.

## Available Scripts

| Command | Description |
| --- | --- |
| `python3 launch.py` | Installs dependencies (if missing), starts `npm run dev -- --host 0.0.0.0`, and records the session log. |
| `start.bat` | Windows-friendly launcher that installs dependencies on first run and starts the dev server. |
| `./start.sh` | POSIX shell wrapper around `launch.py` with a fallback to raw npm if Python is unavailable. |
| `npm run dev` | Starts the Vite development server only. |
| `npm run build` | Type-checks and bundles the production build. |
| `npm run preview` | Serves the production bundle. |

## Stage 3 highlights

- **Imports wizard** – Guided flow with steps for Upload → Mapping → Preview → Conflicts → Import → Summary.
  Supports drag-and-drop CSV upload, demo files, field mapping (including multi-column descriptions),
  duplicate detection, FX options, default categories, and per-row overrides.
- **Mapping profiles** – Auto-detect profiles by header fingerprint, remember revised mappings, and
  reuse saved profiles across imports.
- **Multi-currency readiness** – Accounts retain their native currency, imports capture both native and
  converted amounts, and duplicates are scoped per account. FX rates can be supplied manually or via
  per-row columns with rounding safeguards.
- **Manual exchange rates** – Settings now provide a base currency selector (default GBP), a manual
  exchange-rate table, and the date of the last rate update. Stage 3 documents that live rates are not
  fetched automatically.
- **Import defaults** – Configure preferred date format, decimal and thousands separators, and sign
  convention in Settings. The wizard pre-fills these defaults for new uploads.
- **Demo CSVs and quick testing** – Download staged CSV samples, load them directly into the wizard, and
  clear imported demo transactions per account.

## Data Model Overview

### Institutions & Accounts

- Institutions own accounts and capture metadata such as type and optional website.
- Account rules
  - Opening balance date cannot be in the future.
  - Names must be unique within an institution.
  - Toggle inclusion to control participation in overview totals.
  - Included accounts may join multiple include-only groups; excluded accounts cannot join any
    include-only group.

Example:

```
Institution: Modern Bank (type: bank)
  ├─ Everyday Checking — included in totals, part of "Day-to-Day"
  └─ Future Savings — included in totals
Institution: Global Credit (type: card)
  └─ Global Rewards Card — excluded from totals, in "Exclude: Credit Cycling"
```

### Account Groups

- Include groups surface focus areas in Overview/Transactions.
- Exclude groups remove temporary balances; an account cannot belong to an include and exclude group
  simultaneously.
- Group badges inherit a configurable colour used on chips and pills.

```
[Day-to-Day] (include) → Checking, Credit Card
[Exclude: Credit Cycling] (exclude) → Credit Card only
```

### Category Hierarchy

- Master Categories are fixed anchors (Income, Essentials, Growth, Discretionary).
- Each master category contains categories, which contain sub-categories.
- Categories/sub-categories can be renamed, archived, or merged. Merging preserves historical
  transactions and moves children automatically.

```
Income
  └─ Primary Income
     ├─ Payroll
     └─ Bonus
Essentials
  └─ Housing → Rent / Utilities
```

### Payees & Tags

- Payees store default category/sub-category mappings applied on new transactions.
- Tags provide flexible reporting overlays. Both can be archived without breaking history.
- Tag colours power table pills and filter chips.

### Demo Data & Logs

- Load sample institutions, accounts, groups, categories, payees, tags, and six months of
  transactions via **Settings → Demo data controls**.
- Clear demo data to remove only entities flagged as demo; real data remains untouched.
- Diagnostics log entries are persisted to `localStorage` and visible in **Settings → Diagnostics
  log**. The launcher also writes terminal output to `logs/sleekfinance-dev.log`.

## Project Structure

```
├── launch.py               # Python launcher with logging
├── start.sh                # Shell wrapper around the launcher
├── src
│   ├── App.tsx             # App routing and providers
│   ├── auth/               # Authentication context
│   ├── components/         # Layout, tooltips, error boundary
│   ├── data/               # Data context, models, demo data builders
│   ├── pages/              # Stage 2 feature pages
│   ├── utils/              # Formatting, id generation, logging helpers
│   └── index.css           # Global styles and utility classes
└── README.md
```

## Accessibility & Logging

The interface keeps the Stage 1 high-contrast dark palette, keyboard-accessible navigation, and
expanded tooltips on every form field introduced in Stage 2. Errors are captured by an application
error boundary and persisted to the client-side log store. The launcher mirrors all stdout/stderr to a
rotating log file so crashes never disappear with a closed terminal window.
