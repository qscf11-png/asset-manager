import { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, Plus, DollarSign, Briefcase, Bitcoin, Building, X, Trash2, Activity, Wallet, RefreshCw, Edit2, ChevronDown, Save, Shield, Landmark, Gem, Home, Download, Upload, Calendar, FileSpreadsheet } from 'lucide-react';
import { getUserAssets, addAsset, deleteAsset, updateAsset, getNetWorthHistory, recordNetWorth, addManualNetWorthRecord, exportAllData, importAllData } from '../config/db';
import { getTaiwanStockInfo, batchGetStockPrices } from '../utils/stockApi';
import { calculateTWDValue } from '../utils/exchangeApi';
import * as XLSX from 'xlsx';

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
        const data = payload[0].payload;

        return (
            <div className="glass-panel" style={{ padding: '0.85rem 1rem', minWidth: '200px', zIndex: 100, fontSize: '0.85rem' }}>
                <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-muted)', fontSize: '0.78rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.4rem' }}>{label}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontWeight: 700 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>總淨值</span>
                    <span style={{ color: '#818cf8' }}>NT$ {Math.round(payload[0].value).toLocaleString()}</span>
                </div>

                {data && data.details && Object.keys(data.details).length > 0 ? (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                        {Object.entries(data.details).map(([groupName, value]) => (
                            <div key={groupName} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0', color: 'var(--text-muted)' }}>
                                <span>{groupName}</span>
                                <span style={{ color: (groupName.includes('負債') || groupName.includes('貸款')) ? 'var(--danger-color)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                    {(groupName.includes('負債') || groupName.includes('貸款')) ? '-' : ''} NT$ {Math.round(value).toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.4rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                        舊紀錄未包含分類明細，請重新紀錄今日數值。
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

    // 台股專用匯入狀態
    const [showStockImportModal, setShowStockImportModal] = useState(false);
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

    const handleBatchRefreshGroup = async (group) => {
        const type = group.info.value;
        try {
            setRefreshingGroupType(type);
            let updatedCount = 0;
            let failedItems = [];

            if (type === '台股') {
                const stockAssets = group.items.filter(a => a.ticker && a.shares);
                const tickers = stockAssets.map(a => a.ticker);

                const results = await batchGetStockPrices(tickers);

                for (const asset of stockAssets) {
                    const result = results.get(asset.ticker);
                    if (result?.success) {
                        const newValue = Math.round(Number(asset.shares) * result.price);
                        await updateAsset(asset.id, {
                            value: newValue,
                            name: (result.name && result.name !== `台股 ${asset.ticker}`) ? result.name : asset.name
                        });
                        updatedCount++;
                    } else {
                        failedItems.push(asset.name);
                    }
                }
            } else if (type === '外幣') {
                for (const asset of group.items) {
                    try {
                        if (asset.foreignAmount && asset.currency) {
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

    // 台股匯出 Excel
    const handleStockExport = (group) => {
        const dataForExcel = group.items.map(asset => ({
            'Symbol (代號)': asset.ticker || '',
            'Name (名稱)': asset.name || '',
            'Shares (股數)': asset.shares || 0,
            'AvgCost (成本)': asset.avgCost || 0
        }));

        const ws = XLSX.utils.json_to_sheet(dataForExcel);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "台股持股明細");

        const fileName = `台股持股明細-${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // 台股匯入：解析 Excel 資料
    const handleStockImportSubmit = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            setStockImporting(true);

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);

                    const stocks = [];
                    for (const row of jsonData) {
                        // 支援幾種常見的名稱組合
                        const symbol = row['Symbol (代號)'] || row['Symbol'] || row['代號'];
                        const name = row['Name (名稱)'] || row['Name'] || row['名稱'] || '';
                        const shares = parseInt(row['Shares (股數)'] || row['Shares'] || row['股數'], 10);
                        const avgCost = parseFloat(row['AvgCost (成本)'] || row['AvgCost'] || row['成本']) || 0;

                        if (!symbol || isNaN(shares) || shares <= 0) continue;
                        stocks.push({ symbol: symbol.toString(), name, shares, avgCost });
                    }

                    if (stocks.length === 0) {
                        alert('未解析到有效的股票資料，請確認報表格式或下載匯出範本修改。');
                        return;
                    }

                    // 找出現有台股資產，用 ticker 對應
                    const existingStocks = assets.filter(a => a.type === '台股');
                    const existingMap = {};
                    existingStocks.forEach(a => {
                        if (a.ticker) existingMap[a.ticker] = a;
                    });

                    let created = 0, updated = 0, deleted = 0;

                    // 1. 找出並刪除不在 Excel 清單中的現有台股
                    const importedSymbols = new Set(stocks.map(s => s.symbol));
                    for (const existingAsset of existingStocks) {
                        if (!importedSymbols.has(existingAsset.ticker)) {
                            await deleteAsset(existingAsset.id);
                            deleted++;
                        }
                    }

                    // 2. 新增或更新 Excel 清單中的台股
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
                    alert(`台股 Excel 覆寫匯入完成！\n新增 ${created} 筆，更新 ${updated} 筆\n刪除 ${deleted} 筆不在報表中的舊持股\n\n請點擊「全部更新」抓取最新股價。`);
                } catch (err) {
                    alert('Excel 檔案解析失敗：' + err.message);
                } finally {
                    setStockImporting(false);
                    event.target.value = ''; // 允許重複上傳相同檔案
                }
            };
            reader.readAsArrayBuffer(file);

        } catch (error) {
            alert('匯入失敗：' + error.message);
            setStockImporting(false);
            event.target.value = '';
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '1rem' }}>
                <Activity size={36} className="text-success" style={{ animation: 'pulse 2s infinite', filter: 'drop-shadow(0 0 12px rgba(16,185,129,0.4))' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', letterSpacing: '0.05em' }}>載入資產資料中...</span>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>

            {/* 頂部總覽卡片 */}
            <div className="dashboard-grid">
                <div className="card glass-panel" style={{
                    padding: '2rem',
                    background: 'linear-gradient(145deg, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.04) 50%, rgba(16, 185, 129, 0.03) 100%)',
                    border: '1px solid rgba(59, 130, 246, 0.15)',
                    animation: 'glow 4s ease-in-out infinite',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{ position: 'absolute', top: '-50%', right: '-20%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

                    <div className="card-title">
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <TrendingUp size={16} style={{ color: 'var(--accent-color)' }} />
                            總淨值
                        </span>
                        <span className="stat-chip" style={{ color: 'var(--success-color)' }}>
                            <Activity size={12} /> 即時
                        </span>
                    </div>

                    <div className="net-worth-value" style={{ margin: '0.75rem 0 1.25rem 0', position: 'relative', zIndex: 1 }}>
                        <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginRight: '0.4rem', fontWeight: 400 }}>NT$</span>
                        <span className="text-gradient">{totalNetWorth.toLocaleString()}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>總資產</div>
                            <div style={{ fontWeight: 700, color: 'var(--success-color)', fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums' }}>
                                +{totalAssets.toLocaleString()}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>總負債</div>
                            <div style={{ fontWeight: 700, color: 'var(--danger-color)', fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums' }}>
                                -{totalLiabilities.toLocaleString()}
                            </div>
                        </div>
                    </div>

                    <button className="action-btn primary" onClick={() => {
                        setEditingAssetId(null);
                        setFormData({ name: '', type: '現金', value: '', currency: 'USD', foreignAmount: '', ticker: '', shares: '' });
                        setShowAddModal(true);
                    }} style={{ width: '100%' }}>
                        <Plus size={18} /> 新增資產紀錄
                    </button>
                </div>

                <div className="card glass-panel" style={{ position: 'relative', overflow: 'hidden' }}>
                    <div className="card-title">
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Briefcase size={14} style={{ color: 'var(--accent-color)' }} />
                            資產配置
                        </span>
                    </div>
                    <div style={{ height: '280px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {allocationData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                                <PieChart>
                                    <Pie
                                        data={allocationData}
                                        innerRadius={50}
                                        outerRadius={72}
                                        cx="50%"
                                        cy="42%"
                                        paddingAngle={4}
                                        dataKey="value"
                                        stroke="rgba(0,0,0,0.3)"
                                        strokeWidth={1}
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
                                        iconSize={8}
                                        wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px', color: 'var(--text-secondary)' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', lineHeight: 1.8 }}>
                                <Wallet size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} /><br />
                                尚無資產資料
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 淨值趨勢圖 */}
            <div className="card glass-panel">
                <div className="card-title" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <TrendingUp size={14} style={{ color: '#818cf8' }} />
                        淨值歷史趨勢
                    </span>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button onClick={() => setShowManualRecordForm(!showManualRecordForm)} className="refresh-btn">
                            <Calendar size={14} /> {showManualRecordForm ? '收起' : '補充紀錄'}
                        </button>
                        <button onClick={handleRecordNetWorth} disabled={savingRecord} className="refresh-btn" style={{ color: 'var(--accent-color)' }}>
                            <Save size={14} /> {savingRecord ? '紀錄中...' : '紀錄今日數值'}
                        </button>
                    </div>
                </div>

                {showManualRecordForm && (
                    <div style={{ marginTop: '0.5rem', padding: '1rem', borderRadius: '12px' }} className="info-box">
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                            手動補充過去的淨值紀錄（同一日期會覆寫）
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '140px' }}>
                                <label className="form-label">日期</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={manualDate}
                                    onChange={(e) => setManualDate(e.target.value)}
                                    max={new Date().toISOString().split('T')[0]}
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: '140px' }}>
                                <label className="form-label">總淨值 (NT$)</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={manualNetWorth}
                                    onChange={(e) => setManualNetWorth(e.target.value)}
                                    placeholder="輸入當時的總淨值..."
                                />
                            </div>
                            <button
                                onClick={handleManualRecord}
                                disabled={savingManualRecord || !manualDate || !manualNetWorth}
                                className="action-btn primary"
                                style={{ padding: '0.6rem 1.2rem', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                            >
                                {savingManualRecord ? '儲存中...' : '確認補充'}
                            </button>
                        </div>
                    </div>
                )}

                <div style={{ height: '260px', width: '100%', marginTop: '1rem' }}>
                    {historyData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                            <AreaChart data={historyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#818cf8" stopOpacity={0.25} />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `${(val / 10000).toFixed(0)}萬`} width={55} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="totalNetWorth" stroke="#818cf8" strokeWidth={2.5} fillOpacity={1} fill="url(#colorValue)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#818cf8', fill: 'var(--bg-primary)' }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '0.5rem' }}>
                            <TrendingUp size={28} style={{ opacity: 0.3 }} />
                            <span style={{ fontSize: '0.85rem' }}>尚未有歷史紀錄，點擊上方按鈕開始追蹤</span>
                        </div>
                    )}
                </div>
            </div>

            {/* 資產列表 */}
            <div className="card glass-panel">
                <div className="card-title" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Wallet size={14} style={{ color: 'var(--warning-color)' }} />
                        各項資產明細
                    </span>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button onClick={handleExport} disabled={exporting} className="refresh-btn">
                            <Download size={13} /> {exporting ? '匯出中...' : '匯出備份'}
                        </button>
                        <label className="refresh-btn" style={{ cursor: importing ? 'wait' : 'pointer', opacity: importing ? 0.5 : 1 }}>
                            <Upload size={13} /> {importing ? '匯入中...' : '匯入資料'}
                            <input type="file" accept=".json" onChange={handleImport} disabled={importing} style={{ display: 'none' }} />
                        </label>
                    </div>
                </div>

                {assets.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-muted)', borderRadius: '14px', background: 'rgba(255,255,255,0.015)', border: '1px dashed rgba(255,255,255,0.06)' }}>
                        <Wallet size={40} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
                        <p style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>目前還沒有任何資產紀錄<br /><span style={{ color: 'var(--accent-color)' }}>點擊「新增資產紀錄」</span>開始理財之旅</p>
                    </div>
                ) : (
                    <div className="asset-list">
                        {groupedAssets.map((group) => {
                            const isExpanded = expandedGroups[group.info.label] !== false;
                            const allocationPercentage = group.info.isLiability
                                ? "-"
                                : (totalAssets > 0 ? ((group.totalValue / totalAssets) * 100).toFixed(1) + '%' : '0%');

                            return (
                                <div key={group.info.label}>
                                    <div
                                        className="group-header"
                                        onClick={() => toggleGroup(group.info.label)}
                                        style={{ borderLeft: `3px solid ${group.info.isLiability ? 'var(--danger-color)' : group.info.color}` }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ color: group.info.color, display: 'flex' }}>
                                                <group.info.icon size={18} />
                                            </div>
                                            <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{group.info.label}</span>
                                            <span className="stat-chip">{group.items.length}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums', color: group.info.isLiability ? 'var(--danger-color)' : 'var(--text-primary)' }}>
                                                    {group.info.isLiability ? '-' : ''} NT$ {group.totalValue.toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {allocationPercentage}
                                                </div>
                                            </div>
                                            {(group.info.value === '台股' || group.info.value === '外幣') && (
                                                <button
                                                    className="refresh-btn"
                                                    onClick={(e) => { e.stopPropagation(); handleBatchRefreshGroup(group); }}
                                                    disabled={refreshingGroupType === group.info.value}
                                                    style={{ color: group.info.color }}
                                                    title={`一鍵更新全部${group.info.value === '台股' ? '股價' : '匯率'}`}
                                                >
                                                    <RefreshCw size={13} style={{ animation: refreshingGroupType === group.info.value ? 'spin 1s linear infinite' : 'none' }} />
                                                    {refreshingGroupType === group.info.value ? '更新中...' : '全部更新'}
                                                </button>
                                            )}
                                            {group.info.value === '台股' && (
                                                <>
                                                    <button className="refresh-btn" onClick={(e) => { e.stopPropagation(); handleStockExport(group); }} style={{ color: group.info.color }}>
                                                        <Download size={13} /> 匯出
                                                    </button>
                                                    <button className="refresh-btn" onClick={(e) => { e.stopPropagation(); setShowStockImportModal(true); }} style={{ color: group.info.color }}>
                                                        <Upload size={13} /> 匯入
                                                    </button>
                                                </>
                                            )}
                                            <div style={{ color: 'var(--text-muted)', display: 'flex', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                                                <ChevronDown size={18} />
                                            </div>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div style={{ paddingLeft: '1.25rem', marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            {group.items.map(asset => (
                                                <div key={asset.id} className="asset-item">
                                                    <div className="asset-info" style={{ flex: 1 }}>
                                                        <div className="asset-details">
                                                            <span className="asset-name">
                                                                {asset.name}
                                                                {asset.ticker && (
                                                                    <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: '4px', marginLeft: '6px', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                                        {asset.ticker}
                                                                    </span>
                                                                )}
                                                                {asset.type === '台股' && asset.shares && (
                                                                    <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginLeft: '6px' }}>{asset.shares.toLocaleString()} 股</span>
                                                                )}
                                                                {asset.type === '外幣' && asset.foreignAmount && (
                                                                    <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginLeft: '6px' }}>({asset.currency} {asset.foreignAmount.toLocaleString()})</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                        <div className="asset-value-container" style={{ minWidth: '90px' }}>
                                                            <span className="asset-value" style={{ color: group.info.isLiability ? 'var(--danger-color)' : 'var(--text-primary)' }}>
                                                                {group.info.isLiability ? '-' : ''}NT$ {Number(asset.value).toLocaleString()}
                                                            </span>
                                                        </div>

                                                        <div style={{ display: 'flex', gap: '0.1rem' }}>
                                                            {asset.type === '台股' && (
                                                                <button className="icon-btn" onClick={() => handleFetchSingleStockPrice(asset)} disabled={refreshingId === asset.id} title="重新取得最新現價" style={{ color: '#10b981' }}>
                                                                    <RefreshCw size={14} style={{ animation: refreshingId === asset.id ? 'spin 1s linear infinite' : 'none' }} />
                                                                </button>
                                                            )}
                                                            {asset.type === '外幣' && (
                                                                <button className="icon-btn" onClick={() => handleFetchSingleExchangeRate(asset)} disabled={refreshingId === asset.id} title="最新匯率結算" style={{ color: '#0ea5e9' }}>
                                                                    <RefreshCw size={14} style={{ animation: refreshingId === asset.id ? 'spin 1s linear infinite' : 'none' }} />
                                                                </button>
                                                            )}
                                                            <button className="icon-btn" onClick={() => openEditModal(asset)} title="編輯">
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button className="icon-btn danger" onClick={() => handleDeleteAsset(asset.id)} title="刪除">
                                                                <Trash2 size={14} />
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

            {/* 新增/編輯資產 Modal */}
            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700 }}>{editingAssetId ? '編輯資產' : '新增資產'}</h2>
                            <button className="icon-btn" onClick={() => setShowAddModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={editingAssetId ? handleUpdateAsset : handleCreateAsset} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                            <div>
                                <label className="form-label">類別</label>
                                <select className="form-input" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                                    {ASSET_TYPES.map(type => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="form-label">資產名稱 (如: 台新銀行、台積電)</label>
                                <input type="text" required className="form-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="輸入名稱..." />
                            </div>

                            {formData.type === '台股' && (
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <label className="form-label">台股代號</label>
                                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                                            <input type="text" required className="form-input" value={formData.ticker} onChange={(e) => setFormData({ ...formData, ticker: e.target.value })} placeholder="例如: 2330" />
                                            <button type="button" onClick={handleFetchStockPrice} disabled={fetchingPrice || !formData.ticker} className="refresh-btn" style={{ padding: '0 0.6rem', color: '#10b981' }} title="自動取得現價">
                                                <RefreshCw size={16} style={{ animation: fetchingPrice ? 'spin 1s linear infinite' : 'none' }} />
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label className="form-label">持有股數</label>
                                        <input type="number" required min="1" className="form-input" value={formData.shares} onChange={(e) => setFormData({ ...formData, shares: e.target.value })} placeholder="1張=1000股" />
                                    </div>
                                </div>
                            )}

                            {formData.type === '外幣' && (
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <label className="form-label">幣別</label>
                                        <select className="form-input" value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })}>
                                            <option value="USD">美金 (USD)</option>
                                            <option value="JPY">日圓 (JPY)</option>
                                            <option value="EUR">歐元 (EUR)</option>
                                            <option value="GBP">英鎊 (GBP)</option>
                                            <option value="AUD">澳幣 (AUD)</option>
                                        </select>
                                    </div>
                                    <div style={{ flex: 2 }}>
                                        <label className="form-label">外幣金額</label>
                                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                                            <input type="number" step="0.01" required className="form-input" value={formData.foreignAmount} onChange={(e) => setFormData({ ...formData, foreignAmount: e.target.value })} placeholder="輸入外幣數量..." />
                                            <button type="button" onClick={handleFetchExchangeRate} disabled={fetchingExchange || !formData.foreignAmount} className="refresh-btn" style={{ padding: '0 0.6rem', color: '#0ea5e9' }} title="自動換算台幣">
                                                <RefreshCw size={16} style={{ animation: fetchingExchange ? 'spin 1s linear infinite' : 'none' }} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="form-label">
                                    {(formData.type === '負債' || formData.type === '房貸') ? '負債餘額 (NT$)' : (formData.type === '台股' ? '目前總市值 (NT$)' : '現在市值 (約當 NT$)')}
                                </label>
                                <input type="number" required min="0" className="form-input" value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })} placeholder={(formData.type === '負債' || formData.type === '房貸') ? "輸入剩餘貸款或卡債金額..." : "輸入目前的台幣總價值..."} />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                                <button type="button" className="action-btn" onClick={() => setShowAddModal(false)} style={{ flex: 1, border: '1px solid var(--border-color)' }}>
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
                <div className="modal-overlay" onClick={() => setShowStockImportModal(false)}>
                    <div className="glass-panel modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileSpreadsheet size={20} color="#10b981" /> 台股持股匯入
                            </h2>
                            <button className="icon-btn" onClick={() => setShowStockImportModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="info-box success" style={{ marginBottom: '1.25rem' }}>
                            請上傳先前匯出的 Excel (.xlsx) 檔案。<br />
                            系統會自動新增或更新現有台股的股數與成本，匯入完成後點擊「全部更新」抓取最新股價。
                        </div>

                        <div style={{ marginBottom: '1.25rem', textAlign: 'center', border: '2px dashed rgba(255,255,255,0.08)', borderRadius: '14px', padding: '2rem', background: 'rgba(255,255,255,0.015)', transition: 'all 0.2s' }}>
                            <input type="file" accept=".xlsx, .xls" onChange={handleStockImportSubmit} disabled={stockImporting} style={{ display: 'none' }} id="excel-upload" />
                            <label htmlFor="excel-upload" className="action-btn primary" style={{ cursor: stockImporting ? 'wait' : 'pointer', padding: '0.7rem 1.5rem' }}>
                                <Upload size={16} />
                                {stockImporting ? '讀取與匯入中...' : '選擇 Excel 檔案上傳'}
                            </label>
                        </div>

                        <button type="button" className="action-btn" onClick={() => setShowStockImportModal(false)} style={{ width: '100%', border: '1px solid var(--border-color)' }}>
                            取消
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
