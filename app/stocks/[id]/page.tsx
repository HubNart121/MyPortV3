'use client';

import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  addStockChild,
  deleteStock,
  deleteStockChild,
  fetchStock,
  fetchStockOptions,
  findDuplicateStock,
  updateStock,
  updateStockChild,
} from '@/lib/services/portfolioService';
import { calcStats, formatCurrency, formatNumber, formatThaiDate, resolveAutomaticStockStatus } from '@/lib/calculations';
import type { Stock, BuyRound, RealizedTrade, DividendPayment } from '@/lib/types';
import { BuyRoundTable } from '@/components/BuyRoundTable';
import { DividendTable } from '@/components/DividendTable';
import type { DividendPaymentFormData } from '@/components/DividendTable';
import { StatusBadge, AssetBadge, CountryBadge, PortBadge, RiskBadge } from '@/components/Badges';
import { ToastContainer, useToast } from '@/components/Toast';
import type { BuyRoundFormData } from '@/components/BuyRoundTable';
import { StockForm } from '@/components/StockForm';
import type { StockFormData } from '@/components/StockForm';
import { SellModal } from '@/components/SellModal';
import type { SellFormData } from '@/components/SellModal';
import { DividendAccumulationChart } from '@/components/DividendAccumulationChart';
import { ShareStockButton } from '@/components/ShareStockButton';
import { applyBankAccountMovement } from '@/lib/services/bankAccountService';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function StockDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const [editingSell, setEditingSell] = useState<RealizedTrade | null>(null);
  const [selling, setSelling] = useState(false);

  const { data: raw, isLoading, error } = useQuery({
    queryKey: ['stock', id],
    queryFn: () => fetchStock(id),
  });

  const { data: existingOptions } = useQuery({
    queryKey: ['stock_options'],
    queryFn: fetchStockOptions,
  });

  if (isLoading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="mono" style={{ fontSize: '12px' }}>LOADING...</div>
      </div>
    );
  }

  if (error || !raw) {
    return (
      <div style={{ padding: '40px' }}>
        <div style={{ color: 'var(--red)', fontSize: '13px' }}>⚠ ไม่พบข้อมูลหุ้นนี้</div>
        <Link href="/" className="btn btn-secondary" style={{ marginTop: '16px' }}>← กลับ Dashboard</Link>
      </div>
    );
  }

  const stats = calcStats(
    raw,
    raw.buy_rounds ?? [],
    raw.realized_trades ?? [],
    raw.dividend_payments ?? []
  );
  const rounds = [...(raw.buy_rounds ?? [])].sort(
    (a, b) => new Date(a.buy_date).getTime() - new Date(b.buy_date).getTime()
  );
  const sells = [...(stats.realized_trades ?? [])].sort(
    (a, b) => new Date(a.sell_date).getTime() - new Date(b.sell_date).getTime()
  );
  const dividends = [...(raw.dividend_payments ?? [])].sort(
    (a, b) => new Date(b.pay_date).getTime() - new Date(a.pay_date).getTime()
  );

  const handleAddRound = async (data: BuyRoundFormData) => {
    await addStockChild<BuyRound>(id, 'buy_rounds', {
      buy_date: data.buy_date,
      price: data.price,
      shares: data.shares,
      buy_fee: data.buy_fee,
      note: data.note?.trim() || null,
      link_url: data.link_url?.trim() || null,
    });
    toast.show('บันทึกรอบซื้อสำเร็จ', 'success');
    queryClient.invalidateQueries({ queryKey: ['stock', id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    queryClient.invalidateQueries({ queryKey: ['global-history'] });
  };

  const handleDeleteRound = async (roundId: string) => {
    await deleteStockChild(id, 'buy_rounds', roundId);
    toast.show('ลบรอบซื้อแล้ว', 'success');
    queryClient.invalidateQueries({ queryKey: ['stock', id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    queryClient.invalidateQueries({ queryKey: ['global-history'] });
  };

  const handleEditRound = async (roundId: string, data: BuyRoundFormData) => {
    await updateStockChild(id, 'buy_rounds', roundId, {
        buy_date: data.buy_date,
        price: data.price,
        shares: data.shares,
        buy_fee: data.buy_fee,
        note: data.note?.trim() || null,
        link_url: data.link_url?.trim() || null,
      });
    toast.show('แก้ไขรอบซื้อสำเร็จ', 'success');
    queryClient.invalidateQueries({ queryKey: ['stock', id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    queryClient.invalidateQueries({ queryKey: ['global-history'] });
  };

  const handleAddDividend = async (data: DividendPaymentFormData) => {
    const gross = data.dividend_per_share * data.shares_held;
    const net = gross * (1 - (data.tax_pct ?? 10) / 100);
    await addStockChild<DividendPayment>(id, 'dividend_payments', {
      pay_date: data.pay_date,
      dividend_per_share: data.dividend_per_share,
      shares_held: data.shares_held,
      tax_pct: data.tax_pct,
      gross_amount: gross,
      net_amount: net,
    });
    await applyBankAccountMovement(raw.port_type as 'Business' | 'Private', net);
    toast.show('บันทึกรับเงินปันผลสำเร็จ', 'success');
    queryClient.invalidateQueries({ queryKey: ['stock', id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    queryClient.invalidateQueries({ queryKey: ['all-dividends'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
  };

  const handleEditDividend = async (divId: string, data: DividendPaymentFormData) => {
    const gross = data.dividend_per_share * data.shares_held;
    const net = gross * (1 - (data.tax_pct ?? 10) / 100);
    await updateStockChild(id, 'dividend_payments', divId, {
        pay_date: data.pay_date,
        dividend_per_share: data.dividend_per_share,
        shares_held: data.shares_held,
        tax_pct: data.tax_pct,
        gross_amount: gross,
        net_amount: net,
      });
    const previous = dividends.find((item) => item.id === divId);
    if (previous) await applyBankAccountMovement(raw.port_type as 'Business' | 'Private', -Number(previous.net_amount));
    await applyBankAccountMovement(raw.port_type as 'Business' | 'Private', net);
    toast.show('แก้ไขรายการปันผลสำเร็จ', 'success');
    queryClient.invalidateQueries({ queryKey: ['stock', id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    queryClient.invalidateQueries({ queryKey: ['all-dividends'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
  };

  const handleDeleteDividend = async (divId: string) => {
    const previous = dividends.find((item) => item.id === divId);
    await deleteStockChild(id, 'dividend_payments', divId);
    if (previous) await applyBankAccountMovement(raw.port_type as 'Business' | 'Private', -Number(previous.net_amount));
    toast.show('ลบรายการเงินปันผลแล้ว', 'success');
    queryClient.invalidateQueries({ queryKey: ['stock', id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    queryClient.invalidateQueries({ queryKey: ['all-dividends'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
  };

  const handleSell = async (data: SellFormData & { profit: number; avg_cost_at_sell: number }) => {
    setSelling(true);
    try {
      await addStockChild<RealizedTrade>(id, 'realized_trades', {
        sell_date: data.sell_date,
        shares: data.shares,
        sell_price: data.sell_price,
        sell_fee: data.sell_fee,
        avg_cost_at_sell: data.avg_cost_at_sell,
        profit: data.profit,
        port_type: raw.port_type,
      });

      toast.show('บันทึกการขายสำเร็จ', 'success');
      setIsSelling(false);
      queryClient.invalidateQueries({ queryKey: ['stock', id] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['all-trades'] });
      queryClient.invalidateQueries({ queryKey: ['global-history'] });
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ', 'error');
    } finally {
      setSelling(false);
    }
  };

  const handleEditSell = async (data: SellFormData & { profit: number; avg_cost_at_sell: number }) => {
    if (!editingSell) return;
    setSelling(true);
    try {
      await updateStockChild(id, 'realized_trades', editingSell.id, {
          sell_date: data.sell_date,
          shares: data.shares,
          sell_price: data.sell_price,
          sell_fee: data.sell_fee,
          avg_cost_at_sell: data.avg_cost_at_sell,
          profit: data.profit,
        });

      toast.show('แก้ไขรายการขายสำเร็จ', 'success');
      setEditingSell(null);
      queryClient.invalidateQueries({ queryKey: ['stock', id] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['all-trades'] });
      queryClient.invalidateQueries({ queryKey: ['global-history'] });
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ', 'error');
    } finally {
      setSelling(false);
    }
  };

  const handleDeleteSell = async (sellId: string) => {
    if (!confirm('ยืนยันลบรายการขายนี้?')) return;
    await deleteStockChild(id, 'realized_trades', sellId);
    toast.show('ลบรายการขายแล้ว', 'success');
    queryClient.invalidateQueries({ queryKey: ['stock', id] });
    queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    queryClient.invalidateQueries({ queryKey: ['all-trades'] });
    queryClient.invalidateQueries({ queryKey: ['global-history'] });
  };

  const handleDeleteStock = async () => {
    if (!confirm(`ลบหุ้น ${raw.symbol} ทั้งหมด รวมถึงรอบซื้อทั้งหมด?`)) return;
    setDeleting(true);
    try {
      await deleteStock(id);
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['all-trades'] });
      queryClient.invalidateQueries({ queryKey: ['all-dividends'] });
      queryClient.invalidateQueries({ queryKey: ['global-history'] });
      router.push('/');
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdateStock = async (data: StockFormData) => {
    setUpdating(true);
    try {
      const hasTransactionHistory = (
        (raw.buy_rounds?.length ?? 0)
        + (raw.realized_trades?.length ?? 0)
        + (raw.dividend_payments?.length ?? 0)
      ) > 0;

      if (hasTransactionHistory && data.port_type !== raw.port_type) {
        throw new Error('ไม่สามารถเปลี่ยน Port ของหุ้นที่มีประวัติแล้ว กรุณาเพิ่มหุ้น Symbol เดิมใน Port ใหม่');
      }

      if (data.port_type !== raw.port_type || data.country !== raw.country) {
        const duplicate = await findDuplicateStock(raw.symbol, data.port_type, data.country, id);
        if (duplicate) {
          throw new Error(`มีหุ้น ${raw.symbol} ประเทศ ${data.country} อยู่ใน Port ${data.port_type} แล้ว`);
        }
      }

      await updateStock(id, {
          name: data.name || null,
          sector: data.sector || null,
          status: resolveAutomaticStockStatus(data.status, stats.active_shares),
          asset_type: data.asset_type,
          port_type: data.port_type,
          country: data.country.trim().toUpperCase(),
          platform_trade: data.platform_trade?.trim() || null,
          risk_category: data.risk_category || null,
          dividend_per_share: data.dividend_per_share,
          expected_dividend_per_year: data.expected_dividend_per_year,
          current_price: data.current_price,
          target_price: data.target_price,
          graph_url: data.graph_url?.trim() || null,
          link_url: data.link_url?.trim() || null,
          note: data.note || null,
        });
      toast.show('อัปเดตข้อมูลหุ้นสำเร็จ', 'success');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['stock', id] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    } catch (e: unknown) {
      toast.show(e instanceof Error ? e.message : 'อัปเดตไม่สำเร็จ', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const profitClass = stats.expected_profit > 0 ? 'profit' : stats.expected_profit < 0 ? 'loss' : 'neutral';

  return (
    <>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/" className="btn btn-ghost" style={{ padding: '6px 8px' }}>←</Link>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div className="page-title mono">{raw.symbol}</div>
                <PortBadge portType={raw.port_type} />
                <StatusBadge status={stats.status} />
                <AssetBadge assetType={raw.asset_type} />
                <CountryBadge country={raw.country} />
                {raw.risk_category && <RiskBadge riskCategory={raw.risk_category} />}
                {raw.graph_url && (
                  <a
                    href={raw.graph_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="filter-chip active mono"
                    style={{ textDecoration: 'none' }}
                    aria-label={`เปิด Graph ของ ${raw.symbol}`}
                    title={raw.graph_url}
                  >
                    ↗ Graph
                  </a>
                )}
                {raw.link_url && (
                  <a
                    href={raw.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="filter-chip active mono"
                    style={{ textDecoration: 'none' }}
                    aria-label={`เปิด Link ของ ${raw.symbol}`}
                    title={raw.link_url}
                  >
                    ↗ Link
                  </a>
                )}
              </div>
              <div className="page-subtitle">
                {raw.name || '—'}{raw.sector ? ` · ${raw.sector}` : ''}
              </div>
            </div>
          </div>
          <div className="mobile-only-flex" style={{ display: 'none', gap: '8px', width: '100%', marginTop: '16px' }}>
            <ShareStockButton stockId={id} symbol={raw.symbol} className="btn btn-secondary btn-sm" style={{ flex: 1 }} compact />
            <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => setIsSelling(true)} disabled={stats.total_shares <= 0}>$ ขาย</button>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setIsEditing(true)}>✎ แก้ไข</button>
            <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={handleDeleteStock} disabled={deleting}>{deleting ? '...' : '✕ ลบ'}</button>
          </div>
          <div className="desktop-only" style={{ display: 'flex', gap: '8px' }}>
            <ShareStockButton stockId={id} symbol={raw.symbol} className="btn btn-secondary btn-sm" />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setIsSelling(true)}
              disabled={stats.total_shares <= 0}
            >
              $ บันทึกการขาย
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setIsEditing(true)}
            >
              ✎ แก้ไขป้ายกำกับ
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={handleDeleteStock}
              disabled={deleting}
            >
              {deleting ? '...' : '✕ ลบหุ้นนี้'}
            </button>
          </div>
        </div>

        {/* Sell Modal */}
        {isSelling && (
          <SellModal
            symbol={raw.symbol}
            totalShares={stats.total_shares}
            rounds={raw.buy_rounds ?? []}
            sells={raw.realized_trades ?? []}
            onClose={() => setIsSelling(false)}
            onSubmit={handleSell}
            loading={selling}
          />
        )}

        {editingSell && (
          <SellModal
            symbol={raw.symbol}
            totalShares={stats.total_shares}
            rounds={raw.buy_rounds ?? []}
            sells={raw.realized_trades ?? []}
            initialData={editingSell}
            onClose={() => setEditingSell(null)}
            onSubmit={handleEditSell}
            loading={selling}
          />
        )}

        {/* Summary Cards */}
        <div className="animate-stagger stats-grid">
          <div className="stat-card">
            <div className="stat-label">หุ้นทั้งหมด</div>
            <div className="stat-value mono">
              {formatNumber(stats.total_shares, 0)}
            </div>
            <div className="stat-sub">หน่วย: หุ้น</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ต้นทุนเฉลี่ย</div>
            <div className="stat-value amber mono">
              {stats.total_shares > 0 ? formatCurrency(stats.avg_cost) : '—'}
            </div>
            <div className="stat-sub">ต่อหุ้น</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">เงินลงทุนรวม</div>
            <div className="stat-value mono">{stats.total_shares > 0 ? formatCurrency(stats.total_invested) : '—'}</div>
            <div className="stat-sub">Current Invested</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">กำไรสุทธิคาดการณ์</div>
            <div className="stat-value violet mono">
              {stats.total_shares > 0 ? formatCurrency(stats.expected_profit) : '—'}
            </div>
            <div className="stat-sub">
              {stats.total_shares > 0 && stats.total_invested > 0 && (
                <span className={`mono ${stats.expected_profit_pct >= 0 ? 'profit' : 'loss'}`} style={{ fontWeight: 700 }}>
                  {stats.expected_profit_pct > 0 ? '+' : ''}{formatNumber(stats.expected_profit_pct)}%
                </span>
              )}
              {stats.total_shares > 0 && stats.total_invested > 0 ? ' · ' : ''}
              target ฿{formatNumber(raw.target_price)}
            </div>
          </div>
          <div className="stat-card expected-dividend-card" style={{ borderLeft: '2px solid var(--green)' }}>
            <div className="stat-label">เงินปันผลคาดการณ์/ปี</div>
            <div className="stat-value violet mono">
              {stats.expected_dividend > 0 ? formatCurrency(stats.expected_dividend) : '—'}
            </div>
            <div className="stat-sub">
              <span className="mono profit" style={{ fontWeight: 700 }}>
                {stats.total_shares > 0 && stats.total_invested > 0
                  ? `${formatNumber((stats.expected_dividend / stats.total_invested) * 100)}%`
                  : '—'}
              </span>
              {' ต่อปีของเงินลงทุนที่ถืออยู่'}
            </div>
            <div className="stat-sub">
              ปันผลต่อหุ้น ฿{formatNumber(Number(raw.expected_dividend_per_year) || Number(raw.dividend_per_share ?? 0), 4)} · ตามหุ้นที่ถืออยู่
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '2px solid var(--green)' }}>
            <div className="stat-label">ปันผลสุทธิรับจริง</div>
            <div className="stat-value green mono">
              {stats.total_received_dividend > 0 ? formatCurrency(stats.total_received_dividend) : '—'}
            </div>
            <div className="stat-sub">
              {stats.received_dividend_yield_pct > 0
                ? `${formatNumber(stats.received_dividend_yield_pct)}% ของทุนที่ลงทุนทั้งหมด (all-time)`
                : 'รับจริงหลังหักภาษี'}
            </div>
          </div>
          {sells.length > 0 && (
            <div className="stat-card" style={{ borderLeft: `2px solid ${stats.total_realized_profit >= 0 ? 'var(--amber)' : 'var(--red)'}` }}>
              <div className="stat-label">กำไร/ขาดทุนสุทธิจากการขาย</div>
              <div className={`stat-value mono ${stats.total_realized_profit >= 0 ? 'amber' : 'red'}`}>
                {formatCurrency(stats.total_realized_profit)}
              </div>
              <div className="stat-sub">
                <span
                  className={`mono ${stats.realized_profit_pct >= 0 ? 'profit' : 'loss'}`}
                  style={{ fontWeight: 700 }}
                >
                  {stats.realized_profit_pct > 0 ? '+' : ''}
                  {formatNumber(stats.realized_profit_pct)}%
                </span>
                {' '}จากต้นทุนที่ขาย · {sells.length} รายการขาย
              </div>
            </div>
          )}
          <div className="stat-card" style={{ borderLeft: `2px solid ${stats.total_actual_return >= 0 ? 'var(--green)' : 'var(--red)'}` }}>
            <div className="stat-label">ผลตอบแทนรวมที่ได้รับจริง</div>
            <div className={`stat-value mono ${stats.total_actual_return >= 0 ? 'green' : 'red'}`}>
              {(stats.total_realized_profit !== 0 || stats.total_received_dividend > 0)
                ? formatCurrency(stats.total_actual_return)
                : '—'}
            </div>
            <div className="stat-sub">
              {(stats.total_realized_profit !== 0 || stats.total_received_dividend > 0) && stats.total_invested_all_time > 0 ? (
                <>
                  <span
                    className={`mono ${stats.actual_return_pct >= 0 ? 'profit' : 'loss'}`}
                    style={{ fontWeight: 700 }}
                  >
                    {stats.actual_return_pct > 0 ? '+' : ''}
                    {formatNumber(stats.actual_return_pct)}%
                  </span>
                  {' '}จากเงินลงทุนทั้งหมด (all-time)
                </>
              ) : (
                'กำไรขายจริง + เงินปันผลสุทธิรับจริง'
              )}
            </div>
          </div>
        </div>

        {/* Note */}
        {raw.note && (
          <div style={{ marginBottom: '24px', padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--amber)', borderRadius: '0 2px 2px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            {raw.note}
          </div>
        )}

        <BuyRoundTable
          rounds={rounds}
          sells={sells}
          onAdd={handleAddRound}
          onEdit={handleEditRound}
          onDelete={handleDeleteRound}
          avgCost={stats.avg_cost}
          totalShares={stats.total_shares}
          totalInvested={stats.total_invested}
          currentPrice={Number(raw.current_price ?? 0)}
          currentValue={stats.current_value}
          unrealizedProfit={stats.unrealized_profit}
          unrealizedProfitPct={stats.unrealized_profit_pct}
        />

        <DividendAccumulationChart
          dividends={dividends}
          symbol={raw.symbol}
        />

        <DividendTable
          dividends={dividends}
          currentShares={stats.total_shares}
          onAdd={handleAddDividend}
          onEdit={handleEditDividend}
          onDelete={handleDeleteDividend}
        />

        {/* Realized Trades Section */}
        {sells.length > 0 && (
          <div style={{ marginTop: '40px' }}>
            <div className="section-title">ประวัติการขาย (Trading History)</div>
            <div className="animate-stagger" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sells.map((s) => {
                const costBasis = Number(s.avg_cost_at_sell) * Number(s.shares);
                const profitPct = costBasis > 0 ? (Number(s.profit) / costBasis) * 100 : 0;
                return (
                <div key={s.id} className="stock-row history-grid-layout" style={{ borderLeft: '3px solid var(--amber)', cursor: 'default' }}>
                  <div>
                    <div className="internal-label">Sell Date</div>
                    <div className="mono" style={{ fontSize: '13px' }}>{formatThaiDate(s.sell_date)}</div>
                  </div>
                  <div>
                    <div className="internal-label">Shares</div>
                    <div className="mono" style={{ fontSize: '13px' }}>{formatNumber(s.shares, 0)}</div>
                  </div>
                  <div>
                    <div className="internal-label">Sell Price</div>
                    <div className="mono" style={{ fontSize: '13px' }}>{formatCurrency(s.sell_price)}</div>
                    <div className="mono" style={{ marginTop: '3px', color: 'var(--text-muted)', fontSize: '11px' }}>
                      Fee: {formatCurrency(Number(s.sell_fee ?? 0))}
                    </div>
                  </div>
                  <div className="history-last-col">
                    <div className="internal-label">Net Profit</div>
                    <div className={`mono ${s.profit >= 0 ? 'profit' : 'loss'}`} style={{ fontWeight: 700, fontSize: '15px' }}>
                      {formatCurrency(s.profit)}
                    </div>
                    <div className={`mono ${profitPct >= 0 ? 'profit' : 'loss'}`} style={{ marginTop: '3px', fontWeight: 700, fontSize: '12px' }}>
                      {profitPct > 0 ? '+' : ''}{formatNumber(profitPct)}%
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost" onClick={() => setEditingSell(s)} aria-label="แก้ไขรายการขาย">✎</button>
                      <button className="btn btn-ghost" onClick={() => handleDeleteSell(s.id)} aria-label="ลบรายการขาย">✕</button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>รวมกำไรที่ทำได้จริงทั้งหมด:</span>
              <span className={`mono ${stats.total_realized_profit >= 0 ? 'profit' : 'loss'}`} style={{ fontSize: '18px', fontWeight: 700 }}>
                {formatCurrency(stats.total_realized_profit)}
              </span>
            </div>
          </div>
        )}
      </div>
      {/* Keep the modal outside the animated page container so position: fixed
          remains anchored to the viewport instead of the full document. */}
      {isEditing && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div className="modal-title mono">EDIT STOCK: {raw.symbol}</div>
              <button className="btn btn-ghost" onClick={() => setIsEditing(false)}>✕</button>
            </div>
            <div className="modal-body">
              <StockForm
                initialData={{ ...raw, status: stats.status }}
                onSubmit={handleUpdateStock}
                onCancel={() => setIsEditing(false)}
                loading={updating}
                submitLabel="บันทึกการแก้ไข"
                existingPortTypes={existingOptions?.ports}
                existingStatuses={existingOptions?.statuses}
                existingAssetTypes={existingOptions?.assetTypes}
                existingCountries={existingOptions?.countries}
                existingPlatforms={existingOptions?.platforms}
                lockPortType={(
                  (raw.buy_rounds?.length ?? 0)
                  + (raw.realized_trades?.length ?? 0)
                  + (raw.dividend_payments?.length ?? 0)
                ) > 0}
              />
            </div>
          </div>
        </div>
      )}
      <ToastContainer />
    </>
  );
}
