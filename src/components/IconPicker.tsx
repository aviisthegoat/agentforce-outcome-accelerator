import React, { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { simulationIconNames, getSimulationIcon, SIMULATION_ICON_DEFAULT } from '../utils/simulationIcons.js';

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
  label?: string;
  placeholder?: string;
  compact?: boolean;
}

export const IconPicker: React.FC<IconPickerProps> = ({
  value,
  onChange,
  label = 'Icon',
  placeholder = 'Add icon',
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const displayIcon = value?.trim() || SIMULATION_ICON_DEFAULT;
  const IconComponent = getSimulationIcon(displayIcon);
  const filteredNames = search.trim()
    ? simulationIconNames.filter((n) => n.toLowerCase().includes(search.toLowerCase()))
    : simulationIconNames;

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-3 border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${compact ? 'px-2 py-1.5 max-w-[200px]' : 'px-4 py-3'}`}
      >
        <div className={`rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 ${compact ? 'w-6 h-6' : 'w-10 h-10'}`}>
          <IconComponent className={compact ? 'w-3.5 h-3.5' : 'w-5 h-5'} />
        </div>
        <span className="text-left flex-1 text-gray-700 text-sm">
          {value?.trim() ? displayIcon : `Default (${SIMULATION_ICON_DEFAULT})`}
        </span>
        {!compact && <Plus className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className={`absolute z-50 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg ${compact ? 'w-64 max-h-56' : 'w-full max-h-80'}`}>
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search icons..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className={`overflow-y-auto p-2 grid gap-1 ${compact ? 'max-h-40 grid-cols-4' : 'max-h-64 grid-cols-4 sm:grid-cols-6'}`}>
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-indigo-50 text-gray-600 hover:text-indigo-700"
            >
              <div className={`rounded flex items-center justify-center bg-gray-100 ${compact ? 'w-6 h-6' : 'w-8 h-8'}`}>
                <IconComponent className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
              </div>
              <span className="text-[10px] mt-1 truncate w-full text-center">Default</span>
            </button>
            {filteredNames.map((name) => {
              const I = getSimulationIcon(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg hover:bg-indigo-50 ${
                    value === name ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-indigo-700'
                  }`}
                >
                  <div className={`rounded flex items-center justify-center bg-gray-100 ${compact ? 'w-6 h-6' : 'w-8 h-8'}`}>
                    <I className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
                  </div>
                  <span className="text-[10px] mt-1 truncate w-full text-center">{name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
