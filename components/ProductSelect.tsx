import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../types';
import { Search, X } from 'lucide-react';

interface ProductSelectProps {
  products: Product[];
  value: number | null;
  onChange: (value: number | null) => void;
  error?: string;
  hideLabel?: boolean;
  className?: string;
  disabled?: boolean;
}

export const ProductSelect: React.FC<ProductSelectProps> = ({ 
  products, 
  value, 
  onChange, 
  error, 
  hideLabel = false, 
  className = '', 
  disabled = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedProduct = products.find(p => p.codigo === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

  const filteredProducts = products.filter(p =>
    p.produto.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.codigo.toString().includes(searchTerm)
  );

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div className="flex flex-col space-y-1 relative" ref={wrapperRef}>
      {!hideLabel && <label className="text-sm font-semibold text-slate-700">Produto *</label>}
      
      <div 
        className={`px-3 py-2 bg-white border rounded-lg flex items-center justify-between transition-all ${
          disabled ? 'bg-slate-100 cursor-not-allowed text-slate-400' : 'cursor-pointer hover:border-brand-400'
        } ${
          error ? 'border-red-500' : 'border-slate-300'
        } ${isOpen ? 'ring-2 ring-brand-500 border-brand-500' : ''} ${className}`}
        onClick={handleToggle}
      >
        <span className={`block truncate ${!selectedProduct ? 'text-slate-400' : (disabled ? 'text-slate-500' : 'text-slate-900')}`}>
          {selectedProduct 
            ? `${selectedProduct.produto} - ${selectedProduct.descricao}` 
            : (disabled ? '' : 'Selecione um produto...')}
        </span>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-80 flex flex-col top-full left-0 min-w-[250px]">
          <div className="p-2 border-b border-slate-100 sticky top-0 bg-white rounded-t-lg">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                autoFocus
                placeholder="Buscar código, nome ou descrição..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm outline-none focus:border-brand-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          
          <div className="overflow-y-auto flex-1">
            {filteredProducts.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">Nenhum produto encontrado.</div>
            ) : (
              filteredProducts.map((product) => (
                <div
                  key={product.codigo}
                  className={`p-3 text-sm cursor-pointer hover:bg-brand-50 transition-colors border-b border-slate-50 last:border-0 ${
                    value === product.codigo ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-700'
                  }`}
                  onClick={() => {
                    onChange(product.codigo);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                >
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="font-bold">{product.produto}</span>
                    <span className="text-xs text-slate-400">Cod: {product.codigo}</span>
                  </div>
                  <div className="truncate text-xs opacity-80">{product.descricao}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      
      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
  );
};