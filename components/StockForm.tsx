'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { STOCK_STATUS, ASSET_TYPE, RISK_CATEGORY, STOCK_COUNTRY, PLATFORM_TRADE } from '@/lib/types';
import type { Stock } from '@/lib/types';

const toNum = (v: unknown) => (v === '' || v === undefined || v === null ? 0 : Number(v));

const schema = z.object({
  symbol: z.string().min(1, 'Required'),
  name: z.string().optional().nullable(),
  sector: z.string().optional().nullable(),
  status: z.string().min(1, 'Required'),
  asset_type: z.string().min(1, 'Required'),
  port_type: z.string().min(1, 'Required'),
  country: z.string().trim().min(1, 'กรุณาระบุประเทศ').transform((value) => value.toUpperCase()),
  platform_trade: z.string().trim().max(500).optional().nullable(),
  risk_category: z.enum(RISK_CATEGORY).or(z.literal('')).nullable().optional(),
  dividend_per_share: z.coerce.number().min(0),
  expected_dividend_per_year: z.coerce.number().min(0),
  current_price: z.coerce.number().min(0),
  target_price: z.coerce.number().min(0),
  graph_url: z.string().trim().max(2048).optional().nullable(),
  link_url: z.string().trim().max(2048).optional().nullable(),
  note: z.string().optional().nullable(),
});

export type StockFormData = z.output<typeof schema>;
type StockFormInput = z.input<typeof schema>;

interface StockFormProps {
  initialData?: Partial<Stock>;
  onSubmit: (data: StockFormData) => void;
  onCancel: () => void;
  loading?: boolean;
  submitLabel?: string;
  existingPortTypes?: string[];
  existingStatuses?: string[];
  existingAssetTypes?: string[];
  existingCountries?: string[];
  existingPlatforms?: string[];
  lockPortType?: boolean;
}

