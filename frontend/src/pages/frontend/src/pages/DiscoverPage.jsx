import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';
import { Star, MapPin, Wifi, Coffee, Car, Utensils, Waves, Plane, Dumbbell, Mountain, Loader2 } from 'lucide-react';

// Helper to map amenity strings to icons
const AmenityIcon = ({ name }) => {
  const lower = name.toLowerCase();
  if (lower.includes('wifi')) return <Wifi size={14} />;
  if (lower.includes('breakfast')) return <Coffee size={14} />;
  if (lower.includes('parking')) return <Car size={14} />;
  if (lower.includes('restaurant')) return <Utensils size={14} />;
  if (lower.includes('pool')) return <Waves size={14} />;
  if (lower.includes('shuttle') || lower.includes('airport')) return <Plane size={14} />;
  if (lower.includes('gym')) return <Dumbbell size={14} />;
  if (lower.includes('mountain') || lower.includes('view')) return <Mountain size={14} />;
  return <Star size={14} />;
};

export default function DiscoverPage() {
  // Fetch public properties (We will build this endpoint next)
  const { data, isLoading } = useQuery({
    queryKey: ['publicDiscover'],
    queryFn: async () => {
      const res = await api.get('/public/discover');
      return res.data.data;
    },
    // Fallback to mock data so you can see the UI immediately
    initialData: [
      {
        propertyCode: 'ashaiman-comfort',
        propertyName: 'Ashaiman Comfort Inn',
        city: 'Central, Ashaiman',
        rating: 3.9,
        description: 'No-frills comfort and honest pricing for travelers passing through Ashaiman.',
        amenities: ['Free WiFi', 'Breakfast'],
        minPrice: 320,
        distance: '4.9 km away',
        coverImage: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'
      },
      {
        propertyCode: 'tema-harbour',
        propertyName: 'Tema Harbour Lodge',
        city: 'Community 1, Tema',
        rating: 4.0,
        description: 'Practical, well-kept lodging close to the port, built for shipping and logistics travelers.',
        amenities: ['Free WiFi', 'Parking'],
        minPrice: 410,
        distance: '11.0 km away',
        coverImage: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=800&q=80'
      },
      {
        propertyCode: 'east-legon-boutique',
        propertyName: 'East Legon Boutique Inn',
        city: 'East Legon, Accra',
        rating: 4.5,
        description: 'A leafy, residential-feel boutique inn popular with returning diaspora guests.',
        amenities: ['Free WiFi', 'Pool', 'Restaurant'],
        minPrice: 590,
        distance: '13.9 km away',
        coverImage: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80'
      }
    ]
  });

  if (isLoading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <div className="bg-surface border-b border-border py-12 px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-black text-text tracking-tight mb-4">DISCOVER</h1>
        <p className="text-lg text-text-muted max-w-2xl mx-auto">
          Find the perfect stay for your next trip. Hand-picked hotels and guesthouses across Ghana.
        </p>
      </div>

      {/* Directory Grid */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-text mb-8 flex items-center gap-2">
          <MapPin className="text-primary-600" /> Hotels Near You
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {data.map((hotel) => (
            <Link 
              key={hotel.propertyCode} 
              to={`/public/${hotel.propertyCode}`}
              className="group bg-surface border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:border-primary-200 transition-all duration-300 flex flex-col"
            >
              {/* Image */}
              <div className="relative h-48 overflow-hidden">
                <img 
                  src={hotel.coverImage || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'} 
                  alt={hotel.propertyName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 right-3 bg-background/90 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm">
                  <Star size={14} className="text-warning-500 fill-warning-500" />
                  <span className="text-sm font-bold text-text">{hotel.rating}</span>
                </div>
              </div>

              {/* Content */}
              <div className="p-5 flex flex-col flex-1">
                <div className="mb-3">
                  <h3 className="text-lg font-bold text-text group-hover:text-primary-600 transition-colors">
                    {hotel.propertyName}
                  </h3>
                  <p className="text-sm text-text-muted flex items-center gap-1 mt-1">
                    <MapPin size={14} /> {hotel.city}
                  </p>
                </div>

                <p className="text-sm text-text-muted mb-4 line-clamp-2 flex-1">
                  {hotel.description}
                </p>

                {/* Amenities */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {hotel.amenities.slice(0, 3).map((amenity, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-secondary-50 text-secondary-700 text-xs font-semibold rounded-md border border-secondary-100">
                      <AmenityIcon name={amenity} /> {amenity}
                    </span>
                ))}
                </div>

                {/* Footer: Price & Distance */}
                <div className="pt-4 border-t border-border flex items-center justify-between mt-auto">
                  <div>
                    <p className="text-xs text-text-muted">Starting from</p>
                    <p className="text-xl font-black text-primary-600">GHS {hotel.minPrice} <span className="text-sm font-normal text-text-muted">/ night</span></p>
                  </div>
                  <span className="text-xs font-semibold text-text-muted bg-background px-2 py-1 rounded border border-border">
                    {hotel.distance}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}