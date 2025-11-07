import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const Transactions = () => (
  <div>
    <PageHeader
      title="Transactions"
      description="Review, categorise, split, and bulk edit every money movement with powerful filters."
    />
    <div className="content-card">
      <p>
        A lightning-fast ledger workspace will live here, featuring search, multi-select, keyboard
        shortcuts, and smart matching for transfers.
      </p>
      <div className="placeholder-grid">
        <div className="placeholder-tile">
          <h3>Filter Builder</h3>
          <p>Placeholder for saved views, column sets, and rule visibility toggles.</p>
          <Tooltip label="Filter builder tooltip placeholder" />
        </div>
        <div className="placeholder-tile">
          <h3>Import Conflict Queue</h3>
          <p>Placeholder for resolving duplicates from CSV, OFX, and custom templates.</p>
          <Tooltip label="Import conflict tooltip placeholder" />
        </div>
      </div>
    </div>
  </div>
);

export default Transactions;
