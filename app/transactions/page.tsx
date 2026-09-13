'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ThaiDateInput } from '@/components/ThaiDateInput';
import { ToastContainer, useToast } from '@/components/Toast';
import { formatCurrency, formatThaiDate } from '@/lib/calculations';
import { formatThaiYear } from '@/lib/calculations';
import type { CashTransaction, CashTransactionType } from '@/lib/types';
import {
  addCashTransaction,
  clearCashTransactions,
  deleteCashTransaction,
  fetchCashTransactions,
  importCashTransactions,
  updateCashTransaction,
  type CashTransactionInput,
} from '@/lib/services/cashTransactionService';
import { parseCashTransactionFile, type CashTransactionImportPreview } from '@/lib/cashTransactionImport';
import { downloadCashTransactionsExcel } from '@/lib/cashTransactionExcel';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type TransactionFilter = 'all' | CashTransactionType;

const CLEAR_CASH_TRANSACTIONS_PASSWORD = 'clearnart';

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (): CashTransactionInput => ({
  transaction_date: today(),
  type: 'deposit',
  amount: 0,
  port_type: 'Private',
  note: '',
});

const transactionKey = (item: Pick<CashTransactionInput, 'transaction_date' | 'type' | 'amount' | 'port_type' | 'note'>) => (
  [item.transaction_date, item.type, Number(item.amount).toFixed(2), item.port_type, item.note?.trim() ?? ''].join('|')
);

