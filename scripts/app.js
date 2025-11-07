const pages = [
  {
    id: 'Overview',
    description: 'High-level snapshot of your money across all pots and accounts.',
    tooltip: 'Dashboard KPIs, trending balances, and quick alerts will live here.',
    content: [
      'Visual summaries of total assets, liabilities, and cash runway.',
      'Snapshot cards for latest imports, allocation progress, and notifications.'
    ]
  },
  {
    id: 'Transactions',
    description: 'Review, filter, and edit every money movement with powerful tools.',
    tooltip: 'Batch editing, rule suggestions, and reconciliation helpers are on the roadmap.',
    content: [
      'Streamlined grid with instant filters, splits, and transfer matching.',
      'Import health indicators show stale feeds and incomplete mappings.'
    ]
  },
  {
    id: 'Accounts',
    description: 'Connect holdings from current, savings, credit, and investment accounts.',
    tooltip: 'Future enhancements include balance verification and statement variance checks.',
    content: [
      'Organize accounts by institution and monitor balance freshness.',
      'Highlight accounts requiring manual updates or document uploads.'
    ]
  },
  {
    id: 'Pots',
    description: 'Group accounts into reporting sections that roll up on dashboards.',
    tooltip: 'Expect drag-and-drop pot assignment and quick include/exclude toggles.',
    content: [
      'Define pots such as Cash Cushion, Investments, Rainy Day, or Holiday.',
      'Configure visibility toggles to exclude pots from overview totals when needed.'
    ]
  },
  {
    id: 'Budgets',
    description: 'Plan spending by custom periods, including the UK fiscal year.',
    tooltip: 'Automatic rollovers, alerts, and envelope views will enhance budgeting.',
    content: [
      'Create period templates and monitor category progress at a glance.',
      'Track upcoming bills and expected income to stay ahead of obligations.'
    ]
  },
  {
    id: 'Rules',
    description: 'Automate categorisation, tagging, and pot routing with powerful rules.',
    tooltip: 'Rule testing, prioritisation, and conflict detection features are planned.',
    content: [
      'Build rule conditions on description, amount, tags, account, or dates.',
      'Preview affected transactions before applying bulk updates.'
    ]
  },
  {
    id: 'Reports',
    description: 'Analyse trends across categories, merchants, pots, and time periods.',
    tooltip: 'Exportable visuals, benchmarking, and tax-year views will land here.',
    content: [
      'View income vs expense, net worth growth, and tax-friendly summaries.',
      'Audit allocation outcomes and identify pattern shifts quickly.'
    ]
  },
  {
    id: 'Investments',
    description: 'Track holdings, prices, and sector exposure across accounts.',
    tooltip: 'Future upgrades include dividend tracking and ISA allowance monitors.',
    content: [
      'Maintain positions with price updates and projected performance.',
      'Surface realised and unrealised P/L, plus currency impacts.'
    ]
  },
  {
    id: 'Imports',
    description: 'Bring in data from banks, brokerages, and custom formats with mapping tools.',
    tooltip: 'Saved mapping profiles and duplicate detection will smooth every import.',
    content: [
      'Launch the import wizard to map CSV, OFX, or QIF columns in minutes.',
      'Review preview tables and confirm rules before committing.'
    ]
  },
  {
    id: 'Settings',
    description: 'Tailor SleekFinance to your preferences and privacy requirements.',
    tooltip: 'Multi-user management, data retention policies, and backups will surface here.',
    content: [
      'Manage currencies, fiscal calendars, and authentication options.',
      'Control notification thresholds and integration tokens.'
    ]
  },
  {
    id: 'Help',
    description: 'Discover how each section works and get guidance on next steps.',
    tooltip: 'Inline walkthroughs, knowledge base links, and support chat will be added.',
    content: [
      'Overview: Monitor KPIs, alerts, and trends from a unified dashboard.',
      'Transactions: Clean, categorise, and audit every ledger entry quickly.',
      'Accounts: Maintain balances and sync schedules across institutions.',
      'Pots: Group accounts into reporting collections with include/exclude controls.',
      'Budgets: Build fiscal or monthly plans with rollover support.',
      'Rules: Automate categorisation, tagging, and transfer detection.',
      'Reports: Generate visuals for net worth, spending, and income performance.',
      'Investments: Track holdings, dividends, and ISA utilisation.',
      'Imports: Map file formats, prevent duplicates, and validate before posting.',
      'Settings: Configure security, preferences, and integration tokens.',
      'Help: Access tutorials, FAQs, and change-log highlights.'
    ]
  }
];

const navList = document.querySelector('#nav-list');
const workspace = document.querySelector('#workspace');
const workspaceContent = document.querySelector('#workspace-content');
const pageTitle = document.querySelector('#page-title');
const pageDescription = document.querySelector('#page-description');
const tooltipButton = document.querySelector('.workspace__header .tooltip');
const authSection = document.querySelector('#auth');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const appShell = document.querySelector('#app-shell');
const signOutButton = document.querySelector('#sign-out');

const credentials = {
  email: 'demo@finance.app',
  password: 'demo123'
};

function initialiseNavigation() {
  const fragment = document.createDocumentFragment();

  pages.forEach((page, index) => {
    const listItem = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = page.id;
    button.dataset.pageId = page.id;
    button.classList.toggle('active', index === 0);
    button.addEventListener('click', () => changePage(page.id));
    listItem.appendChild(button);
    fragment.appendChild(listItem);
  });

  navList.appendChild(fragment);
}

function renderContentBlock(message) {
  const block = document.createElement('article');
  block.className = 'placeholder-block';
  block.textContent = message;
  return block;
}

function changePage(pageId, updateHash = true) {
  const page = pages.find((item) => item.id === pageId) ?? pages[0];

  pageTitle.textContent = page.id;
  pageDescription.textContent = page.description;
  tooltipButton.setAttribute('data-tooltip', page.tooltip);

  workspaceContent.innerHTML = '';
  page.content.forEach((message) => workspaceContent.appendChild(renderContentBlock(message)));

  Array.from(navList.querySelectorAll('button')).forEach((button) => {
    button.classList.toggle('active', button.dataset.pageId === page.id);
  });

  if (updateHash) {
    window.location.hash = `#${page.id}`;
  }

  if (!appShell.classList.contains('hidden')) {
    workspace.focus();
  }
}

function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '').trim();

  if (email === credentials.email && password === credentials.password) {
    loginError.textContent = '';
    authSection.classList.add('hidden');
    appShell.classList.remove('hidden');
    appShell.setAttribute('aria-hidden', 'false');
    workspace.focus();
    window.location.hash = '#Overview';
  } else {
    loginError.textContent = 'Incorrect email or password. Try demo@finance.app / demo123.';
  }
}

function handleSignOut() {
  authSection.classList.remove('hidden');
  appShell.classList.add('hidden');
  appShell.setAttribute('aria-hidden', 'true');
  loginForm.reset();
  loginForm.querySelector('input').focus();
  window.location.hash = '#SignIn';
}

function hydrateFromHash() {
  const hash = window.location.hash.replace('#', '');
  const isAuthenticated = !appShell.classList.contains('hidden');

  if (isAuthenticated && pages.some((page) => page.id === hash)) {
    changePage(hash, false);
  }
}

function init() {
  initialiseNavigation();
  changePage(pages[0].id);
  loginForm.addEventListener('submit', handleLogin);
  signOutButton.addEventListener('click', handleSignOut);
  window.addEventListener('hashchange', hydrateFromHash);
}

document.addEventListener('DOMContentLoaded', init);
