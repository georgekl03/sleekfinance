import { FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import Tooltip from '../components/Tooltip';
import '../styles/login.css';

const Login = () => {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await login(email, password);
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit} aria-label="Sign in form">
        <h1>SleekFinance</h1>
        <p className="login-subtitle">Personal finance analytics in one place.</p>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter any password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        <p className="login-helper">
          Demo sign-in accepts any credentials and unlocks the navigation shell.
          <Tooltip label="Login tooltip placeholder" />
        </p>
      </form>
    </div>
  );
};

export default Login;
