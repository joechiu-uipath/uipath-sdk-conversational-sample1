import { useAuth } from '../context/AuthContext';
import { APP_TITLE } from '../constants';

export default function SignIn() {
  const { signIn, isLoading, error } = useAuth();

  return (
    <div className="signin-container">
      <div className="signin-card">
        <h1 className="signin-title">{APP_TITLE}</h1>
        <p className="signin-description">
          Sign in to access conversational agents
        </p>
        {error && <div className="signin-error">{error}</div>}
        <button
          className="signin-button"
          onClick={signIn}
          disabled={isLoading}
        >
          {isLoading ? 'Signing in...' : 'Sign In with UiPath'}
        </button>
      </div>
    </div>
  );
}
