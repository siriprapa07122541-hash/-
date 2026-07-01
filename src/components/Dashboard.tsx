import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { TrendingUp, Package, RefreshCw, Calendar, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { Transaction } from '../types';

interface DashboardProps {
  transactions: Transaction[];
}

export default function Dashboard({ transactions }: DashboardProps) {
  // Monthly names in Thai
  const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];

  // Process data for the monthly trend chart
  const chartData = useMemo(() => {
    // We will accumulate data for 2026 months (or dynamically based on transactions)
    const monthlyData: Record<number, { monthIndex: number; monthName: string; requisitionQty: number; returnQty: number; txCount: number }> = {};
    
    // Initialize Jan to Jun (or full 12 months for 2026) to make the graph look complete and professional
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 12; i++) {
      monthlyData[i] = {
        monthIndex: i,
        monthName: thaiMonths[i],
        requisitionQty: 0,
        returnQty: 0,
        txCount: 0
      };
    }

    // Populate with real transaction data
    transactions.forEach(tx => {
      const date = new Date(tx.timestamp);
      // Only group by month if it's the current year or we can show any year
      const month = date.getMonth();
      
      const totalItemQty = tx.items.reduce((sum, item) => sum + item.quantity, 0);

      if (tx.type === 'เบิก') {
        monthlyData[month].requisitionQty += totalItemQty;
        monthlyData[month].txCount += 1;
      } else {
        monthlyData[month].returnQty += totalItemQty;
      }
    });

    // Convert to sorted array
    // To make the chart look nice, let's return all months of the current year (up to December, or up to the current month)
    // Let's return months from Jan to Dec but filter out months after the current month if they have 0 data
    const currentMonth = new Date().getMonth();
    return Object.values(monthlyData).filter(m => m.monthIndex <= currentMonth || m.requisitionQty > 0 || m.returnQty > 0);
  }, [transactions]);

  // Calculations for KPI Cards
  const kpiData = useMemo(() => {
    let totalDispensed = 0;
    let totalReturned = 0;
    let currentMonthDispensed = 0;
    let lastMonthDispensed = 0;

    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    transactions.forEach(tx => {
      const txDate = new Date(tx.timestamp);
      const isCurrentMonth = txDate.getMonth() === curMonth && txDate.getFullYear() === curYear;
      const isLastMonth = txDate.getMonth() === (curMonth === 0 ? 11 : curMonth - 1) && 
                          txDate.getFullYear() === (curMonth === 0 ? curYear - 1 : curYear);
      
      const qty = tx.items.reduce((sum, item) => sum + item.quantity, 0);

      if (tx.type === 'เบิก') {
        totalDispensed += qty;
        if (isCurrentMonth) currentMonthDispensed += qty;
        if (isLastMonth) lastMonthDispensed += qty;
      } else {
        totalReturned += qty;
      }
    });

    // Calculate percentage change month-over-month
    let momChange = 0;
    if (lastMonthDispensed > 0) {
      momChange = Math.round(((currentMonthDispensed - lastMonthDispensed) / lastMonthDispensed) * 100);
    } else if (currentMonthDispensed > 0) {
      momChange = 100; // 100% increase if last month was 0
    }

    return {
      totalDispensed,
      totalReturned,
      currentMonthDispensed,
      momChange
    };
  }, [transactions]);

  return (
    <div className="space-y-6">
      {/* Dashboard Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: ยอดการเบิกยารวม */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">ปริมาณการเบิกยาสะสมทั้งหมด</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black text-emerald-600 font-mono">{kpiData.totalDispensed}</p>
              <span className="text-xs text-slate-500 font-medium">หลอด/ขวด</span>
            </div>
            <p className="text-xxs text-slate-500">สะสมในระบบจนถึงปัจจุบัน</p>
          </div>
          <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: ยอดเบิกเดือนปัจจุบัน */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">เบิกจ่ายยาเฉพาะเดือนนี้</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black text-slate-800 font-mono">{kpiData.currentMonthDispensed}</p>
              <span className="text-xs text-slate-500 font-medium">หลอด/ขวด</span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              {kpiData.momChange >= 0 ? (
                <span className="text-emerald-600 text-xxs font-bold flex items-center gap-0.5 bg-emerald-50 px-1.5 py-0.5 rounded-sm">
                  <ArrowUpRight className="w-3 h-3" />
                  +{kpiData.momChange}%
                </span>
              ) : (
                <span className="text-rose-600 text-xxs font-bold flex items-center gap-0.5 bg-rose-50 px-1.5 py-0.5 rounded-sm">
                  <ArrowDownRight className="w-3 h-3" />
                  {kpiData.momChange}%
                </span>
              )}
              <span className="text-slate-400 text-[10px]">เปรียบเทียบกับเดือนที่ผ่านมา</span>
            </div>
          </div>
          <div className="bg-blue-50 text-blue-600 p-3 rounded-xl">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: ปริมาณการคืนยารวม */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">ปริมาณการคืนยาสะสมทั้งหมด</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black text-amber-600 font-mono">{kpiData.totalReturned}</p>
              <span className="text-xs text-slate-500 font-medium">หลอด/ขวด</span>
            </div>
            <p className="text-xxs text-slate-500">อัตราส่วนการคืนคลังคิดเป็น {kpiData.totalDispensed > 0 ? Math.round((kpiData.totalReturned / kpiData.totalDispensed) * 100) : 0}% ของการเบิก</p>
          </div>
          <div className="bg-amber-50 text-amber-600 p-3 rounded-xl">
            <RefreshCw className="w-6 h-6 animate-spin-slow" />
          </div>
        </div>
      </div>

      {/* Main Recharts Line Chart Container */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600" />
              แนวโน้มปริมาณการเบิกยาในแต่ละเดือน (Monthly Requisition Trend)
            </h4>
            <p className="text-xs text-slate-500">กราฟเส้นจำลองสถิติปริมาณยอดเบิกสะสมรายเดือน เปรียบเทียบกับจำนวนการคืนยาเข้าคลัง</p>
          </div>
          <div className="flex items-center gap-2 text-xxs text-slate-400 font-semibold bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 self-start sm:self-center">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>ปีงบประมาณประจำปัจจุบัน</span>
          </div>
        </div>

        <div className="h-80 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="monthName" 
                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  padding: '10px 14px'
                }}
                labelStyle={{ fontWeight: 'bold', color: '#1e293b', fontSize: '12px', marginBottom: '4px' }}
                itemStyle={{ fontSize: '11px', padding: '2px 0' }}
              />
              <Legend 
                verticalAlign="top" 
                height={36} 
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '12px', fontWeight: 500, paddingBottom: '10px' }}
              />
              <Line
                name="ปริมาณเบิกยา (หลอด/ขวด)"
                type="monotone"
                dataKey="requisitionQty"
                stroke="#10b981"
                strokeWidth={3}
                activeDot={{ r: 8, stroke: '#ffffff', strokeWidth: 2 }}
                dot={{ r: 4, strokeWidth: 2 }}
              />
              <Line
                name="ปริมาณคืนยา (หลอด/ขวด)"
                type="monotone"
                dataKey="returnQty"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
