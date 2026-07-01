import { Transaction } from './types';

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-hist-1',
    timestamp: '2026-01-15T09:00:00.000Z',
    type: 'เบิก',
    orRoom: 'OR 3',
    patientHN: '640912111',
    requesterName: 'นพ.สมศักดิ์ ดีเลิศ',
    blockBox: 'ไม่เบิก',
    extraBox: 'ไม่เบิก',
    items: [
      { drugId: 'off-1', name: 'Propofol 1% (20 ml)', category: 'off-list', quantity: 15 },
      { drugId: 'ref-1', name: 'Atracurium 50 mg/5 ml (Tracrium)', category: 'refrigerated', quantity: 8 },
      { drugId: 'sc-1', name: 'Fentanyl citrate 100 mcg/2 ml', category: 'special-controlled', quantity: 12 }
    ]
  },
  {
    id: 'tx-hist-2',
    timestamp: '2026-02-18T10:30:00.000Z',
    type: 'เบิก',
    orRoom: 'OR 2',
    patientHN: '640912222',
    requesterName: 'พญ.นภา วงศ์แพทย์',
    blockBox: 'ไม่เบิก',
    extraBox: 'ไม่เบิก',
    items: [
      { drugId: 'off-1', name: 'Propofol 1% (20 ml)', category: 'off-list', quantity: 22 },
      { drugId: 'ref-1', name: 'Atracurium 50 mg/5 ml (Tracrium)', category: 'refrigerated', quantity: 14 },
      { drugId: 'sc-1', name: 'Fentanyl citrate 100 mcg/2 ml', category: 'special-controlled', quantity: 19 }
    ]
  },
  {
    id: 'tx-hist-3',
    timestamp: '2026-03-12T08:15:00.000Z',
    type: 'เบิก',
    orRoom: 'OR 4',
    patientHN: '640912333',
    requesterName: 'นพ.เกียรติศักดิ์ แก้วกล้า',
    blockBox: 'ไม่เบิก',
    extraBox: 'ไม่เบิก',
    items: [
      { drugId: 'off-1', name: 'Propofol 1% (20 ml)', category: 'off-list', quantity: 18 },
      { drugId: 'ref-1', name: 'Atracurium 50 mg/5 ml (Tracrium)', category: 'refrigerated', quantity: 10 },
      { drugId: 'sc-1', name: 'Fentanyl citrate 100 mcg/2 ml', category: 'special-controlled', quantity: 15 }
    ]
  },
  {
    id: 'tx-hist-4',
    timestamp: '2026-04-20T11:45:00.000Z',
    type: 'เบิก',
    orRoom: 'OR 1',
    patientHN: '640912444',
    requesterName: 'พญ.สิรินธร ผาสุก',
    blockBox: 'ไม่เบิก',
    extraBox: 'ไม่เบิก',
    items: [
      { drugId: 'off-1', name: 'Propofol 1% (20 ml)', category: 'off-list', quantity: 30 },
      { drugId: 'ref-1', name: 'Atracurium 50 mg/5 ml (Tracrium)', category: 'refrigerated', quantity: 22 },
      { drugId: 'sc-1', name: 'Fentanyl citrate 100 mcg/2 ml', category: 'special-controlled', quantity: 26 }
    ]
  },
  {
    id: 'tx-hist-5',
    timestamp: '2026-05-22T14:10:00.000Z',
    type: 'เบิก',
    orRoom: 'OR 7',
    patientHN: '640912555',
    requesterName: 'นพ.วิชัย ตั้งใจ',
    blockBox: 'ไม่เบิก',
    extraBox: 'ไม่เบิก',
    items: [
      { drugId: 'off-1', name: 'Propofol 1% (20 ml)', category: 'off-list', quantity: 25 },
      { drugId: 'ref-1', name: 'Atracurium 50 mg/5 ml (Tracrium)', category: 'refrigerated', quantity: 18 },
      { drugId: 'sc-1', name: 'Fentanyl citrate 100 mcg/2 ml', category: 'special-controlled', quantity: 21 }
    ]
  },
  {
    id: 'tx-1',
    timestamp: '2026-06-21T08:30:00.000Z',
    type: 'เบิก',
    orRoom: 'OR 3',
    patientHN: '640912345',
    requesterName: 'นพ.สมศักดิ์ ดีเลิศ',
    blockBox: 'เบิก',
    extraBox: 'ไม่เบิก',
    items: [
      { drugId: 'off-1', name: 'Propofol 1% (20 ml)', category: 'off-list', quantity: 2 },
      { drugId: 'ref-1', name: 'Atracurium 50 mg/5 ml (Tracrium)', category: 'refrigerated', quantity: 1 },
      { drugId: 'sc-1', name: 'Fentanyl citrate 100 mcg/2 ml', category: 'special-controlled', quantity: 1 }
    ]
  },
  {
    id: 'tx-2',
    timestamp: '2026-06-21T11:15:00.000Z',
    type: 'เบิก',
    orRoom: 'OR 5',
    patientHN: '620188443',
    requesterName: 'พญ.นภา วงศ์แพทย์',
    blockBox: 'ไม่เบิก',
    extraBox: 'เบิก',
    items: [
      { drugId: 'off-4', name: 'Sugammadex 200 mg/2 ml (Bridion)', category: 'off-list', quantity: 1 },
      { drugId: 'rt-5', name: 'Atropine sulfate 0.6 mg/ml', category: 'room-temp', quantity: 2 }
    ]
  },
  {
    id: 'tx-3',
    timestamp: '2026-06-22T09:00:00.000Z',
    type: 'เบิก',
    orRoom: 'OR 12',
    patientHN: '650341299',
    requesterName: 'พญ.สิรินธร ผาสุก',
    blockBox: 'เบิก',
    extraBox: 'เบิก',
    items: [
      { drugId: 'off-1', name: 'Propofol 1% (20 ml)', category: 'off-list', quantity: 3 },
      { drugId: 'ref-3', name: 'Succinylcholine 100 mg/2 ml', category: 'refrigerated', quantity: 1 },
      { drugId: 'sc-1', name: 'Fentanyl citrate 100 mcg/2 ml', category: 'special-controlled', quantity: 2 },
      { drugId: 'oth-1', name: 'Dexamethasone 4 mg/ml', category: 'other', quantity: 1 }
    ]
  },
  {
    id: 'tx-4',
    timestamp: '2026-06-22T14:45:00.000Z',
    type: 'คืน',
    orRoom: 'OR 3',
    patientHN: '640912345',
    requesterName: 'นพ.สมศักดิ์ ดีเลิศ',
    blockBox: 'ไม่เบิก',
    extraBox: 'ไม่เบิก',
    items: [
      { drugId: 'ref-1', name: 'Atracurium 50 mg/5 ml (Tracrium)', category: 'refrigerated', quantity: 1 }
    ]
  },
  {
    id: 'tx-5',
    timestamp: '2026-06-23T10:10:00.000Z',
    type: 'เบิก',
    orRoom: 'OR 1',
    patientHN: '661022941',
    requesterName: 'นพ.เกียรติศักดิ์ แก้วกล้า',
    blockBox: 'เบิก',
    extraBox: 'ไม่เบิก',
    items: [
      { drugId: 'rt-3', name: 'Marcine (Bupivacaine) Heavy 0.5% (4 ml)', category: 'room-temp', quantity: 1 },
      { drugId: 'sc-1', name: 'Fentanyl citrate 100 mcg/2 ml', category: 'special-controlled', quantity: 1 },
      { drugId: 'oth-2', name: 'Ondansetron 8 mg/4 ml', category: 'other', quantity: 1 }
    ]
  },
  {
    id: 'tx-6',
    timestamp: '2026-06-23T13:20:00.000Z',
    type: 'เบิก',
    orRoom: 'ENDO 4',
    patientHN: '630248811',
    requesterName: 'พญ.นภา วงศ์แพทย์',
    blockBox: 'ไม่เบิก',
    extraBox: 'ไม่เบิก',
    items: [
      { drugId: 'off-1', name: 'Propofol 1% (20 ml)', category: 'off-list', quantity: 2 },
      { drugId: 'sc-4', name: 'Midazolam 5 mg/5 ml (Dormicum)', category: 'special-controlled', quantity: 1 }
    ]
  },
  {
    id: 'tx-7',
    timestamp: '2026-06-24T08:15:00.000Z',
    type: 'เบิก',
    orRoom: 'OR 9',
    patientHN: '650119223',
    requesterName: 'นพ.วิชัย ตั้งใจ',
    blockBox: 'เบิก',
    extraBox: 'เบิก',
    items: [
      { drugId: 'off-1', name: 'Propofol 1% (20 ml)', category: 'off-list', quantity: 1 },
      { drugId: 'ref-2', name: 'Cisatracurium 10 mg/5 ml (Nimbex)', category: 'refrigerated', quantity: 2 },
      { drugId: 'sc-2', name: 'Morphine sulfate 10 mg/ml', category: 'special-controlled', quantity: 1 },
      { drugId: 'oth-3', name: 'NSS 100 ml (Normal Saline)', category: 'other', quantity: 1 }
    ]
  }
];
