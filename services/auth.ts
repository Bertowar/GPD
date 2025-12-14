
import { supabase } from './supabaseClient';
import { UserProfile, UserRole } from '../types';

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    const { data: profileData, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching profile:', error);
    }

    // Fallback if no profile exists yet, default to operator
    const role: UserRole = profileData?.role === 'manager' ? 'manager' : 'operator';

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    return {
      id: userId,
      email: user.email || '',
      role: role,
      fullName: profileData?.full_name
    };
  } catch (e) {
    console.error(e);
    return null;
  }
};
