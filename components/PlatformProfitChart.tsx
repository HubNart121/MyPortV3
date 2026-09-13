'use client';

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '@/lib/calculations';
import type { PlatformProfit } from '@/lib/platform-profit';

export function PlatformProfitChart({ data }: { data: PlatformProfit[] }) {
  const total = data.reduce((sum, item) => sum + item.profit, 0);
  const color = (value: number) => value > 0 ? 'var(--green)' : value < 0 ? 'var(--red)' : 'var(--text-muted)';

  return (
    <section className="panel" style={{ marginBottom: '24px' }} aria-label="กำไรขายแล้วแยก PlatformTrade">
      <div className="panel-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div className="panel-title">กำไร/ขาดทุนขายแล้ว · PlatformTrade</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '6px' }}>
            ยอดสุทธิหลังต้นทุนและค่าธรรมเนียม · ตามช่วงวันที่และพอร์ตที่เลือกด้านบน
          </div>
        </div>
        <strong className="mono" style={{ color: color(total), fontSize: '18px' }}>รวม {formatCurrency(total)}</strong>
      </div>
      {data.length === 0 ? (
        <div className="panel-body" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '36px 16px' }}>
          ยังไม่มีรายการขายในช่วงวันที่และพอร์ตที่เลือก
        </div>
      ) : (
        <div className="panel-body">
          <div style={{ overflowX: 'auto' }}>
            <div style={{ height: 300, minWidth: Math.max(300, data.length * 110) }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                <BarChart data={data} margin={{ top: 16, right: 20, bottom: 16, left: 16 }} accessibilityLayer>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" interval={0} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    tickFormatter={(name: string) => name.length > 14 ? `${name.slice(0, 12)}…` : name} />
                  <YAxis width={85} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    tickFormatter={(value: number) => value.toLocaleString('th-TH', { notation: 'compact', maximumFractionDigits: 1 })} />
                  <ReferenceLine y={0} stroke="var(--text-secondary)" />
                  <Tooltip cursor={{ fill: 'var(--border)', opacity: 0.3 }} content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload as PlatformProfit;
                    return <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-bright)', padding: '12px', maxWidth: '280px', overflowWrap: 'anywhere' }}>
                      <div>{item.name}</div>
                      <strong className="mono" style={{ color: color(item.profit) }}>{formatCurrency(item.profit)}</strong>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{item.tradeCount} รายการขาย</div>
                    </div>;
                  }} />
                  <Bar dataKey="profit" name="กำไร/ขาดทุนสุทธิ (บาท)" maxBarSize={56} isAnimationActive={false}>
                    {data.map((item) => <Cell key={item.name} fill={color(item.profit)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '12px' }}>
            {data.map((item) => <div key={item.name} style={{ border: '1px solid var(--border)', padding: '12px', minWidth: 0 }}>
              <div style={{ overflowWrap: 'anywhere' }}>{item.name}</div>
              <strong className="mono" style={{ color: color(item.profit) }}>{formatCurrency(item.profit)}</strong>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{item.tradeCount} รายการขาย</div>
            </div>)}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '16px 0 0' }}>
            จัดกลุ่มตาม PlatformTrade ปัจจุบันของหุ้น · ไม่รวมปันผลและกำไรที่ยังไม่ได้ขาย · หุ้นที่ไม่ระบุแพลตฟอร์มอยู่ในกลุ่ม “ไม่ระบุ”
          </p>
        </div>
      )}
    </section>
  );
}
