"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputClass } from "@/components/ui";

interface SmartArticleSelectorProps {
  value: {
    product_name: string;
    color: string;
    size: string;
    quantity: number;
  };
  onChange: (value: Partial<Record<keyof SmartArticleSelectorProps["value"], any>>) => void;
  onRemove?: () => void;
}

export function SmartArticleSelector({
  value,
  onChange,
  onRemove,
}: SmartArticleSelectorProps) {
  const [colors, setColors] = useState<Array<{ id: string; color: string }>>([]);
  const [sizes, setSizes] = useState<Array<{ id: string; size: string }>>([]);
  const [colorSearch, setColorSearch] = useState("");
  const [sizeSearch, setSizeSearch] = useState("");
  const [showColorDropdown, setShowColorDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showColorInput, setShowColorInput] = useState(false);
  const [showSizeInput, setShowSizeInput] = useState(false);
  const [newColor, setNewColor] = useState("");
  const [newSize, setNewSize] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLists = async () => {
      const supabase = createClient();
      try {
        const [{ data: colorsData }, { data: sizesData }] = await Promise.all([
          supabase.from("product_colors").select("id, color").order("color"),
          supabase.from("product_sizes").select("id, size").order("size"),
        ]);

        setColors(colorsData || []);
        setSizes(sizesData || []);
      } catch (error) {
        console.error("Erreur chargement listes:", error);
      } finally {
        setLoading(false);
      }
    };

    loadLists();
  }, []);

  const handleAddColor = async () => {
    if (!newColor.trim()) return;

    const supabase = createClient();
    try {
      const { data } = await supabase
        .from("product_colors")
        .insert({ color: newColor })
        .select()
        .single();

      if (data) {
        setColors((prev) => [...prev, data]);
        onChange({ color: data.color });
        setNewColor("");
        setColorSearch(data.color);
        setShowColorInput(false);
        setShowColorDropdown(false);
      }
    } catch (error) {
      console.error("Erreur ajout couleur:", error);
      alert("Erreur lors de l'ajout de la couleur");
    }
  };

  const handleAddSize = async () => {
    if (!newSize.trim()) return;

    const supabase = createClient();
    try {
      const { data } = await supabase
        .from("product_sizes")
        .insert({ size: newSize })
        .select()
        .single();

      if (data) {
        setSizes((prev) => [...prev, data]);
        onChange({ size: data.size });
        setNewSize("");
        setSizeSearch(data.size);
        setShowSizeInput(false);
        setShowSizeDropdown(false);
      }
    } catch (error) {
      console.error("Erreur ajout taille:", error);
      alert("Erreur lors de l'ajout de la taille");
    }
  };

  const filteredColors = colors.filter((c) =>
    c.color.toLowerCase().includes(colorSearch.toLowerCase())
  );

  const filteredSizes = sizes.filter((s) =>
    s.size.toLowerCase().includes(sizeSearch.toLowerCase())
  );

  if (loading) {
    return <tr><td colSpan={5} className="py-2">Chargement...</td></tr>;
  }

  return (
    <tr>
      {/* Nom article */}
      <td className="py-2 pr-2">
        <input
          value={value.product_name}
          onChange={(e) => onChange({ product_name: e.target.value })}
          placeholder="T-shirt, Polo..."
          className={inputClass}
        />
      </td>

      {/* Couleur avec autocomplete */}
      <td className="py-2 pr-2 relative">
        {showColorInput ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddColor();
                if (e.key === "Escape") {
                  setShowColorInput(false);
                  setNewColor("");
                }
              }}
              placeholder="Nouvelle..."
              autoFocus
              className={inputClass}
            />
            <button
              type="button"
              onClick={handleAddColor}
              className="px-2 text-xs bg-green-500 text-white rounded hover:bg-green-600"
            >
              ✓
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={colorSearch || value.color}
              onChange={(e) => {
                setColorSearch(e.target.value);
                setShowColorDropdown(true);
              }}
              onFocus={() => setShowColorDropdown(true)}
              placeholder="Couleur..."
              className={inputClass}
            />
            {showColorDropdown && (
              <div className="absolute top-full left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded mt-1 max-h-48 overflow-y-auto z-10 shadow-lg">
                {filteredColors.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange({ color: c.color });
                      setColorSearch(c.color);
                      setShowColorDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    {c.color}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setShowColorInput(true);
                    setShowColorDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs italic text-brand-600 hover:bg-slate-100 dark:hover:bg-slate-700 border-t border-slate-200 dark:border-slate-700"
                >
                  + Ajouter nouvelle couleur
                </button>
              </div>
            )}
          </>
        )}
      </td>

      {/* Taille avec autocomplete */}
      <td className="py-2 pr-2 relative">
        {showSizeInput ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddSize();
                if (e.key === "Escape") {
                  setShowSizeInput(false);
                  setNewSize("");
                }
              }}
              placeholder="Nouvelle..."
              autoFocus
              className={inputClass}
            />
            <button
              type="button"
              onClick={handleAddSize}
              className="px-2 text-xs bg-green-500 text-white rounded hover:bg-green-600"
            >
              ✓
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={sizeSearch || value.size}
              onChange={(e) => {
                setSizeSearch(e.target.value);
                setShowSizeDropdown(true);
              }}
              onFocus={() => setShowSizeDropdown(true)}
              placeholder="Taille..."
              className={`${inputClass} w-full`}
            />
            {showSizeDropdown && (
              <div className="absolute top-full left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded mt-1 max-h-48 overflow-y-auto z-10 shadow-lg">
                {filteredSizes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onChange({ size: s.size });
                      setSizeSearch(s.size);
                      setShowSizeDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    {s.size}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setShowSizeInput(true);
                    setShowSizeDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs italic text-brand-600 hover:bg-slate-100 dark:hover:bg-slate-700 border-t border-slate-200 dark:border-slate-700"
                >
                  + Ajouter nouvelle taille
                </button>
              </div>
            )}
          </>
        )}
      </td>

      {/* Quantité */}
      <td className="py-2 pr-2">
        <input
          type="number"
          step="1"
          min="1"
          value={value.quantity}
          onChange={(e) => onChange({ quantity: Number(e.target.value) })}
          className={inputClass}
        />
      </td>

      {/* Bouton Retirer */}
      <td className="py-2 text-right">
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:underline"
        >
          Retirer
        </button>
      </td>
    </tr>
  );
}
