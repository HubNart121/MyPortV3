'use client';

import { useState } from 'react';
import { useToast } from './Toast';
import type { BuyRound, RealizedTrade } from '@/lib/types';
import { calculatePositionTimeline, formatCurrency, formatNumber, formatThaiDate } from '@/lib/calculations';
import { BuyRoundForm } from './BuyRoundForm';
import type { BuyRoundFormData } from './BuyRoundForm';

interface BuyRoundTableProps {
  rounds: BuyRound[];
  sells: RealizedTrade[];
  onAdd: (data: BuyRoundFormData) => Promise<void>;
  onEdit: (id: string, data: BuyRoundFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  avgCost: number;
  totalShares: number;
  totalInvested: number;
  currentPrice: number;
  currentValue: number;
  unrealizedProfit: number;
  unrealizedProfitPct: number;
}

export type { BuyRoundFormData };

export function BuyRoundTable({
  rounds,
  sells,
  onAdd,
  onEdit,
  onDelete,
  avgCost,
  totalShares,
  totalInvested,
  currentPrice,
  currentValue,
  unrealizedProfit,
  unrealizedProfitPct,
}: BuyRoundTableProps) {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingRound, setEditingRound] = useState<BuyRound | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const runningAverageByRoundId = calculatePositionTimeline(rounds, sells).buyAverageById;

