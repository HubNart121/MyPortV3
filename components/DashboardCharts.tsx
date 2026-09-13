'use client';

import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
  ComposedChart,
  Line
} from 'recharts';

const CHART_INITIAL_DIMENSION = { width: 1, height: 1 };

const COLORS = [
  '#F5A623', // Amber
  '#3A8FE0', // Blue
  '#27AE60', // Green
  '#E03A3A', // Red
  '#B06AE0', // Purple
  '#60C0C0', // Cyan
  '#FF9632', // Orange
  '#D96C9D', // Pink
  '#8AC926', // Lime
  '#6C7AE0', // Indigo
  '#F2C14E', // Gold
  '#2EC4B6', // Teal
];

const RISK_COLORS: Record<string, string> = {
  '🟢 Defensive': '#27AE60',
  '🟢 Income / Dividend': '#60C98A',
  '🟡 Quality / Core': '#F2C14E',
  '🟡 Growth': '#E6A93A',
  '🟠 Cyclical': '#FF9632',
  '🟠 Turnaround': '#D9782D',
  '🔴 Speculative': '#E03A3A',
  '🔴 Distressed': '#A92D3A',
  '⚪ ไม่ระบุ': '#8A91A3',
};

interface ChartDataItem {
  name: string;
  value: number;
}

interface DashboardChartsProps {
  countryData: ChartDataItem[];
  portData: ChartDataItem[];
  sectorData: ChartDataItem[];
  assetData: ChartDataItem[];
  riskData: ChartDataItem[];
  symbolData: ChartDataItem[];
  stackedData: {
    data: any[];
    sectors: string[];
  };
}

import { useState, useEffect } from 'react';

