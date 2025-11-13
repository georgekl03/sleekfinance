import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const Help = () => (
  <div className="content-stack">
    <PageHeader
      title="Help"
      description="Guides for managing accounts, providers, collections, categories, and payees."
    />
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
        <pre>{`Master: Essentials
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
  </div>
);

export default Help;
