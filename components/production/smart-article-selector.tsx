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
        onChange({ color: newColor });
        setNewColor("");
        setShowColorInput(false);
      }
    } catch (error) {
      console.error("Erreur ajout couleur:", error);
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
        onChange({ size: newSize });
        setNewSize("");
        setShowSizeInput(false);
      }
    } catch (error) {
      console.error("Erreur ajout taille:", error);
    }
  };

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
          placeholder="T-shirt, Polo, Tote bag..."
          className={inputClass}
        />
      </td>

      {/* Couleur avec dropdown intelligent */}
      <td className="py-2 pr-2">
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
              placeholder="Nouvelle couleur..."
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
            <button
              type="button"
              onClick={() => {
                setShowColorInput(false);
                setNewColor("");
              }}
              className="px-2 text-xs bg-slate-300 rounded hover:bg-slate-400"
            >
              ✕
            </button>
          </div>
        ) : (
          <select
            value={value.color}
            onChange={(e) => {
              if (e.target.value === "__add__") {
                setShowColorInput(true);
              } else {
                onChange({ color: e.target.value });
              }
            }}
            className={inputClass}
          >
            <option value="">— Couleur —</option>
            {colors.map((c) => (
              <option key={c.id} value={c.color}>
                {c.color}
              </option>
            ))}
            <option value="__add__" className="italic">
              + Ajouter nouvelle couleur
            </option>
          </select>
        )}
      </td>

      {/* Taille avec dropdown intelligent */}
      <td className="py-2 pr-2">
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
              placeholder="Nouvelle taille..."
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
            <button
              type="button"
              onClick={() => {
                setShowSizeInput(false);
                setNewSize("");
              }}
              className="px-2 text-xs bg-slate-300 rounded hover:bg-slate-400"
            >
              ✕
            </button>
          </div>
        ) : (
          <select
            value={value.size}
            onChange={(e) => {
              if (e.target.value === "__add__") {
                setShowSizeInput(true);
              } else {
                onChange({ size: e.target.value });
              }
            }}
            className={`${inputClass} w-full`}
          >
            <option value="">— Taille —</option>
            {sizes.map((s) => (
              <option key={s.id} value={s.size}>
                {s.size}
              </option>
            ))}
            <option value="__add__" className="italic">
              + Ajouter nouvelle taille
            </option>
          </select>
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
