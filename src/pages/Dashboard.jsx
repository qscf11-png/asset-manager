import { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, Plus, DollarSign, Briefcase, Bitcoin, Building, X, Trash2, Activity, Wallet, RefreshCw, Edit2, ChevronDown, ChevronRight, Save, Shield, Landmark, Gem, Home, Download, Upload, Calendar, FileSpreadsheet } from 'lucide-react';
import { getUserAssets, addAsset, deleteAsset, updateAsset, getNetWorthHistory, recordNetWorth, addManualNetWorthRecord, exportAllData, importAllData } from '../config/db';
import { getTaiwanStockInfo } from '../utils/stockApi';
import { calculateTWDValue } from '../utils/exchangeApi';

const ASSET_TYPES = [
    { value: '現金', label: '現金與銀行存款', icon: DollarSign, color: '#3b82f6', isLiability: false },
    { value: '外幣', label: '外幣存款 (自動匯率結算)', icon: DollarSign, color: '#0ea5e9', isLiability: false },
    { value: '台股', label: '台股投資 (自動抓價)', icon: Briefcase, color: '#10b981', isLiability: false },
    { value: '美股', label: '美股投資', icon: Briefcase, color: '#10b981', isLiability: false },
    { value: '加密貨幣', label: '加密貨幣', icon: Bitcoin, color: '#f59e0b', isLiability: false },
    { value: '保險', label: '保險 (投資型保單/儲蓄險)', icon: Shield, color: '#06b6d4', isLiability: false },
    { value: '基金信託', label: '基金及信託', icon: TrendingUp, color: '#6366f1', isLiability: false },
    { value: '退休金', label: '勞退/其他退休金帳戶', icon: Landmark, color: '#14b8a6', isLiability: false },
    { value: '其他', label: '房地產/其他', icon: Building, color: '#8b5cf6', isLiability: false },
    { value: '奢侈品', label: '奢侈品/其他消費品', icon: Gem, color: '#ec4899', isLiability: false },
    { value: '房貸', label: '房屋貸款', icon: Home, color: '#f97316', isLiability: true },
    { value: '負債', label: '貸款/信用卡/負債', icon: Building, color: '#ef4444', isLiability: true },
];

