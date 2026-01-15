import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { UiPath } from '@uipath/uipath-typescript/core';
import { ConversationalAgent } from '@uipath/uipath-typescript/conversational-agent';

const AuthContext = createContext(null);

const authConfig = {
  clientId: import.meta.env.VITE_UIPATH_CLIENT_ID,
  orgName: import.meta.env.VITE_UIPATH_ORG_NAME,
  tenantName: import.meta.env.VITE_UIPATH_TENANT_NAME,
  baseUrl: import.meta.env.VITE_UIPATH_BASE_URL,
  redirectUri: import.meta.env.VITE_UIPATH_REDIRECT_URI,
  scope: import.meta.env.VITE_UIPATH_SCOPE,
};

export function AuthProvider({ children }) {
  const [sdk, setSdk] = useState(null);
  const [conversationalAgentService, setConversationalAgentService] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (initStartedRef.current) {
      return;
    }
    initStartedRef.current = true;

    const initializeAuth = async () => {
      try {
        const sdkInstance = new UiPath(authConfig);
        setSdk(sdkInstance);

        if (sdkInstance.isInOAuthCallback()) {
          await sdkInstance.completeOAuth();
          // Clean up OAuth query parameters from URL to prevent issues on page refresh
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        let authenticated = sdkInstance.isAuthenticated();

        if (authenticated) {
          const caService = new ConversationalAgent(sdkInstance);
          setConversationalAgentService(caService);
          setIsAuthenticated(true);
        }
      } catch (err) {
        setError(err.message || 'Failed to initialize authentication');
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const signIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await sdk.initialize();

      if (sdk.isAuthenticated()) {
        const caService = new ConversationalAgent(sdk);
        setConversationalAgentService(caService);
        setIsAuthenticated(true);
        return;
      }
    } catch (err) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = () => {
    if (conversationalAgentService) {
      conversationalAgentService.disconnect();
    }
    setIsAuthenticated(false);
    setConversationalAgentService(null);
  };

  const value = {
    sdk,
    conversationalAgentService,
    isAuthenticated,
    isLoading,
    error,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
