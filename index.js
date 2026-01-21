/**
 * Türk Patent API - Stable Cluster Version
 * Hata düzeltmeleri ve kararlılık odaklı
 */

const express = require('express');
const cors = require('cors');
const { Cluster } = require('puppeteer-cluster');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

let cluster;

async function initCluster() {
    try {
        cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_PAGE, // Tek browser, çoklu sekme (RAM dostu ve kararlı)
            maxConcurrency: 5, // 5 Eşzamanlı İşlem
            monitor: false, // Konsol kirliliğini önle
            puppeteerOptions: {
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
                headless: 'new',
                ignoreHTTPSErrors: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', // /dev/shm kullanımını engeller (Docker için kritik)
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--disable-extensions',
                    '--mute-audio',
                    '--disable-background-networking',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-breakpad',
                    '--disable-client-side-phishing-detection',
                    '--disable-default-apps',
                    '--disable-hang-monitor',
                    '--disable-popup-blocking',
                    '--disable-prompt-on-repost',
                    '--disable-sync',
                    '--disable-translate',
                    '--metrics-recording-only',
                    '--no-first-run',
                    '--safebrowsing-disable-auto-update'
                ]
            },
            timeout: 60000
        });

        // Hata yakalama
        cluster.on('taskerror', (err, data) => {
            console.error(`Error crawling ${data}: ${err.message}`);
        });

        console.log('Cluster başlatıldı (Stable Mode) - Max Concurrency: 5');
    } catch (e) {
        console.error('Cluster başlatılamadı:', e);
        process.exit(1);
    }
}

// Kaynak optimizasyonu
async function optimizePage(page) {
    try {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media', 'other'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });
    } catch (e) {
        console.error('Page optimization error:', e);
    }
}

// Marka Arama
const searchTask = async ({ page, data: { searchText, limit } }) => {
    await optimizePage(page);

    // Hata durumunda retry mekanizması
    let retryCount = 0;
    while (retryCount < 2) {
        try {
            await page.goto('https://www.turkpatent.gov.tr/arastirma-yap', { waitUntil: 'domcontentloaded', timeout: 30000 });

            await page.waitForSelector('input.MuiInputBase-input', { timeout: 10000 });
            const inputs = await page.$$('input.MuiInputBase-input');
            let inputFound = false;
            for (const input of inputs) {
                const placeholder = await input.evaluate(el => el.placeholder);
                if (placeholder && placeholder.includes('Marka')) {
                    await input.type(searchText);
                    inputFound = true;
                    break;
                }
            }

            if (!inputFound) throw new Error('Arama kutusu bulunamadı');

            await page.evaluate(() => {
                const buttons = document.querySelectorAll('button');
                for (const btn of buttons) {
                    if (btn.textContent.includes('Sorgula')) { btn.click(); break; }
                }
            });

            try {
                await page.waitForFunction(
                    () => document.querySelectorAll('tbody tr').length > 0,
                    { timeout: 10000 }
                );
            } catch (e) {
                // Sonuç yoksa devam et
            }

            const results = await page.evaluate((maxLimit) => {
                const rows = document.querySelectorAll('tr');
                const data = [];
                rows.forEach((row, idx) => {
                    if (idx === 0 || data.length >= maxLimit) return;
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 7) {
                        const getText = (cell) => cell?.innerText?.trim() || '';
                        data.push({
                            markaName: getText(cells[2]),
                            applicationNo: getText(cells[1]),
                            holderName: getText(cells[3]),
                            applicationDate: getText(cells[4]),
                            currentStatus: getText(cells[6]),
                            niceClasses: getText(cells[7])
                        });
                    }
                });
                return data;
            }, limit);

            return results;

        } catch (e) {
            console.error(`Search failed (attempt ${retryCount + 1}):`, e.message);
            retryCount++;
            if (retryCount === 2) throw e;
        }
    }
};

// Detay Arama
const detailTask = async ({ page, data: { applicationNo } }) => {
    await optimizePage(page);

    try {
        await page.goto('https://www.turkpatent.gov.tr/arastirma-yap', { waitUntil: 'domcontentloaded', timeout: 30000 });

        await page.waitForSelector('input.MuiInputBase-input', { timeout: 10000 });
        const inputs = await page.$$('input.MuiInputBase-input');
        for (const input of inputs) {
            const placeholder = await input.evaluate(el => el.placeholder);
            if (placeholder && placeholder.includes('Marka')) {
                await input.type(applicationNo);
                break;
            }
        }

        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.textContent.includes('Sorgula')) { btn.click(); break; }
            }
        });

        try {
            await page.waitForFunction(
                () => {
                    const btns = document.querySelectorAll('button');
                    return Array.from(btns).some(b => b.textContent.includes('DETAY'));
                },
                { timeout: 10000 }
            );
        } catch (e) {
            return { error: 'Sonuç bulunamadı' };
        }

        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.textContent.includes('DETAY')) { btn.click(); break; }
            }
        });

        await new Promise(r => setTimeout(r, 2000));

        return await page.evaluate(() => {
            const result = {
                markaBilgileri: {},
                islemBilgileri: []
            };

            const rows = document.querySelectorAll('table tr, .MuiTableRow-root');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td, th');
                if (cells.length >= 2) {
                    const label = cells[0]?.innerText?.trim();
                    const value = cells[1]?.innerText?.trim();
                    if (label && value && !label.includes('İşlem')) {
                        result.markaBilgileri[label] = value;
                    }
                    if (cells.length >= 4) {
                        const label2 = cells[2]?.innerText?.trim();
                        const value2 = cells[3]?.innerText?.trim();
                        if (label2 && value2) {
                            result.markaBilgileri[label2] = value2;
                        }
                    }
                }
            });

            const tables = document.querySelectorAll('table');
            if (tables.length > 1) {
                const islemTable = tables[tables.length - 1];
                const islemRows = islemTable.querySelectorAll('tr');
                islemRows.forEach((row, idx) => {
                    if (idx === 0) return;
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        result.islemBilgileri.push({
                            tarih: cells[0]?.innerText?.trim() || '',
                            tebligTarihi: cells[1]?.innerText?.trim() || '',
                            islem: cells[2]?.innerText?.trim() || '',
                            aciklama: cells[3]?.innerText?.trim() || ''
                        });
                    }
                });
            }
            return result;
        });
    } catch (e) {
        throw new Error('Detay çekilemedi: ' + e.message);
    }
};

initCluster();

app.post('/api/search', async (req, res) => {
    const { searchText } = req.body.params || req.body;
    const limit = req.body.limit || 100;
    if (!searchText) return res.json({ success: false, error: 'Arama terimi gerekli' });

    try {
        const results = await cluster.execute({ searchText, limit }, searchTask);
        res.json({ success: true, source: 'cluster', payload: { items: results } });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.post('/api/detail', async (req, res) => {
    const { applicationNo } = req.body;
    if (!applicationNo) return res.json({ success: false, error: 'Başvuru numarası gerekli' });

    try {
        const detail = await cluster.execute({ applicationNo }, detailTask);
        if (detail.error) throw new Error(detail.error);
        res.json({ success: true, detail });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'API Stable Mode', concurrency: 5 });
});

process.on('SIGINT', async () => {
    if (cluster) await cluster.close();
    process.exit();
});

app.listen(PORT, () => console.log(`API Stable: ${PORT}`));
