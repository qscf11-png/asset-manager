import { getTaiwanStockInfo } from './src/utils/stockApi.js';

async function test() {
    try {
        const info = await getTaiwanStockInfo('2330');
        console.log('Result:', info);
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
