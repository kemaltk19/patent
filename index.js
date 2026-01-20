/**
 * Türk Patent API - Railway Optimized
 */

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Browser başlat
async function getBrowser() {
    return puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process'
        ]
    });
}

// Ana endpoint
app.post('/api/search', async (req, res) => {
    const { searchText } = req.body.params || req.body;

    if (!searchText) {
        return res.json({ success: false, error: 'Arama terimi gerekli' });
    }

    console.log(`Arama: ${searchText}`);

    let browser;
    try {
        browser = await getBrowser();
        const page = await browser.newPage();

        await page.goto('https://www.turkpatent.gov.tr/arastirma-yap', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await page.waitForSelector('input.MuiInputBase-input', { timeout: 10000 });

        const inputs = await page.$$('input.MuiInputBase-input');
        for (const input of inputs) {
            const placeholder = await input.evaluate(el => el.placeholder);
            if (placeholder && placeholder.includes('Marka')) {
                await input.type(searchText);
                break;
            }
        }

        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.textContent.includes('Sorgula')) {
                    btn.click();
                    break;
                }
            }
        });

        await new Promise(r => setTimeout(r, 5000));

        const results = await page.evaluate(() => {
            const rows = document.querySelectorAll('tr');
            const data = [];
            rows.forEach((row, idx) => {
                if (idx === 0) return;
                const cells = row.querySelectorAll('td');
                if (cells.length >= 7) {
                    data.push({
                        markaName: cells[2]?.innerText?.trim() || '',
                        applicationNo: cells[1]?.innerText?.trim() || '',
                        holderName: cells[3]?.innerText?.trim() || '',
                        applicationDate: cells[4]?.innerText?.trim() || '',
                        currentStatus: cells[6]?.innerText?.trim() || '',
                        niceClasses: cells[7]?.innerText?.trim() || ''
                    });
                }
            });
            return data.slice(0, 20);
        });

        await browser.close();
        res.json({ success: true, source: 'live', payload: { items: results } });

    } catch (error) {
        console.error('Hata:', error.message);
        if (browser) await browser.close();
        res.json({ success: false, error: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Türk Patent API çalışıyor' });
});

app.listen(PORT, () => {
    console.log(`API: ${PORT}`);
});
