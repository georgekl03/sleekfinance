import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const Accounts = () => (
  <div>
    <PageHeader
      title="Accounts"
      description="Create institutions, group holdings, and keep balances synced across every location."
    />
    <div className="content-card">
      <p>
        You will be able to manage account metadata, reconciliation status, ownership, and reporting
        currency from this screen.
      </p>
      <div className="placeholder-grid">
        <div className="placeholder-tile">
          <h3>Account Directory</h3>
          <p>Placeholder for grouped accounts by institution, including cash, savings, and credit.</p>
          <Tooltip label="Account directory tooltip placeholder" />
        </div>
        <div className="placeholder-tile">
          <h3>Balance Health</h3>
          <p>Placeholder for highlighting low balances, stale updates, and reconciliation gaps.</p>
          <Tooltip label="Balance health tooltip placeholder" />
        </div>
      </div>
    </div>
  </div>
);

export default Accounts;
