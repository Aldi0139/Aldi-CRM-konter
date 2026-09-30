export type RestockStatus = 'COMPLETED' | 'DRAFT';

export interface RestockItem {
  productId: string;
  productName: string;
  qty: number;
  oldBuyPrice: number;
  newBuyPrice: number;
  oldSellPrice: number;
  newSellPrice: number;
}

export interface RestockInvoice {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  date: string;
  items: RestockItem[];
  totalAmount: number;
  status: RestockStatus;
}
