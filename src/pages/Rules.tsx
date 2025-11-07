import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const Rules = () => (
  <div>
    <PageHeader
      title="Rules"
      description="Automate categorisation by matching on descriptions, amounts, accounts, and timing."
    />
    <div className="content-card">
      <p>
        Build sequential rule sets to tag merchants, mark transfers, override pots, and streamline
        reconciliation.
      </p>
      <div className="placeholder-grid">
        <div className="placeholder-tile">
          <h3>Rule Library</h3>
          <p>Placeholder for viewing priorities, hit rates, and conflict alerts.</p>
          <Tooltip label="Rule library tooltip placeholder" />
        </div>
        <div className="placeholder-tile">
          <h3>Test Console</h3>
          <p>Placeholder for running sample transactions through the rule engine.</p>
          <Tooltip label="Test console tooltip placeholder" />
        </div>
      </div>
    </div>
  </div>
);

export default Rules;