export default function CashTransactionsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CashTransaction | null>(null);
  const [form, setForm] = useState<CashTransactionInput>(emptyForm);
  const [typeFilter, setTypeFilter] = useState<TransactionFilter>('all');
  const [portFilter, setPortFilter] = useState('All');
  const [chartPort, setChartPort] = useState('All');
  const [importPreview, setImportPreview] = useState<CashTransactionImportPreview | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [showClearPanel, setShowClearPanel] = useState(false);
  const [clearPassword, setClearPassword] = useState('');
  const [clearError, setClearError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: transactions = [], isLoading, error } = useQuery({
    queryKey: ['cash-transactions'],
    queryFn: fetchCashTransactions,
  });

  const refresh = async () => {
    void queryClient.invalidateQueries({ queryKey: ['cash-transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
  };
  const saveMutation = useMutation({
    mutationFn: async (input: CashTransactionInput) => {
      if (editing) return updateCashTransaction(editing.id, input);
      return addCashTransaction(input);
    },
    onSuccess: async () => {
      await refresh();
      toast.show(editing ? 'แก้ไขรายการเรียบร้อย' : 'บันทึกรายการเรียบร้อย');
      setEditing(null);
      setShowForm(false);
      setForm(emptyForm());
    },
    onError: (caught) => toast.show(caught instanceof Error ? caught.message : 'บันทึกไม่สำเร็จ', 'error'),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteCashTransaction,
    onSuccess: async () => {
      await refresh();
      toast.show('ลบรายการเรียบร้อย');
    },
    onError: (caught) => toast.show(caught instanceof Error ? caught.message : 'ลบไม่สำเร็จ', 'error'),
  });
  const clearMutation = useMutation({
    mutationFn: clearCashTransactions,
    onSuccess: async (count) => {
      await refresh();
      setClearPassword('');
      setClearError(null);
      setShowClearPanel(false);
      setTypeFilter('all');
      setPortFilter('All');
      setChartPort('All');
      toast.show(`ล้างประวัติฝาก / ถอนทั้งหมดแล้ว (${count} รายการ)`, 'success');
    },
    onError: (caught) => setClearError(caught instanceof Error ? caught.message : 'ล้างข้อมูลไม่สำเร็จ'),
  });

  const importableRows = useMemo(() => {
    if (!importPreview) return [];
    const known = new Set(transactions.map(transactionKey));
    const accepted: CashTransactionInput[] = [];
    importPreview.rows.forEach(({ sourceRow: _sourceRow, ...row }) => {
      const key = transactionKey(row);
      if (!known.has(key)) {
        accepted.push(row);
        known.add(key);
      }
    });
    return accepted;
  }, [importPreview, transactions]);

  const importMutation = useMutation({
    mutationFn: () => importCashTransactions(importableRows),
    onSuccess: async (count) => {
      await refresh();
      toast.show(`นำเข้าสำเร็จ ${count} รายการ`);
      setImportPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (caught) => toast.show(caught instanceof Error ? caught.message : 'นำเข้าไม่สำเร็จ', 'error'),
  });

  const readImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setReadingFile(true);
    try {
      setImportPreview(await parseCashTransactionFile(file));
    } catch (caught) {
      toast.show(caught instanceof Error ? caught.message : 'อ่านไฟล์ไม่สำเร็จ', 'error');
      event.target.value = '';
    } finally {
      setReadingFile(false);
    }
  };

  const selectedPortTransactions = useMemo(() => transactions.filter((item) => (
    chartPort === 'All' || item.port_type === chartPort
  )), [transactions, chartPort]);

  const totals = useMemo(() => {
    const deposits = selectedPortTransactions.filter((item) => item.type === 'deposit').reduce((sum, item) => sum + Number(item.amount), 0);
    const withdrawals = selectedPortTransactions.filter((item) => item.type === 'withdrawal').reduce((sum, item) => sum + Number(item.amount), 0);
    return { deposits, withdrawals, balance: deposits - withdrawals };
  }, [selectedPortTransactions]);

  const selectedPortLabel = chartPort === 'All' ? 'ทุกพอร์ต' : chartPort;

  const visibleTransactions = useMemo(() => transactions.filter((item) => (
    (typeFilter === 'all' || item.type === typeFilter)
    && (portFilter === 'All' || item.port_type === portFilter)
  )), [transactions, typeFilter, portFilter]);

  const annualChartData = useMemo(() => {
    const annual = new Map<string, { year: string; deposits: number; withdrawals: number; net: number }>();
    selectedPortTransactions.forEach((item) => {
        const rawYear = Number(item.transaction_date.slice(0, 4));
        if (!Number.isFinite(rawYear)) return;
        const year = String(rawYear > 2400 ? rawYear - 543 : rawYear);
        const row = annual.get(year) ?? { year, deposits: 0, withdrawals: 0, net: 0 };
        const amount = Number(item.amount);
        if (item.type === 'deposit') {
          row.deposits += amount;
          row.net += amount;
        } else {
          row.withdrawals -= amount;
          row.net -= amount;
        }
        annual.set(year, row);
      });
    return [...annual.values()].sort((a, b) => a.year.localeCompare(b.year));
  }, [selectedPortTransactions]);

  const CashFlowTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload as { deposits: number; withdrawals: number; net: number };
    return (
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-bright)', padding: '10px 12px', minWidth: '190px' }}>
        <div className="mono" style={{ color: 'var(--amber)', fontWeight: 700, marginBottom: '7px' }}>ปี พ.ศ. {formatThaiYear(label)}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '11px' }}><span style={{ color: 'var(--green)' }}>เงินเข้า</span><strong className="mono">{formatCurrency(row.deposits)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '11px' }}><span style={{ color: 'var(--red)' }}>เงินออก</span><strong className="mono">{formatCurrency(Math.abs(row.withdrawals))}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '11px', borderTop: '1px solid var(--border)', marginTop: '6px', paddingTop: '6px' }}><span>สุทธิ</span><strong className="mono" style={{ color: row.net >= 0 ? 'var(--amber)' : 'var(--red)' }}>{formatCurrency(row.net)}</strong></div>
      </div>
    );
  };

  const openNew = (type: CashTransactionType = 'deposit') => {
    setEditing(null);
    setForm({ ...emptyForm(), type });
    setShowForm(true);
  };
  const openEdit = (item: CashTransaction) => {
    setEditing(item);
    setForm({
      transaction_date: item.transaction_date,
      type: item.type,
      amount: Number(item.amount),
      port_type: item.port_type,
      note: item.note ?? '',
    });
    setShowForm(true);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.transaction_date || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) {
      toast.show('กรุณาระบุวันที่และจำนวนเงินมากกว่า 0', 'error');
      return;
    }
    saveMutation.mutate({ ...form, amount: Number(form.amount), note: form.note?.trim() || null });
  };

  const confirmClearTransactions = () => {
    setClearError(null);
    if (clearPassword !== CLEAR_CASH_TRANSACTIONS_PASSWORD) {
      setClearError('รหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง');
      return;
    }

    const confirmed = confirm(
      `ยืนยันลบประวัติฝากเงิน / ถอนเงินทั้งหมด ${transactions.length} รายการ?\n\n`
      + 'ข้อมูลหุ้น รอบซื้อ รายการขาย เงินปันผล ไฟล์ และคลังความรู้จะไม่ถูกลบ\n'
      + 'การดำเนินการนี้ไม่สามารถย้อนกลับได้หากไม่มีไฟล์ Backup',
    );
    if (confirmed) clearMutation.mutate();
  };

  return (
    <>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <div className="page-title">CASH TRANSACTIONS</div>
            <div className="page-subtitle">บันทึกเงินฝากและถอนออกจากพอร์ต</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={readImportFile} style={{ display: 'none' }} />
            <button className="btn btn-secondary" onClick={() => downloadCashTransactionsExcel(transactions)} disabled={transactions.length === 0}>
              ⇩ Export Excel
            </button>
            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={readingFile}>
              {readingFile ? 'กำลังอ่านไฟล์...' : '⇧ Import Excel/CSV'}
            </button>
            <button className="btn btn-primary" onClick={() => openNew('deposit')}>+ ฝากเงิน</button>
            <button className="btn btn-secondary" onClick={() => openNew('withdrawal')}>− ถอนเงิน</button>
            <button
              className="btn btn-danger"
              onClick={() => {
                setShowClearPanel((visible) => !visible);
                setClearPassword('');
                setClearError(null);
              }}
              disabled={transactions.length === 0}
            >
              ⚠ Clear ฝาก / ถอน
            </button>
          </div>
        </div>

        {showClearPanel && (
          <div className="panel" style={{ marginBottom: '20px', borderColor: 'rgba(224,58,58,0.45)' }}>
            <div className="panel-header" style={{ borderBottomColor: 'rgba(224,58,58,0.3)' }}>
              <div className="panel-title" style={{ color: 'var(--red)' }}>
                ⚠ CLEAR ข้อมูลฝากเงิน / ถอนเงินทั้งหมด
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setShowClearPanel(false);
                  setClearPassword('');
                  setClearError(null);
                }}
                disabled={clearMutation.isPending}
              >
                ✕
              </button>
            </div>
            <div className="panel-body">
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                ลบประวัติฝากเงินและถอนเงินทุกพอร์ตของบัญชีที่กำลังใช้งาน จำนวน {transactions.length} รายการ
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                ไม่ลบข้อมูลหุ้น การซื้อขาย เงินปันผล ไฟล์ หรือคลังความรู้ · กรุณา Download Backup JSON ก่อนดำเนินการ
              </p>

              <label
                htmlFor="clear-cash-transactions-password"
                style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}
              >
                Password ยืนยัน
              </label>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  id="clear-cash-transactions-password"
                  type="password"
                  value={clearPassword}
                  onChange={(event) => {
                    setClearPassword(event.target.value);
                    setClearError(null);
                  }}
                  placeholder="ใส่ Password เพื่อยืนยัน"
                  autoComplete="off"
                  disabled={clearMutation.isPending}
                  style={{ minWidth: '260px', flex: '1 1 260px' }}
                />
                <button
                  className="btn btn-danger"
                  onClick={confirmClearTransactions}
                  disabled={clearMutation.isPending || clearPassword.length === 0}
                >
                  {clearMutation.isPending ? 'กำลังล้างข้อมูล...' : '✕ Clear ฝาก / ถอนทั้งหมด'}
                </button>
              </div>

              {clearError && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(224,58,58,0.08)', border: '1px solid rgba(224,58,58,0.3)', borderRadius: '2px', fontSize: '12px', color: 'var(--red)' }}>
                  ⚠ {clearError}
                </div>
              )}
            </div>
          </div>
        )}

        {importPreview && (
          <div className="panel" style={{ marginBottom: '20px', borderColor: 'var(--amber-dim)' }}>
            <div className="panel-header">
              <div>
                <div className="panel-title">ตรวจสอบก่อน Import</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '3px' }}>{importPreview.fileName}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setImportPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>✕</button>
            </div>
            <div style={{ padding: '18px 20px', display: 'grid', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                <div className="stat-card" style={{ padding: '12px' }}><div className="stat-label">รายการในไฟล์</div><div className="mono" style={{ fontWeight: 700 }}>{importPreview.sourceRowCount}</div></div>
                <div className="stat-card" style={{ padding: '12px' }}><div className="stat-label">ฝากเงิน</div><div className="mono green" style={{ fontWeight: 700 }}>{importPreview.counts.deposits} · {formatCurrency(importPreview.totals.deposits)}</div></div>
                <div className="stat-card" style={{ padding: '12px' }}><div className="stat-label">ถอนเงิน</div><div className="mono red" style={{ fontWeight: 700 }}>{importPreview.counts.withdrawals} · {formatCurrency(importPreview.totals.withdrawals)}</div></div>
                <div className="stat-card" style={{ padding: '12px' }}><div className="stat-label">พร้อมนำเข้า</div><div className="mono amber" style={{ fontWeight: 700 }}>{importableRows.length}</div></div>
              </div>
              {(importPreview.warnings.length > 0 || importableRows.length < importPreview.rows.length) && (
                <div style={{ padding: '10px 12px', background: 'rgba(245,166,35,0.08)', border: '1px solid var(--amber-dim)', color: 'var(--text-secondary)', fontSize: '11px' }}>
                  ข้ามข้อมูลผิดรูปแบบ {importPreview.warnings.length} แถว · ข้ามรายการซ้ำ {importPreview.rows.length - importableRows.length} แถว
                  {importPreview.warnings.slice(0, 3).map((warning) => <div key={`${warning.sourceRow}-${warning.message}`}>แถว {warning.sourceRow}: {warning.message}</div>)}
                </div>
              )}
              <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                <table className="data-table" style={{ minWidth: '620px' }}>
                  <thead><tr><th>แถว</th><th>วันที่</th><th>ประเภท</th><th>พอร์ต</th><th style={{ textAlign: 'right' }}>จำนวนเงิน</th></tr></thead>
                  <tbody>{importPreview.rows.slice(0, 10).map((row) => <tr key={row.sourceRow}><td className="mono">{row.sourceRow}</td><td className="mono">{formatThaiDate(row.transaction_date)}</td><td style={{ color: row.type === 'deposit' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{row.type === 'deposit' ? 'ฝากเงิน' : 'ถอนเงิน'}</td><td>{row.port_type}</td><td className="mono" style={{ textAlign: 'right' }}>{formatCurrency(row.amount)}</td></tr>)}</tbody>
                </table>
              </div>
              {importPreview.rows.length > 10 && <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>แสดงตัวอย่าง 10 รายการแรกจาก {importPreview.rows.length} รายการ</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => { setImportPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>ยกเลิก</button>
                <button className="btn btn-primary" disabled={importableRows.length === 0 || importMutation.isPending} onClick={() => importMutation.mutate()}>{importMutation.isPending ? 'กำลังนำเข้า...' : `✓ Import ${importableRows.length} รายการ`}</button>
              </div>
            </div>
          </div>
        )}

        <div className="stats-grid" style={{ marginBottom: '20px' }}>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--green)' }}>
            <div className="stat-label">ฝากเงินสะสม</div>
            <div className="stat-value mono green">{formatCurrency(totals.deposits)}</div>
            <div className="stat-sub">รวมตามตัวกรอง: {selectedPortLabel}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--red)' }}>
            <div className="stat-label">ถอนเงินสะสม</div>
            <div className="stat-value mono red">{formatCurrency(totals.withdrawals)}</div>
            <div className="stat-sub">รวมตามตัวกรอง: {selectedPortLabel}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--amber)' }}>
            <div className="stat-label">เงินฝากสุทธิ</div>
            <div className="stat-value mono" style={{ color: totals.balance >= 0 ? 'var(--amber)' : 'var(--red)' }}>{formatCurrency(totals.balance)}</div>
            <div className="stat-sub">ฝาก − ถอน · {selectedPortLabel} (ไม่ใช่เงินสดคงเหลือในบัญชี)</div>
          </div>
        </div>

        {showForm && (
          <div className="panel" style={{ marginBottom: '20px' }}>
            <div className="panel-header">
              <div className="panel-title">{editing ? 'แก้ไขรายการ' : 'เพิ่มรายการฝาก / ถอน'}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setEditing(null); }}>✕</button>
            </div>
            <form onSubmit={submit} style={{ padding: '20px', display: 'grid', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className={`btn ${form.type === 'deposit' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setForm((value) => ({ ...value, type: 'deposit' }))}>+ ฝากเงิน</button>
                <button type="button" className={`btn ${form.type === 'withdrawal' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setForm((value) => ({ ...value, type: 'withdrawal' }))}>− ถอนเงิน</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">วันที่ทำรายการ (พ.ศ.) *</label>
                  <ThaiDateInput value={form.transaction_date} onChange={(transaction_date) => setForm((value) => ({ ...value, transaction_date }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">จำนวนเงิน (บาท) *</label>
                  <input className="form-input mono" type="number" min="0.01" step="0.01" required value={form.amount || ''} onChange={(event) => setForm((value) => ({ ...value, amount: Number(event.target.value) }))} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label className="form-label">พอร์ต *</label>
                  <select className="form-input" value={form.port_type} onChange={(event) => setForm((value) => ({ ...value, port_type: event.target.value }))}>
                    <option value="Private">Private</option>
                    <option value="Business">Business</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">หมายเหตุ</label>
                  <input className="form-input" value={form.note ?? ''} onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))} maxLength={300} placeholder="เช่น โอนเข้าบัญชีลงทุน" />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null); }}>ยกเลิก</button>
                <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'กำลังบันทึก...' : '✓ บันทึกรายการ'}</button>
              </div>
            </form>
          </div>
        )}

        <div className="panel" style={{ marginBottom: '20px' }}>
          <div className="panel-header" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div className="panel-title">กระแสเงินเข้า–ออกรายปี</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '3px' }}>หน่วย: บาท · เงินออกแสดงใต้เส้นศูนย์ · ปี พ.ศ.</div>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['All', 'Private', 'Business'].map((port) => (
                <button key={port} className={`btn btn-xs ${chartPort === port ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setChartPort(port)}>{port === 'All' ? 'ทุกพอร์ต' : port}</button>
              ))}
            </div>
          </div>
          {annualChartData.length === 0 ? (
            <div className="empty-state" style={{ padding: '36px' }}><div className="empty-state-title">ยังไม่มีข้อมูลสำหรับพอร์ตนี้</div></div>
          ) : (
            <div style={{ height: '340px', padding: '18px 16px 8px 4px' }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                <BarChart data={annualChartData} margin={{ top: 12, right: 18, left: 12, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" stroke="var(--text-muted)" fontSize={11} tickFormatter={(year) => formatThaiYear(year)} />
                  <YAxis stroke="var(--text-muted)" fontSize={10} tickFormatter={(value) => `${value < 0 ? '-' : ''}฿${Math.abs(value) >= 1000000 ? `${(Math.abs(value) / 1000000).toFixed(1)}m` : `${Math.round(Math.abs(value) / 1000)}k`}`} />
                  <Tooltip content={<CashFlowTooltip />} cursor={{ fill: 'var(--bg-hover)', opacity: 0.35 }} />
                  <Legend verticalAlign="top" align="right" iconType="rect" formatter={(value) => <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{value}</span>} />
                  <Bar dataKey="deposits" name="เงินเข้า (ฝาก)" fill="#27AE60" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="withdrawals" name="เงินออก (ถอน)" fill="#E03A3A" radius={[0, 0, 3, 3]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div className="panel-title">ประวัติฝาก / ถอน ({visibleTransactions.length} รายการ)</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(['all', 'deposit', 'withdrawal'] as const).map((type) => (
                <button key={type} className={`btn btn-xs ${typeFilter === type ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTypeFilter(type)}>{type === 'all' ? 'ทั้งหมด' : type === 'deposit' ? 'ฝากเงิน' : 'ถอนเงิน'}</button>
              ))}
              {['All', 'Private', 'Business'].map((port) => (
                <button key={port} className={`btn btn-xs ${portFilter === port ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPortFilter(port)}>{port === 'All' ? 'ทุกพอร์ต' : port}</button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="empty-state"><div className="empty-state-title">กำลังโหลดรายการ...</div></div>
          ) : error ? (
            <div className="empty-state"><div className="empty-state-title" style={{ color: 'var(--red)' }}>โหลดข้อมูลไม่สำเร็จ</div><div className="empty-state-desc">{(error as Error).message}</div></div>
          ) : visibleTransactions.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">⇄</div><div className="empty-state-title">ยังไม่มีรายการฝากหรือถอน</div><div className="empty-state-desc">กด “ฝากเงิน” หรือ “ถอนเงิน” เพื่อเริ่มบันทึกกระแสเงินสดของพอร์ต</div></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: '720px' }}>
                <thead><tr><th>วันที่</th><th>ประเภท</th><th>พอร์ต</th><th style={{ textAlign: 'right' }}>จำนวนเงิน</th><th>หมายเหตุ</th><th></th></tr></thead>
                <tbody>
                  {visibleTransactions.map((item) => (
                    <tr key={item.id}>
                      <td className="mono">{formatThaiDate(item.transaction_date)}</td>
                      <td><span className="mono" style={{ color: item.type === 'deposit' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{item.type === 'deposit' ? 'ฝากเงิน' : 'ถอนเงิน'}</span></td>
                      <td>{item.port_type}</td>
                      <td className="mono" style={{ textAlign: 'right', color: item.type === 'deposit' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{item.type === 'deposit' ? '+' : '−'}{formatCurrency(Number(item.amount))}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{item.note || '—'}</td>
                      <td><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}><button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>✎</button><button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} disabled={deleteMutation.isPending} onClick={() => { if (confirm(`ยืนยันลบรายการ${item.type === 'deposit' ? 'ฝาก' : 'ถอน'} ${formatCurrency(Number(item.amount))}?`)) deleteMutation.mutate(item.id); }}>✕</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
      <ToastContainer />
    </>
  );
}
