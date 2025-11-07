import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const Overview = () => (
  <div>
    <PageHeader
      title="Overview"
      description="High-level health of your finances with quick KPIs and net worth snapshots."
    />
    <div className="content-card">
      <h3>Welcome to SleekFinance</h3>
      <p>
        This dashboard will eventually highlight balances, trends, and urgent alerts across your
        financial life. Use the navigation to explore each workspace.
      </p>
      <div className="placeholder-grid" aria-label="Dashboard preview">
        <div className="placeholder-tile">
          <h3>Net Worth Timeline</h3>
          <p>Chart placeholder describing future monthly performance and blended APR reporting.</p>
          <Tooltip label="Overview tile tooltip placeholder" />
        </div>
        <div className="placeholder-tile">
          <h3>Budget Progress</h3>
          <p>Gauge placeholder for summarising your budget allocations and rollovers.</p>
          <Tooltip label="Budget progress tooltip placeholder" />
        </div>
        <div className="placeholder-tile">
          <h3>Upcoming Notifications</h3>
          <p>Feed placeholder for upcoming bills, low balances, and stale imports.</p>
          <Tooltip label="Notifications tooltip placeholder" />
        </div>
      </div>
    </div>
  </div>
);

export default Overview;
