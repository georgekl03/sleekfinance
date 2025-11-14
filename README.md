## Investments v1

SleekFinance now ships with a dedicated **Investments** workspace that layers portfolio analytics on
top of your existing accounts, providers, collections, and multi-currency settings. The page opens
from the main navigation and automatically scopes its portfolio summary, holdings table, realised
events, and price list to whatever account, provider, or collection filters you apply. Base and
native currency conversions reuse the manual exchange-rate table from Settings, so every cost,
value, and P/L figure is clearly labelled and convertible back to your configured base currency on
request.

- **Holdings management** – Add, edit, archive, or restore positions tied to investment accounts.
  Each holding tracks quantity, cost basis (total or per unit), price currency, asset type, and
  optional notes so that performance and allocation breakdowns stay consistent over time.
- **Manual price tracking** – Capture prices one symbol at a time or upload a simple CSV containing
  symbol, price, currency, and date. Prices persist as history entries and refresh unrealised
  metrics as soon as they are saved.
- **Portfolio summary** – View aggregated portfolio value, cost, unrealised P/L, and return with
  base-currency conversions, plus breakdowns by account, price currency, and asset type for the
  current filter set.
- **Realised events** – Record partial or full sales directly against a holding, specify proceeds,
  currency, and date, and the system stores the realised base-currency gain while adjusting the
  remaining quantity and cost basis.

All flows respect the existing account collections and provider filters, and the holdings table
offers a toggle to reveal base-currency equivalents alongside the native account amounts. The
`python3 launch.py` one-command launcher still starts the full application—no extra switches are
required to reach the Investments view.

## Reports Module

SleekFinance now includes a dedicated **Reports** workspace that surfaces read-only analytics for every
major dataset without modifying the underlying records. A shared filter header lets you pick preset or
custom date ranges, toggle between calendar and UK tax-year logic, and scope the analysis to specific
accounts, providers, collections, flow types, or master categories. All totals are expressed in your
configured base currency using the existing exchange-rate table, and CSV exports respect the current filters
so you can continue analysis elsewhere. The `python3 launch.py` one-command launcher still starts the entire
application—no additional switches are required to access the new reporting views.

- **Net Worth Over Time** – charts assets minus liabilities by month using opening balances plus
  transactions for the filtered accounts. Each point is labelled as an approximation derived from the
  available history, and a supporting table calls out the base-currency totals.
- **Income vs Expense** – summarises inflows and outflows by month and master category, excluding transfers
  by default. A combined table and multi-line chart highlight income, expense, and net positions for every
  period, while a secondary matrix shows the category-level contribution.
- **Category Trends** – plot one or more categories (and optional sub-categories) to see how spending or
  income evolves over time. If nothing is selected the report highlights the top categories within the
  filtered range; the table mirrors the chart with raw values per month.
- **Collection & Provider Breakdown** – compares the absolute value of the selected flows grouped by
  account collection and provider. Horizontal bar charts and tables reveal which institutions and custom
  groupings dominate the filtered activity.
- **Allocation Summary** – aggregates income allocation entries across the chosen range so you can see how
  virtual buckets such as Rainy Day or Holidays compare. The view surfaces total allocated amounts,
  percentages of overall income, and the native-currency breakdown that fed each purpose. When no data is
  available, the report prompts you to configure or run allocation rules first.

Every report offers a CSV export button that captures the underlying table data along with the active date
range, making it easy to archive analyses or share them externally.

## Interest and UK Tax-Year Handling

SleekFinance now includes a dedicated **Interest** workspace that surfaces savings and investment interest
across every connected account. Any transaction assigned to a master category whose flow resolves to
“Interest”, or manually marked with the interest flow override, is automatically treated as an inflow. These
transactions retain their native currency amounts, but summaries are converted to your configured base
currency using the existing exchange rate table so totals, blended rates, and projections remain comparable.

The Interest view supports custom date ranges, calendar years, and the 6 April → 5 April UK tax-year cycle.
You can filter by account, provider, and collection to isolate the balances that matter, while the monthly
timeline groups totals by account or provider to highlight top performers over the last twelve months (or the
selected window). A blended APR is calculated by dividing the interest earned by the estimated average base
currency balance for the period and annualising the result—this is labelled as an approximation because it
relies on opening balances and transaction history rather than bank-supplied daily accruals. The same data
drives an optional 12-month projection that assumes the blended APR continues.

A dedicated UK tax-year report preselects the current tax year, shows totals by account type, and lets you hop
between previous years with one click. Budgets and the Transactions workspace link directly into the Interest
view when you drill into interest lines, so analytical deep dives remain read-only and never mutate budgets or
transactions. The existing one-command launcher (`python3 launch.py`) continues to start the complete
application—no additional steps are required to unlock the new analysis.

## Income Allocation Rules

