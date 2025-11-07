import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const Budgets = () => (
  <div>
    <PageHeader
      title="Budgets"
      description="Plan by month, quarter, or UK fiscal year and monitor progress with rollovers and alerts."
    />
    <div className="content-card">
      <p>
        Configure envelopes, assign allocation rules, and understand spending drift over time using
        the budgeting engine to come.
      </p>
      <div className="placeholder-grid">
        <div className="placeholder-tile">
          <h3>Period Planner</h3>
          <p>Placeholder for selecting cadence, fiscal-year boundaries, and scenario comparisons.</p>
          <Tooltip label="Period planner tooltip placeholder" />
        </div>
        <div className="placeholder-tile">
          <h3>Budget Rollovers</h3>
          <p>Placeholder for tracking carry-over amounts and forecasting end-of-period balances.</p>
          <Tooltip label="Budget rollovers tooltip placeholder" />
        </div>
      </div>
    </div>
  </div>
);

export default Budgets;
