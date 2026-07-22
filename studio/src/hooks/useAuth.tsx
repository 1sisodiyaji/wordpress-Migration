import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchMe,
  loginAccount,
  logoutAccount,
  persistToken,
  registerAccount,
  socialLogin,
  type AuthUser,
} from "../auth-api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (name: string, email: string, password: string) => Promise<{
    user: AuthUser;
    verifyToken: string;
    verifyUrl: string;
  }>;
  loginSocial: (provider: "google" | "github") => Promise<AuthUser>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMe();
      setUser(me);
      if (!me) persistToken(null);
    } catch {
      setUser(null);
      persistToken(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      refresh,
      setUser,
      async login(email, password) {
        const { user: next } = await loginAccount({ email, password });
        setUser(next);
        return next;
      },
      async register(name, email, password) {
        const result = await registerAccount({ name, email, password });
        setUser(result.user);
        return result;
      },
      async loginSocial(provider) {
        const result = await socialLogin(provider);
        if (result.user) setUser(result.user);
        return result.user;
      },
      async logout() {
        await logoutAccount();
        setUser(null);
      },
    }),
    [user, loading, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
