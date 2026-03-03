import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, orderBy, limit, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

const ASSETS_COLLECTION = 'assets';
const HISTORY_COLLECTION = 'net_worth_history';

// 取得特定使用者的所有資產
export const getUserAssets = async (userId) => {
    try {
        const q = query(
            collection(db, ASSETS_COLLECTION),
            where("userId", "==", userId)
        );
        const querySnapshot = await getDocs(q);
        const docs = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        // 在前端進行排序，以避免初次使用時需要去 Firebase 建立複合索引
        return docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
        console.error("載入資產失敗:", error);
        throw error;
    }
};

// 新增一筆資產
export const addAsset = async (assetData) => {
    try {
        const docRef = await addDoc(collection(db, ASSETS_COLLECTION), {
            ...assetData,
            createdAt: new Date().toISOString()
        });
        return { id: docRef.id, ...assetData };
    } catch (error) {
        console.error("新增資產失敗:", error);
        throw error;
    }
};

// 刪除一筆資產
export const deleteAsset = async (assetId) => {
    try {
        await deleteDoc(doc(db, ASSETS_COLLECTION, assetId));
        return true;
    } catch (error) {
        console.error("刪除資產失敗:", error);
        throw error;
    }
};

// 更新一筆資產
export const updateAsset = async (assetId, assetData) => {
    try {
        const docRef = doc(db, ASSETS_COLLECTION, assetId);
        await updateDoc(docRef, { ...assetData, updatedAt: new Date().toISOString() });
        return true;
    } catch (error) {
        console.error("更新資產失敗:", error);
        throw error;
    }
};

// 取得使用者的淨值歷史紀錄
export const getNetWorthHistory = async (userId) => {
    try {
        const q = query(
            collection(db, HISTORY_COLLECTION),
            where("userId", "==", userId)
        );
        const querySnapshot = await getDocs(q);
        const docs = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        // 以日期遞增排序 (確保圖表從左到右)
        return docs.sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (error) {
        console.error("載入歷史紀錄失敗:", error);
        throw error;
    }
};

// 紀錄當日的淨值與各種分類明細
export const recordNetWorth = async (userId, totalNetWorth, groupDetails = {}) => {
    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // 先檢查今天是不是已經有紀錄了
        const q = query(
            collection(db, HISTORY_COLLECTION),
            where("userId", "==", userId),
            where("date", "==", today)
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            // 如果今天有紀錄，更新它 (包含明細)
            const existingDoc = snapshot.docs[0];
            await updateDoc(doc(db, HISTORY_COLLECTION, existingDoc.id), {
                totalNetWorth,
                details: groupDetails,
                updatedAt: new Date().toISOString()
            });
            return true;
        } else {
            // 新增今天的紀錄
            await addDoc(collection(db, HISTORY_COLLECTION), {
                userId,
                date: today,
                totalNetWorth,
                details: groupDetails,
                createdAt: new Date().toISOString()
            });
            return true;
        }
    } catch (error) {
        console.error("紀錄淨值失敗:", error);
        throw error;
    }
};

// 手動補充指定日期的淨值紀錄（若已存在則覆寫）
export const addManualNetWorthRecord = async (userId, date, totalNetWorth) => {
    try {
        // 檢查該日期是否已有紀錄
        const q = query(
            collection(db, HISTORY_COLLECTION),
            where("userId", "==", userId),
            where("date", "==", date)
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            // 覆寫已存在的紀錄
            const existingDoc = snapshot.docs[0];
            await updateDoc(doc(db, HISTORY_COLLECTION, existingDoc.id), {
                totalNetWorth,
                updatedAt: new Date().toISOString()
            });
        } else {
            // 新增紀錄
            await addDoc(collection(db, HISTORY_COLLECTION), {
                userId,
                date,
                totalNetWorth,
                details: {},
                createdAt: new Date().toISOString()
            });
        }
        return true;
    } catch (error) {
        console.error("手動紀錄淨值失敗:", error);
        throw error;
    }
};

// 匯出使用者所有資料（資產 + 淨值歷史）
export const exportAllData = async (userId) => {
    try {
        const [assets, history] = await Promise.all([
            getUserAssets(userId),
            getNetWorthHistory(userId)
        ]);

        return {
            exportDate: new Date().toISOString(),
            version: '1.0',
            assets: assets.map(({ id, ...rest }) => rest),       // 去掉 Firestore doc id
            netWorthHistory: history.map(({ id, ...rest }) => rest)
        };
    } catch (error) {
        console.error("匯出資料失敗:", error);
        throw error;
    }
};

// 匯入資料（資產 + 淨值歷史），預設 merge 模式（不刪除現有資料）
export const importAllData = async (userId, data) => {
    try {
        let importedAssets = 0;
        let importedHistory = 0;

        // 匯入資產
        if (data.assets && Array.isArray(data.assets)) {
            for (const asset of data.assets) {
                await addDoc(collection(db, ASSETS_COLLECTION), {
                    ...asset,
                    userId,              // 確保 userId 為當前使用者
                    createdAt: asset.createdAt || new Date().toISOString(),
                    importedAt: new Date().toISOString()
                });
                importedAssets++;
            }
        }

        // 匯入淨值歷史紀錄（若同日已存在則覆寫）
        if (data.netWorthHistory && Array.isArray(data.netWorthHistory)) {
            for (const record of data.netWorthHistory) {
                if (!record.date || record.totalNetWorth === undefined) continue;

                const q = query(
                    collection(db, HISTORY_COLLECTION),
                    where("userId", "==", userId),
                    where("date", "==", record.date)
                );
                const snapshot = await getDocs(q);

                if (!snapshot.empty) {
                    // 覆寫
                    const existingDoc = snapshot.docs[0];
                    await updateDoc(doc(db, HISTORY_COLLECTION, existingDoc.id), {
                        totalNetWorth: record.totalNetWorth,
                        details: record.details || {},
                        updatedAt: new Date().toISOString()
                    });
                } else {
                    await addDoc(collection(db, HISTORY_COLLECTION), {
                        ...record,
                        userId,
                        createdAt: record.createdAt || new Date().toISOString(),
                        importedAt: new Date().toISOString()
                    });
                }
                importedHistory++;
            }
        }

        return { importedAssets, importedHistory };
    } catch (error) {
        console.error("匯入資料失敗:", error);
        throw error;
    }
};
