import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import { 
  Search, Plus, Minus, Trash2, Printer, TrendingUp, Database, 
  Lock, Unlock, Settings, User, Folder, Calendar, Building, 
  CheckCircle, RefreshCw, FileText, AlertTriangle, Activity, 
  ThermometerSnowflake, ShieldAlert, Check, X, LogOut, ArrowUpDown, BarChart2,
  Package, Pill, Sparkles, Edit, Save, Filter, ChevronDown, Download,
  Scissors, UserCheck, ClipboardList, Info, HeartPulse, ClipboardCheck,
  Star, MessageSquare, Send, Heart, Smile
} from 'lucide-react';

import { Drug, DrugCategory, Transaction, TransactionItem } from './types';
import { OR_ROOMS, CATEGORY_LABELS, DEFAULT_DRUGS } from './data';
import { INITIAL_TRANSACTIONS } from './initialTransactions';
import Dashboard from './components/Dashboard';

// Import Firebase Client & Firestore modular functions
import { db } from './lib/firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

// Import local banner image (using standard public-asset path or relative source asset)
// @ts-ignore
import bannerImg from './assets/images/minimal_anesthesia_banner_1782308055354.jpg';
// @ts-ignore

// Helper function to send data using POST fetch via our server proxy to avoid CORS/Cross-Origin blocks
function sendPOST(url: string, payload: Record<string, any>): Promise<any> {
  return new Promise((resolve) => {
    // Set a timeout to resolve if it takes too long so the UI doesn't hang
    const timeoutId = setTimeout(() => {
      console.warn('POST Request Timeout - Proceeding with local updates');
      resolve({ status: 'timeout_fallback' });
    }, 15000);

    fetch('/api/proxy-post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url, payload })
    })
    .then(async (response) => {
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((result) => {
      resolve(result);
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      console.warn('Proxy POST failed, attempting direct fetch fallback:', err);
      
      // Fallback directly to the URL in case proxy server is unavailable
      fetch(url, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((result) => {
        resolve(result);
      })
      .catch((directErr) => {
        console.error('POST Fetch Error - Fallback triggered:', directErr);
        resolve({ status: 'error_fallback', message: directErr.message });
      });
    });
  });
}

// Helper function to send data using JSONP to bypass CORS issues with Google Apps Script
function sendJSONP(url: string, data: Record<string, any>): Promise<any> {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
    
    // Set a timeout to reject if it takes too long
    const timeoutId = setTimeout(() => {
      cleanup();
      console.warn('JSONP Request Timeout - Proceeding with local updates');
      resolve({ status: 'timeout_fallback' });
    }, 15000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      const script = document.getElementById(callbackName);
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      delete (window as any)[callbackName];
    };

    // Define callback on window
    (window as any)[callbackName] = (response: any) => {
      cleanup();
      resolve(response);
    };

    // Serialize data into query string
    const queryParams = new URLSearchParams();
    Object.keys(data).forEach(key => {
      queryParams.set(key, typeof data[key] === 'object' ? JSON.stringify(data[key]) : String(data[key]));
    });
    queryParams.set('callback', callbackName);

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `${url}${url.includes('?') ? '&' : '?'}${queryParams.toString()}`;
    script.onerror = () => {
      cleanup();
      console.warn('JSONP Script Load Error - Proceeding with local updates');
      resolve({ status: 'error_fallback' });
    };

    document.body.appendChild(script);
  });
}

// Helper function to return correct unit based on drug name
const fentanylUnit = (name: string): string => {
  if (!name) return 'แอมป์';
  const nameLower = name.toLowerCase();
  if (nameLower.includes('fentanyl')) return 'mcg';
  if (nameLower.includes('morphine')) return 'mg';
  if (nameLower.includes('pethidine')) return 'mg';
  return 'แอมป์';
};

const SPECIAL_CONTROLLED_DRUGS_LIST = [
  'Morphine',
  'Fentanyl 2 ml',
  'Fentanyl 10 ml',
  'Pethidine',
  'Midazolam',
  'Ephedrine',
  'Ketamine',
  'Etomidate'
];

const SPECIAL_DRUGS_METADATA: Record<string, { type: 'Amp' | 'Vial'; capacity: number; unit: 'mg' | 'mcg'; display: string }> = {
  'Morphine': { type: 'Amp', capacity: 10, unit: 'mg', display: 'Morphine 10mg' },
  'Fentanyl 2 ml': { type: 'Amp', capacity: 100, unit: 'mcg', display: 'Fentanyl 100mcg' },
  'Fentanyl 10 ml': { type: 'Amp', capacity: 500, unit: 'mcg', display: 'Fentanyl 500mcg' },
  'Pethidine': { type: 'Amp', capacity: 50, unit: 'mg', display: 'Pethidine 50mg' },
  'Midazolam': { type: 'Amp', capacity: 5, unit: 'mg', display: 'Midazolam 5mg' },
  'Ephedrine': { type: 'Amp', capacity: 30, unit: 'mg', display: 'Ephedrine 30mg' },
  'Ketamine': { type: 'Vial', capacity: 500, unit: 'mg', display: 'Ketamine 500mg' },
  'Etomidate': { type: 'Amp', capacity: 20, unit: 'mg', display: 'Etomidate 20mg' }
};

const DRUG_DOSAGE_PRESETS: Record<string, number[]> = {
  'Morphine': [2, 4, 5, 8],
  'Fentanyl 2 ml': [25, 50, 75, 100],
  'Fentanyl 10 ml': [100, 150, 200, 250, 300, 400],
  'Pethidine': [10, 20, 25, 30, 40],
  'Midazolam': [1, 2, 2.5, 3, 4],
  'Ephedrine': [6, 10, 12, 15, 20, 24],
  'Ketamine': [50, 100, 150, 200, 250, 300, 400],
  'Etomidate': [4, 8, 10, 12, 14, 16]
};

