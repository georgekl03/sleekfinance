import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const Imports = () => (
  <div>
    <PageHeader
      title="Imports"
      description="Bring transactions in from CSV, OFX, QIF, or custom templates with smart mapping."
    />
    <div className="content-card">
      <p>
        Launch the import wizard, save mapping profiles, and catch duplicates before they hit the
        ledger.
      </p>
      <div className="placeholder-grid">
        <div className="placeholder-tile">
          <h3>File Mapping Wizard</h3>
          <p>Placeholder for column matching, sample previews, and validation alerts.</p>
          <Tooltip label="File mapping tooltip placeholder" />
        </div>
        <div className="placeholder-tile">
          <h3>Profile Library</h3>
          <p>Placeholder for reusable mapping presets and auto-detection logic.</p>
          <Tooltip label="Profile library tooltip placeholder" />
        </div>
      </div>
    </div>
  </div>
);

export default Imports;
