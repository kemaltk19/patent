/**
 * Türk Patent API - Hafif Versiyon
 * puppeteer-core + @sparticuz/chromium ile optimize edilmiş
 */

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Browser instance'ı başlat
async function getBrowser() {
    return puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
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

        // Marka Adı alanını bul ve yaz
        await page.waitForSelector('input.MuiInputBase-input', { timeout: 10000 });

        const inputs = await page.$$('input.MuiInputBase-input');
        for (const input of inputs) {
            const placeholder = await input.evaluate(el => el.placeholder);
            if (placeholder && placeholder.includes('Marka')) {
                await input.type(searchText);
                break;
            }
        }

        // Sorgula butonunu tıkla
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

        // Sonuçları çek
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
    res.json({ status: 'ok', message: 'Türk Patent API Lite çalışıyor' });
});

app.listen(PORT, () => {
    console.log(`API: ${PORT}`);
});