export function StockForm({
  initialData,
  onSubmit,
  onCancel,
  loading,
  submitLabel = 'บันทึก',
  existingPortTypes,
  existingStatuses,
  existingAssetTypes,
  existingCountries,
  existingPlatforms,
  lockPortType = false,
}: StockFormProps) {
  // Port Types
  const defaultPorts = ['Private', 'Business'];
  const allPortTypes = Array.from(
    new Set([
      ...defaultPorts,
      ...(existingPortTypes || []),
      ...(initialData?.port_type ? [initialData.port_type] : []),
    ].filter(Boolean))
  );

  const initialPort = initialData?.port_type || 'Private';
  const [isCustomPort, setIsCustomPort] = useState(
    !allPortTypes.includes(initialPort) && initialPort !== ''
  );
  const [customPortValue, setCustomPortValue] = useState(isCustomPort ? initialPort : '');

  // Statuses
  const defaultStatuses = STOCK_STATUS;
  const allStatuses = Array.from(
    new Set([
      ...defaultStatuses,
      ...(existingStatuses || []),
      ...(initialData?.status ? [initialData.status] : []),
    ].filter(Boolean))
  );

  const initialStatus = initialData?.status || 'Hold';
  const [isCustomStatus, setIsCustomStatus] = useState(
    !allStatuses.includes(initialStatus) && initialStatus !== ''
  );
  const [customStatusValue, setCustomStatusValue] = useState(isCustomStatus ? initialStatus : '');

  // Asset Types
  const defaultAssetTypes = ASSET_TYPE;
  const allAssetTypes = Array.from(
    new Set([
      ...defaultAssetTypes,
      ...(existingAssetTypes || []),
      ...(initialData?.asset_type ? [initialData.asset_type] : []),
    ].filter(Boolean))
  );

  const initialAsset = initialData?.asset_type || 'StockThai';
  const [isCustomAsset, setIsCustomAsset] = useState(
    !allAssetTypes.includes(initialAsset) && initialAsset !== ''
  );
  const [customAssetValue, setCustomAssetValue] = useState(isCustomAsset ? initialAsset : '');

  const allPlatforms = Array.from(new Set([...PLATFORM_TRADE, ...(existingPlatforms || []), initialData?.platform_trade || ''].filter(Boolean)));
  const [isCustomPlatform, setIsCustomPlatform] = useState(false);

  const allCountries = Array.from(new Set([
    ...STOCK_COUNTRY,
    ...(existingCountries || []).map((value) => value.trim().toUpperCase()),
    ...(initialData?.country ? [initialData.country.trim().toUpperCase()] : []),
  ].filter(Boolean)));
  const initialCountry = (initialData?.country || 'THAI').trim().toUpperCase();
  const [isCustomCountry, setIsCustomCountry] = useState(
    !allCountries.includes(initialCountry) && initialCountry !== '',
  );
  const [customCountryValue, setCustomCountryValue] = useState(isCustomCountry ? initialCountry : '');

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<StockFormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      symbol: initialData?.symbol || '',
      name: initialData?.name || '',
      sector: initialData?.sector || '',
      status: initialStatus,
      asset_type: initialAsset,
      port_type: initialPort,
      country: initialCountry,
      platform_trade: initialData?.platform_trade || '',
      risk_category: initialData?.risk_category || '',
      dividend_per_share: initialData?.dividend_per_share || 0,
      expected_dividend_per_year: initialData?.expected_dividend_per_year || 0,
      current_price: initialData?.current_price || 0,
      target_price: initialData?.target_price || 0,
      graph_url: initialData?.graph_url || '',
      link_url: initialData?.link_url || '',
      note: initialData?.note || '',
    },
  });

  const currentPortType = watch('port_type');
  const currentStatus = watch('status');
  const currentAssetType = watch('asset_type');
  const currentCountry = watch('country');

  const onFormSubmit = (data: StockFormInput) => {
    onSubmit(data as StockFormData);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <div style={{ display: 'grid', gap: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Symbol *</label>
            <input 
              className="form-input mono" 
              placeholder="PTT" 
              {...register('symbol')} 
              style={{ textTransform: 'uppercase' }} 
              disabled={!!initialData?.id} // Disable symbol change if editing
            />
            {errors.symbol && <span className="form-error">{errors.symbol.message}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">ชื่อบริษัท</label>
            <input className="form-input" placeholder="ปตท. จำกัด (มหาชน)" {...register('name')} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">กลุ่มอุตสาหกรรม</label>
            <input className="form-input" placeholder="พลังงาน" {...register('sector')} />
          </div>
          <div className="form-group">
            <label className="form-label">หุ้นประเทศ *</label>
            {!isCustomCountry ? (
              <select
                className="form-select"
                value={currentCountry || ''}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === '__NEW__') {
                    setIsCustomCountry(true);
                    setValue('country', customCountryValue || '');
                  } else {
                    setValue('country', value);
                  }
                }}
              >
                {allCountries.map((country) => (
                  <option key={country} value={country}>{country}</option>
                ))}
                <option value="__NEW__">+ เพิ่มประเทศใหม่...</option>
              </select>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input mono"
                  placeholder="เช่น JAPAN"
                  value={customCountryValue}
                  onChange={(event) => {
                    const value = event.target.value.toUpperCase();
                    setCustomCountryValue(value);
                    setValue('country', value, { shouldValidate: true });
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ whiteSpace: 'nowrap', padding: '0 12px' }}
                  onClick={() => {
                    setIsCustomCountry(false);
                    setValue('country', allCountries[0] || 'THAI');
                  }}
                >
                  ← เลือกที่มี
                </button>
              </div>
            )}
            {errors.country && <span className="form-error">{errors.country.message}</span>}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="platform-trade">PlatformTrade</label>
            {!isCustomPlatform ? (
              <select id="platform-trade" className="form-select" value={watch('platform_trade') || ''}
                onChange={(event) => {
                  if (event.target.value === '__NEW__') {
                    setIsCustomPlatform(true);
                    setValue('platform_trade', '');
                  } else {
                    setValue('platform_trade', event.target.value, { shouldValidate: true });
                  }
                }}>
                <option value="">ไม่ระบุ</option>
                {allPlatforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
                <option value="__NEW__">+ เพิ่มแพลตฟอร์มใหม่...</option>
              </select>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input id="platform-trade" className="form-input" placeholder="ชื่อแพลตฟอร์มใหม่"
                  maxLength={500} autoFocus {...register('platform_trade')} />
                <button type="button" className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap' }}
                  onClick={() => { setIsCustomPlatform(false); setValue('platform_trade', '', { shouldValidate: true }); }}>
                  ← เลือกที่มี
                </button>
              </div>
            )}
            {errors.platform_trade && <span className="form-error">{errors.platform_trade.message}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Type Port *</label>
            {lockPortType ? (
              <input
                className="form-input mono"
                value={currentPortType || initialPort}
                disabled
              />
            ) : !isCustomPort ? (
              <select
                className="form-select"
                value={currentPortType || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__NEW__') {
                    setIsCustomPort(true);
                    setValue('port_type', customPortValue || '');
                  } else {
                    setValue('port_type', val);
                  }
                }}
              >
                {allPortTypes.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="__NEW__">+ เพิ่มประเภทพอร์ตใหม่...</option>
              </select>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="พิมพ์ประเภทพอร์ตใหม่..."
                  value={customPortValue}
                  onChange={(e) => {
                    setCustomPortValue(e.target.value);
                    setValue('port_type', e.target.value);
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ whiteSpace: 'nowrap', padding: '0 12px' }}
                  onClick={() => {
                    setIsCustomPort(false);
                    const fallback = allPortTypes[0] || 'Private';
                    setValue('port_type', fallback);
                  }}
                >
                  ← เลือกที่มี
                </button>
              </div>
            )}
            {errors.port_type && <span className="form-error">{errors.port_type.message}</span>}
            <div style={{ marginTop: '6px', color: lockPortType ? 'var(--amber)' : 'var(--text-muted)', fontSize: '10px', lineHeight: 1.5 }}>
              {lockPortType
                ? 'Port ถูกล็อกเพื่อป้องกันประวัติซื้อ–ขายและปันผลปะปนกัน'
                : initialData?.id
                  ? 'เปลี่ยน Port ได้เฉพาะหุ้นที่ยังไม่มีประวัติรายการ'
                  : 'Symbol เดียวกันสามารถเพิ่มแยกใน Port อื่นได้'}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {/* Status */}
          <div className="form-group">
            <label className="form-label">Status *</label>
            {!isCustomStatus ? (
              <select
                className="form-select"
                value={currentStatus || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__NEW__') {
                    setIsCustomStatus(true);
                    setValue('status', customStatusValue || '');
                  } else {
                    setValue('status', val);
                  }
                }}
              >
                {allStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value="__NEW__">+ เพิ่ม Status ใหม่...</option>
              </select>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="พิมพ์ Status ใหม่..."
                  value={customStatusValue}
                  onChange={(e) => {
                    setCustomStatusValue(e.target.value);
                    setValue('status', e.target.value);
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ whiteSpace: 'nowrap', padding: '0 12px' }}
                  onClick={() => {
                    setIsCustomStatus(false);
                    const fallback = allStatuses[0] || 'Hold';
                    setValue('status', fallback);
                  }}
                >
                  ← เลือกที่มี
                </button>
              </div>
            )}
            {errors.status && <span className="form-error">{errors.status.message}</span>}
          </div>

          {/* Asset Type */}
          <div className="form-group">
            <label className="form-label">Asset Type *</label>
            {!isCustomAsset ? (
              <select
                className="form-select"
                value={currentAssetType || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__NEW__') {
                    setIsCustomAsset(true);
                    setValue('asset_type', customAssetValue || '');
                  } else {
                    setValue('asset_type', val);
                  }
                }}
              >
                {allAssetTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="__NEW__">+ เพิ่ม Asset Type ใหม่...</option>
              </select>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="พิมพ์ Asset Type ใหม่..."
                  value={customAssetValue}
                  onChange={(e) => {
                    setCustomAssetValue(e.target.value);
                    setValue('asset_type', e.target.value);
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ whiteSpace: 'nowrap', padding: '0 12px' }}
                  onClick={() => {
                    setIsCustomAsset(false);
                    const fallback = allAssetTypes[0] || 'StockThai';
                    setValue('asset_type', fallback);
                  }}
                >
                  ← เลือกที่มี
                </button>
              </div>
            )}
            {errors.asset_type && <span className="form-error">{errors.asset_type.message}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Risk Category</label>
            <select className="form-select" {...register('risk_category')}>
              <option value="">-- ไม่ระบุ --</option>
              {RISK_CATEGORY.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">ราคาหุ้นปัจจุบัน (฿)</label>
            <input type="number" min="0" step="0.0001" className="form-input mono" placeholder="0.00" {...register('current_price')} />
          </div>
          <div className="form-group">
            <label className="form-label">ราคาเป้าหมาย (฿)</label>
            <input type="number" step="0.01" className="form-input mono" placeholder="0.00" {...register('target_price')} />
          </div>
          <div className="form-group">
            <label className="form-label">ปันผลคาดการณ์/ปี (฿)</label>
            <input type="number" min="0" step="0.0001" className="form-input mono" placeholder="0.00" {...register('expected_dividend_per_year')} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Graph</label>
            <input
              type="url"
              className="form-input"
              placeholder="https://..."
              autoComplete="url"
              {...register('graph_url')}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Link</label>
            <input
              type="url"
              className="form-input"
              placeholder="https://..."
              autoComplete="url"
              {...register('link_url')}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Note</label>
          <textarea
            className="form-input"
            placeholder="หมายเหตุเพิ่มเติม..."
            rows={3}
            style={{ resize: 'vertical' }}
            {...register('note')}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button type="button" onClick={onCancel} className="btn btn-secondary">ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'กำลังบันทึก...' : `✓ ${submitLabel}`}
          </button>
        </div>
      </div>
    </form>
  );
}
