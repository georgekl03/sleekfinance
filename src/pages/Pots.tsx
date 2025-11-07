import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const Pots = () => (
  <div>
    <PageHeader
      title="Pots"
      description="Group accounts into flexible reporting sections that can be included or excluded from totals."
    />
    <div className="content-card">
      <p>
        Build virtual envelopes for sinking funds, tax reserves, or investment goals. Pots determine
        how balances roll into your overview and reports.
      </p>
      <div className="placeholder-grid">
        <div className="placeholder-tile">
          <h3>Pot Manager</h3>
          <p>Placeholder for drag-and-drop grouping with pot-level overrides.</p>
          <Tooltip label="Pot manager tooltip placeholder" />
        </div>
        <div className="placeholder-tile">
          <h3>Inclusion Controls</h3>
          <p>Placeholder for toggling contributions to overview totals and derived KPIs.</p>
          <Tooltip label="Inclusion controls tooltip placeholder" />
        </div>
      </div>
    </div>
  </div>
);

export default Pots;