The Allocations workspace lets you describe how inflows should be virtually split across
purposes such as rainy day, retirement, investments, spending, and holidays. Create a rule
from **Allocations → New allocation rule**, choose a base scope (all income, specific
categories or sub-categories, selected payees, accounts, or providers), add any filters for
payees, accounts, providers, collections, or tags, and then define the named purposes and
percentages for the split. Percentages must total 100% within the rule tolerance before a rule
can be saved. Each purpose can point to a target collection, account, or remain a virtual
bucket.

Enabled rules execute in ascending priority and stop after the first match unless a later rule
is marked to overwrite allocations. When new inflows arrive or you run a retroactive allocation
over a date range, matching rules create analytical allocation records without altering account
balances. Allocations respect native currency amounts and store base-currency equivalents for
reporting.

Use the Allocations page to edit rules, preview retroactive runs, and review allocation totals
across any date range, accounts, or collections. The Budgets editor now highlights how income
lines and sub-lines are covered by allocations during the active period, and the Reports module
includes an Allocation summary card that compares allocated income to your selected budget plan
while surfacing the top purposes. The existing `python3 launch.py` one-command launcher continues
to start the app with no additional setup.

# SleekFinance

## Budgeting upgrades

- **Budget lines & breakdowns** – Each budget now supports multiple category lines and optional sub-lines.
  Planned amounts are stored per period in the base currency, so past values remain intact when you review
  older months, weeks, or tax years.
- **Planned vs actual tracking** – Actual amounts pull directly from matching transactions, respect flow type
  rules, collections, and currency conversion, and surface clear progress indicators (under, nearing, over).
- **Rollover transparency** – When rollover is enabled, the editor shows how unspent or overspent amounts
  adjust the effective plan without mutating historical data. Differences are calculated against the rolled
  balance so you can see the impact immediately.
- **Period navigation** – Budgets handle monthly, weekly, annual, and UK fiscal cadences with Previous /
  Current / Next controls. The active range is called out in the editor and on the new snapshot card.
- **Transactions drill-down** – Clicking a budget line jumps to the Transactions workspace with period,
  account/collection, category, and flow filters applied, plus a banner explaining the context.
- **Overview snapshot** – The Overview page includes a “Budget snapshot” card for the primary budget,
  summarising income vs expense totals and highlighting categories that are over or nearing their limits.

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

## Environment notes

- Investments reuse the existing base-currency and exchange-rate configuration—no new environment
  variables are required for holdings, pricing, or realised P/L tracking.
- Reports reuse the existing exchange-rate table and base currency settings—no extra environment variables
  or feature flags are required to enable the analytics workspace.
- Interest analytics reuse your configured base currency and exchange rate table—no new environment variables are required for multi-currency or tax-year reporting.
- No new configuration keys were introduced for the budgeting upgrades. The existing Settings fields for
  base currency and manual exchange rates continue to drive all conversions, and planned amounts always
  remain stored in the configured base currency.

## Overview & Net Worth

- **Flow filters** – A banking-style bar with All, In, Out, and Transfers instantly scopes the
  Overview data. Selecting In or Out unlocks expandable category chips so you can drill from master
  categories to individual sub-categories without leaving the page.
- **Category roll-ups** – Totals cascade through the Master Category → Category → Sub-Category
  hierarchy. Roll-ups respect renames and merges automatically, so historical transactions follow
  their parent even after structural changes.
- **Multi-currency display** – Both Overview and Net Worth default to the base currency (GBP unless
  changed in Settings) and provide toggles to reveal native account balances. Base equivalents are
  derived from the manual exchange-rate table and are always labelled as display-only conversions.

## Budgets Overview

- **What they are** – Budgets let you define a planned amount for a time-bound period and compare it
  with real activity. Each budget has its own cadence (weekly, monthly, annual, or UK fiscal year) and
  stores the start reference so period navigation remains accurate as time passes.
- **Creating & editing** – Open the Budgets page from the main navigation to see every budget. Use
  **New budget** to create one, then rename, duplicate, archive, or delete from the list. Selecting a
  budget opens the editor where you can change the name, period type, starting month/day/year, and the
  set of accounts or collections it should include.
- **Period types** – Monthly budgets let you choose the starting month and year. Weekly budgets let you
  pick which day counts as the start of the week. Annual budgets accept a starting year, while UK fiscal
  year budgets automatically use 6 April to 5 April boundaries and let you choose the first tax year.
  The editor highlights the active period and provides Previous/Current/Next navigation to review other
  cycles quickly.
- **Accounts & collections** – By default budgets include every account that is shown in lists and counts
  toward net worth. Switch to **collections** to scope the budget to specific account groups (for example,
  excluding a long-term savings collection). Changing the inclusion mode updates future calculations
  without removing any stored budget configuration.

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

## Transactions Workspace