const mockHistoryData = [
    { name: 'Jan', value: 850000 },
    { name: 'Feb', value: 890000 },
    { name: 'Mar', value: 875000 },
    { name: 'Apr', value: 920000 },
    { name: 'May', value: 980000 },
    { name: 'Jun', value: 1050000 },
];

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        // Recharts 的 payload 陣列中，每個項目的 payload 屬性才是我們原始傳入的資料物件
        const data = payload[0].payload;

        return (
            <div className="glass-panel" style={{ padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', minWidth: '220px', zIndex: 100 }}>
                <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>{label}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    <span style={{ color: 'var(--text-primary)' }}>當日總淨值</span>
                    <span style={{ color: '#3b82f6' }}>NT$ {Math.round(payload[0].value).toLocaleString()}</span>
                </div>

                {data && data.details && Object.keys(data.details).length > 0 ? (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                        {Object.entries(data.details).map(([groupName, value]) => (
                            <div key={groupName} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', color: 'var(--text-secondary)' }}>
                                <span>{groupName}</span>
                                <span style={{ color: (groupName.includes('負債') || groupName.includes('貸款')) ? 'var(--danger-color)' : 'var(--text-primary)' }}>
                                    {(groupName.includes('負債') || groupName.includes('貸款')) ? '-' : ''} NT$ {Math.round(value).toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                        💡 舊紀錄未包含分類明細。<br />請再次點擊右上方「紀錄今日數值」<br />以寫入並顯示最新的詳細資料。
                    </div>
                )}
            </div>
        );
    }
    return null;
};

export default function Dashboard({ user }) {
    const [assets, setAssets] = useState([]);
    const [historyData, setHistoryData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [adding, setAdding] = useState(false);
    const [fetchingPrice, setFetchingPrice] = useState(false);
    const [fetchingExchange, setFetchingExchange] = useState(false);
    const [savingRecord, setSavingRecord] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState({});

    // 手動補充歷史紀錄狀態
    const [showManualRecordForm, setShowManualRecordForm] = useState(false);
    const [manualDate, setManualDate] = useState('');
    const [manualNetWorth, setManualNetWorth] = useState('');
    const [savingManualRecord, setSavingManualRecord] = useState(false);

    // 匯出匯入狀態
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);

    // 台股專用匯入匯出
    const [showStockImportModal, setShowStockImportModal] = useState(false);
    const [stockImportText, setStockImportText] = useState('');
    const [stockImporting, setStockImporting] = useState(false);

    // 編輯模式狀態
    const [editingAssetId, setEditingAssetId] = useState(null);
    const [refreshingId, setRefreshingId] = useState(null);
    const [refreshingGroupType, setRefreshingGroupType] = useState(null);

    // 表單狀態
    const [formData, setFormData] = useState({
        name: '',
        type: '現金',
        value: '',
        currency: 'USD',
        foreignAmount: '',
        ticker: '',
        shares: ''
    });

    const fetchAssets = async () => {
        try {
            const data = await getUserAssets(user.uid);
            setAssets(data);
        } catch (error) {
            console.error("載入資產失敗", error);
        }
    };

    const fetchAllData = async () => {
        try {
            setLoading(true);
            const [assetsData, history] = await Promise.all([
                getUserAssets(user.uid),
                getNetWorthHistory(user.uid)
            ]);
            setAssets(assetsData);
            setHistoryData(history.map(h => ({ ...h, name: h.date })));
        } catch (error) {
            console.error("載入失敗", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchAllData();
        }
    }, [user]);

    // 計算總淨值 (總資產 - 總負債)
    const { totalNetWorth, totalAssets, totalLiabilities } = useMemo(() => {
        let assetsSum = 0;
        let liabilitiesSum = 0;

        assets.forEach(asset => {
            const typeInfo = ASSET_TYPES.find(t => t.value === asset.type) || ASSET_TYPES[0];
            if (typeInfo.isLiability) {
                liabilitiesSum += Number(asset.value || 0);
            } else {
                assetsSum += Number(asset.value || 0);
            }
        });

        return {
            totalNetWorth: assetsSum - liabilitiesSum,
            totalAssets: assetsSum,
            totalLiabilities: liabilitiesSum
        };
    }, [assets]);

    // 計算圓餅圖分配 (只看正向資產)
    const allocationData = useMemo(() => {
        const alloc = {};
        assets.forEach(asset => {
            const typeInfo = ASSET_TYPES.find(t => t.value === asset.type) || ASSET_TYPES[0];
            if (typeInfo.isLiability) return; // 負債不參與資產佔比計算

            if (!alloc[typeInfo.label]) {
                alloc[typeInfo.label] = { name: typeInfo.label, value: 0, color: typeInfo.color };
            }
            alloc[typeInfo.label].value += Number(asset.value || 0);
        });
        return Object.values(alloc).filter(item => item.value > 0);
    }, [assets]);

    const groupedAssets = useMemo(() => {
        const groups = {};
        assets.forEach(asset => {
            const typeInfo = ASSET_TYPES.find(t => t.value === asset.type) || ASSET_TYPES[0];
            const groupName = typeInfo.label;

            if (!groups[groupName]) {
                groups[groupName] = { info: typeInfo, items: [], totalValue: 0 };
            }
            groups[groupName].items.push(asset);
            groups[groupName].totalValue += Number(asset.value || 0);
        });

        return Object.values(groups).sort((a, b) => {
            return ASSET_TYPES.findIndex(t => t.label === a.info.label) - ASSET_TYPES.findIndex(t => t.label === b.info.label);
        });
    }, [assets]);

    const handleRecordNetWorth = async () => {
        try {
            setSavingRecord(true);

            // 整理目前的各群組明細準備存入歷史紀錄
            const details = {};
            groupedAssets.forEach(group => {
                details[group.info.label] = group.totalValue;
            });

            await recordNetWorth(user.uid, totalNetWorth, details);
            const newHistory = await getNetWorthHistory(user.uid);
            setHistoryData(newHistory.map(h => ({ ...h, name: h.date })));
        } catch (error) {
            alert("儲存紀錄失敗：" + error.message);
        } finally {
            setSavingRecord(false);
        }
    };

    const toggleGroup = (groupName) => {
        setExpandedGroups(prev => ({ ...prev, [groupName]: prev[groupName] === false ? true : false }));
    };

    // 手動補充歷史紀錄
    const handleManualRecord = async () => {
        if (!manualDate || !manualNetWorth) {
            alert('請輸入日期和淨值金額');
            return;
        }
        try {
            setSavingManualRecord(true);
            await addManualNetWorthRecord(user.uid, manualDate, Number(manualNetWorth));
            const newHistory = await getNetWorthHistory(user.uid);
            setHistoryData(newHistory.map(h => ({ ...h, name: h.date })));
            setManualDate('');
            setManualNetWorth('');
            setShowManualRecordForm(false);
            alert('歷史紀錄已成功補充！');
        } catch (error) {
            alert('補充紀錄失敗：' + error.message);
        } finally {
            setSavingManualRecord(false);
        }
    };

    // 匯出所有資料
    const handleExport = async () => {
        try {
            setExporting(true);
            const data = await exportAllData(user.uid);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `asset-manager-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            alert('匯出失敗：' + error.message);
        } finally {
            setExporting(false);
        }
    };

    // 匯入資料
    const handleImport = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            setImporting(true);
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.assets && !data.netWorthHistory) {
                alert('無效的備份檔案格式');
                return;
            }

            const confirmMsg = `即將匯入：\n` +
                `• ${data.assets?.length || 0} 筆資產紀錄\n` +
                `• ${data.netWorthHistory?.length || 0} 筆淨值歷史\n\n` +
                `（現有資料不會被刪除，同日期淨值歷史將被覆寫）\n\n確定要匯入嗎？`;

            if (!window.confirm(confirmMsg)) return;

            const result = await importAllData(user.uid, data);
            await fetchAllData();
            alert(`匯入完成！\n已匯入 ${result.importedAssets} 筆資產、${result.importedHistory} 筆歷史紀錄。`);
        } catch (error) {
            alert('匯入失敗：' + error.message);
        } finally {
            setImporting(false);
            // 清除 input 以便重複選擇同檔案
            event.target.value = '';
        }
    };

    const handleCreateAsset = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.value) return;

        try {
            setAdding(true);
            const newAsset = {
                userId: user.uid,
                name: formData.name,
                type: formData.type,
                value: Number(formData.value),
                currency: formData.type === '外幣' ? formData.currency : 'TWD',
                foreignAmount: formData.type === '外幣' ? Number(formData.foreignAmount) : null,
                ticker: formData.ticker || null,
                shares: formData.shares ? Number(formData.shares) : null
            };

            await addAsset(newAsset);
            await fetchAssets();
            setShowAddModal(false);
            setFormData({ name: '', type: '現金', value: '', currency: 'USD', foreignAmount: '', ticker: '', shares: '' });
        } catch (error) {
            alert("新增資產失敗");
        } finally {
            setAdding(false);
        }
    };

    const handleUpdateAsset = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.value) return;

        try {
            setAdding(true);
            const updatedAsset = {
                name: formData.name,
                type: formData.type,
                value: Number(formData.value),
                currency: formData.type === '外幣' ? formData.currency : 'TWD',
                foreignAmount: formData.type === '外幣' ? Number(formData.foreignAmount) : null,
                ticker: formData.ticker || null,
                shares: formData.shares ? Number(formData.shares) : null
            };

            await updateAsset(editingAssetId, updatedAsset);
            await fetchAssets();
            setShowAddModal(false);
            setEditingAssetId(null);
            setFormData({ name: '', type: '現金', value: '', currency: 'USD', foreignAmount: '', ticker: '', shares: '' });
        } catch (error) {
            alert("更新資產失敗");
        } finally {
            setAdding(false);
        }
    };

    const openEditModal = (asset) => {
        setEditingAssetId(asset.id);
        setFormData({
            name: asset.name,
            type: asset.type,
            value: asset.value.toString(),
            currency: asset.currency || 'USD',
            foreignAmount: asset.foreignAmount ? asset.foreignAmount.toString() : '',
            ticker: asset.ticker || '',
            shares: asset.shares ? asset.shares.toString() : ''
        });
        setShowAddModal(true);
    };

    const handleFetchSingleStockPrice = async (asset) => {
        if (!asset.ticker || !asset.shares) {
            alert("此名目缺少代號或股數，無法自動更新");
            return;
        }

        try {
            setRefreshingId(asset.id);
            const info = await getTaiwanStockInfo(asset.ticker);
            const newValue = Math.round(Number(asset.shares) * info.price);

            // 使用更新 API 寫入 Database
            await updateAsset(asset.id, {
                value: newValue,
                name: (info.name && info.name !== `台股 ${asset.ticker}`) ? info.name : asset.name // 如果只回傳代號，就保留原本使用者打的名字
            });

            await fetchAssets();
        } catch (error) {
            alert(`更新 ${asset.name} 股價失敗: ${error.message}`);
        } finally {
            setRefreshingId(null);
        }
    };

    // 一鍵更新某群組內所有項目（台股或外幣）
    const handleBatchRefreshGroup = async (group) => {
        const type = group.info.value;
        try {
            setRefreshingGroupType(type);
            let updatedCount = 0;
            let failedItems = [];

            for (const asset of group.items) {
                try {
                    if (type === '台股' && asset.ticker && asset.shares) {
                        const info = await getTaiwanStockInfo(asset.ticker);
                        const newValue = Math.round(Number(asset.shares) * info.price);
                        await updateAsset(asset.id, {
                            value: newValue,
                            name: (info.name && info.name !== `台股 ${asset.ticker}`) ? info.name : asset.name
                        });
                        updatedCount++;
                    } else if (type === '外幣' && asset.foreignAmount && asset.currency) {
                        const twdValue = await calculateTWDValue(asset.currency, asset.foreignAmount);
                        if (twdValue > 0) {
                            await updateAsset(asset.id, { value: twdValue });
                            updatedCount++;
                        }
                    }
                } catch (err) {
                    failedItems.push(asset.name);
                }
            }

            await fetchAssets();
            const msg = `已更新 ${updatedCount} 筆${failedItems.length > 0 ? `\n失敗: ${failedItems.join(', ')}` : ''}`;
            alert(msg);
        } catch (error) {
            alert(`批次更新失敗: ${error.message}`);
        } finally {
            setRefreshingGroupType(null);
        }
    };

    // 台股匯出 CSV
    const handleStockExport = (group) => {
        const header = 'Symbol\tName\tShares\tAvgCost';
        const rows = group.items.map(asset => {
            return `${asset.ticker || ''}\t${asset.name || ''}\t${asset.shares || ''}\t${asset.avgCost || ''}`;
        });
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/tab-separated-values;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `台股持股明細-${new Date().toISOString().split('T')[0]}.tsv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // 台股匯入：解析貼上的 CSV/TSV 資料
    const handleStockImportSubmit = async () => {
        if (!stockImportText.trim()) {
            alert('請貼上台股持股資料');
            return;
        }

        try {
            setStockImporting(true);
            const lines = stockImportText.trim().split('\n');
            const stocks = [];

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                // 跳過標題行
                if (trimmed.toLowerCase().startsWith('symbol') || trimmed.startsWith('股票代號')) continue;

                // 支援 tab 或逗號分隔
                const parts = trimmed.includes('\t') ? trimmed.split('\t') : trimmed.split(',');
                if (parts.length < 3) continue;

                const symbol = parts[0].trim();
                const name = parts[1]?.trim() || '';
                const shares = parseInt(parts[2]?.trim(), 10);
                const avgCost = parseFloat(parts[3]?.trim()) || 0;

                if (!symbol || isNaN(shares) || shares <= 0) continue;
                stocks.push({ symbol, name, shares, avgCost });
            }

            if (stocks.length === 0) {
                alert('未解析到有效的股票資料，請確認格式是\nSymbol  Name  Shares  AvgCost');
                return;
            }

            // 找出現有台股資產，用 ticker 對應
            const existingStocks = assets.filter(a => a.type === '台股');
            const existingMap = {};
            existingStocks.forEach(a => {
                if (a.ticker) existingMap[a.ticker] = a;
            });

            let created = 0, updated = 0;

            for (const stock of stocks) {
                if (existingMap[stock.symbol]) {
                    // 更新現有
                    const existing = existingMap[stock.symbol];
                    await updateAsset(existing.id, {
                        shares: stock.shares,
                        avgCost: stock.avgCost,
                        name: stock.name || existing.name,
                    });
                    updated++;
                } else {
                    // 新增
                    await addAsset({
                        userId: user.uid,
                        name: stock.name || `台股 ${stock.symbol}`,
                        type: '台股',
                        value: 0,
                        currency: 'TWD',
                        ticker: stock.symbol,
                        shares: stock.shares,
                        avgCost: stock.avgCost,
                    });
                    created++;
                }
            }

            await fetchAssets();
            setShowStockImportModal(false);
            setStockImportText('');
            alert(`台股匯入完成！\n新增 ${created} 筆，更新 ${updated} 筆\n\n請點擊「全部更新」抓取最新股價。`);
        } catch (error) {
            alert('匯入失敗：' + error.message);
        } finally {
            setStockImporting(false);
        }
    };

    const handleFetchStockPrice = async () => {
        if (!formData.ticker) {
            alert("請先輸入台股代號");
            return;
        }

        try {
            setFetchingPrice(true);
            const info = await getTaiwanStockInfo(formData.ticker);

            // 自動帶入名稱與計算市值
            const newFormData = { ...formData };
            if (info.name && info.name !== `台股 ${formData.ticker}`) {
                newFormData.name = info.name;
            } else if (!newFormData.name) {
                newFormData.name = `台股 ${formData.ticker}`;
            }

            if (formData.shares && info.price) {
                newFormData.value = Math.round(Number(formData.shares) * info.price).toString();
            }

            setFormData(newFormData);
        } catch (error) {
            alert(`查詢股價失敗: ${error.message}`);
        } finally {
            setFetchingPrice(false);
        }
    };

    const handleFetchSingleExchangeRate = async (asset) => {
        if (!asset.foreignAmount || !asset.currency) {
            alert("此名目缺少外幣金額或幣別");
            return;
        }

        try {
            setRefreshingId(asset.id);
            const twdValue = await calculateTWDValue(asset.currency, asset.foreignAmount);
            if (twdValue === 0) throw new Error("取得匯率失敗");

            // 更新 Database
            await updateAsset(asset.id, {
                value: twdValue
            });

            await fetchAssets();
        } catch (error) {
            alert(`更新 ${asset.name} 匯率失敗: ${error.message}`);
        } finally {
            setRefreshingId(null);
        }
    };

    const handleFetchExchangeRate = async () => {
        if (!formData.foreignAmount || !formData.currency) {
            alert("請先輸入外幣金額與幣別");
            return;
        }

        try {
            setFetchingExchange(true);
            const twdValue = await calculateTWDValue(formData.currency, formData.foreignAmount);
            if (twdValue === 0) throw new Error("取得匯率失敗");

            setFormData({ ...formData, value: twdValue.toString() });
        } catch (error) {
            alert(`換算匯率失敗: ${error.message}`);
        } finally {
            setFetchingExchange(false);
        }
    };

    const handleDeleteAsset = async (id) => {
        if (!window.confirm('確定要刪除這筆資產項目嗎？')) return;
        try {
            setLoading(true);
            await deleteAsset(id);
            await fetchAssets();
        } catch (error) {
            alert("刪除失敗");
            setLoading(false);
        }
    };

    if (loading && assets.length === 0) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                <Activity size={32} style={{ animation: 'pulse 2s infinite' }} />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', position: 'relative' }}>

            {/* 頂部總覽卡片 */}
            <div className="dashboard-grid">
                <div className="card glass-panel" style={{ padding: '2rem', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <div className="card-title">
                        <span>總淨值 (Net Worth)</span>
                        <span className="text-secondary" style={{ fontSize: '0.9rem' }}>即時試算</span>
                    </div>
                    <div className="net-worth-value" style={{ margin: '0.5rem 0 1.5rem 0', color: 'white' }}>
                        <span style={{ fontSize: '1.5rem', color: 'var(--text-secondary)', marginRight: '0.5rem' }}>NT$</span>
                        {totalNetWorth.toLocaleString()}
                    </div>

                    {/* 總資產與總負債小數位 */}
                    <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>總資產</div>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>+ {totalAssets.toLocaleString()}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>總負債</div>
                            <div style={{ fontWeight: '600', color: 'var(--danger-color)' }}>- {totalLiabilities.toLocaleString()}</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="action-btn primary" onClick={() => {
                            setEditingAssetId(null);
                            setFormData({ name: '', type: '現金', value: '', currency: 'USD', foreignAmount: '', ticker: '', shares: '' });
                            setShowAddModal(true);
                        }} style={{ flex: 1, boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)' }}>
                            <Plus size={18} /> 新增資產紀錄
                        </button>
                    </div>
                </div>

                <div className="card glass-panel">
                    <div className="card-title">資產配置</div>
                    <div style={{ height: '280px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {allocationData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={allocationData}
                                        innerRadius={55}
                                        outerRadius={75}
                                        cx="50%"
                                        cy="40%"
                                        paddingAngle={5}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {allocationData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend
                                        verticalAlign="bottom"
                                        align="center"
                                        layout="horizontal"
                                        iconType="circle"
                                        wrapperStyle={{ fontSize: '0.8rem', paddingTop: '10px' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>尚無資產資料</div>
                        )}
                    </div>
                </div>
            </div>

            {/* 淨值趨勢圖 */}
            <div className="card glass-panel" style={{ gridColumn: '1 / -1' }}>
                <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span>淨值歷史趨勢 (Net Worth History)</span>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button onClick={() => setShowManualRecordForm(!showManualRecordForm)} className="action-btn" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Calendar size={16} /> {showManualRecordForm ? '收起' : '補充歷史紀錄'}
                        </button>
                        <button onClick={handleRecordNetWorth} disabled={savingRecord} className="action-btn" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Save size={16} /> {savingRecord ? '紀錄中...' : '紀錄今日數值'}
                        </button>
                    </div>
                </div>

                {/* 手動補充歷史紀錄表單 */}
                {showManualRecordForm && (
                    <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                            📝 手動補充過去的淨值紀錄（同一日期會覆寫）
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>日期</label>
                                <input
                                    type="date"
                                    value={manualDate}
                                    onChange={(e) => setManualDate(e.target.value)}
                                    max={new Date().toISOString().split('T')[0]}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'white', fontFamily: 'inherit' }}
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>總淨值 (NT$)</label>
                                <input
                                    type="number"
                                    value={manualNetWorth}
                                    onChange={(e) => setManualNetWorth(e.target.value)}
                                    placeholder="輸入當時的總淨值..."
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'white', fontFamily: 'inherit' }}
                                />
                            </div>
                            <button
                                onClick={handleManualRecord}
                                disabled={savingManualRecord || !manualDate || !manualNetWorth}
                                className="action-btn primary"
                                style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                            >
                                {savingManualRecord ? '儲存中...' : '確認補充'}
                            </button>
                        </div>
                    </div>
                )}

                <div style={{ height: '260px', width: '100%', marginTop: '1.5rem' }}>
                    {historyData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={historyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `NT$${(val / 10000).toFixed(0)}w`} width={80} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="totalNetWorth" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                            尚未有歷史紀錄，請點上方按鈕紀錄今日開始追蹤趨勢
                        </div>
                    )}
                </div>
            </div>

            {/* 資產列表 */}
            <div className="card glass-panel">
                <div className="card-title" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span>各項資產明細</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={handleExport} disabled={exporting} className="action-btn" style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Download size={14} /> {exporting ? '匯出中...' : '匯出備份'}
                        </button>
                        <label className="action-btn" style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: importing ? 'wait' : 'pointer', opacity: importing ? 0.6 : 1 }}>
                            <Upload size={14} /> {importing ? '匯入中...' : '匯入資料'}
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleImport}
                                disabled={importing}
                                style={{ display: 'none' }}
                            />
                        </label>
                    </div>
                </div>

                {assets.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                        <Wallet size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
                        <p>目前還沒有任何資產紀錄。<br />點擊上方「新增資產紀錄」開始您的理財之旅！</p>
                    </div>
                ) : (
                    <div className="asset-list">
                        {groupedAssets.map((group) => {
                            const isExpanded = expandedGroups[group.info.label] !== false; // 預設展開
                            const allocationPercentage = group.info.isLiability
                                ? "-"
                                : (totalAssets > 0 ? ((group.totalValue / totalAssets) * 100).toFixed(1) + '%' : '0%');

                            return (
                                <div key={group.info.label} style={{ marginBottom: '1rem' }}>
                                    {/* 群組標頭 */}
                                    <div
                                        onClick={() => toggleGroup(group.info.label)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', cursor: 'pointer', borderLeft: group.info.isLiability ? '4px solid var(--danger-color)' : `4px solid ${group.info.color}` }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ color: group.info.color }}>
                                                <group.info.icon size={20} />
                                            </div>
                                            <span style={{ fontWeight: 'bold' }}>{group.info.label}</span>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>({group.items.length})</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontWeight: 'bold', color: group.info.isLiability ? 'var(--danger-color)' : 'var(--text-primary)' }}>
                                                    {group.info.isLiability ? '-' : ''} NT$ {group.totalValue.toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                    佔比: {allocationPercentage}
                                                </div>
                                            </div>
                                            {(group.info.value === '台股' || group.info.value === '外幣') && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleBatchRefreshGroup(group); }}
                                                    disabled={refreshingGroupType === group.info.value}
                                                    style={{ padding: '0.4rem 0.6rem', color: group.info.color, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', transition: '0.2s' }}
                                                    title={`一鍵更新全部${group.info.value === '台股' ? '股價' : '匯率'}`}
                                                >
                                                    <RefreshCw size={14} style={{ animation: refreshingGroupType === group.info.value ? 'spin 1s linear infinite' : 'none' }} />
                                                    {refreshingGroupType === group.info.value ? '更新中...' : '全部更新'}
                                                </button>
                                            )}
                                            {group.info.value === '台股' && (
                                                <>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleStockExport(group); }}
                                                        style={{ padding: '0.4rem 0.6rem', color: group.info.color, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', transition: '0.2s' }}
                                                        title="匯出台股持股明細"
                                                    >
                                                        <Download size={14} /> 匯出
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setShowStockImportModal(true); }}
                                                        style={{ padding: '0.4rem 0.6rem', color: group.info.color, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', transition: '0.2s' }}
                                                        title="匯入台股持股資料"
                                                    >
                                                        <Upload size={14} /> 匯入
                                                    </button>
                                                </>
                                            )}
                                            {isExpanded ? <ChevronDown size={20} color="var(--text-secondary)" /> : <ChevronRight size={20} color="var(--text-secondary)" />}
                                        </div>
                                    </div>

                                    {/* 群組內容項目 */}
                                    {isExpanded && (
                                        <div style={{ paddingLeft: '1.5rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {group.items.map(asset => (
                                                <div key={asset.id} className="asset-item" style={{ borderLeft: 'none', background: 'rgba(255,255,255,0.015)', padding: '0.75rem 1rem' }}>
                                                    <div className="asset-info" style={{ flex: 1 }}>
                                                        <div className="asset-details">
                                                            <span className="asset-name" style={{ fontSize: '0.95rem' }}>
                                                                {asset.name}
                                                                {asset.ticker && <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>{asset.ticker}</span>}
                                                                {asset.type === '台股' && asset.shares && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>{asset.shares.toLocaleString()} 股</span>}
                                                                {asset.type === '外幣' && asset.foreignAmount && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>({asset.currency} {asset.foreignAmount.toLocaleString()})</span>}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                                        <div className="asset-value-container" style={{ textAlign: 'right', minWidth: '100px' }}>
                                                            <span className="asset-value" style={{ fontSize: '0.95rem', color: group.info.isLiability ? 'var(--danger-color)' : 'var(--text-primary)' }}>
                                                                {group.info.isLiability ? '-' : ''} NT$ {Number(asset.value).toLocaleString()}
                                                            </span>
                                                        </div>

                                                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                            {asset.type === '台股' && (
                                                                <button
                                                                    onClick={() => handleFetchSingleStockPrice(asset)}
                                                                    disabled={refreshingId === asset.id}
                                                                    style={{ padding: '0.4rem', color: '#10b981', opacity: 0.8, transition: '0.2s', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                                                    title="重新取得最新現價"
                                                                >
                                                                    <RefreshCw size={16} style={{ animation: refreshingId === asset.id ? 'spin 1s linear infinite' : 'none' }} />
                                                                </button>
                                                            )}
                                                            {asset.type === '外幣' && (
                                                                <button
                                                                    onClick={() => handleFetchSingleExchangeRate(asset)}
                                                                    disabled={refreshingId === asset.id}
                                                                    style={{ padding: '0.4rem', color: '#0ea5e9', opacity: 0.8, transition: '0.2s', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                                                    title="自動以最新匯率結算台幣"
                                                                >
                                                                    <RefreshCw size={16} style={{ animation: refreshingId === asset.id ? 'spin 1s linear infinite' : 'none' }} />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => openEditModal(asset)}
                                                                style={{ padding: '0.4rem', color: 'var(--text-secondary)', opacity: 0.8, transition: '0.2s', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                                                title="編輯"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteAsset(asset.id)}
                                                                style={{ padding: '0.4rem', color: 'var(--danger-color)', opacity: 0.8, transition: '0.2s', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                                                title="刪除"
                                                                onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                                                                onMouseLeave={(e) => e.currentTarget.style.opacity = 0.8}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 新增資產 Modal 重疊層 */}
            {showAddModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 50, padding: '1rem'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{editingAssetId ? '編輯資產' : '新增資產'}</h2>
                            <button onClick={() => setShowAddModal(false)} style={{ color: 'var(--text-secondary)' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={editingAssetId ? handleUpdateAsset : handleCreateAsset} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>類別</label>
                                <select
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'white', fontFamily: 'inherit' }}
                                >
                                    {ASSET_TYPES.map(type => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>資產名稱 (如: 台新銀行、台積電)</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'white', fontFamily: 'inherit' }}
                                    placeholder="輸入名稱..."
                                />
                            </div>

                            {formData.type === '台股' && (
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>台股代號</label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <input
                                                type="text"
                                                required
                                                value={formData.ticker}
                                                onChange={(e) => setFormData({ ...formData, ticker: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'white', fontFamily: 'inherit' }}
                                                placeholder="例如: 2330"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleFetchStockPrice}
                                                disabled={fetchingPrice || !formData.ticker}
                                                className="action-btn"
                                                style={{ padding: '0 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                title="自動取得現價與名稱"
                                            >
                                                <RefreshCw size={18} style={{ animation: fetchingPrice ? 'spin 1s linear infinite' : 'none', color: '#10b981' }} />
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>持有股數</label>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            value={formData.shares}
                                            onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'white', fontFamily: 'inherit' }}
                                            placeholder="1張 = 1000股"
                                        />
                                    </div>
                                </div>
                            )}

                            {formData.type === '外幣' && (
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>幣別</label>
                                        <select
                                            value={formData.currency}
                                            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'white', fontFamily: 'inherit' }}
                                        >
                                            <option value="USD">美金 (USD)</option>
                                            <option value="JPY">日圓 (JPY)</option>
                                            <option value="EUR">歐元 (EUR)</option>
                                            <option value="GBP">英鎊 (GBP)</option>
                                            <option value="AUD">澳幣 (AUD)</option>
                                        </select>
                                    </div>
                                    <div style={{ flex: 2 }}>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>外幣金額</label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <input
                                                type="number"
                                                step="0.01"
                                                required
                                                value={formData.foreignAmount}
                                                onChange={(e) => setFormData({ ...formData, foreignAmount: e.target.value })}
                                                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'white', fontFamily: 'inherit' }}
                                                placeholder="輸入外幣數量..."
                                            />
                                            <button
                                                type="button"
                                                onClick={handleFetchExchangeRate}
                                                disabled={fetchingExchange || !formData.foreignAmount}
                                                className="action-btn"
                                                style={{ padding: '0 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                title="自動換算成台幣淨值"
                                            >
                                                <RefreshCw size={18} style={{ animation: fetchingExchange ? 'spin 1s linear infinite' : 'none', color: '#0ea5e9' }} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                    {(formData.type === '負債' || formData.type === '房貸') ? '負債餘額 (NT$)' : (formData.type === '台股' ? '目前總市值 (NT$)' : '現在市值 (約當 NT$)')}
                                </label>
                                <input
                                    type="number"
                                    required
                                    min="0"
                                    value={formData.value}
                                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'white', fontFamily: 'inherit' }}
                                    placeholder={(formData.type === '負債' || formData.type === '房貸') ? "輸入剩餘貸款或卡債金額..." : "輸入目前的台幣總價值..."}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" className="action-btn" onClick={() => setShowAddModal(false)} style={{ flex: 1, backgroundColor: 'transparent', border: '1px solid var(--border-color)' }}>
                                    取消
                                </button>
                                <button type="submit" className="action-btn primary" disabled={adding} style={{ flex: 1 }}>
                                    {adding ? '儲存中...' : (editingAssetId ? '確認修改' : '確認新增')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 台股匯入 Modal */}
            {showStockImportModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 50, padding: '1rem'
                }}>
                    <div className="glass-panel" style={{ width: '100%', maxWidth: '550px', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileSpreadsheet size={22} color="#10b981" /> 台股持股匯入
                            </h2>
                            <button onClick={() => setShowStockImportModal(false)} style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                            📝 請貼上以 <strong>Tab</strong> 或<strong>逗號</strong>分隔的台股持股資料，格式如下：<br />
                            <code style={{ fontSize: '0.8rem', color: '#10b981' }}>Symbol  Name  Shares  AvgCost</code><br />
                            • 已存在的股票代號會自動更新股數與成本<br />
                            • 新的代號會自動新增，匯入後請點「全部更新」抓股價
                        </div>

                        <textarea
                            value={stockImportText}
                            onChange={(e) => setStockImportText(e.target.value)}
                            placeholder={`Symbol\tName\tShares\tAvgCost\n2330\t\t100\t801\n2382\t\t1100\t276.68\n2408\t\t500\t178.5`}
                            rows={12}
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '8px',
                                border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                                color: 'white', fontFamily: 'monospace', fontSize: '0.85rem',
                                resize: 'vertical', lineHeight: '1.5'
                            }}
                        />

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <button type="button" className="action-btn" onClick={() => setShowStockImportModal(false)} style={{ flex: 1, backgroundColor: 'transparent', border: '1px solid var(--border-color)' }}>
                                取消
                            </button>
                            <button
                                className="action-btn primary"
                                onClick={handleStockImportSubmit}
                                disabled={stockImporting || !stockImportText.trim()}
                                style={{ flex: 1 }}
                            >
                                {stockImporting ? '匯入中...' : `確認匯入`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 加上簡單的動畫 CSS 直寫在檔案中以便快速測試 */}
            <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}
