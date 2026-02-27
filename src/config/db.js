import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, orderBy, limit } from 'firebase/firestore';
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
