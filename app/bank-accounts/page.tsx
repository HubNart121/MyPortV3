'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ToastContainer, useToast } from '@/components/Toast';
import { formatCurrency, formatThaiDate } from '@/lib/calculations';
import { BANK_ACCOUNT_TYPE, type BankAccount, type BankAccountType } from '@/lib/types';
import {
  addBankAccount,
  deleteBankAccount,
  fetchBankAccounts,
  updateBankAccount,
  type BankAccountInput,
} from '@/lib/services/bankAccountService';
import { fetchCashTransactions } from '@/lib/services/cashTransactionService';
import { fetchAllDividends } from '@/lib/services/portfolioService';

type AccountTransactionRow = {
  id: string;
  date: string;
  label: string;
  amount: number;
  source: 'cash' | 'dividend';
};

const emptyForm = (): BankAccountInput => ({
  account_number: '',
  account_type: 'Private',
  balance: 0,
  note: '',
});

export default function BankAccountsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState<BankAccountInput>(emptyForm);
  const [typeFilter, setTypeFilter] = useState<'ทั้งหมด' | BankAccountType>('ทั้งหมด');
  const [viewingType, setViewingType] = useState<BankAccountType | null>(null);

  const { data: accounts = [], isLoading, error } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: fetchBankAccounts,
  });
  const visibleAccounts = useMemo(() => (
    typeFilter === 'ทั้งหมด' ? accounts : accounts.filter((item) => item.account_type === typeFilter)
  ), [accounts, typeFilter]);
  const totalBalance = useMemo(() => visibleAccounts.reduce((sum, item) => sum + Number(item.balance), 0), [visibleAccounts]);
  const { data: cashTransactions = [], isLoading: cashLoading } = useQuery({
    queryKey: ['cash-transactions'],
    queryFn: fetchCashTransactions,
  });
  const { data: dividends = [], isLoading: dividendsLoading } = useQuery({
    queryKey: ['all-dividends'],
    queryFn: fetchAllDividends,
  });
  const accountTransactions = useMemo<AccountTransactionRow[]>(() => {
    if (!viewingType) return [];
    const cashRows = cashTransactions
      .filter((item) => item.port_type === viewingType)
      .map((item) => ({
        id: item.id,
        date: item.transaction_date,
        label: item.type === 'deposit' ? 'ฝากเงินเข้าพอร์ต' : 'ถอนเงินจากพอร์ต',
        amount: item.type === 'deposit' ? -Number(item.amount) : Number(item.amount),
        source: 'cash' as const,
      }));
    const dividendRows = dividends
      .filter((item) => item.port_type === viewingType)
      .map((item) => ({
        id: `dividend-${item.stocks.id}-${item.id}`,
        date: item.pay_date,
        label: `เงินปันผล ${item.symbol}`,
        amount: Number(item.net_amount),
        source: 'dividend' as const,
      }));
    return [...cashRows, ...dividendRows].sort((left, right) => right.date.localeCompare(left.date));
  }, [cashTransactions, dividends, viewingType]);

  const saveMutation = useMutation({
    mutationFn: () => editing ? updateBankAccount(editing.id, form) : addBankAccount(form),
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.show(editing ? 'อัปเดตบัญชีเรียบร้อย' : 'เพิ่มบัญชีเรียบร้อย');
      setEditing(null); setShowForm(false); setForm(emptyForm());
    },
    onError: (caught) => toast.show(caught instanceof Error ? caught.message : 'บันทึกไม่สำเร็จ', 'error'),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteBankAccount,
    onSuccess: async () => { void queryClient.invalidateQueries({ queryKey: ['bank-accounts'] }); toast.show('ลบบัญชีเรียบร้อย'); },
    onError: (caught) => toast.show(caught instanceof Error ? caught.message : 'ลบไม่สำเร็จ', 'error'),
  });

  const openNew = () => { setEditing(null); setForm(emptyForm()); setShowForm(true); };
  const openEdit = (account: BankAccount) => {
    setEditing(account);
    setForm({ account_number: account.account_number ?? '', account_type: account.account_type, balance: account.balance, note: account.note ?? '' });
    setShowForm(true);
  };

  return (
    <>
      <div className="animate-fade-in">
        <div className="page-header">
          <div><div className="page-title">บัญชีเงินฝาก (BANK ACCOUNTS)</div><div className="page-subtitle">จัดการบัญชีเงินฝากและแยกตามประเภทบัญชี</div></div>
          <button className="btn btn-primary" onClick={openNew}>+ เพิ่มบัญชีเงินฝาก</button>
        </div>

        <div className="panel" style={{ marginBottom: '20px' }}>
          <div className="panel-header"><div className="panel-title">สรุปบัญชีที่แสดง</div><div className="mono green" style={{ fontSize: '20px', fontWeight: 700 }}>{formatCurrency(totalBalance)}</div></div>
          <div className="panel-body" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['ทั้งหมด', ...BANK_ACCOUNT_TYPE] as const).map((type) => <button key={type} className={`filter-chip ${typeFilter === type ? 'active' : ''}`} onClick={() => setTypeFilter(type)}>{type}</button>)}
          </div>
        </div>

        {isLoading && <div className="empty-state">กำลังโหลดข้อมูล...</div>}
        {error && <div className="operation-message operation-error">โหลดบัญชีเงินฝากไม่สำเร็จ: {error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ'}</div>}
        {!isLoading && !error && visibleAccounts.length === 0 && <div className="panel"><div className="empty-state"><div className="empty-state-icon">▣</div><div className="empty-state-title">ยังไม่มีบัญชีเงินฝาก</div><div className="empty-state-desc">เพิ่มบัญชีแรกเพื่อเริ่มแยกประเภทและติดตามยอดคงเหลือ</div><button className="btn btn-primary" onClick={openNew}>+ เพิ่มบัญชี</button></div></div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {visibleAccounts.map((account) => (
            <div className="panel" key={account.id}>
              <div className="panel-header"><div><div className="panel-title" style={{ color: 'var(--amber)' }}>บัญชี {account.account_type}</div><div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>{account.account_number || 'ไม่ระบุเลขบัญชี'}</div></div><span className="filter-chip active">{account.account_type}</span></div>
              <div className="panel-body" style={{ display: 'grid', gap: '12px' }}>
                <div><div className="stat-label">ยอดคงเหลือ</div><div className="mono green" style={{ fontSize: '24px', fontWeight: 700 }}>{formatCurrency(Number(account.balance))}</div></div>
                {account.account_number && <div style={{ color: 'var(--text-secondary)' }}>เลขบัญชี: <span className="mono">{account.account_number}</span></div>}
                {account.note && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{account.note}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}><button className="btn btn-secondary btn-sm" onClick={() => setViewingType((current) => current === account.account_type ? null : account.account_type)}>{viewingType === account.account_type ? 'ซ่อน Transaction' : 'ดู Transaction'}</button><button className="btn btn-secondary btn-sm" onClick={() => openEdit(account)}>แก้ไข</button><button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`ยืนยันลบบัญชีประเภท ${account.account_type}?`)) deleteMutation.mutate(account.id); }}>ลบ</button></div>
              </div>
            </div>
          ))}
        </div>
        {viewingType && <div className="panel" style={{ marginTop: '20px' }}>
          <div className="panel-header"><div><div className="panel-title">TRANSACTIONS · {viewingType}</div><div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>เงินปันผลและรายการเคลื่อนไหวของบัญชีประเภทนี้</div></div><button className="btn btn-ghost btn-sm" onClick={() => setViewingType(null)}>✕ ปิด</button></div>
          {cashLoading || dividendsLoading ? <div className="empty-state">กำลังโหลด Transaction...</div> : accountTransactions.length === 0 ? <div className="empty-state">ยังไม่มี Transaction</div> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={{ textAlign: 'left' }}>วันที่</th><th style={{ textAlign: 'left' }}>รายการ</th><th style={{ textAlign: 'right' }}>เงินเข้า / เงินออก</th></tr></thead><tbody>{accountTransactions.map((item) => <tr key={item.id}><td className="mono" style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{formatThaiDate(item.date)}</td><td style={{ padding: '12px 16px' }}>{item.label}</td><td className={`mono ${item.amount >= 0 ? 'profit' : 'loss'}`} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>{item.amount >= 0 ? '+' : ''}{formatCurrency(item.amount)}</td></tr>)}</tbody></table></div>}
        </div>}
      </div>

      {showForm && <div className="modal-overlay"><div className="modal file-modal"><div className="modal-header"><div className="modal-title">{editing ? 'EDIT BANK ACCOUNT' : 'ADD BANK ACCOUNT'}</div><button className="btn btn-ghost" onClick={() => setShowForm(false)}>✕</button></div><form onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(); }}><div className="modal-body">
        <div className="form-grid-2"><div className="form-group"><label className="form-label">ประเภทบัญชี *</label><select className="form-select" value={form.account_type} onChange={(event) => setForm({ ...form, account_type: event.target.value as BankAccountType })}>{BANK_ACCOUNT_TYPE.map((type) => <option key={type}>{type}</option>)}</select></div><div className="form-group"><label className="form-label">ยอดคงเหลือ (฿) *</label><input className="form-input mono" type="number" min="0" step="0.01" required value={form.balance} onChange={(event) => setForm({ ...form, balance: Number(event.target.value) })} /></div></div>
        <div className="form-group"><label className="form-label">เลขบัญชี</label><input className="form-input mono" value={form.account_number ?? ''} onChange={(event) => setForm({ ...form, account_number: event.target.value })} placeholder="ไม่บังคับ" /></div>
        <div className="form-group"><label className="form-label">หมายเหตุ</label><textarea className="form-input" rows={3} value={form.note ?? ''} onChange={(event) => setForm({ ...form, note: event.target.value })} /></div>
      </div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>ยกเลิก</button><button className="btn btn-primary" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกบัญชี'}</button></div></form></div></div>}
      <ToastContainer />
    </>
  );
}
