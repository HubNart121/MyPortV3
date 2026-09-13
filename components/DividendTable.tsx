'use client';

import { useState } from 'react';
import { useToast } from './Toast';
import type { DividendPayment } from '@/lib/types';
import { ThaiDateInput } from './ThaiDateInput';
import { formatCurrency, formatNumber, formatThaiDate } from '@/lib/calculations';

export interface DividendPaymentFormData {
  pay_date: string;
  dividend_per_share: number;
  shares_held: number;
  tax_pct: number;
}

interface DividendTableProps {
  dividends: DividendPayment[];
  currentShares: number;
  onAdd: (data: DividendPaymentFormData) => Promise<void>;
  onEdit: (id: string, data: DividendPaymentFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function DividendTable({
  dividends,
  currentShares,
  onAdd,
  onEdit,
  onDelete,
}: DividendTableProps) {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<DividendPayment | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form states for Add
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [divPerShare, setDivPerShare] = useState<number | ''>('');
  const [sharesHeld, setSharesHeld] = useState<number>(currentShares);
  const [taxPct, setTaxPct] = useState<number>(10);

  // Form states for Edit
  const [editPayDate, setEditPayDate] = useState('');
  const [editDivPerShare, setEditDivPerShare] = useState<number | ''>('');
  const [editSharesHeld, setEditSharesHeld] = useState<number>(0);
  const [editTaxPct, setEditTaxPct] = useState<number>(10);

  const resetAddForm = () => {
    setPayDate(new Date().toISOString().slice(0, 10));
    setDivPerShare('');
    setSharesHeld(currentShares);
    setTaxPct(10);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!divPerShare || Number(divPerShare) <= 0 || sharesHeld <= 0) return;
    setSaving(true);
    try {
      await onAdd({
        pay_date: payDate,
        dividend_per_share: Number(divPerShare),
        shares_held: sharesHeld,
        tax_pct: taxPct,
      });
      resetAddForm();
      setShowForm(false);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: DividendPayment) => {
    setEditingItem(item);
    setEditPayDate(item.pay_date);
    setEditDivPerShare(item.dividend_per_share);
    setEditSharesHeld(item.shares_held);
    setEditTaxPct(item.tax_pct ?? 10);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editDivPerShare || Number(editDivPerShare) <= 0 || editSharesHeld <= 0) return;
    setSaving(true);
    try {
      await onEdit(editingItem.id, {
        pay_date: editPayDate,
        dividend_per_share: Number(editDivPerShare),
        shares_held: editSharesHeld,
        tax_pct: editTaxPct,
      });
      setEditingItem(null);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ยืนยันลบประวัติการรับเงินปันผลนี้?')) return;
    setDeleting(id);
    try {
      await onDelete(id);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ', 'error');
    } finally {
      setDeleting(null);
    }
  };

  // Preview calculations for Add form
  const previewGross = (Number(divPerShare) || 0) * (sharesHeld || 0);
  const previewNet = previewGross * (1 - (taxPct || 0) / 100);

  // Preview calculations for Edit form
  const editPreviewGross = (Number(editDivPerShare) || 0) * (editSharesHeld || 0);
  const editPreviewNet = editPreviewGross * (1 - (editTaxPct || 0) / 100);

  return (
    <div style={{ marginTop: '40px' }}>
      {/* Header */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            ประวัติการรับเงินปันผลจริง ({dividends.length} รายการ)
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setSharesHeld(currentShares);
              setShowForm((v) => !v);
            }}
          >
            {showForm ? '✕ ยกเลิก' : '+ เพิ่มรายการปันผล'}
          </button>
        </div>

        {/* Add Form */}
        {showForm && (
          <form
            onSubmit={handleAddSubmit}
            style={{
              padding: '20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--amber)' }}>
              บันทึกการรับเงินปันผลใหม่
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">
                  วันที่รับเงิน (พ.ศ.) *
                  {payDate && (
                    <span style={{ color: 'var(--amber)', fontSize: '11px', fontWeight: 600, marginLeft: '6px' }}>
                      ({formatThaiDate(payDate)})
                    </span>
                  )}
                </label>
                <ThaiDateInput value={payDate} onChange={setPayDate} required />
              </div>

              <div className="form-group">
                <label className="form-label">ปันผลต่อหุ้น (฿) *</label>
                <input
                  type="number"
                  step="0.0001"
                  className="form-input mono"
                  placeholder="1.60"
                  required
                  value={divPerShare}
                  onChange={(e) => setDivPerShare(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">หุ้นที่ถือ ณ วันนั้น *</label>
                <input
                  type="number"
                  className="form-input mono"
                  required
                  value={sharesHeld}
                  onChange={(e) => setSharesHeld(Number(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">ภาษีหัก ณ ที่จ่าย (%)</label>
                <input
                  type="number"
                  step="0.1"
                  className="form-input mono"
                  required
                  value={taxPct}
                  onChange={(e) => setTaxPct(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Calculated Preview */}
            <div
              style={{
                display: 'flex',
                gap: '24px',
                padding: '12px 16px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '2px',
                fontSize: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>ยอดปันผลขั้นต้น (Gross): </span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {formatCurrency(previewGross)}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>ภาษี {taxPct}%: </span>
                <span className="mono" style={{ color: 'var(--red)' }}>
                  -{formatCurrency(previewGross * (taxPct / 100))}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>สุทธิรับจริง (Net): </span>
                <span className="mono green" style={{ fontWeight: 700, fontSize: '14px' }}>
                  {formatCurrency(previewNet)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowForm(false)}
              >
                ยกเลิก
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? 'กำลังบันทึก...' : '✓ บันทึกปันผล'}
              </button>
            </div>
          </form>
        )}

        {/* Edit Modal */}
        {editingItem && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '520px' }}>
              <div className="modal-header">
                <div className="modal-title mono">EDIT DIVIDEND RECORD</div>
                <button className="btn btn-ghost" onClick={() => setEditingItem(null)}>✕</button>
              </div>
              <form onSubmit={handleEditSubmit} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">
                      วันที่รับเงิน (พ.ศ.) *
                      {editPayDate && (
                        <span style={{ color: 'var(--amber)', fontSize: '11px', fontWeight: 600, marginLeft: '6px' }}>
                          ({formatThaiDate(editPayDate)})
                        </span>
                      )}
                    </label>
                    <ThaiDateInput value={editPayDate} onChange={setEditPayDate} required />
                  </div>

                  <div className="form-group">
                    <label className="form-label">ปันผลต่อหุ้น (฿) *</label>
                    <input
                      type="number"
                      step="0.0001"
                      className="form-input mono"
                      required
                      value={editDivPerShare}
                      onChange={(e) => setEditDivPerShare(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">หุ้นที่ถือ ณ วันนั้น *</label>
                    <input
                      type="number"
                      className="form-input mono"
                      required
                      value={editSharesHeld}
                      onChange={(e) => setEditSharesHeld(Number(e.target.value))}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">ภาษีหัก ณ ที่จ่าย (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-input mono"
                      required
                      value={editTaxPct}
                      onChange={(e) => setEditTaxPct(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '2px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>ยอดปันผลขั้นต้น (Gross):</span>
                    <span className="mono">{formatCurrency(editPreviewGross)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>ภาษี {editTaxPct}%:</span>
                    <span className="mono red">-{formatCurrency(editPreviewGross * (editTaxPct / 100))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600 }}>สุทธิรับจริง (Net):</span>
                    <span className="mono green" style={{ fontWeight: 700, fontSize: '14px' }}>{formatCurrency(editPreviewNet)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingItem(null)}>
                    ยกเลิก
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                    {saving ? 'กำลังบันทึก...' : '✓ บันทึกการแก้ไข'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* List */}
        {dividends.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <div className="empty-state-title">ยังไม่มีประวัติการรับเงินปันผล</div>
            <div className="empty-state-desc">กดปุ่ม "+ เพิ่มรายการปันผล" เพื่อบันทึกปันผลที่ได้รับจริง</div>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <table className="data-table desktop-only">
              <thead>
                <tr>
                  <th>#</th>
                  <th>วันที่จ่าย</th>
                  <th style={{ textAlign: 'right' }}>ปันผล/หุ้น</th>
                  <th style={{ textAlign: 'right' }}>หุ้นที่ถือ</th>
                  <th style={{ textAlign: 'right' }}>ยอดก่อนภาษี</th>
                  <th style={{ textAlign: 'right' }}>ภาษี</th>
                  <th style={{ textAlign: 'right' }}>รับจริง (Net)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dividends.map((d, i) => (
                  <tr key={d.id}>
                    <td className="mono" style={{ color: 'var(--text-muted)', width: '40px' }}>
                      {i + 1}
                    </td>
                    <td className="mono" style={{ color: 'var(--text-secondary)' }}>
                      {formatThaiDate(d.pay_date)}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      ฿{formatNumber(d.dividend_per_share, 4)}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {formatNumber(d.shares_held, 0)}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                      {formatCurrency(d.gross_amount)}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--red)', fontSize: '12px' }}>
                      {d.tax_pct}% (-{formatCurrency(d.gross_amount - d.net_amount)})
                    </td>
                    <td className="mono green" style={{ textAlign: 'right', fontWeight: 700 }}>
                      {formatCurrency(d.net_amount)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--text-secondary)' }}
                          onClick={() => startEdit(d)}
                          disabled={!!deleting}
                        >
                          ✎
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--red)' }}
                          onClick={() => handleDelete(d.id)}
                          disabled={deleting === d.id}
                        >
                          {deleting === d.id ? '...' : '✕'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile View */}
            <div className="mobile-only-flex" style={{ display: 'none', flexDirection: 'column', gap: '8px', padding: '12px' }}>
              {dividends.map((d) => (
                <div key={d.id} className="stock-row history-grid-layout" style={{ borderLeft: '3px solid var(--green)', cursor: 'default' }}>
                  <div>
                    <div className="internal-label">Pay Date</div>
                    <div className="mono" style={{ fontSize: '13px' }}>{formatThaiDate(d.pay_date)}</div>
                  </div>
                  <div>
                    <div className="internal-label">Shares / Div</div>
                    <div className="mono" style={{ fontSize: '13px' }}>{formatNumber(d.shares_held, 0)} @ ฿{formatNumber(d.dividend_per_share, 4)}</div>
                  </div>
                  <div className="history-last-col">
                    <div className="internal-label">Net Received ({100 - d.tax_pct}%)</div>
                    <div className="mono green" style={{ fontWeight: 700, fontSize: '14px' }}>{formatCurrency(d.net_amount)}</div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => startEdit(d)} disabled={!!deleting}>✎</button>
                    <button className="btn btn-ghost" onClick={() => handleDelete(d.id)} disabled={deleting === d.id}>
                      {deleting === d.id ? '...' : '✕'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
