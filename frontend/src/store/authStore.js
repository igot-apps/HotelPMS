import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      permissions: [], // 🚨 NEW: Store the user's permissions array

      // Update login to accept and save permissions
      login: (userData, tokens, permissions = []) => set({
        user: userData,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isAuthenticated: true,
        permissions: permissions, // 🚨 Save permissions to state
      }),
      
      logout: () => set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        permissions: [], // 🚨 Clear permissions on logout
      }),

      // 🚨 NEW: Helper function to check permissions easily in components
      hasPermission: (permissionCode) => {
        const { permissions } = get();
        return permissions.includes(permissionCode);
      },
    }),
    {
      name: 'hotel-pms-auth', // Key in localStorage
    }
  )
);