- **Virtualised review table** – The Transactions page now renders a virtual list that comfortably
  handles thousands of rows. Column order and visibility are fully customisable and persisted per
  browser, so analysts can build layouts around their reconciliation workflow.
- **Contextual filters** – A filter bar supports combinations of date ranges, accounts, providers,
  collections, flow types, categories, sub-categories, payee text search, tags, amount ranges, free
  text search, and native/base currency modes. Filters update the table instantly and respect multi-
  currency display rules.
- **Inline and detailed editing** – Click directly into category, payee, tag, or note cells to update
  a transaction without leaving the table. A side-panel inspector exposes full metadata, raw import
  fields, audit history, and rule traces, and mirrors the same editing options in a larger layout.
- **Bulk tooling** – Select multiple rows to set categories, set payees, add/remove tags, or preview
  rule runs. A confirmation modal summarises changes before they apply.
- **Split transactions** – Replace a transaction with any number of split lines allocated by amount or
  percentage. Each line can carry its own category, payee, tags, and notes, and the split enforces
  amount parity with the original entry.
- **Audit trail** – Manual edits append to a per-transaction audit log and surface an in-table manual
  indicator. Rule runs continue to log separately so automated updates remain distinguishable.
- **CSV export** – Export the filtered, visible grid to CSV in either native or base currency with a
  single click. The export honours current column visibility and ordering.

## Rules

- **Purpose** – Rules automatically assign categories, sub-categories, tags, payees, flow overrides, note
  prefixes, and FX flags based on transaction attributes. They never change transaction amounts,
  currencies, accounts, or dates.
- **Conditions** – Combine checks such as description text, payee name, amounts (including ranges), date
  windows, accounts, providers, empty or specific categories, flow type, and tags. Choose whether all or
  any conditions must match.
- **Actions** – Apply a single set of updates in priority order: set categories/sub-categories, add tags,
  update the payee, mark transfers, prefix notes, or clear the "needs FX" flag. Only the first action per
  field within a rule applies, and once a field is changed during a run, later rules skip it to guarantee
  deterministic results.
- **Priority & scheduling** – Lower numeric priorities run first. All enabled rules execute automatically
  after a successful CSV import. The Transactions page also provides a "Run rules manually" card to preview
  and confirm actions for selected transactions or date/account filters.
- **Logs & transparency** – Every run records the timestamp, mode (automatic or manual), transactions
  scanned, matches per rule, and the action types applied. View recent runs in the Rules page log to audit
  outcomes.

## Data Model Overview

### Accounts & Providers

- Providers are lightweight labels (e.g., Barclays, Vanguard) used to group accounts and surface
  import hints. Create them from the Accounts page or directly while adding a new account.
- The Accounts page now opens with a compact list of every account. Each row shows the provider
  badge, type, currency, current balance, and quick status icons for hidden or off-net-worth
  accounts. Selecting a row opens the editor on the right.
- The editor is split into **Basic** and **Advanced** tabs:
  - **Basic** – account name, provider, type, currency, opening balance/date, plus toggles for
    **Show in lists** (archives/unarchives the account) and **Count in Net Worth**.
  - **Advanced** – manual balance adjustments, account reference, notes, include/exclude group
    membership, and the archive control.
- Account rules:
  - Opening balance date cannot be in the future.
  - Names must be unique per provider.
  - Collections never affect balances; they simply group accounts for filtering.

Example:

```
Provider: Modern Bank
  ├─ Everyday Checking — shown in lists, counts toward Net Worth, in "Day-to-Day"
  └─ Future Savings — shown in lists, counts toward Net Worth, in "Long-term Savings"
Provider: Global Credit
  └─ Global Rewards Card — excluded from Net Worth, in "Travel" collection
```

### Collections

- Collections surface focus areas in Overview, Transactions, and future reports.
- Accounts can belong to many collections at once without affecting totals.
- Collection badges inherit a configurable colour used on chips and pills.

```
[Day-to-Day] → Everyday Checking, Global Rewards Card
[Long-term Savings] → Future Savings
```

### Category Hierarchy

- Master Categories are fixed anchors (Income, Expense, Transfer, Interest, Fees).
- Each master category contains categories, which contain sub-categories.
- Categories/sub-categories can be renamed, archived, or merged. Merging preserves historical
  transactions and moves children automatically.

```
Income
  └─ Primary Income
     ├─ Payroll
     └─ Bonus
Expense
  └─ Housing → Rent / Utilities
Transfer
  └─ Internal Movements → Internal Transfer
```

### Payees & Tags

- Payees store default category/sub-category mappings applied on new transactions.
- Tags provide flexible reporting overlays. Both can be archived without breaking history.
- Tag colours power table pills and filter chips.

### Demo Data & Logs

- Load sample providers, accounts, collections, categories, payees, tags, and six months of
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
