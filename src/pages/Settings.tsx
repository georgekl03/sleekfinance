import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { clearLogs, readLogs } from '../utils/logger';

const Settings = () => {
  const { loadDemoData, clearDemoData } = useData();
  const [logs, setLogs] = useState(readLogs());

  const handleRefreshLogs = () => {
    setLogs(readLogs());
  };

  const handleClearLogs = () => {
    clearLogs();
    handleRefreshLogs();
  };

  return (
    <div className="content-stack">
      <PageHeader
        title="Settings"
        description="Manage demo data, inspect the diagnostic log, and access maintenance actions."
      />
      <div className="form-card">
        <h3>Demo data controls</h3>
        <p className="muted-text">
          Demo data is flagged internally so it can be removed without affecting real records.
        </p>
        <div className="form-actions">
          <button type="button" className="primary-button" onClick={loadDemoData}>
            Load demo data
          </button>
          <Tooltip label="Adds sample institutions, accounts, categories, and six months of transactions." />
          <button type="button" className="secondary-button" onClick={clearDemoData}>
            Clear demo data
          </button>
          <Tooltip label="Removes any entity or transaction marked as demo without touching real records." />
        </div>
      </div>
      <div className="content-card">
        <div className="section-title">
          <h3>Diagnostics log</h3>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={handleRefreshLogs}>
              Refresh
            </button>
            <button type="button" className="danger-button" onClick={handleClearLogs}>
              Clear log
            </button>
          </div>
        </div>
        <p className="muted-text">
          Logs are stored locally in your browser. Include the latest entries when reporting issues.
        </p>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Timestamp</th>
                <th scope="col">Level</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              {logs
                .slice()
                .reverse()
                .map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.timestamp).toLocaleString()}</td>
                    <td>{entry.level.toUpperCase()}</td>
                    <td>
                      <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(entry, null, 2)}</pre>
                    </td>
                  </tr>
                ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted-text">
                    No log entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Settings;
