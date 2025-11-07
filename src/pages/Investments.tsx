import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const Investments = () => (
  <div>
    <PageHeader
      title="Investments"
      description="Track holdings, ISAs, dividends, and sector exposure with real-time analytics."
    />
    <div className="content-card">
      <p>
        Monitor equity and fund positions, view blended performance, and keep tabs on realised versus
        unrealised gains.
      </p>
      <div className="placeholder-grid">
        <div className="placeholder-tile">
          <h3>Holdings Table</h3>
          <p>Placeholder for quantities, cost basis, and performance metrics.</p>
          <Tooltip label="Holdings table tooltip placeholder" />
        </div>
        <div className="placeholder-tile">
          <h3>Sector Allocation</h3>
          <p>Placeholder for tagging investments and visualising diversification.</p>
          <Tooltip label="Sector allocation tooltip placeholder" />
        </div>
      </div>
    </div>
  </div>
);

export default Investments;
