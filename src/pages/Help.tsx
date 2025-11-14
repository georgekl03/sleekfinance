import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const Help = () => (
  <div className="content-stack">
    <PageHeader
      title="Help"
      description="Guides for managing accounts, budgets, providers, collections, categories, and payees."
    />
    <div className="content-card">
      <h3>Reports workspace</h3>
      <p className="muted-text">
        The Reports page offers read-only analytics across net worth, flows, categories, collections,
        providers, and income allocations. A shared filter bar lets you switch between preset ranges
        (this month, last month, this year, last year) or a custom window, and you can toggle whether
        presets follow calendar or UK tax-year boundaries. Filters for accounts, providers, collections,
        flow types, and master categories apply consistently to every report, while totals always respect
        your Settings → base currency and exchange-rate table.
      </p>
      <div className="help-diagram">
        <strong>Report tips</strong>
        <pre>{`Net Worth Over Time → monthly assets minus liabilities`}
{`Income vs Expense → inflow/outflow comparison, transfers excluded by default`}
{`Category Trends → pick categories/sub-categories to track monthly totals`}
{`Collection & Provider → absolute spend/income by grouping and institution`}
{`Allocation Summary → aggregates income allocation purposes; run rules first`}
{`Export CSV → captures the active filters, range, and table values for each report`}</pre>
        <Tooltip label="Reports are analytical only—they never mutate transactions, budgets, rules, or allocations." />
      </div>
    </div>
    <div className="content-card">
      <h3>Interest analytics</h3>
      <p className="muted-text">
        The Interest view tracks transactions flagged as interest flows and keeps native currency amounts alongside
        base-currency conversions. Use the range selector to switch between custom dates, calendar years, and the UK
        tax-year (6 April → 5 April) cycle. Filters for accounts, providers, and collections make it easy to isolate
        specific savings pots or investment cash balances. A monthly timeline groups totals by account or provider so
        you can see which balances are pulling their weight, while the blended APR and 12-month projection provide an
        approximate effective rate based on historic earnings.
      </p>
      <div className="help-diagram">
        <strong>Tax-year report tips</strong>
        <pre>{`Interest → UK tax-year tab
Select year chips to jump between current and prior tax years
Breakdowns show account, provider, and account-type subtotals
All filters from the main view (accounts, providers, collections) remain in effect`}</pre>
        <Tooltip label="Interest analytics are read-only; they never alter budgets or transaction data." />
      </div>
    </div>
    <div className="content-card">
      <h3>Income Allocation Rules</h3>
      <p className="muted-text">
        Use the Allocations page to define how inflows are analytically split across purposes
        such as rainy day funds, retirement, investments, spending, and holidays. Each rule
        starts with a base scope (all income, selected categories or sub-categories, payees,
        accounts, or providers), optional filters for payees, accounts, providers, collections,
        and tags, and a list of purposes whose percentages must total 100% within the configured
        tolerance. Targets can be collections, accounts, or simple label-only buckets so you can
        keep everything virtual.
      </p>
      <div className="help-diagram">
        <strong>Rule builder quick steps</strong>
        <pre>{`1. Allocations → New allocation rule
2. Pick base scope and optional filters (inflows only)
3. Add purposes, set percentages, choose targets
4. Set priority and enable overwrite if this rule should supersede earlier matches`}</pre>
        <Tooltip label="Percentages must resolve to 100% within the tolerance before saving. Rules execute from lowest to highest priority." />
      </div>
      <div className="help-diagram">
        <strong>Review & reporting</strong>
        <pre>{`Allocations page → summary filters for date range, accounts, collections
Budgets → income lines and sub-lines show allocated coverage per purpose
Reports → Allocation summary compares totals to the selected budget plan
Retro runs → preview impact before applying analytics to historical inflows`}</pre>
        <Tooltip label="Retroactive runs never alter balances—they only create or refresh analytical allocation entries for matched inflows." />
      </div>
    </div>
    <div className="content-card">
      <h3>Budgets & period navigation</h3>
      <p className="muted-text">
        Budgets are made up of category lines and optional sub-lines. Each line stores a planned amount in the
        base currency for every period, and progress bars compare the effective plan (including any rollover)
        with actual activity from included accounts. Use the Previous / Current / Next controls to step through
        months, weeks, years, or tax years without rewriting history—the rollover summary shows exactly how
        underspending or overspending carries forward. Click any budget line to open Transactions with the
        category, accounts, flow type, and date filters applied automatically.
      </p>
      <div className="help-diagram">
        <strong>Editor quick reference</strong>
        <pre>{[
          'Line ➜ select category → set plan in base currency',
          'Breakdown ➜ toggle on → add sub-category lines',
          'Rollover ➜ shows carry-in for the active period',
          'Progress bar ➜ green (under), amber (nearing), red (over)',
          'Period controls ➜ jump to previous/current/next cycle',
          'Drill-down ➜ click line to inspect contributing transactions'
        ].join('\n')}</pre>
        <Tooltip label="Tooltips in the editor describe rollover math, planned vs actual logic, and how drill-down filters are applied." />
      </div>
    </div>
    <div className="content-card">
      <h3>Overview filters</h3>
      <p className="muted-text">
        Use the Flow bar to pivot between <strong>All</strong>, <strong>In</strong>,
        <strong>Out</strong>, and <strong>Transfers</strong>. Selecting In or Out reveals category chips
        that expand to sub-categories, letting you drill from a master category straight to a
        specific merchant-level bucket. Snapshot metrics, charts, and totals update immediately with
        every filter change.
      </p>
      <div className="help-diagram">
        <strong>Category drill-down</strong>
        <pre>{`Flow → Out
  Category chip: Groceries
    Sub-categories: Tesco • Aldi • Amazon Fresh`}</pre>
        <Tooltip label="Category filters automatically include sub-categories until you narrow to a single chip." />
      </div>
    </div>
    <div className="content-card">
      <h3>Multi-currency display</h3>
      <p className="muted-text">
        Overview and Net Worth default to the base currency configured in Settings (GBP unless you
        change it). Use the display toggle to reveal native account balances alongside the base
        equivalent. All base conversions are display-only and reference the manual exchange-rate
        table so you always know the source of each number.
      </p>
      <div className="help-diagram">
        <strong>Conversion cues</strong>
        <pre>{`Base view → uses manual rate table
Native view → shows native + base equivalent (display only)`}</pre>
        <Tooltip label="Each conversion call-out references the Settings table or notes that the fallback rate of 1.0 was used." />
      </div>
    </div>
    <div className="content-card">
      <h3>Budgets</h3>
      <p className="muted-text">
        Create budgets from the Budgets page to track planned spending or income across a cadence that
        matches your workflow. Choose between weekly, monthly, annual, or UK fiscal year periods, set a
        starting point, and decide whether the budget should follow all eligible accounts or only those
        in specific collections. The editor highlights the current period and offers quick Previous /
        Current / Next navigation.
      </p>
      <div className="help-diagram">
        <strong>Editor quick tips</strong>
        <pre>{`Period types: Weekly • Monthly • Annual • UK fiscal year\nStart controls: week day, start month/year, or tax year\nInclusion: All accounts or picked collections`}</pre>
        <Tooltip label="Tooltips in the editor explain period cadences and how collection filters change which accounts feed each budget." />
      </div>
    </div>
    <div className="content-card">
      <h3>Accounts</h3>
      <p className="muted-text">
        Accounts now open from a compact list. Select any row to reveal the editor with a primary
        form and an expandable <strong>Advanced settings</strong> section. Use the main form to
        rename the account, pick a provider, adjust type or currency, and toggle <strong>Show in
        lists</strong> (archives/unarchives the account) or <strong>Count in Net Worth</strong>.
        Expand Advanced settings to update balances, account references, notes, or collection
        membership.
      </p>
      <div className="help-diagram">
        <strong>Visibility & totals</strong>
        <pre>{`Show in lists ── off ──> account archived, hidden from selectors
Count in Net Worth ── off ──> excluded from overview and net-worth totals`}</pre>
        <Tooltip label="Archived accounts stay searchable in history but disappear from selectors until restored." />
      </div>
    </div>
    <div className="content-card">
      <h3>Collections</h3>
      <p className="muted-text">
        Collections act as reusable filters on Overview, Transactions, and future reports.
        Accounts can belong to multiple collections at once, letting you pivot between views such as
        "Savings", "Core Spending", or "University" without affecting balances. Collections never
        alter totals—only visibility.
      </p>
      <div className="help-diagram">
        <strong>Collection tips</strong>
        <pre>{`Example sets:
  Savings ──> emergency fund + long-term cash
  Core Spending ──> everyday current + key cards
  Travel ──> dedicated FX and cash wallets`}</pre>
        <Tooltip label="Use collections to compare scenarios quickly: select one to update Overview chips and transaction filters instantly." />
      </div>
    </div>
    <div className="content-card">
      <h3>Categories</h3>
      <p className="muted-text">
        Categories follow a fixed three-level hierarchy: Master Category → Category → Sub-Category.
        Master Categories are locked. Categories and sub-categories can be renamed, archived, or
        merged with history preserved.
      </p>
      <div className="help-diagram">
        <strong>Hierarchy roll-up</strong>
        <pre>{`Master: Expense
  Category: Housing
    Sub-category: Rent
    Sub-category: Utilities`}</pre>
        <Tooltip label="Merging a category archives the source and moves all children and transactions to the destination." />
      </div>
    </div>
    <div className="content-card">
      <h3>Payees & Tags</h3>
      <p className="muted-text">
        Payees store default category mappings used when new transactions import. Tags create
        flexible overlays for reporting. Archived payees or tags remain linked to history without
        appearing in drop-downs.
      </p>
      <div className="help-diagram">
        <strong>Default mapping flow</strong>
        <pre>{`Transaction imports → match payee → apply default category/sub-category
                                     └─ add tags for recurring or special handling`}</pre>
        <Tooltip label="Update payees when merchants rebrand to keep automation healthy." />
    </div>
  </div>
  <div className="content-card">
    <h3>Transactions workspace</h3>
    <p className="muted-text">
      The Transactions page is designed for large-scale review. Filters for dates, accounts, providers,
      collections, flow types, categories, tags, text, and currencies update the virtualised table
      immediately. Columns are customisable and persisted locally, so each reviewer can keep a preferred
      layout.
    </p>
    <div className="help-diagram">
      <strong>Workflow tips</strong>
      <pre>{`Inline edits: click category, payee, tags, or notes directly in the grid
Inspector: open a row to see raw import fields, audit history, and edit everything at once
Bulk actions: select rows to set categories, set payees, or add/remove tags with confirmation
Splits: break a transaction into percentage or value-based lines that must balance exactly
Export: download the filtered, visible grid to CSV in native or base currency`}</pre>
      <Tooltip label="Manual edits are tracked per transaction so you can see who touched what." />
    </div>
  </div>
  <div className="content-card">
    <h3>Rules</h3>
    <p className="muted-text">
      Rules automate transaction clean-up without touching amounts, currencies, accounts, or dates.
      Combine description, payee, amount, date, account, provider, category, flow, or tag checks and
      layer actions such as setting categories, adding tags, correcting payees, marking transfers,
      prefixing notes, or clearing the FX flag.
    </p>
      <div className="help-diagram">
        <strong>Execution tips</strong>
        <pre>{`Priority: lower numbers run first
Conditions: match all vs match any
Actions: first touch wins per field
Auto-run: immediately after CSV imports
Manual run: Transactions → “Run rules manually”
Log: Rules page lists recent runs & action counts`}</pre>
        <Tooltip label="Once a field is set by a rule during a run, later rules skip it—making outcomes deterministic." />
      </div>
    </div>
  </div>
);

export default Help;
