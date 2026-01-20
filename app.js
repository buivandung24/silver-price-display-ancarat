const express = require('express');
const axios = require('axios');
const app = express();
const port = 8192;

const vietnamTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

app.set('view engine', 'ejs');
app.use(express.static('public'));

// Khai báo các nhóm sản phẩm
const productGroups = {
  default: [
    { title: 'Bạc tích trữ 999 1 lượng',          keywords: ['999', '1 lượng', 'Ngân Long'] },
    { title: 'Bạc tích trữ 999 5 lượng',          keywords: ['999', '5 lượng', 'Ngân Long'] },
    { title: 'Bạc tích trữ 999 1 Kilo',           keywords: ['999', '1 Kilo', 'Ngân Long'] },
    { title: 'Bạc mỹ nghệ trắng 999 1 lượng',     keywords: ['Bitcoin', '1 lượng'] },
    { title: 'Bạc mỹ nghệ màu 999 1 lượng',       keywords: ['Sài Gòn', '1 lượng'] },
    { title: 'Bạc Noel 999 1 lượng',              keywords: ['Noel', '1 lượng', '999', 'bản màu'] },
    { title: 'Vàng 9999 1 chỉ',                   keywords: ['Vàng', '1 chỉ', '9999', 'Kim Ấn'] },
    { title: 'Vàng 9999 0.1 chỉ',                 keywords: ['Vàng', '0.1 chỉ', '9999'] },
    { title: 'Vàng trang sức 9999 1 chỉ',         keywords: ['Vàng', '1 chỉ', 'Nhẫn', '9999'] }
  ],

  manhvu: [
    { title: 'Ngân Long - Bắc Sư Tử 999 - 1 lượng',     keywords: ['999', '1 lượng', 'Ngân Long'] },
    { title: 'Ngân Long - Bắc Sư Tử 999 - 5 lượng',     keywords: ['999', '5 lượng', 'Ngân Long'] },
    { title: 'Ngân Long Quảng Tiến 999 - 1 Kilo',       keywords: ['999', '1 Kilo', 'Ngân Long'] },
    { title: 'Bạc thỏi 2025 Ancarat 999 - 375 gram', keywords: ['Bạc thỏi', '375'] },
    { title: 'Bạc thỏi 2025 Ancarat 999 - 500 gram', keywords: ['Bạc thỏi', '500'] },
    { title: 'Bạc thỏi 2025 Ancarat 999 - 1000 gram', keywords: ['Bạc thỏi', '1000'] },
  ],
};

const previousPrices = {}; // { "title": { sell: number, buy: number, changePercent: string } }

let last_update = '';
let vat_note = '';
let hotline = '';

// Hàm tính % thay đổi
function calculateChange(current, previous) {
  if (!previous || previous <= 0 || !current || current === '-') return null;
  const currNum = parseFloat(current.replace(/,/g, ''));
  const prevNum = previous;
  if (isNaN(currNum) || prevNum <= 0) return null;

  const percent = ((currNum - prevNum) / prevNum) * 100;
  const rounded = percent.toFixed(2);

  if (parseFloat(rounded) === 0) return null;
  return rounded;
}

// Hàm chính: lấy dữ liệu API → lọc theo danh sách mong muốn
async function fetchAndFilterProducts(desiredList) {
  const api_url = "https://giabac.ancarat.com/api/price-data";

  try {
    const response = await axios.get(api_url, { timeout: 10000 });
    if (response.status !== 200) throw new Error("API trả về mã != 200");

    let data = response.data;

    // Xử lý metadata (3 dòng cuối)
    if (data.length >= 3) {
      const meta = data.slice(-3);
      data = data.slice(0, -3);

      if (meta[0]?.[2]) last_update = meta[0][2];
      if (meta[1]?.[0]) vat_note = meta[1][0];
      if (meta[2]?.[0]) hotline = meta[2][0];
    }

    const all_products = data
      .map(row => ({
        name: (row[0] || '').trim(),
        sell: (row[1] || '').trim(),
        buy: (row[2] || '').trim()
      }))
      .filter(p => p.name && p.sell && p.buy);

    const displayed = [];

    for (const desired of desiredList) {
      const matched = all_products.find(p => {
        const lowerName = p.name.toLowerCase();
        return desired.keywords.every(kw => lowerName.includes(kw.toLowerCase()));
      });

      let sell = '-';
      let buy = '-';
      let changePercent = '0.00';

      if (matched) {
        sell = matched.sell;
        buy = matched.buy;

        const sellNum = parseFloat(sell.replace(/,/g, ''));
        const prev = previousPrices[desired.title];

        if (prev && prev.sell > 0) {
          const change = calculateChange(sell, prev.sell);
          if (change !== null) {
            changePercent = change;
          } else if (prev.changePercent && prev.changePercent !== '-') {
            changePercent = prev.changePercent;
          }
        }

        if (sellNum > 0) {
          previousPrices[desired.title] = {
            sell: sellNum,
            buy: parseFloat(buy.replace(/,/g, '')) || 0,
            changePercent
          };
        }
      } else if (previousPrices[desired.title]) {
        changePercent = previousPrices[desired.title].changePercent || '-';
      }

      displayed.push({
        name: desired.title,
        sell,
        buy,
        change: changePercent
      });
    }

    return displayed;

  } catch (err) {
    console.error('Lỗi fetch API:', err.message);
    last_update = 'Lỗi kết nối API';
    return desiredList.map(d => ({
      name: d.title,
      sell: '-',
      buy: '-',
      change: '-'
    }));
  }
}

app.get('/api/data', async (req, res) => {
  const products = await fetchAndFilterProducts(productGroups.default);

  const current_time = last_update !== 'Lỗi kết nối API'
    ? vietnamTimeFormatter.format(new Date())
    : 'Lỗi cập nhật';

  res.json({ products, current_time, vat_note, hotline });
});



app.get('/', async (req, res) => {
  const products = await fetchAndFilterProducts(productGroups.default);
  const current_time = vietnamTimeFormatter.format(new Date());

  res.render('index', {
    products,
    current_time,
    last_update,
    vat_note,
    hotline
  });
});

app.get('/xadan', async (req, res) => {
  const products = await fetchAndFilterProducts(productGroups.default);
  const current_time = vietnamTimeFormatter.format(new Date());
  res.render('xadan', { products, current_time });
});

app.get('/nguyentrai', async (req, res) => {
  const products = await fetchAndFilterProducts(productGroups.default);
  const current_time = vietnamTimeFormatter.format(new Date());
  res.render('nguyentrai', { products, current_time });
});

app.get('/nguyentrai1', async (req, res) => {
  const products = await fetchAndFilterProducts(productGroups.default);
  const current_time = vietnamTimeFormatter.format(new Date());
  res.render('nguyentrai1', { products, current_time });
});

app.get('/nguyentrai2', async (req, res) => {
  const products = await fetchAndFilterProducts(productGroups.default);
  const current_time = vietnamTimeFormatter.format(new Date());
  res.render('nguyentrai2', { products, current_time });
});

app.get('/manhvu', async (req, res) => {
  const products = await fetchAndFilterProducts(productGroups.manhvu);
  const current_time = vietnamTimeFormatter.format(new Date());
  res.render('manhvu', { products, current_time });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});