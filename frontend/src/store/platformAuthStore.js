import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Super Admin session, kept under its own storage key so it never overwrites (or is
// overwritten by) a hotel staff session or a guest session in the same browser.
export const usePlatformAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      login: (user, tokens) => set({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, isAuthenticated: true }),
      setTokens: (tokens) => set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
      updateUser: (patch) => set((state) => ({ user: state.user ? { ...state.user, ...patch } : state.user })),
      logout: () => set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
    }),
    { name: 'hideout24-platform-auth' }
  )
);

/** API paths that belong to the Super Admin session. */
export const isPlatformApiPath = (path) => path.startsWith('/platform/') || path.startsWith('/auth/platform/');
