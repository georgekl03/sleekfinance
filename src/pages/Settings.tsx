import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const Settings = () => (
  <div>
    <PageHeader
      title="Settings"
      description="Control currency, security, notifications, and integrations for your workspace."
    />
    <div className="content-card">
      <p>
        Configure two-factor authentication, manage user profiles, connect future data sources, and
        tailor privacy controls.
      </p>
      <div className="placeholder-grid">
        <div className="placeholder-tile">
          <h3>Profile & Security</h3>
          <p>Placeholder for credentials, sign-in devices, and session history.</p>
          <Tooltip label="Profile security tooltip placeholder" />
        </div>
        <div className="placeholder-tile">
          <h3>Workspace Preferences</h3>
          <p>Placeholder for currency, time zone, and notification policy controls.</p>
          <Tooltip label="Workspace preferences tooltip placeholder" />
        </div>
      </div>
    </div>
  </div>
);

export default Settings;
