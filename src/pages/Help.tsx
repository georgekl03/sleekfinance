import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const Help = () => (
  <div className="content-stack">
    <PageHeader
      title="Help"
      description="Guides for managing accounts, groups, categories, and payees with Stage 2 rules."
    />
    <div className="content-card">
      <h3>Accounts</h3>
      <p className="muted-text">
        Each account belongs to an institution. Toggle inclusion status to decide if it contributes to
        overview totals. Accounts can join multiple include-only groups, but only when they are
        included in totals.
      </p>
      <div className="help-diagram">
        <strong>Inclusion decision tree</strong>
        <pre>{`Account → Include in totals?  ── yes ──> Eligible for include-only groups
                         └─ no  ──> Cannot join include-only groups`}</pre>
        <Tooltip label="Accounts excluded from totals are hidden from dashboards unless a filter explicitly includes them." />
      </div>
    </div>
    <div className="content-card">
      <h3>Account Groups</h3>
      <p className="muted-text">
        Groups act as filter chips on Overview and Transactions. Include groups spotlight related
        accounts even when totals are filtered. Exclude groups remove temporary balances such as
        credit cycling from reports.
      </p>
      <div className="help-diagram">
        <strong>Group membership rules</strong>
        <pre>{`Include group ──> multiple accounts allowed
Exclude group ──> account cannot belong to any include-only group
Account tags ──> chips show colour defined on the group`}</pre>
        <Tooltip label="Assign accounts carefully: an account cannot exist in an include and exclude group simultaneously." />
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