  const onSubmit = async (data: BuyRoundFormData) => {
    setSaving(true);
    try {
      await onAdd(data);
      setShowForm(false);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const onEditSubmit = async (data: BuyRoundFormData) => {
    if (!editingRound) return;
    setSaving(true);
    try {
      await onEdit(editingRound.id, data);
      setEditingRound(null);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ลบรอบการซื้อนี้?')) return;
    setDeleting(id);
    try {
      await onDelete(id);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ', 'error');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      {/* Summary mini row */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        {[
          { label: 'หุ้นรวม', value: `${formatNumber(totalShares, 0)} หุ้น`, color: 'var(--text-primary)' },
          { label: 'ราคาหุ้นปัจจุบัน', value: currentPrice > 0 ? formatCurrency(currentPrice) : '—', color: '#4A9EF5' },
          { label: 'มูลค่าปัจจุบัน', value: currentPrice > 0 ? formatCurrency(currentValue) : '—', color: '#4A9EF5' },
          { label: 'เงินลงทุนรวม', value: formatCurrency(totalInvested), color: 'var(--amber)' },
          { label: 'ต้นทุนเฉลี่ย', value: avgCost > 0 ? formatCurrency(avgCost) : '—', color: 'var(--amber)' },
          {
            label: 'กำไร / ขาดทุนปัจจุบัน',
            value: currentPrice > 0 ? formatCurrency(unrealizedProfit) : '—',
            detail: currentPrice > 0 ? `${unrealizedProfitPct >= 0 ? '+' : ''}${formatNumber(unrealizedProfitPct)}%` : '',
            color: unrealizedProfit >= 0 ? 'var(--green)' : 'var(--red)',
          },
        ].map((item) => (
          <div key={item.label} className="stat-card" style={{ padding: '14px' }}>
            <div className="stat-label">{item.label}</div>
            <div className="mono" style={{ fontSize: '16px', fontWeight: 700, color: item.color }}>{item.value}</div>
            {item.detail && (
              <div className="mono" style={{ marginTop: '5px', fontSize: '12px', fontWeight: 700, color: item.color }}>
                {item.detail}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Table header + Add button */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">รอบการซื้อ ({rounds.length} รายการ)</div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? '✕ ยกเลิก' : '+ เพิ่มรอบซื้อ'}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
            <div style={{ maxWidth: '480px' }}>
              <BuyRoundForm
                onSubmit={onSubmit}
                onCancel={() => setShowForm(false)}
                loading={saving}
              />
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingRound && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '620px' }}>
              <div className="modal-header">
                <div className="modal-title mono">EDIT BUY ROUND</div>
                <button className="btn btn-ghost" onClick={() => setEditingRound(null)}>✕</button>
              </div>
              <div className="modal-body">
                <BuyRoundForm
                  initialData={editingRound}
                  onSubmit={onEditSubmit}
                  onCancel={() => setEditingRound(null)}
                  loading={saving}
                />
              </div>
            </div>
          </div>
        )}

        {/* Rounds list/table */}
        {rounds.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">ยังไม่มีรอบการซื้อ</div>
            <div className="empty-state-desc">กดปุ่ม "+ เพิ่มรอบซื้อ" เพื่อเริ่มบันทึก</div>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <table className="data-table desktop-only">
              <thead>
                <tr>
                  <th>#</th>
                  <th>วันที่ซื้อ</th>
                  <th style={{ textAlign: 'right' }}>ราคา/หุ้น</th>
                  <th style={{ textAlign: 'right' }}>จำนวนหุ้น</th>
                  <th style={{ textAlign: 'right' }}>ค่าธรรมเนียม</th>
                  <th style={{ textAlign: 'right' }}>ต้นทุนรวม</th>
                  <th>Note / Link</th>
                  <th style={{ textAlign: 'right' }}>ต้นทุนเฉลี่ย (running)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((r, i) => {
                  const runningAvg = runningAverageByRoundId[r.id] ?? r.price;
                  return (
                    <tr key={r.id}>
                      <td className="mono" style={{ color: 'var(--text-muted)', width: '40px' }}>{i + 1}</td>
                      <td className="mono" style={{ color: 'var(--text-secondary)' }}>{formatThaiDate(r.buy_date)}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--amber)' }}>
                        {formatCurrency(r.price)}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>{formatNumber(r.shares, 0)}</td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                        {formatCurrency(Number(r.buy_fee ?? 0))}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {formatCurrency((r.price * r.shares) + Number(r.buy_fee ?? 0))}
                      </td>
                      <td style={{ minWidth: '150px', maxWidth: '260px' }}>
                        {r.note && (
                          <div
                            style={{
                              color: 'var(--text-secondary)',
                              fontSize: '12px',
                              whiteSpace: 'pre-wrap',
                              overflowWrap: 'anywhere',
                              marginBottom: r.link_url ? '5px' : 0,
                            }}
                          >
                            {r.note}
                          </div>
                        )}
                        {r.link_url && (
                          <a
                            href={r.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mono"
                            style={{ color: 'var(--blue)', fontSize: '11px', overflowWrap: 'anywhere' }}
                          >
                            ↗ เปิดลิงก์
                          </a>
                        )}
                        {!r.note && !r.link_url && (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px' }}>
                        {formatCurrency(runningAvg)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--text-secondary)' }}
                            onClick={() => setEditingRound(r)}
                            disabled={!!deleting}
                          >
                            ✎
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--red)' }}
                            onClick={() => handleDelete(r.id)}
                            disabled={deleting === r.id}
                          >
                            {deleting === r.id ? '...' : '✕'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile Card List */}
            <div className="mobile-only-flex" style={{ display: 'none', flexDirection: 'column', gap: '8px', padding: '12px' }}>
              {rounds.map((r, i) => {
                const runningAvg = runningAverageByRoundId[r.id] ?? r.price;
                return (
                  <div key={r.id} className="stock-row history-grid-layout" style={{ borderLeft: '3px solid var(--blue)', cursor: 'default' }}>
                    <div>
                      <div className="internal-label">Date</div>
                      <div className="mono" style={{ fontSize: '13px' }}>{formatThaiDate(r.buy_date)}</div>
                    </div>
                    <div>
                      <div className="internal-label">Shares / Price</div>
                      <div className="mono" style={{ fontSize: '13px' }}>{formatNumber(r.shares, 0)} @ ฿{formatNumber(r.price)}</div>
                    </div>
                    <div className="history-last-col">
                      <div className="internal-label">Total incl. Fee / Run. Avg</div>
                      <div className="mono" style={{ fontWeight: 700 }}>
                        {formatCurrency((r.price * r.shares) + Number(r.buy_fee ?? 0))}
                      </div>
                      <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Fee: {formatCurrency(Number(r.buy_fee ?? 0))}
                      </div>
                      <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Avg: {formatCurrency(runningAvg)}</div>
                    </div>
                    {(r.note || r.link_url) && (
                      <div style={{ gridColumn: '1 / -1', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                        {r.note && (
                          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                            {r.note}
                          </div>
                        )}
                        {r.link_url && (
                          <a
                            href={r.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mono"
                            style={{ display: 'inline-block', marginTop: r.note ? '6px' : 0, color: 'var(--blue)', fontSize: '11px' }}
                          >
                            ↗ เปิดลิงก์
                          </a>
                        )}
                      </div>
                    )}
                    <div style={{ textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost" onClick={() => setEditingRound(r)} disabled={!!deleting}>✎</button>
                      <button className="btn btn-ghost" onClick={() => handleDelete(r.id)} disabled={deleting === r.id}>
                        {deleting === r.id ? '...' : '✕'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
