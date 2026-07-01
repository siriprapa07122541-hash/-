export type DrugCategory = 
  | 'off-list' 
  | 'refrigerated' 
  | 'room-temp' 
  | 'special-controlled' 
  | 'other';

export interface Drug {
  id: string;
  name: string;
  category: DrugCategory;
  stock: number; // Current stock
  unit: string;  // e.g. 'amp', 'vial', 'bottle', 'box'
}

export interface TransactionItem {
  drugId: string;
  name: string;
  category: DrugCategory;
  quantity: number;
}

export interface SpecialControlledDrugUsage {
  name: string;
  quantity: number;
  unit: string;
}

export interface Transaction {
  id: string;
  timestamp: string; // ISO string or local date string
  type: 'เบิก' | 'คืน';
  orRoom: string;
  patientHN: string;
  requesterName: string;
  blockBox: 'เบิก' | 'ไม่เบิก' | 'คืน' | 'ไม่ได้เบิก';
  extraBox: 'เบิก' | 'ไม่เบิก' | 'คืน' | 'ไม่ได้เบิก';
  coldBox?: 'เบิก' | 'ไม่เบิก';
  roomTempBox?: 'เบิก' | 'ไม่เบิก';
  coldOrRoomTempBox?: 'เบิก' | 'ไม่เบิก' | 'คืน' | 'ไม่ได้เบิก';
  notes?: string;
  items: TransactionItem[];
  specialControlledDrugs?: SpecialControlledDrugUsage[];
  deviceName?: string;
  syncStatus?: 'Synced' | 'Pending' | 'Conflict' | 'Error';
}
