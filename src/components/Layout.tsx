import { NavLink } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import Tooltip from './Tooltip';
import '../styles/layout.css';

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/net-worth', label: 'Net Worth' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/collections', label: 'Collections' },
  { to: '/categories', label: 'Categories' },
  { to: '/payees', label: 'Payees' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/rules', label: 'Rules' },
  { to: '/allocations', label: 'Allocations' },
  { to: '/reports', label: 'Reports' },
  { to: '/investments', label: 'Investments' },
  { to: '/imports', label: 'Imports' },
  { to: '/settings', label: 'Settings' },
  { to: '/help', label: 'Help' }
];

const Layout = ({ children }: { children: ReactNode }) => {
  const { logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          <span className="brand-mark" aria-hidden>£</span>
          <span className="brand-name">SleekFinance</span>
        </div>
        <nav>
          <ul className="nav-list">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? 'nav-link-active' : ''}`
                  }
                  end={item.to === '/'}
                >
                  <span>{item.label}</span>
                  <Tooltip label={`${item.label} tooltip placeholder`} />
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="main" role="main">
        <header className="main-header">
          <h1 className="sr-only">SleekFinance App Shell</h1>
          <button type="button" className="logout-button" onClick={logout}>
            Sign out
          </button>
        </header>
        <div className="content-area">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
