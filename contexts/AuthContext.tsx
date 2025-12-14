
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { getUserProfile, signIn as supabaseSignIn, signOut as supabaseSignOut } from '../services/auth';
import { UserProfile } from '../types';
import { Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: UserProfile | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  manualLogin: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  manualLogin: async () => {},
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // MODO DESENVOLVIMENTO (SEM LOGIN)
  // Para reativar o login real, remova este useEffect e descomente o useEffect abaixo dele.
  useEffect(() => {
    const devUser: UserProfile = {
        id: 'dev-mode-user',
        email: 'dev@pplast.com',
        role: 'admin', // Full Access (Admin > Manager > Supervisor > Operator)
        fullName: 'Desenvolvedor (Admin)'
    };
    
    // Simula um delay mínimo para não quebrar renderizações
    setTimeout(() => {
        setUser(devUser);
        setSession({ user: { id: 'dev-mode-user', email: 'dev@pplast.com' } } as any);
        setLoading(false);
    }, 100);
  }, []);

  /* 
  // LÓGICA ORIGINAL (COMENTADA PARA MODO DEV)
  useEffect(() => {
    const init = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);
            if (session?.user) {
                const profile = await getUserProfile(session.user.id);
                setUser(profile);
            }
        } catch (e) {
            console.error("Auth init error", e);
        } finally {
            setLoading(false);
        }
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
         if (!user || user.id !== session.user.id) {
             const profile = await getUserProfile(session.user.id);
             setUser(profile);
         }
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  */

  const manualLogin = async (email: string, pass: string) => {
    // No modo Dev, essa função é irrelevante, mas mantemos a estrutura
    alert("Modo Dev ativo: Login automático.");
  };

  const logout = async () => {
    // No modo Dev, "sair" apenas recarrega a página (que loga de novo automaticamente)
    if (confirm("No modo desenvolvimento, o login é automático. A página será recarregada.")) {
        window.location.reload();
    }
    // Lógica real seria:
    // setUser(null);
    // setSession(null);
    // await supabaseSignOut();
  };

  const value = {
    user,
    session,
    loading,
    isAdmin: user?.role === 'admin' || user?.role === 'manager', // Backwards compatibility helper
    manualLogin,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
