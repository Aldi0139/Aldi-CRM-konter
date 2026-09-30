import React, { useState } from 'react';

export interface PriceAdjustment {
  productId: string;
  productName: string;
  oldBuyPrice: number;
  newBuyPrice: number;
  oldSellPrice: number;
  recommendedSellPrice: number;
  adjustedSellPrice: number;
}

interface PriceChangeModalProps {
  isOpen: boolean;
  adjustments: PriceAdjustment[];
  onConfirm: (finalAdjustments: PriceAdjustment[]) => void;
  onCancel: () => void;
}

export const PriceChangeModal: React.FC<PriceChangeModalProps> = ({
  isOpen,
  adjustments,
  onConfirm,
  onCancel,
}) => {
  const [items, setItems] = useState<PriceAdjustment[]>(adjustments);

  if (!isOpen) return null;

  const handlePriceChange = (productId: string, newPrice: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, adjustedSellPrice: newPrice } : item
      )
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 overflow-hidden">
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          ⚠️ Deteksi Perubahan Harga Beli
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Terdapat perubahan harga beli dari supplier. Sesuaikan harga jual agar margin keuntungan Anda tetap terjaga.
        </p>

        <div className="max-h-80 overflow-y-auto mb-6">
          <table className="w-full text-sm text-left text-gray-600">
            <thead className="bg-gray-100 text-gray-700 font-semibold uppercase text-xs sticky top-0">
              <tr>
                <th className="p-3">Produk</th>
                <th className="p-3">Harga Beli (Lama → Baru)</th>
                <th className="p-3">Harga Jual Lama</th>
                <th className="p-3">Rekomendasi / Harga Jual Baru</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item) => (
                <tr key={item.productId}>
                  <td className="p-3 font-medium text-gray-900">{item.productName}</td>
                  <td className="p-3">
                    <span className="line-through text-gray-400">Rp{item.oldBuyPrice.toLocaleString()}</span>
                    <span className="ml-2 font-bold text-blue-600">Rp{item.newBuyPrice.toLocaleString()}</span>
                  </td>
                  <td className="p-3">Rp{item.oldSellPrice.toLocaleString()}</td>
                  <td className="p-3">
                    <input
                      type="number"
                      value={item.adjustedSellPrice}
                      onChange={(e) => handlePriceChange(item.productId, Number(e.target.value))}
                      className="w-32 p-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 font-bold text-green-700"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Batal
          </button>
          <button
            onClick={() => onConfirm(items)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Simpan Perubahan & Update Stok
          </button>
        </div>
      </div>
    </div>
  );
};
