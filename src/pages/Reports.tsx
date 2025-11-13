import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const Reports = () => (
  <div>
    <PageHeader
      title="Reports"
      description="Generate net worth, income vs expense, merchant trends, and tax-ready summaries."
    />
    <div className="content-card">
      <p>
        Reports will deliver tailored views for fiscal years, calendar months, collections,
        categories, and allocation audits with exportable charts.
      </p>
      <div className="placeholder-grid">
        <div className="placeholder-tile">
          <h3>Report Gallery</h3>
          <p>Placeholder for selecting dashboards like income vs expense and collection insights.</p>
          <Tooltip label="Report gallery tooltip placeholder" />
        </div>
        <div className="placeholder-tile">
          <h3>Schedule Builder</h3>
          <p>Placeholder for scheduling exports and sharing filtered report packs.</p>
          <Tooltip label="Schedule builder tooltip placeholder" />
        </div>
      </div>
    </div>
  </div>
);

export default Reports;
