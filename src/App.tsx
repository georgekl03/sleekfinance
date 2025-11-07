import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Transactions from './pages/Transactions';
import Accounts from './pages/Accounts';
import Pots from './pages/Pots';
import Budgets from './pages/Budgets';
import Rules from './pages/Rules';
import Reports from './pages/Reports';
import Investments from './pages/Investments';
import Imports from './pages/Imports';
import Settings from './pages/Settings';
import Help from './pages/Help';
import Login from './pages/Login';

const AppShell = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/pots" element={<Pots />} />
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
  );
};

const App = () => (
  <AuthProvider>
    <AppShell />
  </AuthProvider>
);

export default App;