export function DashboardCharts({ portData, countryData, sectorData, assetData, riskData, symbolData, stackedData }: DashboardChartsProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const hasData = countryData.length > 0 || portData.length > 0 || sectorData.length > 0 || assetData.length > 0 || riskData.length > 0 || symbolData.length > 0;

  if (!hasData) return null;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      // Filter out 'total' from the payload map to avoid showing it as a sector
      const sectors = payload.filter((item: any) => item.dataKey !== 'total');
      const isStacked = sectors.length > 1;
      
      return (
        <div style={{ 
          background: 'var(--bg-secondary)', 
          border: '1px solid var(--border-bright)', 
          padding: '8px 12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          borderRadius: '2px'
        }}>
          <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            {payload[0].payload.name}
          </div>
          {sectors.map((item: any, i: number) => {
            const totalValue = sectors.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0);
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: i === sectors.length - 1 ? 0 : '4px' }}>
                <span className="mono" style={{ fontSize: '11px', color: item.color || item.fill }}>{item.name}:</span>
                <span className="mono" style={{ fontSize: '11px', fontWeight: 700 }}>
                  ฿{item.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  {totalValue > 0 && ` (${((item.value / totalValue) * 100).toFixed(1)}%)`}
                </span>
              </div>
            );
          })}
          {isStacked && (
            <div style={{ marginTop: '8px', paddingTop: '4px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 700 }}>TOTAL:</span>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--amber)', fontWeight: 700 }}>
                ฿{payload[0].payload.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const AllocationTooltip = ({ active, payload, total }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    const value = Number(item.value || 0);
    const percent = total > 0 ? (value / total) * 100 : 0;

    return (
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-bright)',
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        borderRadius: '2px',
      }}>
        <div className="mono" style={{ fontSize: '10px', color: item.color || item.payload?.fill || 'var(--amber)', marginBottom: '4px' }}>
          {item.name}
        </div>
        <div className="mono" style={{ fontSize: '11px', fontWeight: 700 }}>
          ฿{value.toLocaleString('th-TH', { maximumFractionDigits: 0 })} ({percent.toFixed(2)}%)
        </div>
      </div>
    );
  };

  const renderTotalLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (value === undefined || value === null) return null;
    
    return (
      <text 
        x={x} 
        y={y - 12} 
        fill="var(--amber)" 
        textAnchor="middle" 
        className="mono"
        style={{ fontSize: '12px', fontWeight: 700 }}
      >
        ฿{(value / 1000).toFixed(0)}k
      </text>
    );
  };

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }: any) => {
    const RADIAN = Math.PI / 180;
    const isSmallSlice = percent < 0.04;
    const staggerDistance = isSmallSlice ? (index % 3) * (isMobile ? 14 : 10) : 0;
    const radius = Math.max(
      outerRadius + (isMobile ? 10 : 14) + staggerDistance,
      (isMobile ? 76 : 90) + staggerDistance
    );
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.005) return null;

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        className="mono"
        style={{ fontSize: isSmallSlice ? '9px' : isMobile ? '10px' : '11px', fontWeight: 700 }}
      >
        {`${(percent * 100).toFixed(percent < 0.01 ? 1 : 0)}%`}
      </text>
    );
  };

  const renderSymbolLabel = (props: any) => {
    if (props.percent < 0.02) return null;
    return renderCustomizedLabel(props);
  };

  const renderAllocationLegend = (
    data: ChartDataItem[],
    colorOffset = 0,
    colorMap?: Record<string, string>,
  ) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);

    return (
      <div className="allocation-legend">
        {data.map((item, index) => {
          const percent = total > 0 ? (item.value / total) * 100 : 0;

          return (
            <div className="allocation-legend-item" key={item.name}>
              <span
                className="allocation-legend-color"
                style={{ background: colorMap?.[item.name] ?? COLORS[(index + colorOffset) % COLORS.length] }}
              />
              <span className="allocation-legend-name mono">{item.name}</span>
              <strong className="allocation-legend-value mono">{percent.toFixed(percent < 1 ? 1 : 0)}%</strong>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="dashboard-charts">
      
      {/* New Stacked Bar Chart - Top Priority as requested */}
      {stackedData.data.length > 0 && (
        <div className="panel animate-fade-in" style={{ width: '100%' }}>
          <div className="panel-header">
            <div className="panel-title">ยอดเงินลงทุนแยกตามประเภทพอร์ตและกลุ่มอุตสาหกรรม (Stacked Bar)</div>
          </div>
          <div style={{ height: isMobile ? '400px' : '350px', width: '100%', minWidth: 0, padding: isMobile ? '10px 5px' : '24px 20px 10px' }}>
            <ResponsiveContainer
              width="99%"
              height="100%"
              minWidth={0}
              initialDimension={CHART_INITIAL_DIMENSION}
            >
              <ComposedChart
                data={stackedData.data}
                margin={{ top: isMobile ? 50 : 30, right: isMobile ? 10 : 30, left: isMobile ? -10 : 20, bottom: isMobile ? 40 : 20 }}
                barSize={isMobile ? 35 : 60}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="var(--text-muted)" 
                  fontSize={isMobile ? 10 : 12} 
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  className="mono uppercase"
                />
                <YAxis 
                  stroke="var(--text-muted)" 
                  fontSize={isMobile ? 9 : 10}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickFormatter={(value) => `฿${(value / 1000)}k`}
                  className="mono"
                  width={isMobile ? 40 : 60}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-hover)', opacity: 0.4 }} />
                <Legend 
                  verticalAlign={isMobile ? "bottom" : "top"} 
                  align={isMobile ? "center" : "right"}
                  iconType="rect"
                  wrapperStyle={isMobile ? { paddingTop: '20px' } : { paddingBottom: '20px' }}
                  formatter={(value) => <span style={{ color: 'var(--text-secondary)', fontSize: '10px', fontFamily: 'Space Mono', textTransform: 'uppercase' }}>{value}</span>}
                />
                {stackedData.sectors.map((sector, index) => (
                  <Bar 
                    key={sector} 
                    dataKey={sector} 
                    name={sector}
                    stackId="a" 
                    fill={COLORS[index % COLORS.length]} 
                    radius={index === stackedData.sectors.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                    animationDuration={500}
                  />
                ))}
                
                {/* Invisible Line to provide the total labels at the "fingertips" */}
                <Line 
                  type="monotone" 
                  dataKey="total" 
                  stroke="none" 
                  dot={false} 
                  activeDot={false}
                  legendType="none"
                  isAnimationActive={false}
                >
                  <LabelList content={renderTotalLabel} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="allocation-grid">
        {/* Port Type Chart */}
        {portData.length > 0 && (
          <div className="panel allocation-card">
            <div className="panel-header allocation-card-header">
              <div className="panel-title">สัดส่วนตามประเภทพอร์ต (Port Type)</div>
            </div>
            <div className="allocation-chart">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                initialDimension={CHART_INITIAL_DIMENSION}
              >
                <PieChart>
                  <Pie
                    data={portData}
                    cx="50%"
                    cy="50%"
                    innerRadius={isMobile ? 46 : 54}
                    outerRadius={isMobile ? 68 : 82}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                    label={renderCustomizedLabel}
                    labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
                  >
                    {portData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<AllocationTooltip total={portData.reduce((sum, item) => sum + item.value, 0)} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {renderAllocationLegend(portData)}
          </div>
        )}

        {/* Company Country Chart */}
        {countryData.length > 0 && (
          <div className="panel allocation-card">
            <div className="panel-header allocation-card-header">
              <div>
                <div className="panel-title">สัดส่วนหุ้นประเทศ (Country)</div>
                <div className="allocation-card-subtitle">ประเทศบริษัทต้นทาง · ตามเงินลงทุนปัจจุบันในพอร์ตที่เลือก</div>
              </div>
            </div>
            <div className="allocation-chart">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={CHART_INITIAL_DIMENSION}>
                <PieChart>
                  <Pie
                    data={countryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={isMobile ? 46 : 54}
                    outerRadius={isMobile ? 68 : 82}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    label={renderCustomizedLabel}
                    labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
                  >
                    {countryData.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<AllocationTooltip total={countryData.reduce((sum, item) => sum + item.value, 0)} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {renderAllocationLegend(countryData)}
          </div>
        )}

        {/* Sector Chart */}
        {sectorData.length > 0 && (
          <div className="panel allocation-card allocation-card-sector">
            <div className="panel-header allocation-card-header">
              <div className="panel-title">สัดส่วนตามกลุ่มอุตสาหกรรม (Sector)</div>
            </div>
            <div className="allocation-chart">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                initialDimension={CHART_INITIAL_DIMENSION}
              >
                <PieChart>
                  <Pie
                    data={sectorData}
                    cx="50%"
                    cy="50%"
                    innerRadius={isMobile ? 46 : 54}
                    outerRadius={isMobile ? 68 : 82}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                    label={renderCustomizedLabel}
                    labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
                  >
                    {sectorData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<AllocationTooltip total={sectorData.reduce((sum, item) => sum + item.value, 0)} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {renderAllocationLegend(sectorData, 2)}
          </div>
        )}

        {/* Asset Type Chart */}
        {assetData.length > 0 && (
          <div className="panel allocation-card allocation-card-asset">
            <div className="panel-header allocation-card-header">
              <div className="panel-title">สัดส่วนตามประเภทสินทรัพย์ (Asset)</div>
            </div>
            <div className="allocation-chart">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                initialDimension={CHART_INITIAL_DIMENSION}
              >
                <PieChart>
                  <Pie
                    data={assetData}
                    cx="50%"
                    cy="50%"
                    innerRadius={isMobile ? 46 : 54}
                    outerRadius={isMobile ? 68 : 82}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                    label={renderCustomizedLabel}
                    labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
                  >
                    {assetData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 4) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<AllocationTooltip total={assetData.reduce((sum, item) => sum + item.value, 0)} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {renderAllocationLegend(assetData, 4)}
          </div>
        )}

        {/* Risk Category Allocation */}
        {riskData.length > 0 && (
          <div className="panel allocation-card allocation-card-symbol">
            <div className="panel-header allocation-card-header">
              <div>
                <div className="panel-title">สัดส่วนเงินลงทุนตาม Risk Category</div>
                <div className="allocation-card-subtitle">คำนวณจากเงินลงทุนปัจจุบัน และเปลี่ยนตามตัวกรองพอร์ต</div>
              </div>
            </div>
            <div className="allocation-symbol-body">
              <div className="allocation-chart allocation-symbol-chart">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  initialDimension={CHART_INITIAL_DIMENSION}
                >
                  <PieChart>
                    <Pie
                      data={riskData}
                      cx="50%"
                      cy="50%"
                      innerRadius={isMobile ? 50 : 70}
                      outerRadius={isMobile ? 78 : 108}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="var(--bg-secondary)"
                      strokeWidth={1}
                      label={renderCustomizedLabel}
                      labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
                    >
                      {riskData.map((entry) => (
                        <Cell key={`risk-cell-${entry.name}`} fill={RISK_COLORS[entry.name] ?? '#8A91A3'} />
                      ))}
                    </Pie>
                    <Tooltip content={<AllocationTooltip total={riskData.reduce((sum, item) => sum + item.value, 0)} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="allocation-symbol-legend">
                {renderAllocationLegend(riskData, 0, RISK_COLORS)}
              </div>
            </div>
          </div>
        )}

        {/* Individual Stock Allocation */}
        {symbolData.length > 0 && (
          <div className="panel allocation-card allocation-card-symbol">
            <div className="panel-header allocation-card-header">
              <div>
                <div className="panel-title">สัดส่วนการถือหุ้นรายตัว (Symbol)</div>
                <div className="allocation-card-subtitle">คำนวณจากเงินลงทุนปัจจุบันของหุ้นที่ยังถืออยู่</div>
              </div>
            </div>
            <div className="allocation-symbol-body">
              <div className="allocation-chart allocation-symbol-chart">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  initialDimension={CHART_INITIAL_DIMENSION}
                >
                  <PieChart>
                    <Pie
                      data={symbolData}
                      cx="50%"
                      cy="50%"
                      innerRadius={isMobile ? 50 : 70}
                      outerRadius={isMobile ? 78 : 108}
                      paddingAngle={symbolData.length > 30 ? 0.5 : 2}
                      dataKey="value"
                      stroke="var(--bg-secondary)"
                      strokeWidth={1}
                      label={renderSymbolLabel}
                      labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
                    >
                      {symbolData.map((entry, index) => (
                        <Cell key={`symbol-cell-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<AllocationTooltip total={symbolData.reduce((sum, item) => sum + item.value, 0)} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="allocation-symbol-legend">
                {renderAllocationLegend(symbolData)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
