import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import NetWorth from './pages/NetWorth';
import Transactions from './pages/Transactions';
import Accounts from './pages/Accounts';
import Collections from './pages/Collections';
import Categories from './pages/Categories';
import Payees from './pages/Payees';
import Budgets from './pages/Budgets';
import Rules from './pages/Rules';
import Reports from './pages/Reports';
import Investments from './pages/Investments';
import Imports from './pages/Imports';
import Settings from './pages/Settings';
import Help from './pages/Help';
import Login from './pages/Login';
import { DataProvider } from './data/DataContext';
import ErrorBoundary from './components/ErrorBoundary';

const AppShell = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/net-worth" element={<NetWorth />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/payees" element={<Payees />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/investments" element={<Investments />} />
          <Route path="/imports" element={<Imports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<Help />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  );
};

const App = () => (
  <AuthProvider>
    <DataProvider>
      <AppShell />
    </DataProvider>
  </AuthProvider>
);

export default App;