export default function App() {
  // --- Persistent States ---
  const [drugs, setDrugs] = useState<Drug[]>(() => {
    const saved = localStorage.getItem('supply_anesth_drugs');
    return saved ? JSON.parse(saved) : DEFAULT_DRUGS;
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('supply_anesth_transactions');
    const raw = saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
    const seen = new Set<string>();
    const unique: Transaction[] = [];
    raw.forEach((tx: any) => {
      if (tx && tx.id && !seen.has(tx.id)) {
        seen.add(tx.id);
        unique.push({
          ...tx,
          coldBox: tx.coldBox || 'ไม่เบิก',
          roomTempBox: tx.roomTempBox || 'ไม่เบิก',
          coldOrRoomTempBox: tx.coldOrRoomTempBox || (tx.coldBox === 'เบิก' || tx.roomTempBox === 'เบิก' ? 'เบิก' : (tx.type === 'เบิก' ? 'ไม่เบิก' : 'ไม่ได้เบิก')),
          notes: tx.notes || ''
        });
      }
    });
    return unique;
  });

  useEffect(() => {
    localStorage.setItem('supply_anesth_drugs', JSON.stringify(drugs));
  }, [drugs]);

  useEffect(() => {
    localStorage.setItem('supply_anesth_transactions', JSON.stringify(transactions));
  }, [transactions]);

  // Refs to always access latest state inside the 7-second interval without restarting it
  const transactionsRef = React.useRef<Transaction[]>([]);
  const drugsRef = React.useRef<Drug[]>([]);

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  useEffect(() => {
    drugsRef.current = drugs;
  }, [drugs]);

  // --- States for highlighting and smooth scrolling ---
  const [highlightedTxIds, setHighlightedTxIds] = useState<Set<string>>(new Set());
  const [selfAddedTxId, setSelfAddedTxId] = useState<string | null>(null);

  // Smooth scroll to newly added row if it was self-added
  useEffect(() => {
    if (selfAddedTxId) {
      const timer = setTimeout(() => {
        const element = 
          document.getElementById(`tx-row-${selfAddedTxId}`) || 
          document.getElementById(`tx-row-log-${selfAddedTxId}`) ||
          document.getElementById(`tx-row-hist-${selfAddedTxId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setSelfAddedTxId(null);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selfAddedTxId, transactions]);

  // Global Config for Google Sheets Integration
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwUXtLCxArvkspF0jytL3LVcIkhBftmY2NJKXW_-h9IOYK9wqY8k6JOpWN6RmuQZGTDQw/exec';
  const SPREADSHEET_ID = '12akwFyMHjCb2QUG6HiMsagkwaPT2qpU5-kbQ_Z3OkmY';

  // Helper to parse Thai local timestamp string to ISO string or valid date
  const parseThaiTimestamp = (str: string): string => {
    try {
      if (!str) return new Date().toISOString();
      let processed = str;
      if (str.includes('2569') || str.includes('2570') || str.includes('2568')) {
        processed = str.replace(/2569/g, '2026').replace(/2570/g, '2027').replace(/2568/g, '2025');
      }
      // Handle Thai format DD/MM/YYYY HH:MM:SS
      const parts = processed.split(' ');
      if (parts[0] && parts[0].includes('/')) {
        const dateParts = parts[0].split('/');
        if (dateParts.length === 3) {
          const day = parseInt(dateParts[0], 10);
          const month = parseInt(dateParts[1], 10) - 1; // 0-indexed
          const year = parseInt(dateParts[2], 10);
          let hour = 0, minute = 0, second = 0;
          if (parts[1]) {
            const timeParts = parts[1].split(':');
            hour = parseInt(timeParts[0], 10) || 0;
            minute = parseInt(timeParts[1], 10) || 0;
            second = parseInt(timeParts[2], 10) || 0;
          }
          const parsedDate = new Date(year, month, day, hour, minute, second);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString();
          }
        }
      }
      const d = new Date(processed);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
      return new Date().toISOString();
    } catch (e) {
      return new Date().toISOString();
    }
  };

  // Google Sheets Auto-Polling & Syncing Engine (7-second interval)
  useEffect(() => {
    const syncWithGoogleSheets = async () => {
      try {
        const response = await sendJSONP(APPS_SCRIPT_URL, {
          action: 'read',
          sheetId: SPREADSHEET_ID
        });

        if (response && response.status === 'success' && response.sheets) {
          const sheetsData = response.sheets;
          const newTransactions: Transaction[] = [];
          const seenNewIds = new Set<string>();

          // Parse 'ยาควบคุมพิเศษ' sheet rows
          if (Array.isArray(sheetsData['ยาควบคุมพิเศษ'])) {
            sheetsData['ยาควบคุมพิเศษ'].forEach((row: any) => {
              const timestampStr = String(row.Timestamp || '');
              const hn = String(row.patientHN || row.HN || '');
              const drugName = String(row.DrugName || '');
              const requester = String(row.ReturnedBy || row.NurseName || '');
              const actualUsed = row.ActualUsed !== undefined ? parseFloat(row.ActualUsed) : 0;
              const wastage = row.Wastage !== undefined ? parseFloat(row.Wastage) : 0;
              const useMode = row.UseMode || '';
              const openedAmps = row.OpenedAmps || 1;

              // Generate deterministic ID
              const cleanTs = timestampStr.replace(/[^\d]/g, '');
              const cleanHn = hn.replace(/[^\d\w]/g, '');
              const txId = `sheets-scd-${cleanTs}-${cleanHn}-${drugName}`.substring(0, 100);

              // Skip if this transaction ID already exists in our local state or is already parsed to prevent duplicates
              if (seenNewIds.has(txId) || transactionsRef.current.some(tx => tx.id === txId)) {
                return;
              }
              seenNewIds.add(txId);

              const meta = SPECIAL_DRUGS_METADATA[drugName] || { unit: 'mg', type: 'Amp' };
              const txItem = {
                name: drugName,
                quantity: actualUsed,
                unit: useMode === 'เต็มแอมป์/เต็มขวด' || useMode === 'full'
                  ? `${meta.unit} (ใช้เต็ม ${openedAmps} ${meta.type === 'Amp' ? 'แอมป์' : 'ขวด'})`
                  : `${meta.unit} (เปิด ${openedAmps} ${meta.type === 'Amp' ? 'แอมป์' : 'ขวด'}, ทิ้ง ${wastage} ${meta.unit})`
              };

              const tx: Transaction = {
                id: txId,
                timestamp: parseThaiTimestamp(timestampStr),
                type: 'เบิก',
                orRoom: row.orRoom || 'OR Room 1',
                patientHN: hn,
                requesterName: requester,
                blockBox: 'ไม่เบิก',
                extraBox: 'ไม่เบิก',
                coldBox: 'ไม่เบิก',
                roomTempBox: 'ไม่เบิก',
                coldOrRoomTempBox: 'ไม่เบิก',
                notes: row.notes || '[ยาควบคุมพิเศษ]',
                items: [],
                specialControlledDrugs: [txItem],
                deviceName: row.deviceName || row.DeviceName || row.Device || 'PC-OR-REMOTE',
                syncStatus: 'Synced'
              };

              newTransactions.push(tx);
            });
          }

          // Parse 'เบิกยา' sheet rows
          if (Array.isArray(sheetsData['เบิกยา'])) {
            sheetsData['เบิกยา'].forEach((row: any) => {
              const timestampStr = String(row.Timestamp || '');
              const hn = String(row.HN || '');
              const patientName = String(row.PatientName || '');
              const drugName = String(row.DrugName || '');
              const qty = row.UsedAmount !== undefined ? parseFloat(row.UsedAmount) : 1;
              const requester = String(row.NurseName || '');

              const cleanTs = timestampStr.replace(/[^\d]/g, '');
              const cleanHn = hn.replace(/[^\d\w]/g, '');
              const txId = `sheets-draw-${cleanTs}-${cleanHn}-${drugName}`.substring(0, 100);

              if (seenNewIds.has(txId) || transactionsRef.current.some(tx => tx.id === txId)) {
                return;
              }
              seenNewIds.add(txId);

              const tx: Transaction = {
                id: txId,
                timestamp: parseThaiTimestamp(timestampStr),
                type: 'เบิก',
                orRoom: row.orRoom || 'OR Room 1',
                patientHN: patientName ? `${patientName} / ${hn}` : hn,
                requesterName: requester,
                blockBox: row.blockBox || 'ไม่เบิก',
                extraBox: row.extraBox || 'ไม่เบิก',
                coldBox: 'ไม่เบิก',
                roomTempBox: 'ไม่เบิก',
                coldOrRoomTempBox: row.coldOrRoomTempBox || 'ไม่เบิก',
                notes: row.WitnessName && row.WitnessName !== '-' ? `พยาน: ${row.WitnessName}` : '',
                items: [{
                  drugId: drugName.toLowerCase().replace(/\s+/g, '-'),
                  name: drugName,
                  category: 'other',
                  quantity: qty
                }],
                deviceName: row.deviceName || row.DeviceName || row.Device || 'PC-OR-REMOTE',
                syncStatus: 'Synced'
              };

              newTransactions.push(tx);
            });
          }

          // Parse 'คืนยา' sheet rows
          if (Array.isArray(sheetsData['คืนยา'])) {
            sheetsData['คืนยา'].forEach((row: any) => {
              const timestampStr = String(row.Timestamp || '');
              const drugName = String(row.DrugName || '');
              const qty = row.AmpouleCount !== undefined ? parseFloat(row.AmpouleCount) : 1;
              const sender = String(row.SenderName || row.NurseName || 'ไม่ระบุชื่อ');

              const cleanTs = timestampStr.replace(/[^\d]/g, '');
              const cleanDrug = drugName.replace(/[^\d\w]/g, '');
              const txId = `sheets-ret-${cleanTs}-${cleanDrug}`.substring(0, 100);

              if (seenNewIds.has(txId) || transactionsRef.current.some(tx => tx.id === txId)) {
                return;
              }
              seenNewIds.add(txId);

              const tx: Transaction = {
                id: txId,
                timestamp: parseThaiTimestamp(timestampStr),
                type: 'คืน',
                orRoom: row.orRoom || 'OR Room 1',
                patientHN: 'คืนคลังห้องยา',
                requesterName: sender,
                blockBox: row.blockBox || 'ไม่ได้เบิก',
                extraBox: row.extraBox || 'ไม่ได้เบิก',
                coldBox: 'ไม่เบิก',
                roomTempBox: 'ไม่เบิก',
                coldOrRoomTempBox: row.coldOrRoomTempBox || 'ไม่ได้เบิก',
                notes: row.notes || 'ส่งคืนผ่าน Google Sheets',
                items: [{
                  drugId: drugName.toLowerCase().replace(/\s+/g, '-'),
                  name: drugName,
                  category: 'other',
                  quantity: qty
                }],
                deviceName: row.deviceName || row.DeviceName || row.Device || 'PC-OR-REMOTE',
                syncStatus: 'Synced'
              };

              newTransactions.push(tx);
            });
          }

          if (newTransactions.length > 0) {
            // Update local drug stocks to reflect these new transactions
            setDrugs(prevDrugs => {
              let updatedDrugs = [...prevDrugs];
              newTransactions.forEach(tx => {
                if (tx.items && tx.items.length > 0) {
                  tx.items.forEach(item => {
                    updatedDrugs = updatedDrugs.map(d => {
                      if (d.name.toLowerCase() === item.name.toLowerCase() || d.id.toLowerCase() === item.drugId?.toLowerCase()) {
                        const change = tx.type === 'คืน' ? item.quantity : -item.quantity;
                        return { ...d, stock: Math.max(0, d.stock + change) };
                      }
                      return d;
                    });
                  });
                }
                if (tx.specialControlledDrugs && tx.specialControlledDrugs.length > 0) {
                  tx.specialControlledDrugs.forEach(scd => {
                    const cabinetDrugId = mapSpecialDrugToCabinetDrugId(scd.name);
                    updatedDrugs = updatedDrugs.map(d => {
                      if (d.id === cabinetDrugId || d.name.toLowerCase() === scd.name.toLowerCase()) {
                        let ampsCount = 1;
                        const unitStr = scd.unit || '';
                        const openedMatch = unitStr.match(/(?:เปิด|ใช้เต็ม)\s*(\d+)/i);
                        if (openedMatch && openedMatch[1]) {
                          ampsCount = parseInt(openedMatch[1], 10);
                        }
                        return { ...d, stock: Math.max(0, d.stock - ampsCount) };
                      }
                      return d;
                    });
                  });
                }
              });
              return updatedDrugs;
            });

            // Write to Firestore and adjust stocks
            try {
              const batch = writeBatch(db);
              let hasFirestoreUpdates = false;

              newTransactions.forEach(tx => {
                const txRef = doc(db, 'transactions', tx.id);
                batch.set(txRef, tx);
                hasFirestoreUpdates = true;

                // Adjust stock for 'เบิกยา' / 'คืนยา' standard transactions
                if (tx.items && tx.items.length > 0) {
                  tx.items.forEach(item => {
                    const drugItem = drugsRef.current.find(d => 
                      d.name.toLowerCase() === item.name.toLowerCase() || 
                      d.id.toLowerCase() === item.drugId?.toLowerCase()
                    );
                    if (drugItem) {
                      const change = tx.type === 'คืน' ? item.quantity : -item.quantity;
                      const nextStock = Math.max(0, drugItem.stock + change);
                      const drugRef = doc(db, 'drugs', drugItem.id);
                      batch.update(drugRef, { stock: nextStock });
                    }
                  });
                }

                // Adjust stock for 'ยาควบคุมพิเศษ' transactions (always deducts based on opened Amps)
                if (tx.specialControlledDrugs && tx.specialControlledDrugs.length > 0) {
                  tx.specialControlledDrugs.forEach(scd => {
                    const cabinetDrugId = mapSpecialDrugToCabinetDrugId(scd.name);
                    const drugItem = drugsRef.current.find(d => d.id === cabinetDrugId || d.name.toLowerCase() === scd.name.toLowerCase());
                    if (drugItem) {
                      let ampsCount = 1;
                      const unitStr = scd.unit || '';
                      const openedMatch = unitStr.match(/(?:เปิด|ใช้เต็ม)\s*(\d+)/i);
                      if (openedMatch && openedMatch[1]) {
                        ampsCount = parseInt(openedMatch[1], 10);
                      }
                      
                      const nextStock = Math.max(0, drugItem.stock - ampsCount);
                      const drugRef = doc(db, 'drugs', drugItem.id);
                      batch.update(drugRef, { stock: nextStock });
                    }
                  });
                }
              });

              if (hasFirestoreUpdates) {
                await batch.commit();
                console.log(`Successfully batched and committed ${newTransactions.length} transaction(s) to Firestore`);
              }
            } catch (fsErr) {
              console.error("Firestore batch update from Google Sheets sync error:", fsErr);
            }

            setTransactions(prev => {
              const filteredNew = newTransactions.filter(newTx => !prev.some(p => p.id === newTx.id));
              if (filteredNew.length === 0) return prev;

              const newIds = filteredNew.map(tx => tx.id);
              setHighlightedTxIds(prevHighlighted => {
                const updated = new Set(prevHighlighted);
                newIds.forEach(id => updated.add(id));
                return updated;
              });

              // Clear highlights after 4 seconds
              setTimeout(() => {
                setHighlightedTxIds(prevHighlighted => {
                  const updated = new Set(prevHighlighted);
                  newIds.forEach(id => updated.delete(id));
                  return updated;
                });
              }, 4000);

              // Push notification
              const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 4000,
                timerProgressBar: true
              });

              Toast.fire({
                icon: 'success',
                title: `ซิงค์อัตโนมัติ: มีรายการใหม่เข้ามา ${filteredNew.length} รายการ`,
                text: `อัปเดตตารางและปรับยอดสต็อกเรียลไทม์แล้ว`
              });

              const combined = [...filteredNew, ...prev];
              return Array.from(new Map(combined.map(t => [t.id, t])).values());
            });
          }
        }
      } catch (err) {
        console.warn('Google Sheets sync polling skipped or fallback active:', err);
      }
    };

    // Run once on mount, then poll every 7 seconds
    syncWithGoogleSheets();
    const pollInterval = setInterval(syncWithGoogleSheets, 7000);
    return () => clearInterval(pollInterval);
  }, []);



  useEffect(() => {
    const handleAfterPrint = () => {
      setIsPrintingSummary(false);
      setIsPrintingHistory(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  // --- UI/Navigation States ---
  const [activeTab, setActiveTab] = useState<'requisition' | 'return' | 'special_controlled' | 'admin'>('requisition');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminPasscode, setAdminPasscode] = useState<string>('');
  const [passcodeError, setPasscodeError] = useState<string>('');

  // --- Requisition Form States ---
  const [txType, setTxType] = useState<'เบิก' | 'คืน'>('เบิก');
  const [orRoom, setOrRoom] = useState<string>('');
  const [patientHN, setPatientHN] = useState<string>('');
  const [requesterName, setRequesterName] = useState<string>('');
  const [blockBox, setBlockBox] = useState<'เบิก' | 'ไม่เบิก' | 'คืน' | 'ไม่ได้เบิก'>('ไม่เบิก');
  const [extraBox, setExtraBox] = useState<'เบิก' | 'ไม่เบิก' | 'คืน' | 'ไม่ได้เบิก'>('ไม่เบิก');
  const [coldOrRoomTempBox, setColdOrRoomTempBox] = useState<'เบิก' | 'ไม่เบิก' | 'คืน' | 'ไม่ได้เบิก'>('ไม่เบิก');
  const [notes, setNotes] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeRightColumnTab, setActiveRightColumnTab] = useState<'standard' | 'special_controlled'>('standard');

  // --- Pastel Contact Form States ---
  const [contactName, setContactName] = useState<string>('');
  const [contactEmail, setContactEmail] = useState<string>('');
  const [contactRole, setContactRole] = useState<string>('');
  const [contactMessage, setContactMessage] = useState<string>('');

  // --- Multi-Case Special Controlled Drug State ---
  interface CaseDrug {
    id: string;
    drugName: string;
    useMode: 'full' | 'partial';
    ampsCount: number;
    actualUsed: string;
    wastage: string;
  }

  interface ControlledCase {
    id: string;
    orRoom: string;
    patientHN: string;
    drugs: CaseDrug[];
  }

  const [controlledCases, setControlledCases] = useState<ControlledCase[]>([
    {
      id: `case-${Date.now()}`,
      orRoom: '',
      patientHN: '',
      drugs: [
        {
          id: `drug-${Date.now()}-0`,
          drugName: 'Morphine',
          useMode: 'full',
          ampsCount: 1,
          actualUsed: '',
          wastage: ''
        }
      ]
    }
  ]);
  
  // Special Controlled Drugs selections
  const [specialControlledSelections, setSpecialControlledSelections] = useState<Record<string, { 
    selected: boolean; 
    useMode: 'full' | 'partial'; 
    ampsCount: number;
    actualUsed: string; 
    wastage: string; 
    quantity: string; 
    unit: string; 
  }>>(() => {
    const initial: Record<string, { 
      selected: boolean; 
      useMode: 'full' | 'partial'; 
      ampsCount: number;
      actualUsed: string; 
      wastage: string; 
      quantity: string; 
      unit: string; 
    }> = {};
    SPECIAL_CONTROLLED_DRUGS_LIST.forEach(name => {
      initial[name] = { selected: false, useMode: 'full', ampsCount: 1, actualUsed: '', wastage: '', quantity: '', unit: 'amp' };
    });
    return initial;
  });

  // Helper to update special controlled drug selection and keep quantity/unit in sync
  const updateDrugSelection = (name: string, fields: Partial<{
    selected: boolean;
    useMode: 'full' | 'partial';
    ampsCount: number;
    actualUsed: string;
    wastage: string;
    quantity: string;
    unit: string;
  }>) => {
    setSpecialControlledSelections(prev => {
      const current = prev[name] || { selected: false, useMode: 'full', ampsCount: 1, actualUsed: '', wastage: '', quantity: '', unit: 'amp' };
      const next = { ...current, ...fields };
      const meta = SPECIAL_DRUGS_METADATA[name] || { type: 'Amp', capacity: 10, unit: 'mg', display: name };
      
      const totalCapacity = next.ampsCount * meta.capacity;

      // Auto sync quantity and unit
      if (next.useMode === 'full') {
        next.quantity = totalCapacity.toString();
        next.unit = `${meta.unit} (ใช้เต็ม ${next.ampsCount} ${meta.type === 'Amp' ? 'แอมป์' : 'ขวด'})`;
      } else {
        next.quantity = next.actualUsed || '0';
        next.unit = `${meta.unit} (เปิด ${next.ampsCount} ${meta.type === 'Amp' ? 'แอมป์' : 'ขวด'}, ทิ้ง ${next.wastage || '0'} ${meta.unit})`;
      }
      
      return { ...prev, [name]: next };
    });
  };

  // Empty Ampoules Accumulator state (tracked per special controlled drug)
  const [emptyAmpsAccumulator, setEmptyAmpsAccumulator] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('supply_anesth_empty_amps');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error loading empty amps accumulator:', e);
      }
    }
    const initial: Record<string, number> = {};
    SPECIAL_CONTROLLED_DRUGS_LIST.forEach(name => {
      initial[name] = 0;
    });
    return initial;
  });

  useEffect(() => {
    localStorage.setItem('supply_anesth_empty_amps', JSON.stringify(emptyAmpsAccumulator));
  }, [emptyAmpsAccumulator]);

  const mapSpecialDrugToCabinetDrugId = (specialDrugName: string): string => {
    switch (specialDrugName) {
      case 'Morphine': return 'sc-2';
      case 'Fentanyl 2 ml': return 'sc-1';
      case 'Fentanyl 10 ml': return 'sc-6';
      case 'Pethidine': return 'sc-3';
      case 'Midazolam': return 'sc-4';
      case 'Ephedrine': return 'rt-6';
      case 'Ketamine': return 'sc-5';
      case 'Etomidate': return 'off-5';
      default: return '';
    }
  };
  
  // Selected drugs & quantities: Record of drugId -> quantity
  const [selectedMedications, setSelectedMedications] = useState<Record<string, number>>({});

  // Submission Statuses
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [lastSubmittedTx, setLastSubmittedTx] = useState<Transaction | null>(null);

  // --- Admin Panel States ---
  const [adminActiveSubTab, setAdminActiveSubTab] = useState<'stock' | 'history' | 'stats'>('stats');
  const [isPrintingSummary, setIsPrintingSummary] = useState<boolean>(false);
  const [isPrintingHistory, setIsPrintingHistory] = useState<boolean>(false);
  
  // Admin Stock Management
  const [newDrugName, setNewDrugName] = useState<string>('');
  const [newDrugCategory, setNewDrugCategory] = useState<DrugCategory>('room-temp');
  const [newDrugStock, setNewDrugStock] = useState<number>(50);
  const [newDrugUnit, setNewDrugUnit] = useState<string>('amp');
  const [stockEditId, setStockEditId] = useState<string | null>(null);
  const [stockEditVal, setStockEditVal] = useState<number>(0);
  const [adminSelectedCategory, setAdminSelectedCategory] = useState<string>('all');
  
  // States for Editing Drug properties inline
  const [editingDrugId, setEditingDrugId] = useState<string | null>(null);
  const [editingDrugName, setEditingDrugName] = useState<string>('');
  const [editingDrugCategory, setEditingDrugCategory] = useState<DrugCategory>('room-temp');
  const [editingDrugStock, setEditingDrugStock] = useState<number>(0);
  const [editingDrugUnit, setEditingDrugUnit] = useState<string>('');

  // Admin History Filters
  const [historySearchType, setHistorySearchType] = useState<string>('all'); // all, เบิก, คืน
  const [historySearchOR, setHistorySearchOR] = useState<string>('all');
  const [historySearchHN, setHistorySearchHN] = useState<string>('');
  const [historySearchDrug, setHistorySearchDrug] = useState<string>('');
  const [historySearchRequester, setHistorySearchRequester] = useState<string>('');
  const [historySearchDevice, setHistorySearchDevice] = useState<string>('');
  const [historySearchSync, setHistorySearchSync] = useState<string>('all');

  // --- Real-time Sync States ---
  const [deviceName, setDeviceName] = useState<string>(() => {
    return localStorage.getItem('supply_anesth_device_name') || `PC-OR0${Math.floor(Math.random() * 8) + 1}-ANESTH`;
  });
  const [currentStaffName, setCurrentStaffName] = useState<string>(() => {
    return localStorage.getItem('supply_anesth_staff_name') || 'พญ. สิริประภา (วิสัญญีแพทย์)';
  });
  const [syncState, setSyncState] = useState<'Synced' | 'Loading' | 'Conflict' | 'Error' | 'Reconnecting'>('Synced');
  const [syncTech, setSyncTech] = useState<'WebSockets' | 'SSE' | 'LongPolling'>('WebSockets');
  const [lastSyncedTime, setLastSyncedTime] = useState<string>(() => new Date().toLocaleTimeString('th-TH'));
  const [showSyncSettings, setShowSyncSettings] = useState<boolean>(false);
  const [conflictActive, setConflictActive] = useState<boolean>(false);
  const [conflictDetails, setConflictDetails] = useState<{
    localTx: any;
    remoteTx: any;
    drugId: string;
    drugName: string;
    localStock: number;
    remoteStock: number;
    expectedStock: number;
  } | null>(null);

  // Sync to local storage when changed
  useEffect(() => {
    localStorage.setItem('supply_anesth_device_name', deviceName);
  }, [deviceName]);

  useEffect(() => {
    localStorage.setItem('supply_anesth_staff_name', currentStaffName);
  }, [currentStaffName]);

  const handleChangeDeviceName = () => {
    Swal.fire({
      title: 'เปลี่ยนชื่อเครื่องคอมพิวเตอร์',
      text: 'ระบุชื่อเครื่องที่ใช้อยู่ เช่น PC-OR01-ANESTH',
      input: 'text',
      inputValue: deviceName,
      showCancelButton: true,
      confirmButtonText: 'บันทึก',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#ef4444',
      inputValidator: (value) => {
        if (!value) {
          return 'กรุณาระบุชื่อเครื่อง';
        }
      }
    }).then((result) => {
      if (result.isConfirmed) {
        setDeviceName(result.value.toUpperCase());
        Swal.fire({
          title: 'เปลี่ยนชื่อเครื่องสำเร็จ',
          text: `ชื่อเครื่องใหม่คือ: ${result.value.toUpperCase()}`,
          icon: 'success',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#10b981'
        });
      }
    });
  };

  // Firebase Real-time Sync for Drugs
  useEffect(() => {
    const drugsColRef = collection(db, 'drugs');
    const unsubscribe = onSnapshot(drugsColRef, async (snapshot) => {
      if (snapshot.empty) {
        // First-time setup: initialize Firestore with DEFAULT_DRUGS
        const batch = writeBatch(db);
        DEFAULT_DRUGS.forEach((drug) => {
          const dRef = doc(db, 'drugs', drug.id);
          batch.set(dRef, drug);
        });
        await batch.commit();
        return;
      }

      const loadedDrugs: Drug[] = [];
      snapshot.forEach((d) => {
        loadedDrugs.push(d.data() as Drug);
      });

      // Maintain order consistent with DEFAULT_DRUGS
      const orderMap = DEFAULT_DRUGS.reduce((acc, drug, idx) => {
        acc[drug.id] = idx;
        return acc;
      }, {} as Record<string, number>);

      loadedDrugs.sort((a, b) => {
        const orderA = orderMap[a.id] !== undefined ? orderMap[a.id] : 9999;
        const orderB = orderMap[b.id] !== undefined ? orderMap[b.id] : 9999;
        return orderA - orderB;
      });

      setDrugs(loadedDrugs);
    }, (error) => {
      console.error("Firebase Sync Error (Drugs):", error);
    });

    return () => unsubscribe();
  }, []);

  // Firebase Real-time Sync for Transactions
  useEffect(() => {
    const txColRef = collection(db, 'transactions');
    const unsubscribe = onSnapshot(txColRef, async (snapshot) => {
      if (snapshot.empty) {
        // First-time setup: initialize Firestore with INITIAL_TRANSACTIONS
        const batch = writeBatch(db);
        INITIAL_TRANSACTIONS.forEach((tx) => {
          const tRef = doc(db, 'transactions', tx.id);
          batch.set(tRef, tx);
        });
        await batch.commit();
        return;
      }

      const loadedTxs: Transaction[] = [];
      const seenIds = new Set<string>();
      snapshot.forEach((d) => {
        const tx = d.data() as Transaction;
        if (!tx.id) return;
        if (seenIds.has(tx.id)) {
          console.warn(`Duplicate transaction ID found in Firestore snapshot: ${tx.id}. Skipping.`);
          return;
        }
        seenIds.add(tx.id);
        loadedTxs.push({
          ...tx,
          coldBox: tx.coldBox || 'ไม่เบิก',
          roomTempBox: tx.roomTempBox || 'ไม่เบิก',
          coldOrRoomTempBox: tx.coldOrRoomTempBox || (tx.coldBox === 'เบิก' || tx.roomTempBox === 'เบิก' ? 'เบิก' : (tx.type === 'เบิก' ? 'ไม่เบิก' : 'ไม่ได้เบิก')),
          notes: tx.notes || ''
        });
      });

      // Sort by timestamp descending
      loadedTxs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setTransactions((prev) => {
        // If it's the first load, don't show notifications for historical items
        if (prev.length === 0) {
          return loadedTxs;
        }

        // Find transactions that are new compared to our current state
        const filteredNew = loadedTxs.filter(newTx => !prev.some(p => p.id === newTx.id));

        if (filteredNew.length > 0) {
          // Identify transactions recorded by other devices
          const remoteNew = filteredNew.filter(tx => tx.deviceName !== deviceName);

          if (remoteNew.length > 0) {
            const newIds = remoteNew.map(tx => tx.id);
            setHighlightedTxIds(prevHighlighted => {
              const updated = new Set(prevHighlighted);
              newIds.forEach(id => updated.add(id));
              return updated;
            });

            // Clear highlights after 4 seconds
            setTimeout(() => {
              setHighlightedTxIds(prevHighlighted => {
                const updated = new Set(prevHighlighted);
                newIds.forEach(id => updated.delete(id));
                return updated;
              });
            }, 4000);

            // Push a toast notice
            const Toast = Swal.mixin({
              toast: true,
              position: 'top-end',
              showConfirmButton: false,
              timer: 4000,
              timerProgressBar: true
            });

            Toast.fire({
              icon: 'info',
              title: `พบข้อมูลเบิกจ่ายยาใหม่จากระบบส่วนกลาง (${remoteNew.length} รายการ)`,
              text: `อัปเดตตารางและปรับยอดคงเหลือเรียลไทม์`
            });
          }
        }

        return loadedTxs;
      });
    }, (error) => {
      console.error("Firebase Sync Error (Transactions):", error);
    });

    return () => unsubscribe();
  }, [deviceName]);

  // Resolve conflict handler
  const handleResolveConflict = (resolution: 'merge' | 'use_remote' | 'override_server') => {
    if (!conflictDetails) return;

    setSyncState('Loading');
    setConflictActive(false);

    setTimeout(() => {
      const { drugId, drugName, localTx, remoteTx, expectedStock } = conflictDetails;
      
      let nextStock = expectedStock;
      let toastText = '';

      if (resolution === 'merge') {
        const totalUsed = localTx.quantity + remoteTx.quantity;
        nextStock = Math.max(0, expectedStock - totalUsed);
        
        setTransactions(prev => [
          {
            ...localTx,
            syncStatus: 'Synced',
            items: [{ drugId, name: drugName, category: 'special-controlled', quantity: localTx.quantity }]
          },
          {
            ...remoteTx,
            syncStatus: 'Synced',
            items: [{ drugId, name: drugName, category: 'special-controlled', quantity: remoteTx.quantity }]
          },
          ...prev
        ]);

        toastText = `บันทึกรายการทั้งสองเครื่องเรียบร้อย ยอดคงคลังปรับลดเหลือ ${nextStock}`;
      } 
      else if (resolution === 'use_remote') {
        nextStock = Math.max(0, expectedStock - remoteTx.quantity);
        
        setTransactions(prev => [
          {
            ...remoteTx,
            syncStatus: 'Synced',
            items: [{ drugId, name: drugName, category: 'special-controlled', quantity: remoteTx.quantity }]
          },
          ...prev
        ]);

        toastText = `ยอมรับข้อมูลจากเครื่องอื่น เรียบร้อย`;
      } 
      else if (resolution === 'override_server') {
        nextStock = Math.max(0, expectedStock - localTx.quantity);
        
        setTransactions(prev => [
          {
            ...localTx,
            syncStatus: 'Synced',
            items: [{ drugId, name: drugName, category: 'special-controlled', quantity: localTx.quantity }]
          },
          ...prev
        ]);

        toastText = `ข้อมูลสต็อกของเครื่องนี้ถูกเขียนทับไปยังระบบส่วนกลางเรียบร้อย`;
      }

      setDrugs(prev => prev.map(d => {
        if (d.id === drugId) {
          return { ...d, stock: nextStock };
        }
        return d;
      }));

      setSyncState('Synced');
      setLastSyncedTime(new Date().toLocaleTimeString('th-TH'));
      setConflictDetails(null);

      Swal.fire({
        title: 'แก้ไขความขัดแย้งสำเร็จ',
        text: toastText,
        icon: 'success',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#10b981',
      });
    }, 1000);
  };

  // Admin Stats Timeline Filter
  const [statsPeriod, setStatsPeriod] = useState<'day' | 'month' | 'year'>('month');

  // Interactive hovered vial state for the safe anesthesia drug illustration
  const [hoveredVial, setHoveredVial] = useState<string | null>(null);

  // --- Search Filtering for Drug Requisition ---
  const filteredDrugs = useMemo(() => {
    return drugs.filter(drug => {
      // If search query is non-empty, check if it matches name or category.
      // Instructions mention: "พิมพ์อักษร 3 ตัวแรกของชื่อยา" 
      // We will search dynamically as they type, highlighting when text length >= 3
      const matchesSearch = searchQuery.length > 0 
        ? drug.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true;

      const matchesCategory = selectedCategory === 'all' 
        ? true 
        : drug.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [drugs, searchQuery, selectedCategory]);

  // Handle Passcode Unlock
  const handleUnlockAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasscode === '6817') {
      setIsAdminAuthenticated(true);
      setPasscodeError('');
      setAdminPasscode('');
    } else {
      setPasscodeError('รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
    }
  };

  // Handle Clear All Data (Reset state) - satisfies the 'Clear' command requirement
  const handleClearAllData = () => {
    Swal.fire({
      title: 'ต้องการล้างประวัติข้อมูลทั้งหมดจริงหรือไม่?',
      text: 'ข้อมูลธุรกรรมทั้งหมดและประวัติสะสมจะถูกล้างอย่างสมบูรณ์ และสต็อกยาจะถูกรีเซ็ตกลับเป็นค่าเริ่มต้น',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ใช่, ฉันต้องการล้างข้อมูล (Clear)',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#4b5563',
    }).then(async (result) => {
      if (result.isConfirmed) {
        // Reset in Firestore
        try {
          const batch = writeBatch(db);
          // Delete all current drugs and reset to DEFAULT_DRUGS
          drugs.forEach((d) => {
            batch.delete(doc(db, 'drugs', d.id));
          });
          DEFAULT_DRUGS.forEach((d) => {
            batch.set(doc(db, 'drugs', d.id), d);
          });
          // Delete all current transactions
          transactions.forEach((tx) => {
            batch.delete(doc(db, 'transactions', tx.id));
          });
          await batch.commit();
        } catch (fError) {
          console.error("Firestore Reset Error:", fError);
        }

        // Reset drugs back to DEFAULT_DRUGS
        setDrugs(DEFAULT_DRUGS);
        localStorage.setItem('supply_anesth_drugs', JSON.stringify(DEFAULT_DRUGS));

        // Clear all transaction history
        setTransactions([]);
        localStorage.setItem('supply_anesth_transactions', JSON.stringify([]));

        // Reset empty ampoules accumulator
        const reseted: Record<string, number> = {};
        SPECIAL_CONTROLLED_DRUGS_LIST.forEach(name => {
          reseted[name] = 0;
        });
        setEmptyAmpsAccumulator(reseted);
        localStorage.setItem('supply_anesth_empty_amps', JSON.stringify(reseted));

        Swal.fire({
          title: 'ล้างข้อมูลสำเร็จ (Cleared)',
          text: 'ข้อมูลทั้งหมดในระบบถูกรีเซ็ตและล้างค่าเรียบร้อยแล้ว',
          icon: 'success',
          confirmButtonColor: '#10b981',
        });
      }
    });
  };

  // Add drug to current requisition list
  const addMedication = (drugId: string) => {
    setSelectedMedications(prev => {
      if (prev[drugId]) return prev;
      return { ...prev, [drugId]: 1 };
    });
  };

  // Update quantity in list
  const updateMedicationQty = (drugId: string, delta: number) => {
    const drug = drugs.find(d => d.id === drugId);
    if (!drug) return;

    setSelectedMedications(prev => {
      const currentQty = prev[drugId] || 0;
      const newQty = Math.max(1, currentQty + delta);
      
      // If Requisitioning (เบิก), cap at current stock
      if (txType === 'เบิก' && newQty > drug.stock) {
        alert(`ไม่สามารถเบิกเกินจำนวนคงคลังได้ (คงเหลือในคลัง ${drug.stock} ${drug.unit})`);
        return prev;
      }
      
      return { ...prev, [drugId]: newQty };
    });
  };

  // Remove medication from list
  const removeMedication = (drugId: string) => {
    setSelectedMedications(prev => {
      const copy = { ...prev };
      delete copy[drugId];
      return copy;
    });
  };

  // Reset form
  const resetForm = () => {
    setOrRoom('');
    setPatientHN('');
    setBlockBox(txType === 'เบิก' ? 'ไม่เบิก' : 'ไม่ได้เบิก');
    setExtraBox(txType === 'เบิก' ? 'ไม่เบิก' : 'ไม่ได้เบิก');
    setColdOrRoomTempBox(txType === 'เบิก' ? 'ไม่เบิก' : 'ไม่ได้เบิก');
    setNotes('');
    setSelectedMedications({});
    setSearchQuery('');
    
    const initial: Record<string, { 
      selected: boolean; 
      useMode: 'full' | 'partial'; 
      ampsCount: number;
      actualUsed: string; 
      wastage: string; 
      quantity: string; 
      unit: string; 
    }> = {};
    SPECIAL_CONTROLLED_DRUGS_LIST.forEach(name => {
      initial[name] = { selected: false, useMode: 'full', ampsCount: 1, actualUsed: '', wastage: '', quantity: '', unit: 'amp' };
    });
    setSpecialControlledSelections(initial);

    // Reset multi-case state
    setControlledCases([
      {
        id: `case-${Date.now()}`,
        orRoom: '',
        patientHN: '',
        drugs: [
          {
            id: `drug-${Date.now()}-0`,
            drugName: 'Morphine',
            useMode: 'full',
            ampsCount: 1,
            actualUsed: '',
            wastage: ''
          }
        ]
      }
    ]);
  };

  const handleAddControlledCase = () => {
    const lastCase = controlledCases[controlledCases.length - 1];
    const lastDrugName = lastCase && lastCase.drugs && lastCase.drugs.length > 0 
      ? lastCase.drugs[lastCase.drugs.length - 1].drugName 
      : 'Morphine';
    
    const newCaseId = `case-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    setControlledCases(prev => [
      ...prev,
      {
        id: newCaseId,
        orRoom: lastCase ? lastCase.orRoom : '',
        patientHN: '',
        drugs: [
          {
            id: `drug-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            drugName: lastDrugName,
            useMode: 'full',
            ampsCount: 1,
            actualUsed: '',
            wastage: ''
          }
        ]
      }
    ]);

    // Smooth scroll and focus on the new card once rendered
    setTimeout(() => {
      const cardEl = document.getElementById(`case-card-${newCaseId}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Delay slightly to allow scroll animation to start before focus pop
        setTimeout(() => {
          const hnInput = document.getElementById(`patient-hn-input-${newCaseId}`);
          if (hnInput) {
            hnInput.focus();
          }
        }, 350);
      }
    }, 100);
  };

  const handleCompleteAndAddNextCase = (caseId: string) => {
    const matchedCase = controlledCases.find(c => c.id === caseId);
    if (!matchedCase) return;

    if (!matchedCase.orRoom) {
      Swal.fire({
        title: 'กรุณาเลือกห้องผ่าตัด',
        text: 'กรุณาเลือกห้อง OR / แผนกวิสัญญี ก่อนบันทึกเข้าสู่เคสถัดไป',
        icon: 'warning',
        confirmButtonText: 'เข้าใจแล้ว',
        confirmButtonColor: '#8b5cf6' // purple-600
      });
      return;
    }

    if (!matchedCase.patientHN.trim()) {
      Swal.fire({
        title: 'กรุณากรอกข้อมูลผู้ป่วย',
        text: 'กรุณาระบุหมายเลข HN หรือชื่อผู้ป่วย ก่อนบันทึกเข้าสู่เคสถัดไป',
        icon: 'warning',
        confirmButtonText: 'เข้าใจแล้ว',
        confirmButtonColor: '#8b5cf6'
      });
      return;
    }

    // Check partial usage
    let drugError = false;
    matchedCase.drugs.forEach(d => {
      if (d.useMode === 'partial' && (!d.actualUsed.trim() || !d.wastage.trim())) {
        drugError = true;
      }
    });

    if (drugError) {
      Swal.fire({
        title: 'กรอกข้อมูลยาไม่ครบถ้วน',
        text: 'กรุณาระบุปริมาณยาที่ใช้จริงและเศษยาทิ้งให้ครบถ้วนก่อนบันทึกเข้าสู่เคสถัดไป',
        icon: 'warning',
        confirmButtonText: 'เข้าใจแล้ว',
        confirmButtonColor: '#8b5cf6'
      });
      return;
    }

    // Highlight successful completion
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'เคสเสร็จสมบูรณ์! เพิ่มเคสถัดไปเรียบร้อยแล้ว ➔',
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true,
      background: '#f5f3ff',
      color: '#6d28d9'
    });

    handleAddControlledCase();
  };

  const handleRemoveControlledCase = (id: string) => {
    if (controlledCases.length === 1) {
      Swal.fire({
        title: 'คำเตือน',
        text: 'ต้องมีข้อมูลอย่างน้อย 1 เคสในระบบ',
        icon: 'warning',
        confirmButtonText: 'เข้าใจแล้ว',
        confirmButtonColor: '#f59e0b'
      });
      return;
    }
    setControlledCases(prev => prev.filter(c => c.id !== id));
  };

  const handleUpdateControlledCase = (id: string, fields: Partial<Omit<ControlledCase, 'drugs'>>) => {
    setControlledCases(prev => prev.map(c => {
      if (c.id === id) {
        return { ...c, ...fields };
      }
      return c;
    }));
  };

  const handleAddDrugToCase = (caseId: string) => {
    setControlledCases(prev => prev.map(c => {
      if (c.id === caseId) {
        const existingDrugs = c.drugs.map(d => d.drugName);
        const availableDrug = SPECIAL_CONTROLLED_DRUGS_LIST.find(name => !existingDrugs.includes(name)) || 'Morphine';
        
        return {
          ...c,
          drugs: [
            ...c.drugs,
            {
              id: `drug-${Date.now()}-${Math.random()}`,
              drugName: availableDrug,
              useMode: 'full',
              ampsCount: 1,
              actualUsed: '',
              wastage: ''
            }
          ]
        };
      }
      return c;
    }));
  };

  const handleRemoveDrugFromCase = (caseId: string, drugId: string) => {
    setControlledCases(prev => prev.map(c => {
      if (c.id === caseId) {
        if (c.drugs.length === 1) {
          Swal.fire({
            title: 'คำเตือน',
            text: 'แต่ละเคสต้องมีตัวยาอย่างน้อย 1 รายการ',
            icon: 'warning',
            confirmButtonText: 'เข้าใจแล้ว',
            confirmButtonColor: '#f59e0b'
          });
          return c;
        }
        return {
          ...c,
          drugs: c.drugs.filter(d => d.id !== drugId)
        };
      }
      return c;
    }));
  };

  const handleUpdateDrugInCase = (caseId: string, drugId: string, fields: Partial<Omit<CaseDrug, 'id'>>) => {
    setControlledCases(prev => prev.map(c => {
      if (c.id === caseId) {
        return {
          ...c,
          drugs: c.drugs.map(d => {
            if (d.id === drugId) {
              return { ...d, ...fields };
            }
            return d;
          })
        };
      }
      return c;
    }));
  };

  // --- Submit Requisition Form ---
  const handleSubmitRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Validations
    const missingFields: string[] = [];
    if (!orRoom) {
      missingFields.push('ห้อง OR');
    }
    if (!patientHN.trim()) {
      missingFields.push('ชื่อ-นามสกุล หรือ HN ผู้ป่วย');
    }
    if (!requesterName.trim()) {
      missingFields.push(txType === 'เบิก' ? 'ชื่อผู้เบิกยา' : 'ชื่อผู้ส่งคืนยา');
    }

    if (missingFields.length > 0) {
      setSaveSuccess(false);
      setSubmitError(`กรุณากรอกข้อมูลให้ครบถ้วน ขาดข้อมูลในช่อง: ${missingFields.join(', ')}`);
      return;
    }

    const selectedKeys = Object.keys(selectedMedications);
    const hasBoxAction = txType === 'เบิก'
      ? (blockBox === 'เบิก' || extraBox === 'เบิก' || coldOrRoomTempBox === 'เบิก')
      : (blockBox === 'คืน' || extraBox === 'คืน' || coldOrRoomTempBox === 'คืน');

    if (selectedKeys.length === 0 && !hasBoxAction) {
      setSaveSuccess(false);
      setSubmitError(txType === 'เบิก' 
        ? 'กรุณาเลือกรายการยา หรือ รายการเบิกกล่องยา อย่างน้อย 1 รายการ' 
        : 'กรุณาเลือกรายการยา หรือ รายการคืนกล่องยา อย่างน้อย 1 รายการ');
      return;
    }

    // Build items payload
    const itemsPayload: TransactionItem[] = selectedKeys.map(drugId => {
      const d = drugs.find(item => item.id === drugId)!;
      return {
        drugId,
        name: d.name,
        category: d.category,
        quantity: selectedMedications[drugId]
      };
    });

    // Create Transaction Record
    const newTx: Transaction = {
      id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      timestamp: new Date().toISOString(),
      type: txType,
      orRoom,
      patientHN: patientHN.trim(),
      requesterName: requesterName.trim(),
      blockBox,
      extraBox,
      coldBox: txType === 'เบิก'
        ? (coldOrRoomTempBox === 'เบิก' ? 'เบิก' : 'ไม่เบิก')
        : (coldOrRoomTempBox === 'คืน' ? 'เบิก' : 'ไม่เบิก'),
      roomTempBox: txType === 'เบิก'
        ? (coldOrRoomTempBox === 'เบิก' ? 'เบิก' : 'ไม่เบิก')
        : (coldOrRoomTempBox === 'คืน' ? 'เบิก' : 'ไม่เบิก'),
      coldOrRoomTempBox,
      notes: notes.trim(),
      items: itemsPayload,
      specialControlledDrugs: [],
      deviceName: deviceName,
      syncStatus: 'Synced'
    };

    setIsSubmitting(true);
    setSubmitError('');
    setSaveSuccess(false);

    try {
      // 1. Log or Dispatch to external App Script URL via fetch POST to avoid CORS/Cross-Origin blocks.
      const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbwUXtLCxArvkspF0jytL3LVcIkhBftmY2NJKXW_-h9IOYK9wqY8k6JOpWN6RmuQZGTDQw/exec';
      const currentTimestamp = new Date().toLocaleString('th-TH');
      
      const getShiftName = (): string => {
        const hours = new Date().getHours();
        if (hours >= 8 && hours < 16) return 'เวรเช้า (08:00 - 16:00)';
        if (hours >= 16 && hours < 24) return 'เวรบ่าย (16:00 - 24:00)';
        return 'เวรดึก (00:00 - 08:00)';
      };

      const rows: Record<string, any>[] = [];

      if (txType === 'เบิก') {
        if (newTx.items && newTx.items.length > 0) {
          newTx.items.forEach(item => {
            rows.push({
              'Timestamp': currentTimestamp,
              'DrugName': item.name,
              'HN': newTx.patientHN.split('/')[1]?.trim() || newTx.patientHN.trim(),
              'PatientName': newTx.patientHN.split('/')[0]?.trim() || newTx.patientHN.trim(),
              'UsedAmount': item.quantity,
              'WastageAmount': 0,
              'NurseName': newTx.requesterName,
              'WitnessName': newTx.notes || '-',
              'orRoom': newTx.orRoom,
              'blockBox': newTx.blockBox,
              'extraBox': newTx.extraBox,
              'coldOrRoomTempBox': newTx.coldOrRoomTempBox,
              'deviceName': newTx.deviceName
            });
          });
        } else {
          // If only boxes are checked
          rows.push({
            'Timestamp': currentTimestamp,
            'DrugName': `เบิกเฉพาะกล่องยา (${[
              newTx.blockBox !== 'ไม่เบิก' ? 'กล่องบล็อคหลัง' : '',
              newTx.extraBox !== 'ไม่เบิก' ? 'กล่องยาเสริม' : '',
              newTx.coldOrRoomTempBox !== 'ไม่เบิก' ? 'กล่องยาเย็น/อุณหภูมิห้อง' : ''
            ].filter(Boolean).join(', ') || 'ไม่มี'})`,
            'HN': newTx.patientHN.split('/')[1]?.trim() || newTx.patientHN.trim(),
            'PatientName': newTx.patientHN.split('/')[0]?.trim() || newTx.patientHN.trim(),
            'UsedAmount': 1,
            'WastageAmount': 0,
            'NurseName': newTx.requesterName,
            'WitnessName': newTx.notes || '-',
            'orRoom': newTx.orRoom,
            'blockBox': newTx.blockBox,
            'extraBox': newTx.extraBox,
            'coldOrRoomTempBox': newTx.coldOrRoomTempBox,
            'deviceName': newTx.deviceName
          });
        }
      } else {
        // Return Mode ('คืน')
        if (newTx.items && newTx.items.length > 0) {
          newTx.items.forEach(item => {
            const drugItem = drugs.find(d => d.id === item.drugId);
            const expectedStock = drugItem ? drugItem.stock : 0;
            const physicalStock = expectedStock + item.quantity;
            
            rows.push({
              'Timestamp': currentTimestamp,
              'DrugName': item.name,
              'ShiftName': getShiftName(),
              'ExpectedStock': expectedStock,
              'PhysicalStock': physicalStock,
              'AmpouleCount': item.quantity,
              'Status': 'ส่งคืนสำเร็จ',
              'SenderName': newTx.requesterName,
              'ReceiverName': 'ผู้รับคืน (ห้องยา)',
              'orRoom': newTx.orRoom,
              'blockBox': newTx.blockBox,
              'extraBox': newTx.extraBox,
              'coldOrRoomTempBox': newTx.coldOrRoomTempBox,
              'notes': newTx.notes || '-',
              'deviceName': newTx.deviceName
            });
          });
        } else {
          // Only boxes returned
          rows.push({
            'Timestamp': currentTimestamp,
            'DrugName': `คืนเฉพาะกล่องยา (${[
              newTx.blockBox !== 'ไม่ได้เบิก' ? 'กล่องบล็อคหลัง' : '',
              newTx.extraBox !== 'ไม่ได้เบิก' ? 'กล่องยาเสริม' : '',
              newTx.coldOrRoomTempBox !== 'ไม่ได้เบิก' ? 'กล่องยาเย็น/อุณหภูมิห้อง' : ''
            ].filter(Boolean).join(', ') || 'ไม่มี'})`,
            'ShiftName': getShiftName(),
            'ExpectedStock': '-',
            'PhysicalStock': '-',
            'AmpouleCount': 0,
            'Status': 'ส่งคืนสำเร็จ',
            'SenderName': newTx.requesterName,
            'ReceiverName': 'ผู้รับคืน (ห้องยา)',
            'orRoom': newTx.orRoom,
            'blockBox': newTx.blockBox,
            'extraBox': newTx.extraBox,
            'coldOrRoomTempBox': newTx.coldOrRoomTempBox,
            'notes': newTx.notes || '-',
            'deviceName': newTx.deviceName
          });
        }
      }

      const payload = {
        sheetId: '12akwFyMHjCb2QUG6HiMsagkwaPT2qpU5-kbQ_Z3OkmY',
        target: txType === 'เบิก' ? 'เบิกยา' : 'คืนยา',
        rows: rows
      };

      // Perform direct POST request
      await sendPOST(appsScriptUrl, payload);

      // Save to Firebase Firestore in real-time
      try {
        const txRef = doc(db, 'transactions', newTx.id);
        await setDoc(txRef, newTx);

        const batch = writeBatch(db);
        Object.keys(selectedMedications).forEach((drugId) => {
          const qty = selectedMedications[drugId];
          if (qty > 0) {
            const drugItem = drugs.find(d => d.id === drugId);
            if (drugItem) {
              const updatedStock = Math.max(0, drugItem.stock + (txType === 'เบิก' ? -qty : qty));
              const drugRef = doc(db, 'drugs', drugId);
              batch.update(drugRef, { stock: updatedStock });
            }
          }
        });
        await batch.commit();
      } catch (fError) {
        console.error("Failed to write to Firestore in real-time:", fError);
      }

      // 2. Process locally: Update stock numbers
      setDrugs(prevDrugs => {
        return prevDrugs.map(drug => {
          const requisitioned = selectedMedications[drug.id] || 0;
          if (requisitioned > 0) {
            const stockDelta = txType === 'เบิก' ? -requisitioned : requisitioned;
            return {
              ...drug,
              stock: Math.max(0, drug.stock + stockDelta)
            };
          }
          return drug;
        });
      });

      // 3. Append Transaction to state
      setTransactions(prevTxs => {
        const combined = [newTx, ...prevTxs];
        return Array.from(new Map(combined.map(t => [t.id, t])).values());
      });
      setSelfAddedTxId(newTx.id);
      setHighlightedTxIds(prev => {
        const next = new Set(prev);
        next.add(newTx.id);
        return next;
      });
      setTimeout(() => {
        setHighlightedTxIds(prev => {
          const next = new Set(prev);
          next.delete(newTx.id);
          return next;
        });
      }, 4000);
      
      // Set submission flags
      setLastSubmittedTx(newTx);
      setSaveSuccess(true);
      resetForm();

      Swal.fire({
        title: 'บันทึกรายการสำเร็จ',
        text: txType === 'เบิก' ? 'บันทึกรายการเบิกจ่ายยาเรียบร้อยแล้ว' : 'บันทึกรายการส่งคืนยาเรียบร้อยแล้ว',
        icon: 'success',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#10b981', // emerald-600
      });

      // Clear the "บันทึกสำเร็จ" notice after 10 seconds, but keep the statistics
      setTimeout(() => {
        setSaveSuccess(false);
      }, 10000);

    } catch (err: any) {
      console.error('Error saving to Google Sheets:', err);

      // Save to Firebase Firestore as fallback
      try {
        const txRef = doc(db, 'transactions', newTx.id);
        await setDoc(txRef, newTx);

        const batch = writeBatch(db);
        Object.keys(selectedMedications).forEach((drugId) => {
          const qty = selectedMedications[drugId];
          if (qty > 0) {
            const drugItem = drugs.find(d => d.id === drugId);
            if (drugItem) {
              const updatedStock = Math.max(0, drugItem.stock + (txType === 'เบิก' ? -qty : qty));
              const drugRef = doc(db, 'drugs', drugId);
              batch.update(drugRef, { stock: updatedStock });
            }
          }
        });
        await batch.commit();
      } catch (fError) {
        console.error("Failed to write to Firestore as fallback:", fError);
      }

      // Even if network fails in the preview runtime, we will save locally so it works beautifully in-app!
      setDrugs(prevDrugs => {
        return prevDrugs.map(drug => {
          const requisitioned = selectedMedications[drug.id] || 0;
          if (requisitioned > 0) {
            const stockDelta = txType === 'เบิก' ? -requisitioned : requisitioned;
            return {
              ...drug,
              stock: Math.max(0, drug.stock + stockDelta)
            };
          }
          return drug;
        });
      });
      setTransactions(prevTxs => {
        const combined = [newTx, ...prevTxs];
        return Array.from(new Map(combined.map(t => [t.id, t])).values());
      });
      setSelfAddedTxId(newTx.id);
      setHighlightedTxIds(prev => {
        const next = new Set(prev);
        next.add(newTx.id);
        return next;
      });
      setTimeout(() => {
        setHighlightedTxIds(prev => {
          const next = new Set(prev);
          next.delete(newTx.id);
          return next;
        });
      }, 4000);
      setLastSubmittedTx(newTx);
      setSaveSuccess(true);
      resetForm();

      Swal.fire({
        title: 'บันทึกรายการสำเร็จ',
        text: txType === 'เบิก' ? 'บันทึกรายการเบิกจ่ายยาเรียบร้อยแล้ว' : 'บันทึกรายการส่งคืนยาเรียบร้อยแล้ว',
        icon: 'success',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#10b981',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Submit Contact Form (Pastel Theme Requirement) ---
  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
      Swal.fire({
        title: 'ข้อมูลไม่ครบถ้วน',
        text: 'กรุณากรอกข้อมูลในช่องที่มีเครื่องหมาย * ให้ครบทุกช่องค่ะ',
        icon: 'warning',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#f43f5e',
      });
      return;
    }

    try {
      // Try saving to firebase firestore for durable cloud persistence
      try {
        const feedbackRef = doc(collection(db, 'feedbacks_controlled'));
        await setDoc(feedbackRef, {
          id: feedbackRef.id,
          name: contactName,
          email: contactEmail,
          role: contactRole,
          message: contactMessage,
          createdAt: new Date().toISOString()
        });
      } catch (fbError) {
        console.warn('Could not persist feedback to cloud database, saving locally:', fbError);
      }

      // Show beautiful success popup
      Swal.fire({
        title: 'ส่งข้อความสำเร็จ! ✨',
        html: `
          <div class="space-y-2 text-slate-700 text-sm">
            <p>ขอบคุณคุณ <b>${contactName}</b> สำหรับข้อเสนอแนะค่ะ</p>
            <p>ระบบได้รับความคิดเห็นของคุณเรียบร้อยแล้ว ทีมงานวิสัญญีจะนำไปพัฒนาให้ดียิ่งขึ้นไปอีก!</p>
          </div>
        `,
        icon: 'success',
        confirmButtonText: 'รับทราบ',
        confirmButtonColor: '#ec4899', // Pretty Pastel Pinkish Red
      });

      // Reset contact states
      setContactName('');
      setContactEmail('');
      setContactRole('');
      setContactMessage('');
    } catch (err) {
      console.error(err);
    }
  };

  // --- Submit Special Controlled Drugs Form ---
  const handleSubmitSpecialControlled = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // 1. General Validations
    if (!requesterName.trim()) {
      setSaveSuccess(false);
      setSubmitError('กรุณาระบุชื่อผู้บันทึกข้อมูลการใช้ยา');
      Swal.fire({
        title: 'คำเตือน',
        text: 'กรุณาระบุชื่อผู้บันทึกข้อมูลการใช้ยา',
        icon: 'warning',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#f59e0b'
      });
      return;
    }

    // 2. Validate each patient case row & their drugs
    const selectionErrors: string[] = [];
    const rows: Record<string, any>[] = [];
    const localTxEntries: Transaction[] = [];

    controlledCases.forEach((c, idx) => {
      const caseNum = idx + 1;
      if (!c.orRoom) {
        selectionErrors.push(`เคสที่ ${caseNum}: กรุณาเลือกห้อง OR / แผนก`);
      }
      if (!c.patientHN.trim()) {
        selectionErrors.push(`เคสที่ ${caseNum}: กรุณาระบุชื่อ-นามสกุล หรือ HN ผู้ป่วย`);
      }

      c.drugs.forEach((drug, dIdx) => {
        const drugNum = dIdx + 1;
        const meta = SPECIAL_DRUGS_METADATA[drug.drugName] || { type: 'Amp', capacity: 10, unit: 'mg', display: drug.drugName };
        const numAmps = drug.ampsCount || 1;
        const expectedTotalCapacity = numAmps * meta.capacity;

        let usedVal = 0;
        let wasteVal = 0;

        if (drug.useMode === 'full') {
          usedVal = expectedTotalCapacity;
          wasteVal = 0;
        } else {
          const usedStr = drug.actualUsed.trim();
          const wasteStr = drug.wastage.trim();

          if (!usedStr || !wasteStr) {
            selectionErrors.push(`เคสที่ ${caseNum} ยาตัวที่ ${drugNum} (${meta.display}): กรุณากรอกทั้งปริมาณใช้จริงและยาทิ้ง (Wastage)`);
            return;
          }

          usedVal = parseFloat(usedStr) || 0;
          wasteVal = parseFloat(wasteStr) || 0;
          const totalVal = usedVal + wasteVal;

          if (drug.drugName !== 'Ketamine' && Math.abs(totalVal - expectedTotalCapacity) > 0.0001) {
            selectionErrors.push(`เคสที่ ${caseNum} ยาตัวที่ ${drugNum} (${meta.display}): ปริมาณใช้จริง (${usedVal}) + ยาทิ้ง (${wasteVal}) = ${totalVal} ${meta.unit} แต่ต้องเท่ากับปริมาณที่เปิดใช้ ${expectedTotalCapacity} ${meta.unit} (เปิด ${numAmps} ${meta.type === 'Amp' ? 'แอมป์' : 'ขวด'})`);
            return;
          }
        }

        // Append transaction list and sheets row
        const txItem = {
          name: drug.drugName,
          quantity: usedVal,
          unit: drug.useMode === 'full'
            ? `${meta.unit} (ใช้เต็ม ${numAmps} ${meta.type === 'Amp' ? 'แอมป์' : 'ขวด'})`
            : `${meta.unit} (เปิด ${numAmps} ${meta.type === 'Amp' ? 'แอมป์' : 'ขวด'}, ทิ้ง ${wasteVal} ${meta.unit})`
        };

        const newTx: Transaction = {
          id: `tx-${Date.now()}-${idx}-${dIdx}-${Math.random()}`,
          timestamp: new Date().toISOString(),
          type: 'เบิก',
          orRoom: c.orRoom,
          patientHN: c.patientHN.trim(),
          requesterName: requesterName.trim(),
          blockBox: 'ไม่เบิก',
          extraBox: 'ไม่เบิก',
          coldBox: 'ไม่เบิก',
          roomTempBox: 'ไม่เบิก',
          coldOrRoomTempBox: 'ไม่เบิก',
          notes: notes.trim() ? `[ยาควบคุมพิเศษ] ${notes.trim()}` : '[ยาควบคุมพิเศษ]',
          items: [],
          specialControlledDrugs: [txItem],
          deviceName: deviceName,
          syncStatus: 'Synced'
        };

        localTxEntries.push(newTx);

        const currentTimestamp = new Date().toLocaleString('th-TH');
        rows.push({
          'Timestamp': currentTimestamp,
          'DrugName': drug.drugName,
          'ReturnQty': `${numAmps} ${meta.type === 'Amp' ? 'แอมป์' : 'ขวด'} (ใช้จริง: ${usedVal} ${meta.unit} / ทิ้ง: ${wasteVal} ${meta.unit})`,
          'ReturnedBy': requesterName.trim(),
          'ReceivedByRoomยา': 'ผู้ตรวจสอบ (ห้องยา)',
          'orRoom': c.orRoom,
          'patientHN': c.patientHN.trim(),
          'OpenedAmps': numAmps,
          'ActualUsed': usedVal,
          'Wastage': wasteVal,
          'UseMode': drug.useMode === 'full' ? 'เต็มแอมป์/เต็มขวด' : 'ใช้บางส่วน',
          'notes': notes.trim() ? `[ยาควบคุมพิเศษ] ${notes.trim()}` : '[ยาควบคุมพิเศษ]',
          'deviceName': newTx.deviceName
        });
      });
    });

    if (selectionErrors.length > 0) {
      setSaveSuccess(false);
      setSubmitError(`กรุณาตรวจสอบข้อมูลและแก้ไขข้อผิดพลาดดังนี้:\n\n• ${selectionErrors.join('\n• ')}`);
      Swal.fire({
        title: 'ข้อมูลไม่ถูกต้อง',
        text: 'กรุณาตรวจสอบรายละเอียดที่แจ้งเตือนในแบบฟอร์ม',
        icon: 'error',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#ef4444'
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setSaveSuccess(false);

    try {
      const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbwUXtLCxArvkspF0jytL3LVcIkhBftmY2NJKXW_-h9IOYK9wqY8k6JOpWN6RmuQZGTDQw/exec';

      const payload = {
        sheetId: '12akwFyMHjCb2QUG6HiMsagkwaPT2qpU5-kbQ_Z3OkmY',
        target: 'ยาควบคุมพิเศษ',
        rows: rows
      };

      // Perform direct POST request
      await sendPOST(appsScriptUrl, payload);

      // Save special controlled transactions and update drug stocks in Firestore
      try {
        const batch = writeBatch(db);
        localTxEntries.forEach((tx) => {
          const txRef = doc(db, 'transactions', tx.id);
          batch.set(txRef, tx);
        });

        drugs.forEach((drug) => {
          let totalAmpsUsed = 0;
          controlledCases.forEach(c => {
            c.drugs.forEach(d => {
              if (mapSpecialDrugToCabinetDrugId(d.drugName) === drug.id) {
                totalAmpsUsed += d.ampsCount;
              }
            });
          });
          if (totalAmpsUsed > 0) {
            const drugRef = doc(db, 'drugs', drug.id);
            batch.update(drugRef, { stock: Math.max(0, drug.stock - totalAmpsUsed) });
          }
        });

        await batch.commit();
      } catch (fError) {
        console.error("Failed to write controlled transactions to Firestore:", fError);
      }

      // Decrement stock based on ampsCount
      setDrugs(prevDrugs => {
        return prevDrugs.map(drug => {
          let totalAmpsUsed = 0;
          controlledCases.forEach(c => {
            c.drugs.forEach(d => {
              if (mapSpecialDrugToCabinetDrugId(d.drugName) === drug.id) {
                totalAmpsUsed += d.ampsCount;
              }
            });
          });

          if (totalAmpsUsed > 0) {
            return {
              ...drug,
              stock: Math.max(0, drug.stock - totalAmpsUsed)
            };
          }
          return drug;
        });
      });

      // Accumulate empty ampoules
      setEmptyAmpsAccumulator(prev => {
        const updated = { ...prev };
        controlledCases.forEach(c => {
          c.drugs.forEach(d => {
            updated[d.drugName] = (updated[d.drugName] || 0) + d.ampsCount;
          });
        });
        return updated;
      });

      // Process locally: append to transaction feed
      setTransactions(prevTxs => {
        const combined = [...localTxEntries, ...prevTxs];
        return Array.from(new Map(combined.map(t => [t.id, t])).values());
      });
      if (localTxEntries.length > 0) {
        setLastSubmittedTx(localTxEntries[0]);
        setSelfAddedTxId(localTxEntries[0].id);
        const newIds = localTxEntries.map(tx => tx.id);
        setHighlightedTxIds(prev => {
          const next = new Set(prev);
          newIds.forEach(id => next.add(id));
          return next;
        });
        setTimeout(() => {
          setHighlightedTxIds(prev => {
            const next = new Set(prev);
            newIds.forEach(id => next.delete(id));
            return next;
          });
        }, 4000);
      }
      setSaveSuccess(true);
      resetForm();

      Swal.fire({
        title: 'บันทึกรายการสำเร็จ',
        text: `บันทึกรายงานการใช้ยาควบคุมพิเศษรวม ${controlledCases.length} เคสเรียบร้อยแล้ว`,
        icon: 'success',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#10b981', // emerald-600
      });

      setTimeout(() => {
        setSaveSuccess(false);
      }, 10000);

    } catch (err: any) {
      console.error('Error saving controlled drugs to Google Sheets:', err);
      
      // Save special controlled transactions and update drug stocks in Firestore as fallback
      try {
        const batch = writeBatch(db);
        localTxEntries.forEach((tx) => {
          const txRef = doc(db, 'transactions', tx.id);
          batch.set(txRef, tx);
        });

        drugs.forEach((drug) => {
          let totalAmpsUsed = 0;
          controlledCases.forEach(c => {
            c.drugs.forEach(d => {
              if (mapSpecialDrugToCabinetDrugId(d.drugName) === drug.id) {
                totalAmpsUsed += d.ampsCount;
              }
            });
          });
          if (totalAmpsUsed > 0) {
            const drugRef = doc(db, 'drugs', drug.id);
            batch.update(drugRef, { stock: Math.max(0, drug.stock - totalAmpsUsed) });
          }
        });

        await batch.commit();
      } catch (fError) {
        console.error("Failed to write controlled transactions to Firestore in fallback:", fError);
      }
      
      // Fallback local save if network is offline
      setDrugs(prevDrugs => {
        return prevDrugs.map(drug => {
          let totalAmpsUsed = 0;
          controlledCases.forEach(c => {
            c.drugs.forEach(d => {
              if (mapSpecialDrugToCabinetDrugId(d.drugName) === drug.id) {
                totalAmpsUsed += d.ampsCount;
              }
            });
          });

          if (totalAmpsUsed > 0) {
            return {
              ...drug,
              stock: Math.max(0, drug.stock - totalAmpsUsed)
            };
          }
          return drug;
        });
      });

      setEmptyAmpsAccumulator(prev => {
        const updated = { ...prev };
        controlledCases.forEach(c => {
          c.drugs.forEach(d => {
            updated[d.drugName] = (updated[d.drugName] || 0) + d.ampsCount;
          });
        });
        return updated;
      });

      setTransactions(prevTxs => {
        const combined = [...localTxEntries, ...prevTxs];
        return Array.from(new Map(combined.map(t => [t.id, t])).values());
      });
      if (localTxEntries.length > 0) {
        setLastSubmittedTx(localTxEntries[0]);
        setSelfAddedTxId(localTxEntries[0].id);
        const newIds = localTxEntries.map(tx => tx.id);
        setHighlightedTxIds(prev => {
          const next = new Set(prev);
          newIds.forEach(id => next.add(id));
          return next;
        });
        setTimeout(() => {
          setHighlightedTxIds(prev => {
            const next = new Set(prev);
            newIds.forEach(id => next.delete(id));
            return next;
          });
        }, 4000);
      }
      setSaveSuccess(true);
      resetForm();

      Swal.fire({
        title: 'บันทึกรายการสำเร็จ (Local)',
        text: `บันทึกรายงานการใช้ยาควบคุมพิเศษรวม ${controlledCases.length} เคสเรียบร้อยแล้ว`,
        icon: 'success',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#10b981',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Admin Stock Actions ---
  const handleAddNewDrug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDrugName.trim()) {
      Swal.fire({
        title: 'คำเตือน!',
        text: 'กรุณาระบุชื่อยา',
        icon: 'warning',
        confirmButtonColor: '#10b981'
      });
      return;
    }

    const newDrug: Drug = {
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      name: newDrugName.trim(),
      category: newDrugCategory,
      stock: newDrugStock,
      unit: newDrugUnit.trim() || 'amp'
    };

    try {
      await setDoc(doc(db, 'drugs', newDrug.id), newDrug);
    } catch (fError) {
      console.error("Firestore Add Drug Error:", fError);
      setDrugs(prev => [...prev, newDrug]); // offline fallback
    }
    setNewDrugName('');
    setNewDrugStock(50);
    setNewDrugUnit('amp');

    Swal.fire({
      title: 'เพิ่มรายการยาสำเร็จ!',
      text: `เพิ่มยา "${newDrug.name}" เข้าสู่ระบบเรียบร้อยแล้ว`,
      icon: 'success',
      confirmButtonColor: '#10b981',
      timer: 1500
    });
  };

  const handleDeleteDrug = async (id: string) => {
    const targetDrug = drugs.find(d => d.id === id);
    if (!targetDrug) return;

    Swal.fire({
      title: 'คุณแน่ใจหรือไม่ที่จะลบรายการยานี้?',
      text: `ต้องการลบยา "${targetDrug.name}" ออกจากระบบถาวรหรือไม่?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ใช่, ฉันต้องการลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#4b5563',
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await deleteDoc(doc(db, 'drugs', id));
        } catch (fError) {
          console.error("Firestore Delete Drug Error:", fError);
          setDrugs(prev => prev.filter(drug => drug.id !== id)); // offline fallback
        }
        
        // Auto-refresh: remove from selected medications queue
        setSelectedMedications(prev => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });

        // Clear active editing/adjusting IDs if deleted
        setStockEditId(prev => prev === id ? null : prev);
        setEditingDrugId(prev => prev === id ? null : prev);
        
        Swal.fire({
          title: 'ลบรายการยาสำเร็จ!',
          text: `ลบ "${targetDrug.name}" ออกจากระบบเรียบร้อยแล้ว`,
          icon: 'success',
          confirmButtonColor: '#10b981',
          timer: 1500
        });
      }
    });
  };

  const handleStartEditDrug = (drug: Drug) => {
    setEditingDrugId(drug.id);
    setEditingDrugName(drug.name);
    setEditingDrugCategory(drug.category);
    setEditingDrugStock(drug.stock);
    setEditingDrugUnit(drug.unit);
  };

  const handleSaveDrugEdit = async () => {
    if (!editingDrugName.trim()) {
      Swal.fire({
        title: 'คำเตือน!',
        text: 'กรุณากรอกชื่อรายการยา',
        icon: 'warning',
        confirmButtonColor: '#10b981'
      });
      return;
    }
    
    const updatedDrug: Drug = {
      id: editingDrugId || '',
      name: editingDrugName.trim(),
      category: editingDrugCategory,
      stock: editingDrugStock,
      unit: editingDrugUnit.trim() || 'amp'
    };

    if (editingDrugId) {
      try {
        await setDoc(doc(db, 'drugs', editingDrugId), updatedDrug);
      } catch (fError) {
        console.error("Firestore Edit Drug Error:", fError);
        setDrugs(prev => prev.map(drug => drug.id === editingDrugId ? updatedDrug : drug)); // offline fallback
      }
    }
    
    setEditingDrugId(null);

    Swal.fire({
      title: 'แก้ไขสำเร็จ!',
      text: 'ปรับปรุงข้อมูลรายการยาในระบบเรียบร้อยแล้ว',
      icon: 'success',
      confirmButtonColor: '#10b981',
      timer: 1500
    });
  };

  const handleCancelDrugEdit = () => {
    setEditingDrugId(null);
  };

  const handleStartEditStock = (id: string, currentVal: number) => {
    setStockEditId(id);
    setStockEditVal(currentVal);
  };

  const handleSaveStockEdit = async (id: string) => {
    try {
      await updateDoc(doc(db, 'drugs', id), { stock: stockEditVal });
    } catch (fError) {
      console.error("Firestore Save Stock Error:", fError);
      setDrugs(prev => prev.map(drug => drug.id === id ? { ...drug, stock: stockEditVal } : drug)); // offline fallback
    }
    setStockEditId(null);
  };

  const handleAdjustStock = async (id: string, amount: number) => {
    const targetDrug = drugs.find(d => d.id === id);
    if (targetDrug) {
      const nextStock = Math.max(0, targetDrug.stock + amount);
      try {
        await updateDoc(doc(db, 'drugs', id), { stock: nextStock });
      } catch (fError) {
        console.error("Firestore Adjust Stock Error:", fError);
        setDrugs(prev => prev.map(drug => drug.id === id ? { ...drug, stock: nextStock } : drug)); // offline fallback
      }
    }
  };

  const handleDirectStockChange = async (id: string, value: number) => {
    const nextStock = Math.max(0, value);
    try {
      await updateDoc(doc(db, 'drugs', id), { stock: nextStock });
    } catch (fError) {
      console.error("Firestore Direct Stock Error:", fError);
      setDrugs(prev => prev.map(drug => drug.id === id ? { ...drug, stock: nextStock } : drug)); // offline fallback
    }
  };

  // --- Admin Filtered History ---
  const filteredHistory = useMemo(() => {
    return transactions.filter(tx => {
      const matchesType = historySearchType === 'all' ? true : tx.type === historySearchType;
      const matchesOR = historySearchOR === 'all' ? true : tx.orRoom === historySearchOR;
      const matchesHN = historySearchHN.trim() === '' 
        ? true 
        : tx.patientHN.toLowerCase().includes(historySearchHN.toLowerCase().trim());
      const matchesRequester = historySearchRequester.trim() === '' 
        ? true 
        : tx.requesterName.toLowerCase().includes(historySearchRequester.toLowerCase().trim());
      
      const matchesDrug = historySearchDrug.trim() === ''
        ? true
        : tx.items.some(item => item.name.toLowerCase().includes(historySearchDrug.toLowerCase().trim())) ||
          (tx.specialControlledDrugs || []).some(item => item.name.toLowerCase().includes(historySearchDrug.toLowerCase().trim()));

      const matchesDevice = historySearchDevice.trim() === ''
        ? true
        : (tx.deviceName || 'PC-OR01-ANESTH').toLowerCase().includes(historySearchDevice.toLowerCase().trim());

      const matchesSync = historySearchSync === 'all'
        ? true
        : (tx.syncStatus || 'Synced') === historySearchSync;

      return matchesType && matchesOR && matchesHN && matchesRequester && matchesDrug && matchesDevice && matchesSync;
    });
  }, [transactions, historySearchType, historySearchOR, historySearchHN, historySearchRequester, historySearchDrug, historySearchDevice, historySearchSync]);

  // --- Admin Statistics & Analytics Calculations ---
  const statisticsData = useMemo(() => {
    const now = new Date();
    
    // Filter transactions based on timeline: day, month, year
    const statsTimelineFiltered = transactions.filter(tx => {
      const txDate = new Date(tx.timestamp);
      if (statsPeriod === 'day') {
        return txDate.toDateString() === now.toDateString();
      } else if (statsPeriod === 'month') {
        return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
      } else {
        return txDate.getFullYear() === now.getFullYear();
      }
    });

    let totalRequisitions = 0;
    let totalReturns = 0;
    let blockBoxCount = 0;
    let extraBoxCount = 0;
    let coldOrRoomTempBoxCount = 0;
    let coldBoxCount = 0;
    let roomTempBoxCount = 0;

    // Drug count map
    const drugCountMap: Record<string, { name: string, category: DrugCategory, beg: number, kurn: number, total: number }> = {};

    statsTimelineFiltered.forEach(tx => {
      if (tx.type === 'เบิก') {
        totalRequisitions++;
        if (tx.blockBox === 'เบิก') blockBoxCount++;
        if (tx.extraBox === 'เบิก') extraBoxCount++;
        if (tx.coldOrRoomTempBox === 'เบิก' || tx.coldBox === 'เบิก' || tx.roomTempBox === 'เบิก') coldOrRoomTempBoxCount++;
        if (tx.coldBox === 'เบิก') coldBoxCount++;
        if (tx.roomTempBox === 'เบิก') roomTempBoxCount++;
      } else {
        totalReturns++;
      }

      tx.items.forEach(item => {
        if (!drugCountMap[item.drugId]) {
          drugCountMap[item.drugId] = {
            name: item.name,
            category: item.category,
            beg: 0,
            kurn: 0,
            total: 0
          };
        }
        if (tx.type === 'เบิก') {
          drugCountMap[item.drugId].beg += item.quantity;
        } else {
          drugCountMap[item.drugId].kurn += item.quantity;
        }
        drugCountMap[item.drugId].total += item.quantity;
      });
    });

    const topDrugs = Object.values(drugCountMap).sort((a, b) => b.total - a.total).slice(0, 5);

    // Distribution by category
    const categoryDistribution = {
      'off-list': 0,
      'refrigerated': 0,
      'room-temp': 0,
      'special-controlled': 0,
      'other': 0
    };

    statsTimelineFiltered.forEach(tx => {
      tx.items.forEach(item => {
        categoryDistribution[item.category] += item.quantity;
      });
    });

    // Room demand chart helper
    const roomDemand: Record<string, number> = {};
    statsTimelineFiltered.forEach(tx => {
      roomDemand[tx.orRoom] = (roomDemand[tx.orRoom] || 0) + tx.items.reduce((sum, item) => sum + item.quantity, 0);
    });

    const topRooms = Object.entries(roomDemand)
      .map(([room, qty]) => ({ room, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      totalRequisitions,
      totalReturns,
      blockBoxCount,
      extraBoxCount,
      coldOrRoomTempBoxCount,
      coldBoxCount,
      roomTempBoxCount,
      topDrugs,
      categoryDistribution,
      topRooms,
      totalTransactions: statsTimelineFiltered.length
    };
  }, [transactions, statsPeriod]);

  // --- Dynamic Drug Usage and Stock Accumulator for Main Dashboard ---
  const dynamicAccumulatedStats = useMemo(() => {
    const stats: Record<string, { borrowed: number; returned: number }> = {};
    
    // Initialize stats for each drug in current stock
    drugs.forEach(d => {
      stats[d.id] = { borrowed: 0, returned: 0 };
    });

    // Sum up totals from all transactions
    transactions.forEach(tx => {
      tx.items.forEach(item => {
        const d = drugs.find(g => g.id === item.drugId || g.name === item.name);
        if (d) {
          if (tx.type === 'เบิก') {
            stats[d.id].borrowed += item.quantity;
          } else if (tx.type === 'คืน') {
            stats[d.id].returned += item.quantity;
          }
        }
      });
    });

    return stats;
  }, [drugs, transactions]);

  // --- Dynamic Special Controlled Drug Accumulator ---
  const specialControlledAccumulatedStats = useMemo(() => {
    const stats: Record<string, { openedAmps: number; usedQty: number; wastedQty: number }> = {};
    
    SPECIAL_CONTROLLED_DRUGS_LIST.forEach(name => {
      stats[name] = { openedAmps: 0, usedQty: 0, wastedQty: 0 };
    });

    transactions.forEach(tx => {
      if (tx.specialControlledDrugs) {
        tx.specialControlledDrugs.forEach(item => {
          const name = item.name;
          if (stats[name]) {
            const ampMatch = item.unit.match(/(?:เปิด|ใช้เต็ม)\s*(\d+)\s*(?:แอมป์|ขวด)/);
            const amps = ampMatch ? parseInt(ampMatch[1], 10) : 0;
            
            const wasteMatch = item.unit.match(/ทิ้ง\s*(\d+(?:\.\d+)?)/);
            const wasted = wasteMatch ? parseFloat(wasteMatch[1]) : 0;
            
            stats[name].openedAmps += amps;
            stats[name].usedQty += item.quantity;
            stats[name].wastedQty += wasted;
          }
        });
      }
    });

    return stats;
  }, [transactions]);

  // Quick print function
  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel Thai
    csvContent += "รายงานสรุปยอดบัญชีคลังและยอดใช้ยาสะสม ณ ปัจจุบัน (สรุปผลสะสมทั้งหมด)\n";
    csvContent += `พิมพ์รายงานเมื่อ: ${new Date().toLocaleString('th-TH')}\n\n`;

    // Section 1: General & Refrigerated
    csvContent += "1. คลังยาสลบและวัสดุทั่วไป (General & Refrigerated Stocks)\n";
    csvContent += "ชื่อรายการยา,หมวดหมู่,ยอดเบิกสะสม,ยอดคืนสะสม,คงเหลือในคลังตู้,หน่วย\n";
    drugs.filter(d => d.category !== 'special-controlled').forEach(d => {
      const s = dynamicAccumulatedStats[d.id] || { borrowed: 0, returned: 0 };
      const catLabel = CATEGORY_LABELS[d.category] || d.category;
      csvContent += `"${d.name}","${catLabel}",${s.borrowed},${s.returned},${d.stock},"${d.unit}"\n`;
    });

    csvContent += "\n";

    // Section 2: Special Controlled
    csvContent += "2. ยาควบคุมพิเศษสะสม (Special Controlled Drugs Tracking)\n";
    csvContent += "ชื่อรายการยา,เปิดใช้สะสม,ใช้จริงสะสม,ทิ้งสะสม,แอมป์ค้างคืนคลัง\n";
    SPECIAL_CONTROLLED_DRUGS_LIST.forEach(name => {
      const s = specialControlledAccumulatedStats[name] || { openedAmps: 0, usedQty: 0, wastedQty: 0 };
      const emptyCount = emptyAmpsAccumulator[name] || 0;
      const meta = SPECIAL_DRUGS_METADATA[name] || { unit: 'mg', type: 'Amp' };
      const unitLabel = meta.type === 'Amp' ? 'แอมป์' : 'ขวด';
      csvContent += `"${name}","${s.openedAmps} ${unitLabel}","${s.usedQty} ${meta.unit}","${s.wastedQty.toFixed(1)} ${meta.unit}","${emptyCount} แอมป์"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `summary_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintSummary = () => {
    setIsPrintingSummary(true);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleExportHistoryCSV = () => {
    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel Thai
    csvContent += "รายงานประวัติการเบิก-คืนยา วิสัญญี (ประวัติการเบิก-คืน)\n";
    csvContent += `ตัวกรอง: ประเภท=${historySearchType === 'all' ? 'ทั้งหมด' : historySearchType}, ห้อง OR=${historySearchOR === 'all' ? 'ทุกห้อง' : historySearchOR}, HN/ชื่อ=${historySearchHN.trim() || 'ทั้งหมด'}, ยา=${historySearchDrug.trim() || 'ทั้งหมด'}, ผู้ดำเนินงาน=${historySearchRequester.trim() || 'ทั้งหมด'}\n`;
    csvContent += `พิมพ์รายงานเมื่อ: ${new Date().toLocaleString('th-TH')}\n\n`;

    csvContent += "วัน-เวลา,ประเภท,ห้อง OR,ชื่อ-นามสกุล / HN,ผู้ดำเนินงาน,กล่อง Block,กล่อง Extra,ตู้เย็น/ห้อง,รายละเอียดตัวยาและปริมาณ,หมายเหตุ\n";
    
    filteredHistory.forEach(tx => {
      const dateStr = new Date(tx.timestamp).toLocaleString('th-TH');
      const itemsList: string[] = [];
      if (tx.items && tx.items.length > 0) {
        tx.items.forEach(item => {
          itemsList.push(`${item.name} (x${item.quantity})`);
        });
      }
      if (tx.specialControlledDrugs && tx.specialControlledDrugs.length > 0) {
        tx.specialControlledDrugs.forEach(item => {
          itemsList.push(`${item.name} (${item.quantity} ${item.unit})`);
        });
      }
      const itemsStr = itemsList.join(" | ");
      const notes = tx.notes || "";
      
      csvContent += `"${dateStr}","${tx.type}","${tx.orRoom}","${tx.patientHN}","${tx.requesterName}","${tx.blockBox || '-'}","${tx.extraBox || '-'}","${tx.coldOrRoomTempBox || '-'}","${itemsStr}","${notes}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `history_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintHistory = () => {
    setIsPrintingHistory(true);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const isReturnMode = activeTab === 'return';

  // --- Progress / Form Completeness Calculation ---
  const isOrRoomCompleted = !!orRoom;
  const isPatientHNCompleted = !!patientHN.trim();
  const isRequesterNameCompleted = !!requesterName.trim();
  const hasBoxActionVal = txType === 'เบิก'
    ? (blockBox === 'เบิก' || extraBox === 'เบิก' || coldOrRoomTempBox === 'เบิก')
    : (blockBox === 'คืน' || extraBox === 'คืน' || coldOrRoomTempBox === 'คืน');
  const hasSpecialControlledSelection = controlledCases.some(c => c.patientHN.trim() !== '' && c.orRoom !== '');
  const isItemsOrBoxesCompleted = Object.keys(selectedMedications).length > 0 || hasBoxActionVal || hasSpecialControlledSelection;

  const totalSteps = 4;
  const completedStepsCount = 
    (isOrRoomCompleted ? 1 : 0) +
    (isPatientHNCompleted ? 1 : 0) +
    (isRequesterNameCompleted ? 1 : 0) +
    (isItemsOrBoxesCompleted ? 1 : 0);
  
  const progressPercentage = Math.round((completedStepsCount / totalSteps) * 100);
  
  // Dynamic design tokens based on selected mode
  const theme = {
    primaryBg: isReturnMode ? 'bg-amber-600' : 'bg-emerald-600',
    primaryHoverBg: isReturnMode ? 'hover:bg-amber-700' : 'hover:bg-emerald-700',
    primaryText: isReturnMode ? 'text-amber-600' : 'text-emerald-600',
    primaryLightBg: isReturnMode ? 'bg-amber-50/60' : 'bg-emerald-50/60',
    primaryBorder: isReturnMode ? 'border-amber-200' : 'border-emerald-200',
    primaryRing: isReturnMode ? 'focus:ring-amber-500' : 'focus:ring-emerald-500',
    gradientFrom: isReturnMode ? 'from-amber-950/95' : 'from-emerald-950/95',
    buttonColor: isReturnMode ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold' : 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold',
    badgeBg: isReturnMode ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200',
    accentText: isReturnMode ? 'text-amber-700' : 'text-emerald-700',
    accentLight: isReturnMode ? 'bg-amber-50' : 'bg-emerald-50',
    bannerTitle: isReturnMode ? 'ส่งคืนยาเข้าคลังวิสัญญี' : 'ระบบเบิกยาจากคลังวิสัญญี',
    bannerSubtitle: isReturnMode ? 'คณะแพทยศาสตร์ มหาวิทยาลัยขอนแก่น • ส่งคืนยาอย่างปลอดภัย' : 'คณะแพทยศาสตร์ มหาวิทยาลัยขอนแก่น • ตรวจรับพัสดุและคุมสต็อกยา',
    iconColor: isReturnMode ? 'text-amber-500' : 'text-emerald-600'
  };

  if (isPrintingSummary) {
    return (
      <div className="bg-white text-slate-900 font-sans p-10 max-w-4xl mx-auto space-y-10">
        <div className="text-center py-6 border-b border-slate-300">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">รายงานสรุปยอดบัญชีคลังและยอดใช้ยาสะสม ณ ปัจจุบัน</h1>
          <p className="text-slate-600 text-sm mt-1">ระบบคลังเวชภัณฑ์วิสัญญี Supply Anesth-KKU • Srinagarind Hospital</p>
          <p className="text-slate-500 text-xs mt-1.5 font-medium font-mono">พิมพ์รายงานเมื่อ: {new Date().toLocaleString('th-TH')}</p>
        </div>

        <div className="space-y-8">
          {/* Section 1 */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2">
              1. คลังยาสลบและวัสดุทั่วไป (General & Refrigerated Stocks)
            </h2>
            <table className="w-full text-left text-sm border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-800 font-bold">
                  <th className="py-3 px-4 border border-slate-200">ชื่อรายการยา</th>
                  <th className="py-3 px-4 text-center border border-slate-200">ยอดเบิกสะสม</th>
                  <th className="py-3 px-4 text-center border border-slate-200">ยอดคืนสะสม</th>
                  <th className="py-3 px-4 text-center border border-slate-200">คงเหลือในคลังตู้</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {drugs.filter(d => d.category !== 'special-controlled').map(d => {
                  const s = dynamicAccumulatedStats[d.id] || { borrowed: 0, returned: 0 };
                  return (
                    <tr key={d.id}>
                      <td className="py-2.5 px-4 font-bold border border-slate-200">{d.name}</td>
                      <td className="py-2.5 px-4 text-center font-semibold border border-slate-200 text-emerald-700 font-mono">+{s.borrowed}</td>
                      <td className="py-2.5 px-4 text-center font-semibold border border-slate-200 text-amber-700 font-mono">-{s.returned}</td>
                      <td className="py-2.5 px-4 text-center font-bold border border-slate-200 font-mono">{d.stock} {d.unit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Section 2 */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 border-b border-slate-200 pb-2">
              2. ยาควบคุมพิเศษสะสม (Special Controlled Drugs Tracking)
            </h2>
            <table className="w-full text-left text-sm border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-800 font-bold">
                  <th className="py-3 px-4 border border-slate-200">ชื่อรายการยา</th>
                  <th className="py-3 px-4 text-center border border-slate-200">เปิดใช้สะสม</th>
                  <th className="py-3 px-4 text-center border border-slate-200">ใช้จริงสะสม</th>
                  <th className="py-3 px-4 text-center border border-slate-200">ทิ้งสะสม</th>
                  <th className="py-3 px-4 text-center border border-slate-200">แอมป์ค้างคืนคลัง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {SPECIAL_CONTROLLED_DRUGS_LIST.map(name => {
                  const s = specialControlledAccumulatedStats[name] || { openedAmps: 0, usedQty: 0, wastedQty: 0 };
                  const emptyCount = emptyAmpsAccumulator[name] || 0;
                  const meta = SPECIAL_DRUGS_METADATA[name] || { unit: 'mg', type: 'Amp' };
                  return (
                    <tr key={name}>
                      <td className="py-2.5 px-4 font-bold border border-slate-200">{name}</td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold text-indigo-700 border border-slate-200">
                        {s.openedAmps} {meta.type === 'Amp' ? 'แอมป์' : 'ขวด'}
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold text-emerald-700 border border-slate-200">
                        {s.usedQty} {meta.unit}
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono text-rose-600 border border-slate-200">
                        {s.wastedQty.toFixed(1)} {meta.unit}
                      </td>
                      <td className="py-2.5 px-4 text-center font-bold border border-slate-200 font-mono text-pink-700">
                        {emptyCount} แอมป์
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pt-12 text-center text-xs text-slate-400 no-print flex justify-center gap-3">
          <button 
            type="button" 
            onClick={() => setIsPrintingSummary(false)}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg font-bold text-slate-700 transition cursor-pointer text-xs"
          >
            ย้อนกลับ (Back to Dashboard)
          </button>
        </div>
      </div>
    );
  }

  if (isPrintingHistory) {
    return (
      <div className="bg-white text-slate-900 font-sans p-10 max-w-5xl mx-auto space-y-8">
        <div className="text-center py-6 border-b border-slate-300">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">รายงานประวัติการเบิก-คืนยา วิสัญญี</h1>
          <p className="text-slate-600 text-sm mt-1">ระบบคลังเวชภัณฑ์วิสัญญี Supply Anesth-KKU • Srinagarind Hospital</p>
          <div className="text-slate-500 text-xs mt-2 space-y-1 font-medium">
            <p>ตัวกรอง: ประเภท={historySearchType === 'all' ? 'ทั้งหมด' : historySearchType} | ห้อง OR={historySearchOR === 'all' ? 'ทุกห้อง' : historySearchOR} | HN/ชื่อ={historySearchHN.trim() || 'ทั้งหมด'} | ยา={historySearchDrug.trim() || 'ทั้งหมด'} | ผู้ดำเนินงาน={historySearchRequester.trim() || 'ทั้งหมด'}</p>
            <p className="font-mono">พิมพ์รายงานเมื่อ: {new Date().toLocaleString('th-TH')}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse border border-slate-200">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-800 font-bold uppercase">
                <th className="py-3 px-4 border border-slate-200">วัน-เวลา</th>
                <th className="py-3 px-3 text-center border border-slate-200">ประเภท</th>
                <th className="py-3 px-3 text-center border border-slate-200">ห้อง OR</th>
                <th className="py-3 px-4 border border-slate-200">ชื่อ-นามสกุล / HN</th>
                <th className="py-3 px-4 border border-slate-200">ผู้ดำเนินงาน</th>
                <th className="py-3 px-4 border border-slate-200">กล่องที่ทำรายการด้วย</th>
                <th className="py-3 px-4 border border-slate-200">รายละเอียดตัวยาที่ทำรายการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-bold">
                    ไม่พบรายการตามตัวกรองที่เลือก
                  </td>
                </tr>
              ) : (
                filteredHistory.map(tx => {
                  const boxes: string[] = [];
                  if (tx.blockBox === 'เบิก' || tx.blockBox === 'คืน') boxes.push(`Block (${tx.blockBox})`);
                  if (tx.extraBox === 'เบิก' || tx.extraBox === 'คืน') boxes.push(`Extra (${tx.extraBox})`);
                  if (tx.coldOrRoomTempBox === 'เบิก' || tx.coldOrRoomTempBox === 'คืน') boxes.push(`ตู้เย็น/ห้อง (${tx.coldOrRoomTempBox})`);

                  return (
                    <tr key={tx.id} className="align-top">
                      <td className="py-2.5 px-4 font-mono border border-slate-200">
                        {new Date(tx.timestamp).toLocaleString('th-TH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-2.5 px-3 text-center border border-slate-200 font-bold">
                        <span className={tx.type === 'เบิก' ? 'text-emerald-700' : 'text-amber-700'}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center border border-slate-200 font-bold">{tx.orRoom}</td>
                      <td className="py-2.5 px-4 border border-slate-200 font-medium font-mono">{tx.patientHN}</td>
                      <td className="py-2.5 px-4 border border-slate-200">{tx.requesterName}</td>
                      <td className="py-2.5 px-4 border border-slate-200 text-[11px]">
                        {boxes.length > 0 ? boxes.join(", ") : "-"}
                      </td>
                      <td className="py-2.5 px-4 border border-slate-200 space-y-1 text-[11px]">
                        {tx.items && tx.items.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {tx.items.map((item, idx) => (
                              <span key={idx} className="inline-block bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-semibold">
                                {item.name} x{item.quantity}
                              </span>
                            ))}
                          </div>
                        )}
                        {tx.specialControlledDrugs && tx.specialControlledDrugs.length > 0 && (
                          <div className="text-purple-800 font-semibold space-y-0.5">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-purple-600">✓ ยาควบคุมพิเศษ:</p>
                            <div className="flex flex-wrap gap-1">
                              {tx.specialControlledDrugs.map((item, idx) => (
                                <span key={idx} className="inline-block bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 font-mono">
                                  {item.name} {item.quantity} {item.unit}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {tx.notes && (
                          <p className="text-[10px] text-slate-500 italic mt-1 font-sans">
                            <span className="font-bold">หมายเหตุ:</span> {tx.notes}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="pt-8 text-center text-xs text-slate-400 no-print flex justify-center gap-3">
          <button 
            type="button" 
            onClick={() => setIsPrintingHistory(false)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold transition cursor-pointer text-xs"
          >
            ย้อนกลับ (Back to History)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      
      {/* --- Top KKU Faculty Header --- */}
      <header className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-800 text-white shadow-md no-print">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* KKU Medicine Icon Shield */}
            <div className="bg-white text-emerald-700 p-2.5 rounded-full shadow-inner flex items-center justify-center">
              <Activity className="w-8 h-8" />
            </div>
            <div className="text-center md:text-left">
              <h1 className="text-xl md:text-3xl font-bold tracking-tight">ระบบเบิก-คืนยา วิสัญญี</h1>
              <p className="text-emerald-100 text-sm md:text-base font-light">
                Supply Anesth-KKU • คณะแพทยศาสตร์ มหาวิทยาลัยขอนแก่น
              </p>
            </div>
          </div>
          
          {/* Main Tab Switch */}
          <div className="flex flex-wrap bg-emerald-950/40 p-1.5 rounded-2xl border border-emerald-500/20 gap-1.5 no-print">
            <button
              onClick={() => {
                setActiveTab('requisition');
                setTxType('เบิก');
                setSelectedMedications({});
                setBlockBox('ไม่เบิก');
                setExtraBox('ไม่เบิก');
                setColdOrRoomTempBox('ไม่เบิก');
                setNotes('');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeTab === 'requisition'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                  : 'text-emerald-100 hover:bg-emerald-800/40'
              }`}
            >
              <Plus className="w-4 h-4" />
              เบิกยา (Staff)
            </button>
            <button
              onClick={() => {
                setActiveTab('return');
                setTxType('คืน');
                setSelectedMedications({});
                setBlockBox('ไม่ได้เบิก');
                setExtraBox('ไม่ได้เบิก');
                setColdOrRoomTempBox('ไม่ได้เบิก');
                setNotes('');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeTab === 'return'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/20'
                  : 'text-emerald-100 hover:bg-emerald-800/40'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              คืนยา (Staff)
            </button>
            <button
              onClick={() => {
                setActiveTab('special_controlled');
                // Keep patient HN and orRoom if filled, but clear items and set default type
                setTxType('เบิก');
                setSelectedMedications({});
                setBlockBox('ไม่เบิก');
                setExtraBox('ไม่เบิก');
                setColdOrRoomTempBox('ไม่เบิก');
                setNotes('');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeTab === 'special_controlled'
                  ? 'bg-blue-700 text-white shadow-md shadow-blue-950/30'
                  : 'text-emerald-100 hover:bg-emerald-800/40'
              }`}
            >
              <Pill className="w-4 h-4 text-sky-200" />
              ยาควบคุมพิเศษ/Case
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeTab === 'admin'
                  ? 'bg-white text-emerald-800 shadow-md'
                  : 'text-emerald-100 hover:bg-emerald-800/40'
              }`}
            >
              <Settings className="w-4 h-4" />
              คลังและสถิติ (Admin)
            </button>
          </div>
        </div>
      </header>

      {/* --- Print-Only Header --- */}
      <div className="hidden print-only text-center py-6 border-b border-slate-300">
        <h1 className="text-2xl font-bold">รายงานประวัติการเบิก-คืนยา วิสัญญี</h1>
        <p className="text-slate-600">Supply Anesth-KKU • คณะแพทยศาสตร์ มหาวิทยาลัยขอนแก่น</p>
        <p className="text-xs text-slate-500 mt-1">พิมพ์เมื่อ: {new Date().toLocaleString('th-TH')}</p>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8 animate-in fade-in duration-300">
        
        {/* --- REAL-TIME DATA CONFLICT RESOLUTION OVERLAY MODAL --- */}
        {conflictActive && conflictDetails && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/75 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 md:p-8 space-y-6 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center gap-4 border-b border-amber-100 pb-4">
                <div className="bg-amber-100 text-amber-700 p-3 rounded-full">
                  <ShieldAlert className="w-8 h-8 animate-bounce" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    ตรวจพบความขัดแย้งของข้อมูล (Data Conflict Detected)
                  </h2>
                  <p className="text-xs text-amber-700 font-medium mt-0.5">
                    มีผู้ทำธุรกรรมกับยาชนิดเดียวกันในช่วงเวลาเดียวกัน ทำให้ยอดสต็อกขัดแย้งกัน
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-slate-600 leading-relaxed">
                  ขณะที่เครื่องของคุณพยายามเบิกยา <span className="font-bold text-slate-900">{conflictDetails.drugName}</span> ระบบส่วนกลางรายงานว่ามียอดเบิกสอดแทรกเข้ามาจากอีกเครื่องหนึ่ง ณ วินาทีเดียวกัน กรุณาเปรียบเทียบข้อมูลและเลือกวิธีผสานยอดคลังยา:
                </p>

                {/* Comparison Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Local Trans */}
                  <div className="bg-emerald-50/50 rounded-2xl border border-emerald-100 p-4 space-y-2">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide bg-emerald-100/60 px-2 py-0.5 rounded-full">
                      เครื่องนี้ (เครื่องของคุณ)
                    </span>
                    <h4 className="font-bold text-slate-800 text-sm">{conflictDetails.localTx.deviceName}</h4>
                    <ul className="text-xs text-slate-600 space-y-1">
                      <li>• ทำรายการ: <span className="font-semibold text-slate-800">เบิก {conflictDetails.drugName}</span></li>
                      <li>• ปริมาณ: <span className="font-bold text-emerald-700">x{conflictDetails.localTx.quantity} {fentanylUnit(conflictDetails.drugName)}</span></li>
                      <li>• โดย: {conflictDetails.localTx.requesterName}</li>
                      <li>• แผนก: {conflictDetails.localTx.orRoom}</li>
                    </ul>
                  </div>

                  {/* Remote Trans */}
                  <div className="bg-amber-50/50 rounded-2xl border border-amber-100 p-4 space-y-2">
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide bg-amber-100/60 px-2 py-0.5 rounded-full">
                      เครื่องอื่นบนระบบ (Remote Device)
                    </span>
                    <h4 className="font-bold text-slate-800 text-sm">{conflictDetails.remoteTx.deviceName}</h4>
                    <ul className="text-xs text-slate-600 space-y-1">
                      <li>• ทำรายการ: <span className="font-semibold text-slate-800">เบิก {conflictDetails.drugName}</span></li>
                      <li>• ปริมาณ: <span className="font-bold text-amber-700">x{conflictDetails.remoteTx.quantity} {fentanylUnit(conflictDetails.drugName)}</span></li>
                      <li>• โดย: {conflictDetails.remoteTx.requesterName}</li>
                      <li>• แผนก: {conflictDetails.remoteTx.orRoom}</li>
                    </ul>
                  </div>
                </div>

                {/* Stock Math Visualization */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    แบบจำลองการคำนวณยอดคงคลัง (Stock Recalculation Model)
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-white border border-slate-200 rounded-xl p-2">
                      <p className="text-[10px] text-slate-500 font-light">ยอดตั้งต้นก่อนทำรายการ</p>
                      <p className="text-sm font-bold text-slate-700">{conflictDetails.expectedStock} {fentanylUnit(conflictDetails.drugName)}</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-2">
                      <p className="text-[10px] text-slate-500 font-light">หากบันทึกเครื่องคุณอย่างเดียว</p>
                      <p className="text-sm font-bold text-emerald-600">เหลือ {conflictDetails.expectedStock - conflictDetails.localTx.quantity} {fentanylUnit(conflictDetails.drugName)}</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-2">
                      <p className="text-[10px] text-slate-500 font-light">หากผสานรวมยอด (แนะนำ)</p>
                      <p className="text-sm font-bold text-purple-600">เหลือ {conflictDetails.expectedStock - conflictDetails.localTx.quantity - conflictDetails.remoteTx.quantity} {fentanylUnit(conflictDetails.drugName)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-100 pt-4">
                <button
                  onClick={() => handleResolveConflict('merge')}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl text-xs transition duration-200 flex flex-col items-center justify-center gap-1 shadow-md shadow-emerald-100 cursor-pointer"
                >
                  <span>วิธีที่ 1: ผสานและหักลบยอดรวม</span>
                  <span className="text-[10px] font-normal opacity-90">(บันทึกทั้งคู่ เหลือ {conflictDetails.expectedStock - conflictDetails.localTx.quantity - conflictDetails.remoteTx.quantity})</span>
                </button>
                <button
                  onClick={() => handleResolveConflict('use_remote')}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-3 px-4 rounded-xl text-xs transition duration-200 flex flex-col items-center justify-center gap-1 border border-slate-200 cursor-pointer"
                >
                  <span>วิธีที่ 2: ใช้ยอดเครื่องอื่น</span>
                  <span className="text-[10px] font-normal text-slate-500">(ยกเลิกยอดเครื่องนี้ เหลือ {conflictDetails.expectedStock - conflictDetails.remoteTx.quantity})</span>
                </button>
                <button
                  onClick={() => handleResolveConflict('override_server')}
                  className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold py-3 px-4 rounded-xl text-xs transition duration-200 flex flex-col items-center justify-center gap-1 border border-rose-200 cursor-pointer"
                >
                  <span>วิธีที่ 3: เขียนทับด้วยยอดเครื่องนี้</span>
                  <span className="text-[10px] font-normal text-rose-500">(ยกเลิกยอดเครื่องอื่น เหลือ {conflictDetails.expectedStock - conflictDetails.localTx.quantity})</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 1: REQUISITION / RETURN STAFF PAGE ==================== */}
        {(activeTab === 'requisition' || activeTab === 'return') && (
          <>
            <form onSubmit={handleSubmitRequisition} className="space-y-8 no-print">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Column: Requisition Form Controls & Patient Info */}
              <div className="lg:col-span-5 space-y-6">
                
                {/* KKU Anesthesia Visual Identity Card with AI-generated Art */}
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200">
                  <div className="h-44 relative bg-slate-900">
                    <img 
                      src={bannerImg} 
                      alt="Anesthesia Banner" 
                      className="w-full h-full object-cover opacity-85"
                      referrerPolicy="no-referrer"
                    />
                    <div className={`absolute inset-0 bg-gradient-to-t ${theme.gradientFrom} to-transparent`}></div>
                    <div className="absolute bottom-4 left-5 right-5">
                      <h2 className="text-white text-xl font-bold mt-1">
                        {theme.bannerTitle}
                      </h2>
                      <p className="text-white/80 text-sm mt-0.5 font-light">
                        {theme.bannerSubtitle}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dynamic Form Progress / Completeness Checklist */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <Activity className={`w-4 h-4 ${theme.iconColor} animate-pulse`} />
                        ความสมบูรณ์ของข้อมูลการ{txType}ยา
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">กรุณากรอกข้อมูลให้ครบถ้วน 100% ก่อนส่งบันทึกรายการ</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      progressPercentage === 100
                        ? (isReturnMode ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200')
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}>
                      {progressPercentage}%
                    </span>
                  </div>

                  {/* Progress Bar Track */}
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-550 ease-out ${
                        progressPercentage === 100 
                          ? (isReturnMode ? 'bg-amber-500' : 'bg-emerald-600') 
                          : 'bg-indigo-500'
                      }`}
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>

                  {/* Checklist steps */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 text-[11px]">
                    {/* step 1 */}
                    <div className={`flex items-center justify-between p-2 rounded-xl border transition-all duration-300 ${
                      isOrRoomCompleted 
                        ? 'bg-slate-50 border-slate-200 text-slate-800' 
                        : 'bg-slate-50/30 border-slate-100 text-slate-400'
                    }`}>
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${
                          isOrRoomCompleted 
                            ? (isReturnMode ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800') 
                            : 'bg-slate-200/60 text-slate-400'
                        }`}>
                          <Building className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold">ห้อง OR / แผนกปฏิบัติงาน</span>
                      </div>
                      <div>
                        {isOrRoomCompleted ? (
                          <span className={`font-bold flex items-center gap-0.5 ${theme.accentText}`}>
                            <Check className="w-3.5 h-3.5 text-emerald-600" /> Done
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-400">ยังไม่เลือก</span>
                        )}
                      </div>
                    </div>

                    {/* step 2 */}
                    <div className={`flex items-center justify-between p-2 rounded-xl border transition-all duration-300 ${
                      isPatientHNCompleted 
                        ? 'bg-slate-50 border-slate-200 text-slate-800' 
                        : 'bg-slate-50/30 border-slate-100 text-slate-400'
                    }`}>
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${
                          isPatientHNCompleted 
                            ? (isReturnMode ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800') 
                            : 'bg-slate-200/60 text-slate-400'
                        }`}>
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold">ระบุชื่อ-นามสกุล หรือ HN ผู้ป่วย</span>
                      </div>
                      <div>
                        {isPatientHNCompleted ? (
                          <span className={`font-bold flex items-center gap-0.5 ${theme.accentText}`}>
                            <Check className="w-3.5 h-3.5 text-emerald-600" /> Done
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-400">ยังไม่ระบุ</span>
                        )}
                      </div>
                    </div>

                    {/* step 3 */}
                    <div className={`flex items-center justify-between p-2 rounded-xl border transition-all duration-300 ${
                      isRequesterNameCompleted 
                        ? 'bg-slate-50 border-slate-200 text-slate-800' 
                        : 'bg-slate-50/30 border-slate-100 text-slate-400'
                    }`}>
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${
                          isRequesterNameCompleted 
                            ? (isReturnMode ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800') 
                            : 'bg-slate-200/60 text-slate-400'
                        }`}>
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold">ระบุชื่อผู้ปฏิบัติงาน / ผู้{txType}</span>
                      </div>
                      <div>
                        {isRequesterNameCompleted ? (
                          <span className={`font-bold flex items-center gap-0.5 ${theme.accentText}`}>
                            <Check className="w-3.5 h-3.5 text-emerald-600" /> Done
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-400">ยังไม่ระบุ</span>
                        )}
                      </div>
                    </div>

                    {/* step 4 */}
                    <div className={`flex items-center justify-between p-2 rounded-xl border transition-all duration-300 ${
                      isItemsOrBoxesCompleted 
                        ? 'bg-slate-50 border-slate-200 text-slate-800' 
                        : 'bg-slate-50/30 border-slate-100 text-slate-400'
                    }`}>
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${
                          isItemsOrBoxesCompleted 
                            ? (isReturnMode ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800') 
                            : 'bg-slate-200/60 text-slate-400'
                        }`}>
                          <Package className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold">เลือกตัวยา หรือกล่องยา ({txType})</span>
                      </div>
                      <div>
                        {isItemsOrBoxesCompleted ? (
                          <span className={`font-bold flex items-center gap-0.5 ${theme.accentText}`}>
                            <Check className="w-3.5 h-3.5 text-emerald-600" /> Done
                          </span>
                        ) : (
                          <span className="font-semibold text-slate-400">ยังไม่เลือก</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
  
                {/* Form Base Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                      <Activity className={`w-5 h-5 ${theme.iconColor}`} />
                      1. ข้อมูลการ{txType}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">ระบุห้อง OR และชื่อผู้รับผิดชอบปฏิบัติงาน</p>
                  </div>

                  {/* Active Mode Banner Notice */}
                  <div className={`p-4 rounded-xl border flex items-center justify-between transition-all duration-300 ${
                    isReturnMode 
                      ? 'bg-amber-50/50 border-amber-200 text-amber-800' 
                      : 'bg-emerald-50/50 border-emerald-200 text-emerald-800'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isReturnMode ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isReturnMode ? <RefreshCw className="w-5 h-5 animate-spin-slow" /> : <Plus className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">ประเภทการดำเนินการ</p>
                        <p className="text-sm font-bold">{isReturnMode ? 'ส่งคืนยาเข้าคลังสำรอง (Return)' : 'เบิกจ่ายยาออกเพื่อปฏิบัติงาน (Dispense)'}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
                      isReturnMode ? 'bg-amber-200/60 text-amber-900' : 'bg-emerald-200/60 text-emerald-900'
                    }`}>
                      {isReturnMode ? 'Stock In' : 'Stock Out'}
                    </span>
                  </div>

                {/* Inputs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Select OR Room */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      ห้อง OR / แผนกปฏิบัติงาน *
                    </label>
                    <div className="relative">
                      <select
                        value={orRoom}
                        onChange={(e) => setOrRoom(e.target.value)}
                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-slate-800 focus:outline-none focus:ring-2 ${theme.primaryRing} text-sm appearance-none`}
                      >
                        <option value="">-- เลือกห้อง OR --</option>
                        {OR_ROOMS.map(room => (
                          <option key={room} value={room}>{room}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400">
                        <Building className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* HN Patient ID */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      ชื่อ-นามสกุล หรือ HN ผู้ป่วย *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="ระบุชื่อผู้ป่วย หรือ HN เช่น สมชาย รักดี / 650912345"
                        value={patientHN}
                        onChange={(e) => setPatientHN(e.target.value)}
                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-10 py-3 text-slate-800 focus:outline-none focus:ring-2 ${theme.primaryRing} text-sm`}
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Requester Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      {txType === 'เบิก' ? 'ชื่อผู้เบิกยา *' : 'ชื่อผู้ส่งคืนยา *'}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="ระบุชื่อ-นามสกุล"
                        value={requesterName}
                        onChange={(e) => setRequesterName(e.target.value)}
                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-10 py-3 text-slate-800 focus:outline-none focus:ring-2 ${theme.primaryRing} text-sm`}
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                </div>

                {/* Box Kits selection */}
                <div className="border-t border-slate-100 pt-4 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Package className={`w-4.5 h-4.5 ${theme.iconColor}`} />
                    {isReturnMode ? '2. รายการคืนกล่องยา' : '2. รายการเบิกกล่องยา'}
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Block Box Kit */}
                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-emerald-100 text-emerald-700 p-1.5 rounded-lg">
                          <Package className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">กล่องยา Block</p>
                          <p className="text-xxs text-slate-400">กล่องยาหัตถการบล็อกหลัง/เส้นประสาท</p>
                        </div>
                      </div>
                      
                      <div className="flex rounded-lg bg-slate-200/50 p-1 gap-1 self-end w-full">
                        <button
                          type="button"
                          onClick={() => setBlockBox(isReturnMode ? 'คืน' : 'เบิก')}
                          className={`flex-1 text-center py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                            (isReturnMode ? blockBox === 'คืน' : blockBox === 'เบิก') 
                              ? (isReturnMode ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'bg-emerald-600 text-white shadow-xs') 
                              : 'text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {isReturnMode ? 'คืน' : 'เบิก'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setBlockBox(isReturnMode ? 'ไม่ได้เบิก' : 'ไม่เบิก')}
                          className={`flex-1 text-center py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                            (isReturnMode ? blockBox === 'ไม่ได้เบิก' : blockBox === 'ไม่เบิก') 
                              ? 'bg-sky-600 text-white shadow-xs font-bold' 
                              : 'text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {isReturnMode ? 'ไม่ได้เบิก' : 'ไม่เบิก'}
                        </button>
                      </div>
                    </div>

                    {/* Extra Box Kit */}
                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-emerald-100 text-emerald-700 p-1.5 rounded-lg">
                          <Package className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">กล่องยา Extra</p>
                          <p className="text-xxs text-slate-400">กล่องยาสนับสนุนกรณีฉุกเฉินเพิ่มเติม</p>
                        </div>
                      </div>
                      
                      <div className="flex rounded-lg bg-slate-200/50 p-1 gap-1 self-end w-full">
                        <button
                          type="button"
                          onClick={() => setExtraBox(isReturnMode ? 'คืน' : 'เบิก')}
                          className={`flex-1 text-center py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                            (isReturnMode ? extraBox === 'คืน' : extraBox === 'เบิก') 
                              ? (isReturnMode ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'bg-emerald-600 text-white shadow-xs') 
                              : 'text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {isReturnMode ? 'คืน' : 'เบิก'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setExtraBox(isReturnMode ? 'ไม่ได้เบิก' : 'ไม่เบิก')}
                          className={`flex-1 text-center py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                            (isReturnMode ? extraBox === 'ไม่ได้เบิก' : extraBox === 'ไม่เบิก') 
                              ? 'bg-sky-600 text-white shadow-xs font-bold' 
                              : 'text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {isReturnMode ? 'ไม่ได้เบิก' : 'ไม่เบิก'}
                        </button>
                      </div>
                    </div>

                    {/* Cold Box / Room Temp Box (Combined) */}
                    <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="bg-blue-100 text-blue-700 p-1.5 rounded-lg">
                          <ThermometerSnowflake className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">กล่องยาเย็น / อุณหภูมิห้อง</p>
                          <p className="text-xxs text-slate-400">กล่องรักษาอุณหภูมิเย็น & ชุดจัดเก็บตามมาตรฐาน</p>
                        </div>
                      </div>
                      
                      <div className="flex rounded-lg bg-slate-200/50 p-1 gap-1 self-end w-full">
                        <button
                          type="button"
                          onClick={() => setColdOrRoomTempBox(isReturnMode ? 'คืน' : 'เบิก')}
                          className={`flex-1 text-center py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                            (isReturnMode ? coldOrRoomTempBox === 'คืน' : coldOrRoomTempBox === 'เบิก') 
                              ? (isReturnMode ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'bg-emerald-600 text-white shadow-xs') 
                              : 'text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {isReturnMode ? 'คืน' : 'เบิก'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setColdOrRoomTempBox(isReturnMode ? 'ไม่ได้เบิก' : 'ไม่เบิก')}
                          className={`flex-1 text-center py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                            (isReturnMode ? coldOrRoomTempBox === 'ไม่ได้เบิก' : coldOrRoomTempBox === 'ไม่เบิก') 
                              ? 'bg-sky-600 text-white shadow-xs font-bold' 
                              : 'text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {isReturnMode ? 'ไม่ได้เบิก' : 'ไม่เบิก'}
                        </button>
                      </div>
                    </div>

                  </div>

                </div>

              </div>

            </div>

              <div className="lg:col-span-7 space-y-6">
                {/* 3. ค้นหาและเลือกรายการยาเพิ่มเติม (Search and Select Additional Medications) */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
                  <div className="border-b border-slate-100 pb-4">
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <Search className={`w-5 h-5 ${theme.iconColor}`} />
                      3. ค้นหาและเลือกรายการยาเพิ่ม
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">ค้นหาและกดเลือกรายการยาเพื่อเพิ่มเข้าไปในรายการทำรายการด้านล่าง</p>
                  </div>

                  {/* Search and Category Filter Row */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="พิมพ์อักษรของชื่อยาเพื่อค้นหา..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-slate-800 focus:outline-none focus:ring-2 ${theme.primaryRing} text-sm`}
                      />
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                        <Search className="w-4 h-4" />
                      </div>
                    </div>
                    
                    <div className="relative">
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className={`bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-8 py-2.5 text-slate-800 focus:outline-none focus:ring-2 ${theme.primaryRing} text-sm appearance-none cursor-pointer`}
                      >
                        <option value="all">ทุกหมวดหมู่</option>
                        {Object.entries(CATEGORY_LABELS).map(([key, value]) => (
                          <option key={key} value={key}>{value}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Filtered Medication Catalog */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                    {filteredDrugs.length === 0 ? (
                      <div className="col-span-full py-8 text-center text-slate-400 text-sm">
                        ไม่พบรายการยาที่ตรงกับเงื่อนไขการค้นหา
                      </div>
                    ) : (
                      filteredDrugs.map((d) => {
                        const isAdded = !!selectedMedications[d.id];
                        const outOfStock = d.stock <= 0 && txType === 'เบิก';
                        return (
                          <div 
                            key={d.id} 
                            onClick={() => {
                              if (!outOfStock) {
                                addMedication(d.id);
                              }
                            }}
                            className={`p-3 rounded-xl border transition-all duration-200 text-left cursor-pointer flex flex-col justify-between h-24 ${
                              isAdded 
                                ? 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-300' 
                                : outOfStock 
                                  ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                                  : 'bg-white border-slate-200 hover:border-slate-350 hover:bg-slate-50/50 hover:shadow-xs'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate max-w-[150px]">
                                  {CATEGORY_LABELS[d.category]}
                                </span>
                                {isAdded && (
                                  <span className="text-xxs bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                                    <Check className="w-3 h-3 stroke-[3]" /> เลือกแล้ว
                                  </span>
                                )}
                              </div>
                              <h4 className="text-xs font-bold text-slate-800 truncate mt-1" title={d.name}>
                                {d.name}
                              </h4>
                            </div>
                            
                            <div className="flex items-center justify-between gap-2 mt-2">
                              <span className="text-xxs font-semibold text-slate-500">
                                ในคลัง: <span className="font-bold text-slate-700 font-mono">{d.stock}</span> {d.unit}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 4. รายการยาที่เลือกและระบุจำนวน */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
                  <div className="border-b border-slate-100 pb-4">
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <Package className={`w-5 h-5 ${theme.iconColor}`} />
                      4. รายการยาที่เลือกและระบุจำนวน
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">ระบุจำนวนที่ต้องการ{txType}ของแต่ละรายการยา</p>
                  </div>

                  {Object.keys(selectedMedications).length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs italic">
                      ยังไม่ได้เลือกรายการยาเพิ่มเติม (ไม่มีรายการเลือก)
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Object.keys(selectedMedications).map((drugId) => {
                        const drug = drugs.find((d) => d.id === drugId);
                        if (!drug) return null;
                        const qty = selectedMedications[drugId];
                        return (
                          <div key={drugId} className="flex items-center justify-between p-3 rounded-xl border border-slate-150 bg-slate-50/30 gap-4">
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-bold text-slate-800 truncate">{drug.name}</h4>
                              <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
                                ในคลัง: {drug.stock} {drug.unit}
                              </p>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => updateMedicationQty(drugId, -1)}
                                className="w-8 h-8 rounded-lg bg-white border border-slate-250 hover:bg-slate-50 text-slate-600 flex items-center justify-center font-bold text-base transition active:scale-95 cursor-pointer"
                              >
                                -
                              </button>
                              <span className="w-8 text-center text-sm font-black text-slate-800 font-mono">{qty}</span>
                              <button
                                type="button"
                                onClick={() => updateMedicationQty(drugId, 1)}
                                className="w-8 h-8 rounded-lg bg-white border border-slate-250 hover:bg-slate-50 text-slate-600 flex items-center justify-center font-bold text-base transition active:scale-95 cursor-pointer"
                              >
                                +
                              </button>
                              <span className="text-xs text-slate-500 w-10 text-left font-semibold">{drug.unit}</span>
                              <button
                                type="button"
                                onClick={() => removeMedication(drugId)}
                                className="text-slate-400 hover:text-red-500 p-1.5 transition cursor-pointer"
                                title="ลบรายการนี้"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Submit Error & Action Buttons */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
                  {submitError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold">
                      ⚠️ {submitError}
                    </div>
                  )}

                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-6 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition cursor-pointer"
                    >
                      ล้างแบบฟอร์ม
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={`flex-1 py-3 px-6 rounded-xl text-xs font-bold text-white transition cursor-pointer ${
                        isSubmitting
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          : isReturnMode
                            ? 'bg-amber-600 hover:bg-amber-700 shadow-sm'
                            : 'bg-emerald-600 hover:bg-emerald-700 shadow-sm'
                      }`}
                    >
                      {isSubmitting ? 'กำลังบันทึกรายการ...' : `ยืนยันการทำรายการ${txType}ยา`}
                    </button>
                  </div>
                </div>

              </div>
            </div>
            </form>
          </>
        )}

        {activeTab === 'special_controlled' && (
          <div className="space-y-8 animate-fade-in no-print">
            <section id="hero-section" className="relative rounded-[36px] bg-gradient-to-br from-pink-50/60 via-purple-50/50 to-sky-50/60 border border-pink-100 p-6 md:p-10 text-center overflow-hidden shadow-sm flex flex-col items-center justify-center gap-8 max-w-4xl mx-auto">
              {/* Decorative blur elements */}
              <div className="absolute top-0 right-0 w-80 h-80 bg-pink-200/20 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-sky-200/20 rounded-full blur-2xl pointer-events-none"></div>
              
              <div className="space-y-4 relative z-10 w-full flex flex-col items-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black bg-pink-100/70 text-pink-600 border border-pink-200/40 uppercase tracking-widest">
                  <Sparkles className="w-3.5 h-3.5 text-pink-500 animate-pulse" /> High-Alert Drugs & Narcotics Log
                </div>
                
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-800 leading-tight tracking-tight">
                  ระบบบันทึกข้อมูลการใช้ <br className="sm:hidden" />
                  <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent ml-1">
                    ยาควบคุมพิเศษวิสัญญี
                  </span>
                </h1>
              </div>

                                        </section>

            {/* Main Form container */}
            <form id="controlled-form-section" onSubmit={handleSubmitSpecialControlled} className="space-y-8">
              
              {/* 1. Global Information Card */}
              <div className="bg-white rounded-3xl border border-pink-100 border-l-4 border-l-pink-400 p-6 md:p-8 shadow-sm relative overflow-hidden transition-all hover:shadow-md">
                <div className="absolute right-0 top-0 w-32 h-32 bg-pink-50/50 rounded-full blur-2xl pointer-events-none"></div>
                
                <div className="border-b border-pink-100 pb-4 mb-6 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="bg-pink-50 p-2.5 rounded-xl text-pink-600 border border-pink-100">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base md:text-lg font-black text-slate-800">1. ข้อมูลผู้บันทึกรายงานและผู้สอบทาน</h3>
                      <p className="text-xs text-slate-500 mt-1 font-bold">กรุณาระบุตัวตนเจ้าหน้าที่ผู้ทำการเบิกและใช้งานตามหลักเกณฑ์วิชาชีพเวชกรรม</p>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-50 border border-blue-100 text-[10px] text-blue-700 font-mono font-black">
                    <Lock className="w-3.5 h-3.5" /> AUDITED LOG
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Requester Name */}
                  <div className="space-y-2">
                    <label className="block text-xs md:text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-600" />
                      ชื่อผู้บันทึกข้อมูลการใช้ยา *
                    </label>
                    <div className="relative rounded-xl shadow-xxs">
                      <input
                        type="text"
                        required
                        placeholder="ระบุชื่อ-นามสกุล ของวิสัญญีแพทย์/วิสัญญีพยาบาล..."
                        value={requesterName}
                        onChange={(e) => setRequesterName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-slate-850 font-extrabold focus:ring-4 focus:ring-blue-100 focus:border-blue-400 focus:outline-none text-sm transition-all placeholder:text-slate-400"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600 pointer-events-none">
                        <UserCheck className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  {/* Global Notes */}
                  <div className="space-y-2">
                    <label className="block text-xs md:text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-blue-600" />
                      หมายเหตุเพิ่มเติม (ถ้ามี)
                    </label>
                    <div className="relative rounded-xl shadow-xxs">
                      <input
                        type="text"
                        placeholder="พิมพ์ระบุหมายเหตุ เช่น เคสด่วนพิเศษ, พยานลงนามทำลายเศษยา..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-slate-850 font-extrabold focus:ring-4 focus:ring-blue-100 focus:border-blue-400 focus:outline-none text-sm transition-all placeholder:text-slate-400"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-450 pointer-events-none">
                        <FileText className="w-5 h-5 text-blue-400" />
                      </div>
                    </div>
                  </div>
                </div>


              </div>

              {/* 2. Patient Cases Form List */}
              <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-4 bg-blue-50/40 border border-blue-100 rounded-2xl p-5 shadow-xxs">
                  <div>
                    <h3 className="text-sm md:text-lg font-black text-blue-950 tracking-tight flex items-center gap-2.5">
                      <ClipboardList className="w-5 h-5 text-blue-700" />
                      2. รายการข้อมูลผู้ป่วยวิสัญญี ({controlledCases.length} เคส)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 font-bold">กรุณากรอกข้อมูลจำเพาะเคสและเลือกรายงานปริมาณยารายบุคคล</p>
                  </div>
                  
                  {/* Highly prominent Add Case button */}
                  <button
                    type="button"
                    onClick={handleAddControlledCase}
                    className="px-5 py-3 bg-gradient-to-r from-blue-700 to-blue-800 hover:from-blue-800 hover:to-blue-900 text-white font-black text-xs md:text-sm rounded-xl flex items-center justify-center gap-2.5 shadow-md hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer hover:ring-4 hover:ring-blue-100"
                  >
                    <Plus className="w-5 h-5 stroke-[2.5px] text-white" />
                    เพิ่มเคสผู้ป่วยวิสัญญี (+ Add New Case)
                  </button>
                </div>

                {/* List of Case Cards */}
                <div className="grid grid-cols-1 gap-8">
                  {controlledCases.map((c, idx) => {
                    const caseNum = idx + 1;

                    return (
                      <div 
                        key={c.id} 
                        id={`case-card-${c.id}`}
                        className="bg-white rounded-3xl border border-slate-150 border-l-4 border-l-blue-600 shadow-sm hover:shadow-md transition-all duration-350 overflow-hidden"
                      >
                        {/* Case Card Header - Clean Medical Tab look */}
                        <div className="bg-blue-50/40 px-5 py-4 border-b border-blue-100 flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-xl bg-blue-700 text-white text-xs md:text-sm font-black flex items-center justify-center shadow-xs font-mono">
                              {caseNum}
                            </span>
                            <div>
                              <h4 className="text-xs md:text-sm font-black text-blue-950 flex items-center gap-2">
                                บันทึกรายงานยาเสพติดวิสัญญี รายที่ {caseNum}
                              </h4>
                              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Anesthesia Case ID #{c.id.substring(c.id.length - 6)}</p>
                            </div>
                          </div>

                          {/* Delete Case Button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveControlledCase(c.id)}
                            className="text-red-600 hover:text-white hover:bg-red-500 px-3.5 py-2 rounded-xl border border-red-100 hover:border-red-500 text-xs font-bold transition duration-200 cursor-pointer flex items-center gap-1.5 bg-red-50/50"
                            title="ลบเคสผู้ป่วยนี้"
                          >
                            <Trash2 className="w-4 h-4 text-current" />
                            <span>ลบเคสนี้</span>
                          </button>
                        </div>

                        {/* Case Card Body */}
                        <div className="p-6 md:p-8 space-y-6 bg-gradient-to-b from-blue-50/10 to-transparent">
                          
                          {/* Row 1: Patient Demographic Details */}
                          <div className="bg-slate-50/40 border border-slate-150 rounded-2xl p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 shadow-inner">
                            {/* OR Room selection */}
                            <div className="space-y-2">
                              <label className="block text-xs md:text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                                <Building className="w-4.5 h-4.5 text-blue-600" />
                                ห้อง OR / แผนกวิสัญญี *
                              </label>
                              <div className="relative rounded-xl shadow-xxs bg-white border border-slate-200 focus-within:ring-4 focus-within:ring-blue-100 focus-within:border-blue-400">
                                <select
                                  value={c.orRoom}
                                  required
                                  onChange={(e) => handleUpdateControlledCase(c.id, { orRoom: e.target.value })}
                                  className="w-full bg-transparent pl-4 pr-10 py-3 text-slate-850 font-extrabold focus:outline-none text-sm cursor-pointer appearance-none"
                                >
                                  <option value="">-- เลือกห้องผ่าตัด / แผนก (Select OR Room) --</option>
                                  {OR_ROOMS.map((room) => (
                                    <option key={room} value={room}>
                                      {room}
                                    </option>
                                  ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                  <ChevronDown className="w-4.5 h-4.5" />
                                </div>
                              </div>
                            </div>

                            {/* Patient HN / Name */}
                            <div className="space-y-2">
                              <label className="block text-xs md:text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                                <Activity className="w-4.5 h-4.5 text-blue-600" />
                                หมายเลข HN หรือชื่อ-นามสกุลผู้ป่วย *
                              </label>
                              <div className="relative rounded-xl shadow-xxs">
                                <input
                                  type="text"
                                  id={`patient-hn-input-${c.id}`}
                                  required
                                  placeholder="ระบุ HN (เช่น HN69XXXXX) หรือระบุชื่อ-นามสกุล..."
                                  value={c.patientHN}
                                  onChange={(e) => handleUpdateControlledCase(c.id, { patientHN: e.target.value })}
                                  className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-3 text-slate-850 font-extrabold focus:ring-4 focus:ring-blue-100 focus:border-blue-400 focus:outline-none text-sm transition-all placeholder:text-slate-400"
                                />
                                <div className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-450 pointer-events-none">
                                  <User className="w-4.5 h-4.5" />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Row 2: Controlled Drug details */}
                          <div className="space-y-4 pt-2">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                              <h5 className="text-xs md:text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                                <Pill className="w-4.5 h-4.5 text-blue-600" />
                                รายการยาควบคุมพิเศษที่ใช้ในเคสนี้ *
                              </h5>
                              
                              <button
                                type="button"
                                onClick={() => handleAddDrugToCase(c.id)}
                                className="text-blue-700 hover:text-white hover:bg-blue-700 bg-blue-50 hover:shadow-xs px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition duration-200 active:scale-[0.98] cursor-pointer border border-blue-100 hover:border-blue-700"
                              >
                                <Plus className="w-3.5 h-3.5 stroke-[2.5px]" />
                                เพิ่มยาตัวอื่นในเคสนี้ (+ Add Drug)
                              </button>
                            </div>
 
                            {/* Drug Table container - Clean & Space-efficient */}
                            <div className="border border-slate-150 rounded-2xl overflow-hidden bg-white shadow-xs">
                              {/* Table Header Row (Desktop Only) */}
                              <div className="hidden md:grid grid-cols-12 gap-3 bg-blue-50/30 px-5 py-3.5 border-b border-slate-150 text-xs font-black text-blue-950 uppercase tracking-widest">
                                <div className="col-span-1">#</div>
                                <div className="col-span-3">ยาควบคุมพิเศษ (Drug Name)</div>
                                <div className="col-span-2 text-center">จำนวนเปิดใช้ (Qty)</div>
                                <div className="col-span-2 text-center">ลักษณะการใช้ (Usage)</div>
                                <div className="col-span-3 text-center">ปริมาณจริง / ทิ้ง ({c.drugs[0]?.drugName ? (SPECIAL_DRUGS_METADATA[c.drugs[0].drugName]?.unit || 'mg') : 'mg'})</div>
                                <div className="col-span-1 text-right">ลบ</div>
                              </div>
 
                              {/* Table Body / Drug Rows */}
                              <div className="divide-y divide-slate-150">
                                {c.drugs.map((drug, dIdx) => {
                                  const drugNum = dIdx + 1;
                                  const meta = SPECIAL_DRUGS_METADATA[drug.drugName] || { type: 'Amp', capacity: 10, unit: 'mg', display: drug.drugName };
                                  const expectedTotalCapacity = drug.ampsCount * meta.capacity;
                                  
                                  const usedVal = parseFloat(drug.actualUsed) || 0;
                                  const wasteVal = parseFloat(drug.wastage) || 0;
                                  const ratio = expectedTotalCapacity > 0 ? (usedVal / expectedTotalCapacity) * 100 : 0;
                                  const totalSum = usedVal + wasteVal;
                                  const hasInputs = drug.actualUsed.trim() !== '' && drug.wastage.trim() !== '';
                                  const isMismatch = drug.drugName !== 'Ketamine' && hasInputs && Math.abs(totalSum - expectedTotalCapacity) > 0.0001;
                                  const isIncomplete = drug.useMode === 'partial' && (!drug.actualUsed.trim() || !drug.wastage.trim());

                                  return (
                                    <div key={drug.id} className="p-4 md:p-0">
                                      {/* Desktop Layout View */}
                                      <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-4 items-center hover:bg-blue-50/5 transition duration-150">
                                        {/* Col 1: Index */}
                                        <div className="col-span-1">
                                          <span className="w-8 h-8 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg flex items-center justify-center text-sm font-black font-mono shadow-xxs">
                                            {drugNum}
                                          </span>
                                        </div>

                                        {/* Col 2: Drug Select */}
                                        <div className="col-span-3">
                                          <div className="relative rounded-xl border border-slate-300 bg-white hover:border-blue-400 transition-colors shadow-xxs">
                                            <select
                                              value={drug.drugName}
                                              onChange={(e) => handleUpdateDrugInCase(c.id, drug.id, { drugName: e.target.value })}
                                              className="w-full h-11 bg-transparent pl-3.5 pr-9 py-1 text-slate-850 font-extrabold focus:outline-none text-sm cursor-pointer appearance-none"
                                            >
                                              {SPECIAL_CONTROLLED_DRUGS_LIST.map((name) => (
                                                <option key={name} value={name}>
                                                  {SPECIAL_DRUGS_METADATA[name]?.display || name}
                                                </option>
                                              ))}
                                            </select>
                                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                              <ChevronDown className="w-4 h-4" />
                                            </div>
                                          </div>
                                        </div>

                                        {/* Col 3: Amps Qty Stepper */}
                                        <div className="col-span-2 flex justify-center">
                                          <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-white justify-between h-11 w-28 shadow-xxs hover:border-blue-300 transition-colors">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const nextCount = Math.max(1, drug.ampsCount - 1);
                                                handleUpdateDrugInCase(c.id, drug.id, { ampsCount: nextCount });
                                              }}
                                              className="w-9 h-full flex items-center justify-center text-slate-600 hover:bg-slate-100 transition font-black text-sm cursor-pointer select-none"
                                            >
                                              −
                                            </button>
                                            <div className="font-mono text-sm font-black text-slate-900">
                                              {drug.ampsCount}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const nextCount = Math.min(50, drug.ampsCount + 1);
                                                handleUpdateDrugInCase(c.id, drug.id, { ampsCount: nextCount });
                                              }}
                                              className="w-9 h-full flex items-center justify-center text-slate-600 hover:bg-slate-100 transition font-black text-sm cursor-pointer select-none"
                                            >
                                              +
                                            </button>
                                          </div>
                                        </div>

                                        {/* Col 4: Usage Mode Switcher */}
                                        <div className="col-span-2 flex justify-center">
                                          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 h-11 w-44 items-center shadow-inner">
                                            <button
                                              type="button"
                                              onClick={() => handleUpdateDrugInCase(c.id, drug.id, { useMode: 'full' })}
                                              className={`py-1.5 rounded-lg text-xs font-black transition-all text-center h-full flex items-center justify-center cursor-pointer ${
                                                drug.useMode === 'full'
                                                  ? 'bg-blue-700 text-white shadow-xxs'
                                                  : 'text-slate-600 hover:text-slate-850 hover:bg-white/50'
                                              }`}
                                            >
                                              <Check className="w-3.5 h-3.5 stroke-[3px] mr-1" />
                                              เต็มขนาด
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleUpdateDrugInCase(c.id, drug.id, { useMode: 'partial' })}
                                              className={`py-1.5 rounded-lg text-xs font-black transition-all text-center h-full flex items-center justify-center cursor-pointer ${
                                                drug.useMode === 'partial'
                                                  ? 'bg-amber-600 text-white shadow-xxs'
                                                  : 'text-slate-600 hover:text-slate-850 hover:bg-white/50'
                                              }`}
                                            >
                                              <Scissors className="w-3.5 h-3.5 mr-1" />
                                              ทิ้งเศษ
                                            </button>
                                          </div>
                                        </div>

                                        {/* Col 5: Volume Input (used vs wasted) */}
                                        <div className="col-span-3 text-center">
                                          {drug.useMode === 'full' ? (
                                            <span className="text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 rounded-xl shadow-xxs inline-flex items-center justify-center h-11 w-full max-w-[210px]">
                                              เต็มขนาด: {expectedTotalCapacity} {meta.unit}
                                            </span>
                                          ) : (
                                            <div className="flex items-center gap-2 justify-center w-full">
                                              <div className="w-24">
                                                <input
                                                  type="number"
                                                  min="0"
                                                  step="any"
                                                  placeholder="ใช้จริง"
                                                  value={drug.actualUsed}
                                                  onChange={(e) => {
                                                    const val = e.target.value;
                                                    const valNum = parseFloat(val) || 0;
                                                    const waste = Math.max(0, expectedTotalCapacity - valNum);
                                                    handleUpdateDrugInCase(c.id, drug.id, { 
                                                      actualUsed: val, 
                                                      wastage: val.trim() ? waste.toFixed(2).replace(/\.00$/, '') : '' 
                                                    });
                                                  }}
                                                  className="w-full h-11 bg-white border border-slate-300 rounded-xl px-2 py-1 text-center text-sm text-slate-850 font-black focus:ring-4 focus:ring-blue-100 focus:border-blue-400 focus:outline-none transition-all shadow-xxs"
                                                  title="ปริมาณใช้จริง (mg)"
                                                />
                                              </div>
                                              <span className="text-xs text-slate-400 font-extrabold shrink-0">+</span>
                                              <div className="w-24">
                                                <input
                                                  type="number"
                                                  min="0"
                                                  step="any"
                                                  placeholder="ทิ้งเศษ"
                                                  value={drug.wastage}
                                                  onChange={(e) => {
                                                    const val = e.target.value;
                                                    const valNum = parseFloat(val) || 0;
                                                    const used = Math.max(0, expectedTotalCapacity - valNum);
                                                    handleUpdateDrugInCase(c.id, drug.id, { 
                                                      wastage: val, 
                                                      actualUsed: val.trim() ? used.toFixed(2).replace(/\.00$/, '') : '' 
                                                    });
                                                  }}
                                                  className="w-full h-11 bg-white border border-slate-300 rounded-xl px-2 py-1 text-center text-sm text-slate-850 font-black focus:ring-4 focus:ring-blue-100 focus:border-blue-400 focus:outline-none transition-all shadow-xxs"
                                                  title="ปริมาณเหลือทิ้ง (mg)"
                                                />
                                              </div>
                                              
                                              {/* Verification Checkmark / Warning */}
                                              <div className="shrink-0 flex items-center justify-center w-6">
                                                {isIncomplete ? (
                                                  <span className="text-red-500 font-bold text-base" title="กรุณากรอกทั้งสองช่อง">⚠️</span>
                                                ) : isMismatch ? (
                                                  <span className="text-red-600 font-bold text-base animate-pulse" title={`ยอดรวมไม่ตรง: ${totalSum} / ต้องได้: ${expectedTotalCapacity}`}>❌</span>
                                                ) : hasInputs ? (
                                                  <span className="text-emerald-600 font-black text-lg" title="ยอดตรวจสอบตรงกัน">✓</span>
                                                ) : null}
                                              </div>
                                            </div>
                                          )}
                                        </div>

                                        {/* Col 6: Delete button */}
                                        <div className="col-span-1 text-right">
                                          {c.drugs.length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveDrugFromCase(c.id, drug.id)}
                                              className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-xl transition-colors inline-flex items-center justify-center cursor-pointer h-11 w-11 border border-slate-100 hover:border-red-200"
                                              title="ลบยาตัวนี้ออกจากเคส"
                                            >
                                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {/* Expanded Dosage Balancing Panel for Desktop (Partial Mode) */}
                                      {drug.useMode === 'partial' && (
                                        <div className="hidden md:block bg-blue-50/15 border-t border-b border-blue-100/30 px-12 py-4 space-y-3.5 animate-in slide-in-from-top duration-200">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              <Sparkles className="w-4 h-4 text-blue-600" />
                                              <span className="text-xs font-black text-blue-950">
                                                Dosage Balancing Assistant — ยอดเปิดใช้ {expectedTotalCapacity} {meta.unit} ({drug.ampsCount} {meta.type === 'Amp' ? 'แอมป์' : 'ขวด'})
                                              </span>
                                            </div>
                                            <div className="text-xs font-bold text-slate-500">
                                              สัดส่วน: <span className="text-emerald-700 font-extrabold">ใช้จริง {ratio.toFixed(0)}%</span> / <span className="text-amber-700 font-extrabold">ยาทิ้ง {(100 - ratio).toFixed(0)}%</span>
                                            </div>
                                          </div>

                                          {/* Proportional Digital Segmented Bar */}
                                          <div className="space-y-1">
                                            <div className="flex gap-1 justify-between w-full bg-slate-100/80 p-1.5 rounded-lg border border-slate-200 shadow-inner">
                                              {Array.from({ length: 15 }).map((_, idx) => {
                                                const threshold = ((idx + 1) / 15) * 100;
                                                const isActive = ratio >= threshold;
                                                return (
                                                  <div 
                                                    key={idx} 
                                                    className={`h-2.5 flex-1 rounded-sm transition-all duration-300 ${
                                                      isActive ? 'bg-emerald-500' : 'bg-amber-500'
                                                    }`} 
                                                  />
                                                );
                                              })}
                                            </div>
                                            <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold px-1">
                                              <span className="text-emerald-700 flex items-center gap-1 font-extrabold">◀ ใช้จริง (Patient Dose: {usedVal} {meta.unit})</span>
                                              <span className="text-amber-700 flex items-center gap-1 font-extrabold">ยาทิ้งทำลาย (Wastage: {wasteVal} {meta.unit}) ▶</span>
                                            </div>
                                          </div>

                                          {/* Slider Controls */}
                                          <div className="flex items-center gap-4 py-1">
                                            <span className="text-[11px] font-black text-emerald-700 shrink-0">ใช้ 0</span>
                                            <input
                                              type="range"
                                              min="0"
                                              max={expectedTotalCapacity}
                                              step={drug.drugName === 'Fentanyl 2 ml' ? 5 : drug.drugName === 'Fentanyl 10 ml' ? 10 : drug.drugName === 'Pethidine' ? 5 : drug.drugName === 'Midazolam' ? 0.5 : drug.drugName === 'Ketamine' ? 10 : 1}
                                              value={usedVal}
                                              onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                const waste = Math.max(0, expectedTotalCapacity - val);
                                                handleUpdateDrugInCase(c.id, drug.id, { 
                                                  actualUsed: val.toString(), 
                                                  wastage: waste.toFixed(2).replace(/\.00$/, '') 
                                                });
                                              }}
                                              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-700 focus:outline-none transition-all"
                                            />
                                            <span className="text-[11px] font-black text-amber-700 shrink-0">ทิ้ง {expectedTotalCapacity} {meta.unit}</span>
                                          </div>

                                          {/* Clinical Dosage Presets */}
                                          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                                            <span className="text-[11px] font-black text-slate-500 mr-1">ปริมาณใช้บ่อย (Common Clinical Dose Presets):</span>
                                            {(DRUG_DOSAGE_PRESETS[drug.drugName] || [])
                                              .filter(preset => preset <= expectedTotalCapacity)
                                              .map(preset => {
                                                const isSelected = Math.abs(usedVal - preset) < 0.01;
                                                return (
                                                  <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => {
                                                      const waste = Math.max(0, expectedTotalCapacity - preset);
                                                      handleUpdateDrugInCase(c.id, drug.id, {
                                                        actualUsed: preset.toString(),
                                                        wastage: waste.toFixed(2).replace(/\.00$/, '')
                                                      });
                                                    }}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all duration-150 flex items-center gap-1 border cursor-pointer ${
                                                      isSelected
                                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xxs scale-[1.03]'
                                                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-350'
                                                    }`}
                                                  >
                                                    {isSelected && <Check className="w-3 h-3 stroke-[3px]" />}
                                                    {preset} {meta.unit}
                                                  </button>
                                                );
                                              })}
                                          </div>
                                        </div>
                                      )}

                                      {/* Mobile Layout View */}
                                      <div className="block md:hidden space-y-3.5">
                                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                          <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                                            <span className="w-8 h-8 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg flex items-center justify-center text-sm font-black font-mono shadow-xxs">
                                              {drugNum}
                                            </span>
                                            รายการยาควบคุมพิเศษ
                                          </span>
                                          {c.drugs.length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveDrugFromCase(c.id, drug.id)}
                                              className="text-red-600 hover:text-red-700 font-extrabold text-xs flex items-center gap-1 transition active:scale-[0.98] cursor-pointer bg-red-50 px-2.5 py-1.5 rounded-xl border border-red-100"
                                            >
                                              <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                              ลบรายการยานี้
                                            </button>
                                          )}
                                        </div>

                                        <div className="grid grid-cols-12 gap-3.5">
                                          {/* Drug select */}
                                          <div className="col-span-12">
                                            <div className="relative border border-slate-300 rounded-xl bg-white shadow-xxs">
                                              <select
                                                value={drug.drugName}
                                                onChange={(e) => handleUpdateDrugInCase(c.id, drug.id, { drugName: e.target.value })}
                                                className="w-full h-11 bg-transparent pl-3.5 pr-10 py-1 text-slate-850 font-black focus:outline-none text-sm cursor-pointer appearance-none animate-none"
                                              >
                                                {SPECIAL_CONTROLLED_DRUGS_LIST.map((name) => (
                                                  <option key={name} value={name}>
                                                    {SPECIAL_DRUGS_METADATA[name]?.display || name}
                                                  </option>
                                                ))}
                                              </select>
                                              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                                <ChevronDown className="w-4 h-4" />
                                              </div>
                                            </div>
                                          </div>

                                          {/* Stepper Count */}
                                          <div className="col-span-6 space-y-1.5">
                                            <span className="block text-xs font-bold text-slate-700">
                                              จำนวนเปิดใช้ ({meta.type === 'Amp' ? 'แอมป์' : 'ขวด'}) *
                                            </span>
                                            <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-white w-full justify-between h-11 shadow-xxs">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const nextCount = Math.max(1, drug.ampsCount - 1);
                                                  handleUpdateDrugInCase(c.id, drug.id, { ampsCount: nextCount });
                                                }}
                                                className="w-10 h-full flex items-center justify-center text-slate-600 hover:bg-slate-100 transition font-black text-lg cursor-pointer select-none"
                                              >
                                                −
                                              </button>
                                              <div className="px-1 font-mono text-sm font-black text-slate-900">
                                                {drug.ampsCount}
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const nextCount = Math.min(50, drug.ampsCount + 1);
                                                  handleUpdateDrugInCase(c.id, drug.id, { ampsCount: nextCount });
                                                }}
                                                className="w-10 h-full flex items-center justify-center text-slate-600 hover:bg-slate-100 transition font-black text-lg cursor-pointer select-none"
                                              >
                                                +
                                              </button>
                                            </div>
                                          </div>

                                          {/* Use Mode */}
                                          <div className="col-span-6 space-y-1.5">
                                            <span className="block text-xs font-bold text-slate-700">
                                              ลักษณะการใช้ *
                                            </span>
                                            <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-300 h-11 items-center shadow-inner">
                                              <button
                                                type="button"
                                                onClick={() => handleUpdateDrugInCase(c.id, drug.id, { useMode: 'full' })}
                                                className={`py-1.5 rounded-lg text-xs font-black transition-all text-center h-full flex items-center justify-center cursor-pointer ${
                                                  drug.useMode === 'full'
                                                    ? 'bg-blue-700 text-white shadow-xxs'
                                                    : 'text-slate-600 hover:text-slate-850 hover:bg-white/50'
                                                }`}
                                              >
                                                <Check className="w-3.5 h-3.5 stroke-[3px] mr-1" />
                                                เต็มขนาด
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleUpdateDrugInCase(c.id, drug.id, { useMode: 'partial' })}
                                                className={`py-1.5 rounded-lg text-xs font-black transition-all text-center h-full flex items-center justify-center cursor-pointer ${
                                                  drug.useMode === 'partial'
                                                    ? 'bg-amber-600 text-white shadow-xxs'
                                                    : 'text-slate-600 hover:text-slate-850 hover:bg-white/50'
                                                }`}
                                              >
                                                <Scissors className="w-3.5 h-3.5 mr-1" />
                                                ทิ้งเศษ
                                              </button>
                                            </div>
                                          </div>

                                          {/* Volume outputs */}
                                          <div className="col-span-12">
                                            {drug.useMode === 'full' ? (
                                              <div className="bg-slate-50 px-3.5 py-3 rounded-xl border border-slate-200 flex justify-between items-center text-xs shadow-inner h-11">
                                                <span className="text-slate-500 font-bold">ปริมาณใช้รวม (เต็มแอมป์):</span>
                                                <span className="font-extrabold text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-xxs">{expectedTotalCapacity} {meta.unit}</span>
                                              </div>
                                            ) : (
                                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4.5 shadow-inner">
                                                <div className="grid grid-cols-2 gap-3.5">
                                                  <div>
                                                    <label className="block text-xs font-bold text-slate-700 mb-1">ใช้จริง ({meta.unit})</label>
                                                    <input
                                                      type="number"
                                                      min="0"
                                                      step="any"
                                                      placeholder="0.0"
                                                      value={drug.actualUsed}
                                                      onChange={(e) => {
                                                        const val = e.target.value;
                                                        const valNum = parseFloat(val) || 0;
                                                        const waste = Math.max(0, expectedTotalCapacity - valNum);
                                                        handleUpdateDrugInCase(c.id, drug.id, { 
                                                          actualUsed: val, 
                                                          wastage: val.trim() ? waste.toFixed(2).replace(/\.00$/, '') : '' 
                                                        });
                                                      }}
                                                      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-2.5 h-11 text-sm text-slate-850 font-black focus:ring-4 focus:ring-blue-100 focus:border-blue-400 focus:outline-none transition-all shadow-xxs"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-xs font-bold text-slate-700 mb-1">ยาทิ้ง ({meta.unit})</label>
                                                    <input
                                                      type="number"
                                                      min="0"
                                                      step="any"
                                                      placeholder="0.0"
                                                      value={drug.wastage}
                                                      onChange={(e) => {
                                                        const val = e.target.value;
                                                        const valNum = parseFloat(val) || 0;
                                                        const used = Math.max(0, expectedTotalCapacity - valNum);
                                                        handleUpdateDrugInCase(c.id, drug.id, { 
                                                          wastage: val, 
                                                          actualUsed: val.trim() ? used.toFixed(2).replace(/\.00$/, '') : '' 
                                                        });
                                                      }}
                                                      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-2.5 h-11 text-sm text-slate-850 font-black focus:ring-4 focus:ring-blue-100 focus:border-blue-400 focus:outline-none transition-all shadow-xxs"
                                                    />
                                                  </div>
                                                </div>

                                                {/* Proportional Equalizer Segments for Mobile */}
                                                <div className="space-y-1">
                                                  <div className="flex gap-1 justify-between w-full bg-slate-200/50 p-1 rounded-md">
                                                    {Array.from({ length: 10 }).map((_, idx) => {
                                                      const threshold = ((idx + 1) / 10) * 100;
                                                      const isActive = ratio >= threshold;
                                                      return (
                                                        <div 
                                                          key={idx} 
                                                          className={`h-2 flex-1 rounded-xs transition-all duration-300 ${
                                                            isActive ? 'bg-emerald-500' : 'bg-amber-500'
                                                          }`} 
                                                        />
                                                      );
                                                    })}
                                                  </div>
                                                  <div className="flex justify-between text-[9px] text-slate-500 font-bold">
                                                    <span className="text-emerald-700 font-extrabold">ใช้ {ratio.toFixed(0)}%</span>
                                                    <span className="text-amber-700 font-extrabold">ทิ้ง {(100-ratio).toFixed(0)}%</span>
                                                  </div>
                                                </div>

                                                {/* Slider Range for Mobile */}
                                                <div className="flex items-center gap-3 py-1">
                                                  <input
                                                    type="range"
                                                    min="0"
                                                    max={expectedTotalCapacity}
                                                    step={drug.drugName === 'Fentanyl 2 ml' ? 5 : drug.drugName === 'Fentanyl 10 ml' ? 10 : drug.drugName === 'Pethidine' ? 5 : drug.drugName === 'Midazolam' ? 0.5 : drug.drugName === 'Ketamine' ? 10 : 1}
                                                    value={usedVal}
                                                    onChange={(e) => {
                                                      const val = parseFloat(e.target.value) || 0;
                                                      const waste = Math.max(0, expectedTotalCapacity - val);
                                                      handleUpdateDrugInCase(c.id, drug.id, { 
                                                        actualUsed: val.toString(), 
                                                        wastage: waste.toFixed(2).replace(/\.00$/, '') 
                                                      });
                                                    }}
                                                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-700 focus:outline-none"
                                                  />
                                                </div>

                                                {/* Presets for Mobile */}
                                                <div className="space-y-1.5">
                                                  <span className="block text-[10px] font-bold text-slate-500">ปริมาณแนะนำ (Presets):</span>
                                                  <div className="flex flex-wrap gap-1.5">
                                                    {(DRUG_DOSAGE_PRESETS[drug.drugName] || [])
                                                      .filter(preset => preset <= expectedTotalCapacity)
                                                      .map(preset => {
                                                        const isSelected = Math.abs(usedVal - preset) < 0.01;
                                                        return (
                                                          <button
                                                            key={preset}
                                                            type="button"
                                                            onClick={() => {
                                                              const waste = Math.max(0, expectedTotalCapacity - preset);
                                                              handleUpdateDrugInCase(c.id, drug.id, {
                                                                actualUsed: preset.toString(),
                                                                wastage: waste.toFixed(2).replace(/\.00$/, '')
                                                              });
                                                            }}
                                                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-all border cursor-pointer ${
                                                              isSelected
                                                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xxs scale-105'
                                                                : 'bg-white text-slate-700 border-slate-200'
                                                            }`}
                                                          >
                                                            {preset} {meta.unit}
                                                          </button>
                                                        );
                                                      })}
                                                  </div>
                                                </div>

                                                <div className="text-center pt-2 border-t border-slate-200">
                                                  {isIncomplete ? (
                                                    <span className="text-xs text-red-500 font-extrabold flex items-center justify-center gap-1">⚠️ กรุณากรอกใช้จริงและยาทิ้งให้ครบ</span>
                                                  ) : isMismatch ? (
                                                    <span className="text-xs text-red-600 font-black animate-pulse flex items-center justify-center gap-1">
                                                      ❌ ผลรวมไม่ตรง: {totalSum} {meta.unit} (ต้องได้ {expectedTotalCapacity} {meta.unit})
                                                    </span>
                                                  ) : (
                                                    <span className="text-xs text-emerald-700 font-extrabold flex items-center justify-center gap-1">
                                                      ✓ ตรวจสอบข้อมูลตรง: {usedVal} + {wasteVal} = {totalSum} {meta.unit}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Interactive Case Completed Footer - Seamlessly adds next case */}
                        <div className="bg-blue-50/20 px-6 py-4 border-t border-blue-100/70 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => handleCompleteAndAddNextCase(c.id)}
                            className="inline-flex items-center gap-2 px-4.5 py-2.5 bg-blue-100 hover:bg-blue-200 text-blue-800 font-black text-xs md:text-sm rounded-xl transition duration-200 cursor-pointer shadow-xxs border border-blue-200/50 hover:scale-[1.01]"
                          >
                            <Check className="w-4 h-4 text-blue-750 stroke-[3px]" />
                            กรอกเคสนี้สำเร็จแล้ว ➔ เตรียมเคสถัดไป
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 3 Card for Special Controlled Submit Button - Quiet & Clinical */}
              <div className="lg:col-span-12 mt-4">
                <div className="bg-white rounded-3xl border border-slate-150 p-6 md:p-8 space-y-6 shadow-sm bg-gradient-to-tr from-white to-blue-50/5">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <div className="bg-blue-50 p-2.5 rounded-xl text-blue-700">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base md:text-lg font-black text-blue-950">3. ตรวจสอบข้อมูลรายงานและบันทึกข้อมูล</h3>
                      <p className="text-xs text-slate-500 font-bold mt-1">กรุณาสอบทานยอดปริมาณเปิดใช้ ใช้จริง และยาทิ้งให้ถูกต้องตามจริงก่อนทำการบันทึกข้อมูล</p>
                    </div>
                  </div>

                  {/* Real-time clinical summary preview */}
                  <div className="bg-blue-50/15 rounded-2xl p-5 md:p-6 border border-blue-100 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3 text-xs md:text-sm pb-3 border-b border-blue-100/60">
                      <div className="flex items-center gap-2 font-black text-blue-950 uppercase tracking-wide">
                        <Activity className="w-4.5 h-4.5 text-blue-700" />
                        สรุปรายการใช้ยาควบคุมพิเศษ (ก่อนบันทึกจริง)
                      </div>
                      <div className="flex items-center gap-2 bg-white border border-blue-100 px-3.5 py-2 rounded-xl shadow-xxs text-xs md:text-sm">
                        <User className="w-4 h-4 text-blue-600" />
                        <span className="text-blue-700 font-bold">ผู้บันทึกข้อมูล:</span>
                        {requesterName.trim() ? (
                          <span className="font-extrabold text-blue-950">{requesterName}</span>
                        ) : (
                          <span className="font-black text-amber-600 animate-pulse bg-amber-50 px-2 py-0.5 rounded border border-amber-150">⚠️ กรุณาระบุในขั้นตอนที่ 1</span>
                        )}
                      </div>
                    </div>

                    <div className="divide-y divide-blue-100/80 max-h-[400px] overflow-y-auto pr-2 space-y-4">
                      {controlledCases.map((c, idx) => {
                        const caseNum = idx + 1;
                        const hasOr = !!c.orRoom;
                        const hasHn = !!c.patientHN.trim();
                        const isCaseValid = hasOr && hasHn;

                        return (
                          <div key={c.id} className="pt-3.5 first:pt-0 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs md:text-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-lg">
                                  เคสที่ {caseNum}
                                </span>
                                <span className={`font-extrabold inline-flex items-center gap-1.5 ${hasOr ? 'text-blue-950' : 'text-red-600 font-black animate-pulse bg-red-50 px-2 py-0.5 rounded border border-red-100'}`}>
                                  <Building className="w-4 h-4 text-blue-500" />
                                  OR: {hasOr ? c.orRoom : 'กรุณาเลือกห้อง OR/แผนก'}
                                </span>
                                <span className="text-blue-200 font-bold">|</span>
                                <span className={`font-extrabold inline-flex items-center gap-1.5 ${hasHn ? 'text-blue-900' : 'text-red-600 font-black animate-pulse bg-red-50 px-2 py-0.5 rounded border border-red-100'}`}>
                                  <Activity className="w-4 h-4 text-blue-500" />
                                  HN: {hasHn ? c.patientHN : 'กรุณาระบุ HN ผู้ป่วย'}
                                </span>
                              </div>
                              {!isCaseValid && (
                                <span className="text-[10px] font-black text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
                                  กรุณากรอกข้อมูลเคสให้ครบถ้วน
                                </span>
                              )}
                            </div>

                            {/* Case's drug list summary */}
                            <div className="pl-4 sm:pl-8 space-y-2.5 bg-white p-4 rounded-2xl border border-blue-100/50">
                              {c.drugs.length === 0 ? (
                                <div className="text-xs text-slate-400 italic font-bold">ไม่มีรายการยาควบคุมพิเศษที่เลือก</div>
                              ) : (
                                c.drugs.map((drug) => {
                                  const meta = SPECIAL_DRUGS_METADATA[drug.drugName] || { type: 'Amp', capacity: 10, unit: 'mg', display: drug.drugName };
                                  const expectedTotalCapacity = drug.ampsCount * meta.capacity;
                                  const usedVal = parseFloat(drug.actualUsed) || 0;
                                  const wasteVal = parseFloat(drug.wastage) || 0;
                                  const totalSum = usedVal + wasteVal;
                                  const hasInputs = drug.actualUsed.trim() !== '' && drug.wastage.trim() !== '';
                                  const isMismatch = drug.drugName !== 'Ketamine' && hasInputs && Math.abs(totalSum - expectedTotalCapacity) > 0.0001;
                                  const isIncomplete = drug.useMode === 'partial' && (!drug.actualUsed.trim() || !drug.wastage.trim());

                                  return (
                                    <div key={drug.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs md:text-sm text-slate-900 border-b border-dashed border-slate-100 last:border-b-0 pb-2 last:pb-0">
                                      <div className="flex items-center gap-2">
                                        <Pill className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                        <span className="font-black text-slate-900">{meta.display}</span>
                                        <span className="text-slate-500 font-bold">
                                          (เปิดใช้ {drug.ampsCount} {meta.type === 'Amp' ? 'แอมป์' : 'ขวด'})
                                        </span>
                                      </div>
                                      <div className="text-right sm:text-left shrink-0 font-bold">
                                        {drug.useMode === 'full' ? (
                                          <span className="text-emerald-800 font-extrabold bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl text-xs inline-block">
                                            ใช้เต็มจำนวน ({expectedTotalCapacity} {meta.unit})
                                          </span>
                                        ) : isIncomplete ? (
                                          <span className="text-red-700 font-extrabold bg-red-50 border border-red-200 px-3 py-1 rounded-xl text-xs inline-block animate-pulse">
                                            ⚠️ กรอกปริมาณใช้/ทิ้งไม่ครบ
                                          </span>
                                        ) : isMismatch ? (
                                          <span className="text-red-700 font-black bg-red-50 border border-red-300 px-3 py-1 rounded-xl text-xs inline-block">
                                            ❌ ยอดรวมไม่ตรง ({usedVal} + {wasteVal} = {totalSum} ≠ {expectedTotalCapacity} {meta.unit})
                                          </span>
                                        ) : (
                                          <span className="text-slate-900 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs inline-block shadow-xxs">
                                            ใช้จริง <span className="font-black text-slate-800">{usedVal}</span> + ทิ้ง <span className="font-black text-amber-600">{wasteVal}</span> {meta.unit} (รวม {totalSum} {meta.unit})
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {submitError && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs md:text-sm font-semibold leading-relaxed whitespace-pre-wrap">
                      ⚠️ {submitError}
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={`w-full py-4 px-6 rounded-2xl font-black text-sm md:text-base transition-all duration-200 flex items-center justify-center gap-2.5 shadow-md cursor-pointer ${
                        isSubmitting
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                          : 'bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white hover:shadow-lg active:scale-[0.99] hover:ring-4 hover:ring-blue-100'
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          กำลังประมวลผลและปรับยอดคลัง...
                        </>
                      ) : (
                        <>
                          <Check className="w-5 h-5 stroke-[2.5px]" />
                          ส่งรายงานและตัดยอดใช้ยาควบคุมพิเศษ
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>



          </div>
        )}

        {/* ==================== TAB 3: ADMIN PANEL (MANAGEMENT & STATS) ==================== */}
        {activeTab === 'admin' && (
          <div className="space-y-8 no-print">
            {!isAdminAuthenticated ? (
              <div className="max-w-md mx-auto bg-white rounded-3xl shadow-sm border border-slate-200 p-8 md:p-10 text-center space-y-8 no-print mt-12">
                <div className="bg-slate-50 text-slate-700 w-20 h-20 rounded-full mx-auto flex items-center justify-center border border-slate-100 shadow-xs">
                  <Lock className="w-9 h-9 text-slate-600" />
                </div>
                <div className="space-y-2.5">
                  <h2 className="text-xl font-bold text-slate-800 tracking-tight">ระบบเข้าสู่ส่วนผู้ดูแลคลัง (Admin)</h2>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-xs mx-auto">
                    เฉพาะบุคลากรผู้ดูแลระบบคลังเวชภัณฑ์วิสัญญี Supply Anesth-KKU เท่านั้น
                  </p>
                </div>

                <form onSubmit={handleUnlockAdmin} className="space-y-5">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider text-left pl-1">รหัสผ่านผู้ดูแลระบบ</label>
                    <input
                      type="password"
                      placeholder="••••••"
                      value={adminPasscode}
                      onChange={(e) => setAdminPasscode(e.target.value)}
                      className="w-full text-center tracking-widest bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-xl font-black focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition duration-150"
                    />
                  </div>

                  {passcodeError && (
                    <p className="text-rose-600 text-xs font-semibold bg-rose-50/50 py-2 px-3 rounded-xl border border-rose-100 flex items-center justify-center gap-1.5">{passcodeError}</p>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-6 rounded-2xl shadow-sm transition duration-150 text-sm tracking-wide cursor-pointer"
                  >
                    ยืนยันตัวตนเพื่อเข้าสู่ระบบ
                  </button>
                </form>
              </div>
            ) : (
              // --- Authenticated Admin Panel Workspace ---
              <div className="space-y-8">
                
                {/* Admin Subheader Panel Controls */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 flex flex-col xl:flex-row items-center justify-between gap-6 no-print">
                  <div className="flex items-center gap-4 w-full xl:w-auto">
                    <div className="bg-emerald-50 text-emerald-800 p-3.5 rounded-2xl border border-emerald-100 shrink-0">
                      <ShieldAlert className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">แผงควบคุมหลักผู้ดูแลระบบ</h2>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        จัดการยอดสต็อกคลังเวชภัณฑ์, บันทึกการเบิก-คืนของวิสัญญีแพทย์ และสรุปรายงานสถิติวิเคราะห์
                      </p>
                    </div>
                  </div>

                  {/* Subnav links inside Segmented Control container */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50 w-full xl:w-auto overflow-x-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => setAdminActiveSubTab('stock')}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold transition duration-150 flex items-center justify-center gap-2 grow xl:grow-0 shrink-0 ${
                        adminActiveSubTab === 'stock'
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/30 font-black'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                      }`}
                    >
                      <Database className="w-4 h-4 text-emerald-600" />
                      จัดการสต็อกยา
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminActiveSubTab('history')}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold transition duration-150 flex items-center justify-center gap-2 grow xl:grow-0 shrink-0 ${
                        adminActiveSubTab === 'history'
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/30 font-black'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                      }`}
                    >
                      <FileText className="w-4 h-4 text-indigo-600" />
                      ประวัติการเบิก-คืน
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminActiveSubTab('stats')}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold transition duration-150 flex items-center justify-center gap-2 grow xl:grow-0 shrink-0 ${
                        adminActiveSubTab === 'stats'
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/30 font-black'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                      }`}
                    >
                      <BarChart2 className="w-4 h-4 text-pink-600" />
                      รายงานสถิติวิเคราะห์
                    </button>
                    
                    <div className="border-l border-slate-200 h-6 mx-2 shrink-0"></div>
                    
                    <button
                      type="button"
                      onClick={() => setIsAdminAuthenticated(false)}
                      className="p-2.5 rounded-xl text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition shrink-0"
                      title="ออกจากระบบแอดมิน"
                    >
                      <LogOut className="w-4.5 h-4.5" />
                    </button>
                  </div>
                </div>

                {/* --- 2.1 ADMIN SUBTAB: STOCK MANAGEMENT --- */}
                {adminActiveSubTab === 'stock' && (
                  <div className="space-y-8 no-print animate-fade-in">

                    {/* Live Cabinet Inventory & Empty Ampoules Tracker Dashboard */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-5">
                        <div className="flex items-center gap-3">
                          <div className="bg-emerald-50 p-2.5 rounded-2xl text-emerald-600 border border-emerald-100">
                            <Database className="w-5 h-5" />
                          </div>
                          <div className="space-y-0.5">
                            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                              <Sparkles className="w-4.5 h-4.5 text-yellow-500" />
                              สถานะยอดสต็อกยาในตู้ และยอดแอมป์เปล่าสะสม (Real-time Cabinet Stock & Empty Amps)
                            </h3>
                            <p className="text-xs text-slate-500 font-medium">
                              เปรียบเทียบยอดคงเหลือพร้อมใช้จริงในตู้ กับยอดแอมป์เปล่าค้างส่งคืนห้องยาควบคุมพิเศษ
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3.5 py-1.5 rounded-xl self-start sm:self-auto flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          อัปเดตเรียลไทม์
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {SPECIAL_CONTROLLED_DRUGS_LIST.map((name) => {
                          const drugId = mapSpecialDrugToCabinetDrugId(name);
                          const matchingDrug = drugs.find(d => d.id === drugId);
                          const stock = matchingDrug ? matchingDrug.stock : 0;
                          const unit = matchingDrug ? matchingDrug.unit : 'amp';
                          const emptyCount = emptyAmpsAccumulator[name] || 0;

                          return (
                            <div key={name} className="bg-slate-50/30 hover:bg-slate-50/60 border border-slate-200/70 rounded-2xl p-5 transition duration-150 space-y-4">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <span className="text-xs font-bold text-slate-800 truncate" title={name}>
                                  {name}
                                </span>
                                <span className="text-[9px] font-black px-2 py-0.5 rounded bg-slate-200 text-slate-600 uppercase font-mono">
                                  {unit}
                                </span>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3 text-center">
                                <div className="bg-emerald-50/40 border border-emerald-100/60 p-2.5 rounded-xl">
                                  <span className="text-[10px] text-emerald-700 block font-bold leading-none">ยาในตู้</span>
                                  <span className="text-sm font-black text-emerald-800 block mt-1.5 font-mono">
                                    {stock}
                                  </span>
                                </div>
                                <div className="bg-pink-50/40 border border-pink-100/60 p-2.5 rounded-xl">
                                  <span className="text-[10px] text-pink-700 block font-bold leading-none">แอมป์เปล่า</span>
                                  <span className="text-sm font-black text-pink-800 block mt-1.5 font-mono">
                                    {emptyCount}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                      
                      {/* Left Column: Add Drug and Empty Ampoules management */}
                      <div className="lg:col-span-4 space-y-8">
                        
                        {/* Add Drug panel */}
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-6 h-fit">
                          <div className="border-b border-slate-100 pb-4">
                            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                              <Plus className="w-5 h-5 text-emerald-600" />
                              เพิ่มรายการยาเข้าระบบ
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">ระบุชื่อเวชภัณฑ์และจำนวนโควต้าเริ่มต้น</p>
                          </div>

                          <form onSubmit={handleAddNewDrug} className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider pl-0.5">ชื่อรายการยา *</label>
                              <input
                                type="text"
                                placeholder="เช่น Fentanyl 100 mcg/2 ml"
                                value={newDrugName}
                                onChange={(e) => setNewDrugName(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider pl-0.5">หมวดหมู่จัดเก็บ *</label>
                              <select
                                value={newDrugCategory}
                                onChange={(e) => setNewDrugCategory(e.target.value as DrugCategory)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                              >
                                {Object.entries(CATEGORY_LABELS).map(([key, val]) => (
                                  <option key={key} value={key}>{val}</option>
                                ))}
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider pl-0.5">สต็อกเริ่มต้น *</label>
                                <input
                                  type="number"
                                  value={newDrugStock}
                                  onChange={(e) => setNewDrugStock(Math.max(0, parseInt(e.target.value) || 0))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs text-center font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider pl-0.5">หน่วยนับ *</label>
                                <input
                                  type="text"
                                  placeholder="เช่น amp, vial"
                                  value={newDrugUnit}
                                  onChange={(e) => setNewDrugUnit(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs text-center font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                                />
                              </div>
                            </div>

                            <button
                              type="submit"
                              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-4 rounded-xl shadow-xs text-xs transition duration-150 mt-3 cursor-pointer"
                            >
                              ยืนยันการเพิ่มยาเข้าระบบ
                            </button>
                          </form>
                        </div>

                        {/* Empty Ampoules Management Panel */}
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-6 h-fit">
                          <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-0.5">
                              <h3 className="text-sm md:text-base font-bold text-slate-800 flex items-center gap-2">
                                <Sparkles className="w-4.5 h-4.5 text-purple-600" />
                                จัดการยอดแอมป์เปล่าสะสม
                              </h3>
                              <p className="text-xxs text-slate-500 font-medium">
                                ยอดแอมป์/ขวดเปล่ายาควบคุมพิเศษค้างส่งคืนห้องยา
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                Swal.fire({
                                  title: 'คุณต้องการรีเซ็ตยอดแอมป์เปล่าสะสมหรือไม่?',
                                  text: 'ยอดสะสมของแอมป์/ขวดเปล่ายาควบคุมพิเศษทั้งหมดจะกลับเป็น 0',
                                  icon: 'warning',
                                  showCancelButton: true,
                                  confirmButtonText: 'ใช่, รีเซ็ตเป็น 0',
                                  cancelButtonText: 'ยกเลิก',
                                  confirmButtonColor: '#e11d48',
                                  cancelButtonColor: '#4b5563',
                                }).then((result) => {
                                  if (result.isConfirmed) {
                                    const reseted: Record<string, number> = {};
                                    SPECIAL_CONTROLLED_DRUGS_LIST.forEach(name => {
                                      reseted[name] = 0;
                                    });
                                    setEmptyAmpsAccumulator(reseted);
                                    localStorage.setItem('supply_anesth_empty_amps', JSON.stringify(reseted));

                                    Swal.fire({
                                      title: 'รีเซ็ตสำเร็จ!',
                                      text: 'ล้างยอดสะสมแอมป์เปล่าเป็น 0 เรียบร้อยแล้ว',
                                      icon: 'success',
                                      confirmButtonColor: '#10b981',
                                      timer: 1500
                                    });
                                  }
                                });
                              }}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold transition border border-rose-100 shrink-0 self-start sm:self-auto cursor-pointer"
                            >
                              ล้างทั้งหมด
                            </button>
                          </div>

                          <div className="space-y-3">
                            {SPECIAL_CONTROLLED_DRUGS_LIST.map((name) => {
                              const count = emptyAmpsAccumulator[name] || 0;
                              return (
                                <div key={name} className="flex items-center justify-between text-xs bg-slate-50 hover:bg-slate-100/50 p-3 rounded-2xl border border-slate-200/50 transition">
                                  <span className="font-bold text-slate-700 truncate mr-2" title={name}>{name}</span>
                                  <div className="flex items-center gap-2.5 shrink-0">
                                    <span className="bg-pink-50 text-pink-700 border border-pink-100 px-2.5 py-1 rounded-xl font-black font-mono text-[10px]">
                                      {count} แอมป์
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEmptyAmpsAccumulator(prev => ({
                                          ...prev,
                                          [name]: 0
                                        }));
                                      }}
                                      disabled={count === 0}
                                      className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition cursor-pointer ${
                                        count === 0
                                          ? 'text-slate-300 bg-slate-100 cursor-not-allowed border border-slate-100'
                                          : 'text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 shadow-xxs'
                                      }`}
                                    >
                                      เคลียร์
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                      </div>

                      {/* Stock listing table */}
                      <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                          <div className="space-y-0.5">
                            <h3 className="text-base font-bold text-slate-800">
                              ตารางจัดการคลังยาสลบและเวชภัณฑ์ทั้งหมด ({drugs.length} ชนิด)
                            </h3>
                            <p className="text-xs text-slate-500 font-medium">แยกหมวดหมู่ตัวยาเพื่อการปรับสต็อก ปรับจูนยอด และถอนรายการเวชภัณฑ์</p>
                          </div>
                        </div>

                        {/* Category Switcher Tabs - Minimalist styled */}
                        <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-slate-100">
                          <button
                            type="button"
                            onClick={() => setAdminSelectedCategory('all')}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition duration-150 cursor-pointer ${
                              adminSelectedCategory === 'all'
                                ? 'bg-slate-900 text-white shadow-xs'
                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            ยาทั้งหมด ({drugs.length})
                          </button>
                          {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
                            const count = drugs.filter(d => d.category === cat).length;
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setAdminSelectedCategory(cat)}
                                className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition duration-150 cursor-pointer ${
                                  adminSelectedCategory === cat
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {label} ({count})
                              </button>
                            );
                          })}
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-100">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-600 uppercase font-bold">
                                <th className="py-3 px-4">ชื่อยา</th>
                                <th className="py-3 px-4">หมวดหมู่คลัง</th>
                                <th className="py-3 px-4 text-center">คงเหลือในตู้ (ปรับค่าจำนวนจริง)</th>
                                <th className="py-3 px-4 text-center">หน่วย</th>
                                <th className="py-3 px-4 text-center">การดำเนินการ</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {drugs
                                .filter(drug => adminSelectedCategory === 'all' ? true : drug.category === adminSelectedCategory)
                                .map(drug => {
                                  if (editingDrugId === drug.id) {
                                    return (
                                      <tr key={drug.id} className="bg-indigo-50/30 border border-indigo-100 transition">
                                        <td className="py-3 px-4 font-bold">
                                          <input
                                            type="text"
                                            value={editingDrugName}
                                            onChange={(e) => setEditingDrugName(e.target.value)}
                                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500"
                                          />
                                        </td>
                                        <td className="py-3 px-4">
                                          <select
                                            value={editingDrugCategory}
                                            onChange={(e) => setEditingDrugCategory(e.target.value as DrugCategory)}
                                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 cursor-pointer"
                                          >
                                            {Object.entries(CATEGORY_LABELS).map(([catKey, catLabel]) => (
                                              <option key={catKey} value={catKey}>{catLabel}</option>
                                            ))}
                                          </select>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                          <div className="flex items-center justify-center gap-1">
                                            <button
                                              type="button"
                                              onClick={() => setEditingDrugStock(prev => Math.max(0, prev - 10))}
                                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-[9px] font-black transition flex items-center justify-center border border-slate-200 cursor-pointer"
                                              title="ลด 10"
                                            >
                                              -10
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditingDrugStock(prev => Math.max(0, prev - 1))}
                                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition flex items-center justify-center border border-slate-200 cursor-pointer"
                                              title="ลด 1"
                                            >
                                              <Minus className="w-3 h-3" />
                                            </button>
                                            <input
                                              type="number"
                                              value={editingDrugStock}
                                              onChange={(e) => setEditingDrugStock(Math.max(0, parseInt(e.target.value) || 0))}
                                              className="w-14 h-7 text-center bg-white border border-slate-300 rounded-lg text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => setEditingDrugStock(prev => prev + 1)}
                                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition flex items-center justify-center border border-slate-200 cursor-pointer"
                                              title="เพิ่ม 1"
                                            >
                                              <Plus className="w-3 h-3" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditingDrugStock(prev => prev + 10)}
                                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-[9px] font-black transition flex items-center justify-center border border-slate-200 cursor-pointer"
                                              title="เพิ่ม 10"
                                            >
                                              +10
                                            </button>
                                          </div>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                          <input
                                            type="text"
                                            value={editingDrugUnit}
                                            onChange={(e) => setEditingDrugUnit(e.target.value)}
                                            className="w-14 bg-white border border-slate-300 rounded-lg px-1.5 py-1 text-xs font-bold font-mono text-center text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500"
                                          />
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                          <div className="flex items-center justify-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={handleSaveDrugEdit}
                                              className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm transition cursor-pointer"
                                            >
                                              <Check className="w-3 h-3" />
                                              บันทึก
                                            </button>
                                            <button
                                              type="button"
                                              onClick={handleCancelDrugEdit}
                                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center gap-1 transition border border-slate-200 cursor-pointer"
                                            >
                                              <X className="w-3 h-3" />
                                              ยกเลิก
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return (
                                    <tr key={drug.id} className="hover:bg-slate-50/20 transition">
                                      <td className="py-3.5 px-4 font-bold text-slate-800">{drug.name}</td>
                                      <td className="py-3.5 px-4">
                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200/50 px-2 py-1 rounded-lg">
                                          {CATEGORY_LABELS[drug.category]}
                                        </span>
                                      </td>
                                      <td className="py-3.5 px-4 text-center">
                                        <div className="flex items-center justify-center gap-1.5">
                                          {/* Quick adjust buttons */}
                                          <button
                                            type="button"
                                            onClick={() => handleAdjustStock(drug.id, -10)}
                                            className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-rose-50 hover:text-rose-600 text-slate-500 text-[10px] font-black transition flex items-center justify-center border border-slate-200/60 hover:border-rose-200 cursor-pointer"
                                            title="ลด 10"
                                          >
                                            -10
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleAdjustStock(drug.id, -1)}
                                            className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold transition flex items-center justify-center border border-slate-200/60 cursor-pointer"
                                            title="ลด 1"
                                          >
                                            <Minus className="w-3.5 h-3.5" />
                                          </button>

                                          {/* Number field */}
                                          <input
                                            type="number"
                                            value={drug.stock}
                                            onChange={(e) => handleDirectStockChange(drug.id, Math.max(0, parseInt(e.target.value) || 0))}
                                            className="w-16 h-7 text-center bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-white transition"
                                          />

                                          <button
                                            type="button"
                                            onClick={() => handleAdjustStock(drug.id, 1)}
                                            className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold transition flex items-center justify-center border border-slate-200/60 cursor-pointer"
                                            title="เพิ่ม 1"
                                          >
                                            <Plus className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleAdjustStock(drug.id, 10)}
                                            className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-emerald-50 hover:text-emerald-600 text-slate-500 text-[10px] font-black transition flex items-center justify-center border border-slate-200/60 hover:border-emerald-200 cursor-pointer"
                                            title="เพิ่ม 10"
                                          >
                                            +10
                                          </button>
                                        </div>
                                      </td>
                                      <td className="py-3.5 px-4 text-center text-slate-500 font-bold font-mono text-[10px]">{drug.unit}</td>
                                      <td className="py-3.5 px-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => handleStartEditDrug(drug)}
                                            className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center justify-center gap-1 transition cursor-pointer"
                                          >
                                            <Edit className="w-3 h-3" />
                                            แก้ไข
                                          </button>
                                          <span className="text-slate-300">|</span>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteDrug(drug.id)}
                                            className="text-[10px] font-extrabold text-rose-500 hover:text-rose-700 hover:underline flex items-center justify-center gap-1 transition cursor-pointer"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            ลบออก
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                  </div>
                )}



                {/* --- 2.2 ADMIN SUBTAB: REQUISITION & RETURN LOG HISTORY --- */}
                {/* --- 2.2 ADMIN SUBTAB: REQUISITION & RETURN LOG HISTORY --- */}
                {adminActiveSubTab === 'history' && (
                  <div className="space-y-6 no-print">
                    
                    {/* Log Filter Card */}
                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-6 md:p-8 space-y-6">
                      <div className="border-b border-slate-100 pb-4">
                        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                          <Filter className="w-4 h-4 text-slate-500" />
                          ตัวกรองและค้นหารายการประวัติ
                        </h3>
                        <p className="text-xxs text-slate-400 mt-0.5">ระบุคำค้นหาหรือเลือกหมวดหมู่ที่ต้องการ เพื่อสืบค้นข้อมูลประวัติการเบิก-คืนยาอย่างละเอียด</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        {/* Action Type filter */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-0.5">ประเภทธุรกรรม</label>
                          <div className="relative">
                            <select
                              value={historySearchType}
                              onChange={(e) => setHistorySearchType(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-8 py-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-500/15 focus:border-slate-500 appearance-none text-slate-700 cursor-pointer"
                            >
                              <option value="all">ทั้งหมด (เบิก/คืน)</option>
                              <option value="เบิก">เฉพาะรายการเบิกยา</option>
                              <option value="คืน">เฉพาะรายการคืนยา</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-500">
                              <ChevronDown className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>

                        {/* Room filter */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-0.5">ห้อง OR</label>
                          <div className="relative">
                            <select
                              value={historySearchOR}
                              onChange={(e) => setHistorySearchOR(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-8 py-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-500/15 focus:border-slate-500 appearance-none text-slate-700 cursor-pointer"
                            >
                              <option value="all">ทุกห้อง OR</option>
                              {OR_ROOMS.map(room => (
                                <option key={room} value={room}>{room}</option>
                              ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-500">
                              <ChevronDown className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>

                        {/* Patient HN filter */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-0.5">ชื่อ-นามสกุล หรือ HN ผู้ป่วย</label>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="ค้นหาชื่อ หรือ HN..."
                              value={historySearchHN}
                              onChange={(e) => setHistorySearchHN(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8.5 pr-3.5 py-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-500/15 focus:border-slate-500 text-slate-700"
                            />
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                              <Search className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>

                        {/* Drug Name filter */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-0.5">ชื่อตัวยา</label>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="ค้นหายา..."
                              value={historySearchDrug}
                              onChange={(e) => setHistorySearchDrug(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8.5 pr-3.5 py-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-500/15 focus:border-slate-500 text-slate-700"
                            />
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                              <Search className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>

                        {/* Requester filter */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-0.5">ชื่อผู้ดำเนินรายการ</label>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="ค้นหาผู้เบิก/คืน..."
                              value={historySearchRequester}
                              onChange={(e) => setHistorySearchRequester(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8.5 pr-3.5 py-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-500/15 focus:border-slate-500 text-slate-700"
                            />
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                              <Search className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Results Table Card */}
                    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
                      {/* Section Header */}
                      <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-indigo-600" />
                            บันทึกประวัติการเบิก-คืนวิสัญญี ({filteredHistory.length} รายการ)
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">ประวัติย้อนหลังแสดงรายการเบิกจ่ายและการคืนวัสดุยาอย่างครบถ้วน</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={handleClearAllData}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-150 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                            title="ล้างข้อมูลและประวัติสะสมทั้งหมด"
                          >
                            <Trash2 className="w-4 h-4" />
                            รีเซ็ตประวัติคลังยา
                          </button>

                          <button
                            type="button"
                            onClick={handleExportHistoryCSV}
                            className="bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 border border-emerald-150 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition duration-150 cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                            ส่งออก Excel (CSV)
                          </button>

                          <button
                            type="button"
                            onClick={handlePrintHistory}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition duration-150 cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                            พิมพ์รายงาน (Print PDF)
                          </button>
                        </div>
                      </div>

                      {/* History logs rendering table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50/70 border-b border-slate-150 text-slate-600 font-bold uppercase tracking-wider">
                              <th className="py-4 px-6 text-slate-500">วัน-เวลา</th>
                              <th className="py-4 px-4 text-center">ประเภท</th>
                              <th className="py-4 px-4">ห้อง OR</th>
                              <th className="py-4 px-4">ชื่อ-นามสกุล / HN</th>
                              <th className="py-4 px-4">ผู้ดำเนินงาน</th>
                              <th className="py-4 px-4 text-center">กล่อง Block</th>
                              <th className="py-4 px-4 text-center">กล่อง Extra</th>
                              <th className="py-4 px-4 text-center">ตู้เย็น/ห้อง</th>
                              <th className="py-4 px-6">รายละเอียดตัวยาที่ทำรายการ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {filteredHistory.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="py-16 text-center text-slate-400 font-bold text-xs bg-slate-50/10">
                                  <div className="max-w-xs mx-auto space-y-2">
                                    <p>ไม่พบบันทึกประวัติการเบิก-คืนยา</p>
                                    <p className="text-xxs text-slate-400 font-medium">กรุณาปรับตัวเลือกตัวกรอง หรือสร้างรายการทำประวัติใหม่ในระบบ</p>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              filteredHistory.map(tx => (
                                <tr 
                                  key={tx.id} 
                                  id={`tx-row-hist-${tx.id}`}
                                  className={`hover:bg-slate-50/25 align-top transition-colors duration-150 ${
                                    highlightedTxIds.has(tx.id) 
                                      ? (tx.notes?.includes('[ยาควบคุมพิเศษ]') || tx.specialControlledDrugs?.length > 0 ? 'animate-row-flash-purple' : 'animate-row-flash-amber') 
                                      : ''
                                  }`}
                                >
                                  <td className="py-4 px-6 font-mono text-slate-500 text-[10px] leading-relaxed">
                                    {new Date(tx.timestamp).toLocaleString('th-TH', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </td>
                                  <td className="py-4 px-4 text-center">
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold ${
                                      tx.type === 'เบิก' 
                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                                        : 'bg-amber-50 text-amber-800 border border-amber-100'
                                    }`}>
                                      {tx.type}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4">
                                    <div className="flex flex-col gap-1">
                                      <span className="font-bold text-slate-800">{tx.orRoom}</span>
                                      <span className="font-semibold text-slate-400 text-[9px] font-mono whitespace-nowrap bg-slate-50 border border-slate-150 px-1.5 py-0.5 rounded w-fit">
                                        {tx.deviceName || 'PC-OR01-ANESTH'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-4 px-4 font-mono font-medium text-slate-700 leading-relaxed max-w-[120px] truncate" title={tx.patientHN}>{tx.patientHN}</td>
                                  <td className="py-4 px-4 text-slate-800 font-medium">{tx.requesterName}</td>
                                  
                                  {/* Box Kits status tags */}
                                  <td className="py-4 px-4 text-center">
                                    {tx.blockBox === 'เบิก' || tx.blockBox === 'คืน' ? (
                                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                        tx.type === 'เบิก' ? 'bg-emerald-100/40 text-emerald-800' : 'bg-amber-100/40 text-amber-800'
                                      }`}>
                                        ✓ {tx.blockBox}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 font-mono text-[10px]">-</span>
                                    )}
                                  </td>
                                  <td className="py-4 px-4 text-center">
                                    {tx.extraBox === 'เบิก' || tx.extraBox === 'คืน' ? (
                                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                        tx.type === 'เบิก' ? 'bg-emerald-100/40 text-emerald-800' : 'bg-amber-100/40 text-amber-800'
                                      }`}>
                                        ✓ {tx.extraBox}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 font-mono text-[10px]">-</span>
                                    )}
                                  </td>
                                  <td className="py-4 px-4 text-center">
                                    {tx.coldOrRoomTempBox === 'เบิก' || tx.coldOrRoomTempBox === 'คืน' ? (
                                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                        tx.type === 'เบิก' ? 'bg-emerald-100/40 text-emerald-800' : 'bg-amber-100/40 text-amber-800'
                                      }`}>
                                        ✓ {tx.coldOrRoomTempBox}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 font-mono text-[10px]">-</span>
                                    )}
                                  </td>

                                  {/* Drug entries */}
                                  <td className="py-4 px-6 font-mono text-xs max-w-sm space-y-2">
                                    {tx.items.length === 0 ? (
                                      <span className="text-slate-400 text-xxs italic">ไม่มีตัวยาเบิกเพิ่ม</span>
                                    ) : (
                                      <div className="flex flex-wrap gap-1.5">
                                        {tx.items.map((item, idx) => (
                                          <div key={idx} className="flex items-center gap-1 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded-lg text-slate-700 text-xxs font-bold">
                                            <span>{item.name}</span>
                                            <span className="text-emerald-700 font-mono font-black ml-1">x{item.quantity}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {tx.specialControlledDrugs && tx.specialControlledDrugs.length > 0 && (
                                      <div className="mt-1 bg-purple-50/50 border border-purple-100/85 p-2 rounded-xl space-y-1">
                                        <p className="font-bold text-purple-700 flex items-center gap-1 text-[9px] uppercase tracking-wider">
                                          <Sparkles className="w-3.5 h-3.5 text-purple-600" /> ยาควบคุมพิเศษ
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                          {tx.specialControlledDrugs.map((item, idx) => (
                                            <div key={idx} className="bg-white border border-purple-200/80 text-purple-950 px-2 py-0.5 rounded-lg text-xxs font-bold flex items-center">
                                              <span>{item.name}</span>
                                              <span className="font-mono font-black text-purple-700 ml-1 bg-purple-50 px-1 rounded-sm">{item.quantity} {item.unit}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {tx.notes && (
                                      <div className="mt-1 text-[10px] text-slate-500 font-sans italic bg-slate-50 p-1.5 rounded-lg border border-slate-100 flex items-start gap-1">
                                        <span className="font-bold text-slate-400 shrink-0">หมายเหตุ:</span>
                                        <span className="leading-normal">{tx.notes}</span>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* --- 2.3 ADMIN SUBTAB: STATS AND ANALYTICS CHARTS --- */}
                {adminActiveSubTab === 'stats' && (
                  <div className="space-y-6">

                    {/* --- Consolidated Inventory & Accumulation Table --- */}
                    <div className="bg-white rounded-3xl shadow-xs border border-slate-200 p-6 md:p-8 space-y-6">
                      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2.5">
                            <Database className="w-5 h-5 text-indigo-600" />
                            ตารางสรุปยอดบัญชีคลังและยอดใช้ยาสะสม ณ ปัจจุบัน (สรุปผลสะสมทั้งหมด)
                          </h3>
                          <p className="text-xs text-slate-500 font-medium">รายงานสรุปข้อมูลคลังยาในตู้วิสัญญีสะสมและประเมินผลต่อเนื่องในระบบเรียลไทม์</p>
                        </div>
                        
                        {/* Print & Export Actions */}
                        <div className="flex flex-wrap items-center gap-2.5 no-print">
                          <button
                            type="button"
                            onClick={handleExportCSV}
                            className="px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 border border-emerald-150 text-xs font-bold flex items-center gap-1.5 transition duration-150 cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                            ส่งออก Excel (CSV)
                          </button>
                          <button
                            type="button"
                            onClick={handlePrintSummary}
                            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition duration-150 shadow-xs cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                            พิมพ์รายงาน (Print PDF)
                          </button>
                          <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-2 rounded-xl font-bold shrink-0">
                            สะสมต่อเนื่อง
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Box 1: General and Refrigerated Drugs */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs md:text-sm font-bold text-slate-700 flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                              คลังยาสลบและวัสดุทั่วไป (General & Refrigerated Stocks)
                            </h4>
                            <span className="text-[10px] text-slate-400 font-bold font-mono">หน่วย: หลอด/ขวด</span>
                          </div>
                          <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-xxs">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-600 font-bold">
                                  <th className="py-3 px-4">ชื่อรายการยา</th>
                                  <th className="py-3 px-4 text-center">ยอดเบิกสะสม</th>
                                  <th className="py-3 px-4 text-center">ยอดคืนสะสม</th>
                                  <th className="py-3 px-4 text-center bg-emerald-50/50 text-emerald-800">คงเหลือในคลังตู้</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                {drugs.filter(d => d.category !== 'special-controlled').map(d => {
                                  const s = dynamicAccumulatedStats[d.id] || { borrowed: 0, returned: 0 };
                                  return (
                                    <tr key={d.id} className="hover:bg-slate-50/30 transition">
                                      <td className="py-3 px-4 font-bold text-slate-800">{d.name}</td>
                                      <td className="py-3 px-4 text-center text-emerald-600 font-mono font-bold">+{s.borrowed}</td>
                                      <td className="py-3 px-4 text-center text-amber-600 font-mono font-bold">-{s.returned}</td>
                                      <td className="py-3 px-4 text-center font-bold font-mono bg-emerald-50/20 text-emerald-700">{d.stock} {d.unit}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Box 2: Special Controlled Drugs */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs md:text-sm font-bold text-slate-700 flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                              ยาควบคุมพิเศษสะสม (Special Controlled Drugs Tracking)
                            </h4>
                            <span className="text-[10px] text-purple-400 font-bold font-mono">หน่วย: แอมป์/หน่วยยา</span>
                          </div>
                          <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-xxs">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-600 font-bold">
                                  <th className="py-3 px-4">ชื่อรายการยา</th>
                                  <th className="py-3 px-4 text-center">เปิดใช้สะสม</th>
                                  <th className="py-3 px-4 text-center">ใช้จริงสะสม</th>
                                  <th className="py-3 px-4 text-center">ทิ้งสะสม</th>
                                  <th className="py-3 px-4 text-center bg-pink-50/50 text-pink-800">แอมป์ค้างคืนคลัง</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                {SPECIAL_CONTROLLED_DRUGS_LIST.map(name => {
                                  const s = specialControlledAccumulatedStats[name] || { openedAmps: 0, usedQty: 0, wastedQty: 0 };
                                  const emptyCount = emptyAmpsAccumulator[name] || 0;
                                  const meta = SPECIAL_DRUGS_METADATA[name] || { unit: 'mg', type: 'Amp' };
                                  return (
                                    <tr key={name} className="hover:bg-slate-50/30 transition">
                                      <td className="py-3 px-4 font-bold text-slate-800">{name}</td>
                                      <td className="py-3 px-4 text-center font-mono font-black text-indigo-700">
                                        {s.openedAmps} {meta.type === 'Amp' ? 'แอมป์' : 'ขวด'}
                                      </td>
                                      <td className="py-3 px-4 text-center font-mono text-emerald-600 font-bold">
                                        {s.usedQty} {meta.unit}
                                      </td>
                                      <td className="py-3 px-4 text-center font-mono text-rose-500">
                                        {s.wastedQty.toFixed(1)} {meta.unit}
                                      </td>
                                      <td className="py-3 px-4 text-center font-bold font-mono bg-pink-50/20 text-pink-700">
                                        {emptyCount} แอมป์
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Timeline Switch filters */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 no-print">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">ช่วงเวลาสรุปสถิติ</h4>
                        <p className="text-xs text-slate-500">เลือกช่วงเพื่อกรองกราฟรายงานประวัติประมวลผล</p>
                      </div>

                      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button
                          onClick={() => setStatsPeriod('day')}
                          className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                            statsPeriod === 'day' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          รายวัน (วันนี้)
                        </button>
                        <button
                          onClick={() => setStatsPeriod('month')}
                          className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                            statsPeriod === 'month' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          รายเดือน (เดือนนี้)
                        </button>
                        <button
                          onClick={() => setStatsPeriod('year')}
                          className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                            statsPeriod === 'year' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                          }`}
                        >
                          รายปี (ปีนี้)
                        </button>
                      </div>
                    </div>

                    {/* Stats counters grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* total transactions */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">ธุรกรรมทั้งหมด</p>
                          <p className="text-2xl font-black text-slate-800">{statisticsData.totalTransactions}</p>
                          <p className="text-xxs text-slate-500">ในรอบประเมินผลปัจจุบัน</p>
                        </div>
                        <div className="bg-slate-100 p-3 rounded-xl text-slate-700">
                          <FileText className="w-6 h-6" />
                        </div>
                      </div>

                      {/* Requisitions */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">จำนวนการเบิกจ่าย</p>
                          <p className="text-2xl font-black text-emerald-600">{statisticsData.totalRequisitions}</p>
                          <p className="text-xxs text-emerald-600 font-medium">คงที่ / เป็นไปตามความต้องการ</p>
                        </div>
                        <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl">
                          <Plus className="w-6 h-6" />
                        </div>
                      </div>

                      {/* Returns */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">จำนวนการส่งคืน</p>
                          <p className="text-2xl font-black text-amber-600">{statisticsData.totalReturns}</p>
                          <p className="text-xxs text-slate-500">เพื่อคืนสต็อกอย่างเป็นระบบ</p>
                        </div>
                        <div className="bg-amber-50 text-amber-700 p-3 rounded-xl">
                          <Minus className="w-6 h-6" />
                        </div>
                      </div>

                      {/* Box Kits stats */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">การเบิกกล่องยาสำเร็จรูป</p>
                          <p className="text-sm font-bold text-slate-800">
                            Block: {statisticsData.blockBoxCount} • Extra: {statisticsData.extraBoxCount} • เย็น/ห้อง: {statisticsData.coldOrRoomTempBoxCount}
                          </p>
                          <p className="text-xxs text-slate-500">กล่องยาสำเร็จรูปและกล่องรักษาอุณหภูมิ</p>
                        </div>
                        <div className="bg-blue-50 text-blue-700 p-3 rounded-xl">
                          <Database className="w-6 h-6" />
                        </div>
                      </div>
                    </div>

                    {/* Dashboard Component containing Recharts Line Chart & Monthly Trends */}
                    <Dashboard transactions={transactions} />

                    {/* Analytics charts segment - Rendered beautifully in responsive Tailwind SVG bars */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      
                      {/* Top Requisitioned Medications (Top 5 chart) */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4 text-emerald-600" />
                            อันดับยาที่มีการเบิกจ่ายสูงสุด (Top 5)
                          </h4>
                          <p className="text-xxs text-slate-400">เปรียบเทียบจากจำนวนหลอด/ขวดที่ใช้ทั้งหมด</p>
                        </div>

                        {statisticsData.topDrugs.length === 0 ? (
                          <div className="py-12 text-center text-slate-400 text-xs">ไม่มีข้อมูลยาเบิกจ่ายในรอบเวลานี้</div>
                        ) : (
                          <div className="space-y-3.5">
                            {statisticsData.topDrugs.map((item, idx) => {
                              const maxTotal = Math.max(...statisticsData.topDrugs.map(d => d.total));
                              const percentage = maxTotal > 0 ? (item.total / maxTotal) * 100 : 0;
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex justify-between text-xs font-medium">
                                    <span className="text-slate-700">{item.name}</span>
                                    <span className="text-slate-500 font-mono">
                                      รวม {item.total} (เบิก: {item.beg} / คืน: {item.kurn})
                                    </span>
                                  </div>
                                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                                      style={{ width: `${percentage}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Demand by OR Rooms (Top 5 OR Rooms) */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                            <Building className="w-4 h-4 text-emerald-600" />
                            แผนกหรือห้อง OR ที่เบิกยาหนาแน่นสูงสุด (Top 5)
                          </h4>
                          <p className="text-xxs text-slate-400">จัดอันดับจากปริมาณหน่วยยาที่มีการเบิกจ่ายไปใช้งาน</p>
                        </div>

                        {statisticsData.topRooms.length === 0 ? (
                          <div className="py-12 text-center text-slate-400 text-xs">ไม่มีข้อมูลห้อง OR ในช่วงเวลานี้</div>
                        ) : (
                          <div className="space-y-3.5">
                            {statisticsData.topRooms.map((item, idx) => {
                              const maxQty = Math.max(...statisticsData.topRooms.map(r => r.qty));
                              const percentage = maxQty > 0 ? (item.qty / maxQty) * 100 : 0;
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex justify-between text-xs font-medium">
                                    <span className="text-slate-700 font-bold">{item.room}</span>
                                    <span className="text-slate-500 font-mono">{item.qty} ชิ้น</span>
                                  </div>
                                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-blue-600 rounded-full transition-all duration-500"
                                      style={{ width: `${percentage}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>

                    {/* Stats by Medication Storage Category (Pie Chart style representation) */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">สัดส่วนการเบิกจ่ายจำแนกตามหมวดหมู่ตัวยา</h4>
                        <p className="text-xxs text-slate-400">ดูสัดส่วนการเบิกเพื่อวางแผนการเก็บตู้เย็นและตู้ควบคุมพิเศษ</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
                          const value = statisticsData.categoryDistribution[cat as DrugCategory] || 0;
                          const totalAll = (Object.values(statisticsData.categoryDistribution) as number[]).reduce((a, b) => a + b, 0);
                          const percentage = totalAll > 0 ? Math.round((value / totalAll) * 100) : 0;
                          
                          let barColor = 'bg-slate-500';
                          if (cat === 'off-list') barColor = 'bg-purple-600';
                          else if (cat === 'refrigerated') barColor = 'bg-blue-500';
                          else if (cat === 'room-temp') barColor = 'bg-emerald-500';
                          else if (cat === 'special-controlled') barColor = 'bg-rose-500';

                          return (
                            <div key={cat} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between gap-2 text-center">
                              <div>
                                <p className="text-xxs font-bold text-slate-500 uppercase">{label}</p>
                                <p className="text-lg font-extrabold text-slate-800 mt-1">{value} หลอด</p>
                              </div>
                              <div className="space-y-1">
                                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                  <div className={`h-full ${barColor}`} style={{ width: `${percentage}%` }}></div>
                                </div>
                                <p className="text-[10px] text-slate-400 font-mono font-bold">{percentage}% ของยาทั้งหมด</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                )}

              </div>
            )}

          </div>
        )}

      </main>

      {/* --- Footer block --- */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-12 no-print text-center text-slate-400 text-xs">
        <p className="font-semibold text-slate-500">
          ระบบเบิก-คืนยา วิสัญญี (Supply Anesth-KKU)
        </p>
        <p className="mt-1">
          คณะแพทยศาสตร์ มหาวิทยาลัยขอนแก่น • Srinagarind Hospital
        </p>
        <p className="mt-0.5 text-[10px]">
          &copy; {new Date().getFullYear()} KKU. All Rights Reserved. • Designed with AI Assist
        </p>
      </footer>
    </div>
  );
}
