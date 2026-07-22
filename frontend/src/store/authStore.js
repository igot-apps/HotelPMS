import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      permissions: [],

      login: (userData, tokens, permissions = []) => {
        // 🛡️ MUTUAL EXCLUSIVITY: Staff login DESTROYS any public guest session
        localStorage.removeItem('guestInfo');
        localStorage.removeItem('guestToken');

        set({
          user: userData,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isAuthenticated: true,
          permissions: permissions,
        });
      },
      
      logout: () => {
        // 🛡️ MUTUAL EXCLUSIVITY: Staff logout also cleans up guest keys just in case
        localStorage.removeItem('guestInfo');
        localStorage.removeItem('guestToken');
        
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          permissions: [],
        });
      },

      hasPermission: (permissionCode) => {
        const { permissions } = get();
        return permissions.includes(permissionCode);
      },
    }),
    {
      name: 'hotel-pms-auth', // PMS uses this specific key
    }
  )
);