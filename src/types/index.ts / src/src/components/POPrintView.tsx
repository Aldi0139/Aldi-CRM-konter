import React from 'react';

interface POPrintViewProps {
  supplierName: string;
  invoiceNumber: string;
  date: string;
  items: Array<{ productName: string; qty: number }>;
  storeName?: string;
}

export const POPrintView: React.FC<POPrintViewProps> = ({
  supplierName,
  invoiceNumber,
  date,
  items,
  storeName = "Konter Cell"
}) => {
  return (
    <div className="p-8 max-w-2xl mx-auto bg-white text-black print:p-0">
      <div className="border-b-2 border-black pb-4 mb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold uppercase">{storeName}</h1>
          <p className="text-sm">Surat Pesanan / Purchase Order (PO)</p>
        </div>
        <div className="text-right text-sm">
          <p><strong>No. PO:</strong> {invoiceNumber || '-'}</p>
          <p><strong>Tanggal:</strong> {date}</p>
        </div>
      </div>

      <div className="mb-6 text-sm">
        <p className="font-semibold">Kepada Yth Supplier:</p>
        <p className="text-lg font-bold">{supplierName}</p>
      </div>

      <table className="w-full border-collapse border border-black mb-6 text-sm">
        <thead>
          <tr className="bg-gray-100 border-b border-black">
            <th className="border border-black p-2 text-center w-12">No</th>
            <th className="border border-black p-2 text-left">Nama Barang / Deskripsi</th>
            <th className="border border-black p-2 text-center w-24">Jumlah (Qty)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td className="border border-black p-2 text-center">{idx + 1}</td>
              <td className="border border-black p-2">{item.productName}</td>
              <td className="border border-black p-2 text-center font-bold">{item.qty} pcs</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-12 flex justify-between text-center text-sm">
        <div>
          <p className="mb-12">Dibuat Oleh,</p>
          <p className="font-underline font-bold">( .................... )</p>
        </div>
        <div>
          <p className="mb-12">Diterima Oleh Supplier,</p>
          <p className="font-underline font-bold">( .................... )</p>
        </div>
      </div>
    </div>
  );
};
