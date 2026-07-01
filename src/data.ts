import { Drug, DrugCategory } from './types';

export const OR_ROOMS = [
  'OR 1', 'OR 2', 'OR 3', 'OR 4', 'OR 5', 'OR 6', 'OR 7', 'OR 8', 'OR 9', 'OR 10',
  'OR 11', 'OR 12', 'OR 13', 'OR 14', 'OR 15', 'OR 16', 'OR 17', 'OR 18', 'OR 19', 'OR 20', 'OR 21',
  'PACU 1', 'PACU 2',
  'กว.1', 'กว.2', 'กว.3', 'กว.4',
  'PACU กว.',
  'ESWL',
  'ENDO 4', 'ENDO 5', 'ENDO 6', 'ENDO 7', 'ENDO 8',
  'PACU ENDO',
  'LR',
  'Angiogram',
  'MRI',
  'CT',
  'RE',
  'TR',
  'เก็บไข่'
];

export const CATEGORY_LABELS: Record<DrugCategory, string> = {
  'off-list': 'หมวดยานอกบัญชี',
  'refrigerated': 'ยาอุณหภูมิตู้เย็น (2-8°C)',
  'room-temp': 'ยาอุณหภูมิห้อง',
  'special-controlled': 'ยาควบคุมพิเศษ (ยาเสพติด/วัตถุออกฤทธิ์)',
  'other': 'ยาอื่น ๆ'
};

export const DEFAULT_DRUGS: Drug[] = [
  // หมวดยานอกบัญชี (off-list)
  { id: 'off-1', name: 'Propofol 1% (20 ml)', category: 'off-list', stock: 100, unit: 'amp' },
  { id: 'off-2', name: 'Sevoflurane (250 ml)', category: 'off-list', stock: 10, unit: 'bottle' },
  { id: 'off-3', name: 'Desflurane (240 ml)', category: 'off-list', stock: 8, unit: 'bottle' },
  { id: 'off-4', name: 'Sugammadex 200 mg/2 ml (Bridion)', category: 'off-list', stock: 25, unit: 'vial' },
  { id: 'off-5', name: 'Etomidate Lipuro 20 mg/10 ml', category: 'off-list', stock: 30, unit: 'amp' },

  // ยาอุณหภูมิตู้เย็น (refrigerated)
  { id: 'ref-1', name: 'Atracurium 50 mg/5 ml (Tracrium)', category: 'refrigerated', stock: 150, unit: 'amp' },
  { id: 'ref-2', name: 'Cisatracurium 10 mg/5 ml (Nimbex)', category: 'refrigerated', stock: 80, unit: 'amp' },
  { id: 'ref-3', name: 'Succinylcholine 100 mg/2 ml', category: 'refrigerated', stock: 50, unit: 'amp' },
  { id: 'ref-4', name: 'Insulin (Regular) 100 U/ml', category: 'refrigerated', stock: 15, unit: 'vial' },
  { id: 'ref-5', name: 'Rocuronium bromide 50 mg/5 ml (Esmeron)', category: 'refrigerated', stock: 120, unit: 'vial' },

  // ยาอุณหภูมิห้อง (room-temp)
  { id: 'rt-1', name: 'Lidocaine 1% (20 ml)', category: 'room-temp', stock: 200, unit: 'vial' },
  { id: 'rt-2', name: 'Lidocaine 2% (20 ml)', category: 'room-temp', stock: 180, unit: 'vial' },
  { id: 'rt-3', name: 'Marcine (Bupivacaine) Heavy 0.5% (4 ml)', category: 'room-temp', stock: 100, unit: 'amp' },
  { id: 'rt-4', name: 'Marcine (Bupivacaine) Plain 0.5% (10 ml)', category: 'room-temp', stock: 70, unit: 'vial' },
  { id: 'rt-5', name: 'Atropine sulfate 0.6 mg/ml', category: 'room-temp', stock: 300, unit: 'amp' },
  { id: 'rt-6', name: 'Ephedrine HCl 30 mg/ml', category: 'room-temp', stock: 150, unit: 'amp' },
  { id: 'rt-7', name: 'Adrenaline (Epinephrine) 1 mg/ml', category: 'room-temp', stock: 250, unit: 'amp' },
  { id: 'rt-8', name: 'Naloxone 0.4 mg/ml', category: 'room-temp', stock: 40, unit: 'amp' },

  // ยาควบคุมพิเศษ (special-controlled)
  { id: 'sc-1', name: 'Fentanyl citrate 100 mcg/2 ml', category: 'special-controlled', stock: 300, unit: 'amp' },
  { id: 'sc-2', name: 'Morphine sulfate 10 mg/ml', category: 'special-controlled', stock: 100, unit: 'amp' },
  { id: 'sc-3', name: 'Pethidine HCl 50 mg/ml', category: 'special-controlled', stock: 150, unit: 'amp' },
  { id: 'sc-4', name: 'Midazolam 5 mg/5 ml (Dormicum)', category: 'special-controlled', stock: 120, unit: 'amp' },
  { id: 'sc-5', name: 'Ketamine HCl 500 mg/10 ml (Calypsol)', category: 'special-controlled', stock: 60, unit: 'vial' },
  { id: 'sc-6', name: 'Fentanyl citrate 500 mcg/10 ml', category: 'special-controlled', stock: 50, unit: 'amp' },

  // ยาอื่น ๆ (other)
  { id: 'oth-1', name: 'Dexamethasone 4 mg/ml', category: 'other', stock: 250, unit: 'amp' },
  { id: 'oth-2', name: 'Ondansetron 8 mg/4 ml', category: 'other', stock: 180, unit: 'amp' },
  { id: 'oth-3', name: 'NSS 100 ml (Normal Saline)', category: 'other', stock: 400, unit: 'bottle' },
  { id: 'oth-4', name: 'Sterile Water 10 ml', category: 'other', stock: 300, unit: 'amp' },
  { id: 'oth-5', name: 'Norepinephrine 4 mg/4 ml (Levophed)', category: 'other', stock: 100, unit: 'amp' }
];
