'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { assignMissingHistoryPlatform, fetchGlobalHistory } from '@/lib/services/portfolioService';
import { formatCurrency, formatNumber, formatThaiDate } from '@/lib/calculations';
import { downloadTradingHistoryExcel } from '@/lib/tradingHistoryExcel';
import { PortBadge } from '@/components/Badges';
import { ToastContainer, useToast } from '@/components/Toast';

interface UnifiedTransaction {
  id: string;
  type: 'BUY' | 'SELL';
  date: string;
  symbol: string;
  shares: number;
  price: number;
  total: number;
  fee: number;
  profit?: number;
  profit_pct?: number;
  port_type: string;
  stock_id: string;
}

export default function HistoryPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isAssigningPlatform, setIsAssigningPlatform] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['global-history'],
    queryFn: fetchGlobalHistory,
  });

  const history = useMemo(() => {
    if (!data) return [];
    
    const unified: UnifiedTransaction[] = [];
    
    // Process Buys
    data.buys?.forEach((b: any) => {
      unified.push({
        id: b.id,
        type: 'BUY',
        date: b.buy_date,
        symbol: b.stocks?.symbol || '?',
        shares: b.shares,
        price: b.price,
        total: (b.shares * b.price) + Number(b.buy_fee ?? 0),
        fee: Number(b.buy_fee ?? 0),
        port_type: b.stocks?.port_type || 'Private',
        stock_id: b.stock_id,
      });
    });
    
    // Process Sells
    data.sells?.forEach((s: any) => {
      const parsedProfit = Number(s.profit);
      const profit = s.profit !== null && s.profit !== undefined && Number.isFinite(parsedProfit)
        ? parsedProfit
        : undefined;
      const costBasis = Number(s.avg_cost_at_sell ?? 0) * Number(s.shares ?? 0);

      unified.push({
        id: s.id,
        type: 'SELL',
        date: s.sell_date,
        symbol: s.stocks?.symbol || '?',
        shares: s.shares,
        price: s.sell_price,
        total: (s.shares * s.sell_price) - Number(s.sell_fee ?? 0),
        fee: Number(s.sell_fee ?? 0),
        profit,
        profit_pct: profit !== undefined && costBasis > 0 ? profit / costBasis : undefined,
        port_type: s.port_type,
        stock_id: s.stock_id,
      });
    });
    
    return unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data]);

  const assignStreaming = async () => {
    setIsAssigningPlatform(true);
    try {
      const count = await assignMissingHistoryPlatform('streaming');
      await queryClient.invalidateQueries({ queryKey: ['global-history'] });
      await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      toast.show(count > 0 ? `บันทึก streaming ให้หุ้น History ${count} รายการแล้ว` : 'หุ้น History ระบุ PlatformTrade ครบแล้ว', 'success');
    } catch (caught) {
      toast.show(caught instanceof Error ? caught.message : 'บันทึก PlatformTrade ไม่สำเร็จ', 'error');
    } finally {
      setIsAssigningPlatform(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="mono" style={{ fontSize: '12px' }}>LOADING HISTORY...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ color: 'var(--red)', fontSize: '13px' }}>⚠ Error: {(error as Error).message}</div>
      </div>
    );
  }

  return (
    <>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <div className="page-title">TRADING HISTORY</div>
            <div className="page-subtitle">ประวัติการซื้อขายทั้งหมดเรียงตามวันเวลา</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={assignStreaming} disabled={isAssigningPlatform || history.length === 0}>
            {isAssigningPlatform ? 'กำลังบันทึก...' : 'ตั้งรายการที่ยังไม่ระบุเป็น streaming'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => downloadTradingHistoryExcel(history)}
            disabled={history.length === 0}
          >
            ⇩ Report Excel
          </button>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">▤</div>
            <div className="empty-state-title">ยังไม่มีประวัติการซื้อขาย</div>
            <div className="empty-state-desc">เริ่มเพิ่มรอบการซื้อหรือบันทึกการขายเพื่อดูประวัติที่นี่</div>
          </div>
        ) : (
          <div className="animate-stagger" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
             {/* Header */}
             <div className="stock-grid-layout desktop-only"
              style={{
                padding: '6px 20px',
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--text-muted)',
              }}
            >
              <div style={{ gridColumn: 'span 1' }}>Date</div>
              <div>Type</div>
              <div>Symbol</div>
              <div>Shares</div>
              <div>Price</div>
              <div style={{ textAlign: 'right' }}>Total Value / Profit</div>
            </div>

            {history.map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                href={`/stocks/${item.stock_id}`}
                className="stock-row history-grid-layout"
                style={{ 
                  borderLeft: `3px solid ${item.type === 'BUY' ? 'var(--blue)' : 'var(--amber)'}`
                }}
              >
                <div>
                   <div className="internal-label" style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Date</div>
                   <div className="mono" style={{ fontSize: '13px' }}>{formatThaiDate(item.date)}</div>
                </div>
                <div>
                   <div className="internal-label" style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Type</div>
                   <span style={{ 
                     fontSize: '10px', 
                     fontWeight: 700, 
                     padding: '2px 6px', 
                     borderRadius: '2px',
                     background: item.type === 'BUY' ? 'rgba(58,143,224,0.1)' : 'rgba(245,166,35,0.1)',
                     color: item.type === 'BUY' ? 'var(--blue)' : 'var(--amber)',
                     border: `1px solid ${item.type === 'BUY' ? 'rgba(58,143,224,0.2)' : 'rgba(245,166,35,0.2)'}`
                   }}>
                     {item.type}
                   </span>
                </div>
                <div>
                   <div className="internal-label" style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Symbol</div>
                   <div className="mono" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.symbol}</div>
                   <div style={{ transform: 'scale(0.8)', transformOrigin: 'left' }}>
                     <PortBadge portType={item.port_type as any} />
                   </div>
                </div>
                <div>
                   <div className="internal-label" style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Shares</div>
                   <div className="mono" style={{ fontSize: '13px' }}>{formatNumber(item.shares, 0)}</div>
                </div>
                <div>
                   <div className="internal-label" style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Price</div>
                   <div className="mono" style={{ fontSize: '13px' }}>{formatCurrency(item.price)}</div>
                   <div className="mono" style={{ marginTop: '3px', color: 'var(--text-muted)', fontSize: '10px' }}>
                     Fee: {formatCurrency(item.fee)}
                   </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', width: '100%' }} className="history-last-col">
                  <div className="internal-label" style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>Total / Profit</div>
                  <div className="mono" style={{ fontWeight: 600 }}>{formatCurrency(item.total)}</div>
                  {item.type === 'SELL' && item.profit !== undefined && (
                    <div className={`mono ${item.profit >= 0 ? 'profit' : 'loss'}`} style={{ fontSize: '11px', fontWeight: 700 }}>
                      {item.profit >= 0 ? '+' : ''}{formatCurrency(item.profit)} Profit
                      {item.profit_pct !== undefined && (
                        <> ({item.profit_pct >= 0 ? '+' : ''}{formatNumber(item.profit_pct * 100, 2)}%)</>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <ToastContainer />
    </>
  );
}
