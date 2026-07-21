import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      permissions: [], // 🚨 Store the user's permissions array

      // Update login to accept and save permissions
      login: (userData, tokens, permissions = []) => set({
        user: userData,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isAuthenticated: true,
        permissions: permissions, // 🚨 Save permissions to state
      }),
      
      logout: () => {
        // 🌟 1. CLEAR PUBLIC GUEST KEYS FROM LOCAL STORAGE
        // This ensures the public site (Checkout, Reservations) forgets the guest immediately
        localStorage.removeItem('guestInfo');
        localStorage.removeItem('guestToken');
        
        // 🌟 2. RESET PMS ZUSTAND STATE
        // Zustand's persist middleware will automatically update the 'hotel-pms-auth' 
        // localStorage key with these null/empty values.
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          permissions: [], // 🚨 Clear permissions on logout
        });
      },

      // 🚨 Helper function to check permissions easily in components
      hasPermission: (permissionCode) => {
        const { permissions } = get();
        return permissions.includes(permissionCode);
      },
    }),
    {
      name: 'hotel-pms-auth', // Key in localStorage for PMS staff
    }
  )
);