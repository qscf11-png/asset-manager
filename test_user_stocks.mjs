import { getTaiwanStockInfo } from './src/utils/stockApi.js';

async function testStocks() {
    const codes = ['8021', '7799', '6805', '6781'];
    for (const code of codes) {
        try {
            console.log(`\nTesting ${code}...`);
            const info = await getTaiwanStockInfo(code);
            console.log('Result:', info);
        } catch (error) {
            console.error(`Error for ${code}:`, error.message);
        }
    }
}

testStocks();
