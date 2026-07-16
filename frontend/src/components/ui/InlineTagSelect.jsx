import { useState, useRef, useEffect } from 'react';
import { X, Plus, Check } from 'lucide-react';
import { createAmenity } from '../../api/amenities';
import toast from 'react-hot-toast';

export default function InlineTagSelect({ 
  label, 
  options, // Array of { amenityId, name, icon }
  selectedIds, // Array of selected amenityIds (numbers)
  onChange, // Callback when selection changes: (newIds) => void
  onCreateNew // Callback to refresh the parent's options list after creating
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const wrapperRef = useRef(null);

  // Filter options based on search
  const filteredOptions = options.filter(opt => 
    opt.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Check if the search term exactly matches an existing option
  const exactMatchExists = options.some(opt => opt.name.toLowerCase() === searchTerm.toLowerCase());
  
  // Should we show the "Create New" button?
  const showCreateOption = searchTerm.trim() !== '' && !exactMatchExists;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (id) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(sid => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const handleCreateNew = async () => {
    setIsCreating(true);
    try {
      const res = await createAmenity({ name: searchTerm.trim() });
      const newAmenity = res.data.data;
      
      toast.success(`Created "${newAmenity.name}"`);
      
      // 1. Add the new amenity to the parent's options list
      onCreateNew(newAmenity);
      
      // 2. Auto-select it
      onChange([...selectedIds, newAmenity.amenityId]);
      
      // 3. Clear search and close
      setSearchTerm('');
      setIsOpen(false);
    } catch (error) {
      toast.error('Failed to create amenity.');
    } finally {
      setIsCreating(false);
    }
  };

  const selectedOptions = options.filter(opt => selectedIds.includes(opt.amenityId));

  return (
    <div ref={wrapperRef} className="relative w-full">
      <label className="block text-sm font-semibold text-text mb-1.5">{label}</label>
      
      {/* The Input / Tag Area */}
      <div 
        onClick={() => setIsOpen(true)}
        className="w-full min-h-[42px] px-3 py-2 bg-background border border-border rounded-lg text-text focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition flex flex-wrap gap-2 items-center cursor-pointer"
      >
        {selectedOptions.length > 0 ? (
          selectedOptions.map(opt => (
            <span key={opt.amenityId} className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-700 text-xs font-bold rounded-md">
              {opt.name}
              <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); toggleOption(opt.amenityId); }}
                className="hover:bg-primary-200 rounded-full p-0.5"
              >
                <X size={12} />
              </button>
            </span>
          ))
        ) : (
          <span className="text-text-muted text-sm">Search or create amenities...</span>
        )}
      </div>

      {/* The Dropdown */}
      {isOpen && (
        <div className="absolute z-30 w-full mt-1 bg-surface border border-border rounded-lg shadow-xl max-h-60 overflow-hidden flex flex-col">
          {/* Search Input */}
          <div className="p-2 border-b border-border">
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type to search or create..."
              className="w-full px-3 py-1.5 bg-background border border-border rounded text-sm text-text outline-none focus:ring-1 focus:ring-primary-500"
              onClick={(e) => e.stopPropagation()} // Prevent closing when clicking input
            />
          </div>

          {/* Options List */}
          <div className="overflow-y-auto flex-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => {
                const isSelected = selectedIds.includes(opt.amenityId);
                return (
                  <button
                    key={opt.amenityId}
                    type="button"
                    onClick={() => toggleOption(opt.amenityId)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition flex justify-between items-center ${
                      isSelected ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-text hover:bg-secondary-50'
                    }`}
                  >
                    <span>{opt.name}</span>
                    {isSelected && <Check size={16} className="text-primary-600" />}
                  </button>
                );
              })
            ) : (
              !showCreateOption && (
                <div className="px-4 py-3 text-sm text-text-muted text-center">
                  No amenities found.
                </div>
              )
            )}

            {/* 🌟 THE MAGIC: Create New Button */}
            {showCreateOption && (
              <button
                type="button"
                onClick={handleCreateNew}
                disabled={isCreating}
                className="w-full text-left px-4 py-2.5 text-sm font-bold text-success-700 bg-success-50 hover:bg-success-100 transition flex items-center gap-2 border-t border-border"
              >
                <Plus size={16} /> 
                {isCreating ? 'Creating...' : `Create "${searchTerm.trim()}"`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}