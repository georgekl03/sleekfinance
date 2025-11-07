import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';

const sections = [
  {
    title: 'Overview',
    description:
      'Snapshots of balances, KPIs, notifications, and recent performance across all pots and accounts.'
  },
  {
    title: 'Transactions',
    description:
      'Ledger workspace for categorising, splitting, bulk editing, and reconciling every money movement.'
  },
  {
    title: 'Accounts',
    description:
      'Manage institutions, account ownership, connection health, and reconciliation status.'
  },
  {
    title: 'Pots',
    description:
      'Group accounts for reporting, toggle inclusion in totals, and define goal allocations.'
  },
  {
    title: 'Budgets',
    description:
      'Plan spending and saving by period, monitor rollover balances, and align with fiscal years.'
  },
  {
    title: 'Rules',
    description:
      'Automate transaction categorisation, tags, transfer detection, and pot overrides.'
  },
  {
    title: 'Reports',
    description:
      'Generate net worth, category trends, allocation audits, and tax-ready statements.'
  },
  {
    title: 'Investments',
    description:
      'Track holdings, sector exposure, ISA allowances, dividends, and realised performance.'
  },
  {
    title: 'Imports',
    description:
      'Load data from CSV, OFX, QIF, and custom templates with saved mapping profiles and de-duplication.'
  },
  {
    title: 'Settings',
    description:
      'Control workspace preferences, notification policies, access, and future integrations.'
  },
  {
    title: 'Help',
    description: 'Read documentation, onboarding guides, and contact support resources.'
  }
];

const Help = () => (
  <div>
    <PageHeader
      title="Help"
      description="Learn what each section delivers and how SleekFinance keeps your finances organised."
    />
    <div className="content-card">
      <p>
        Use this guide to understand where to manage specific workflows. Tooltips across the product
        will eventually surface contextual help and shortcuts.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {sections.map((section) => (
          <li key={section.title} style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--accent-strong)' }}>{section.title}</h3>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)' }}>{section.description}</p>
              </div>
              <Tooltip label={`${section.title} help tooltip placeholder`} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

export default Help;
