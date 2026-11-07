import { createContext, useContext } from 'react';

export const HotelWebsiteContext = createContext(null);
export const useHotelWebsite = () => useContext(HotelWebsiteContext);

const centralHosts = new Set(['localhost', '127.0.0.1', 'hideout24.com', 'www.hideout24.com', 'app.hideout24.com', 'hotelpms-frontend.onrender.com']);
export const isHotelWebsiteHost = () => !centralHosts.has(window.location.hostname.toLowerCase());
export const currentHotelHostname = () => isHotelWebsiteHost() ? window.location.hostname.toLowerCase() : undefined;
