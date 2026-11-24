/* hairly — shared script for product.html, order.html, admin.html */

const ORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwnlJtx7-QgyZnJWThJWRoGUAdDeJn1O6RP2_oZ5Zcnp1Dcqj7yP8ipMvCDoMfdQ5hpCw/exec';
const ORDERS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRszRdi5YhhMPlsZg9pMaoV-aEnZjJYsun3C-TlnXYTJ4-5HNQfHz00EjkyC3acbDdbfy1eStDIl36m/pub?gid=0&single=true&output=csv';

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('product-list')) initProductPage();
  if (document.getElementById('orderForm')) initOrderPage();
  if (document.getElementById('ordersTable')) initAdminPage();
});

/* ---------- helpers ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------- product.html ---------- */

// ชื่อที่ส่งไปหน้า order — แก้รูปแบบได้ที่ฟังก์ชันนี้ที่เดียว
function buildItemLabel(product) {
  return `${product.name} ${product.size}`;
}

async function initProductPage() {
  const list = document.getElementById('product-list');
  const filterBar = document.getElementById('filter-bar');

  let products = [];
  try {
    const res = await fetch('products.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    products = await res.json();
  } catch (error) {
    console.error(error);
    list.replaceChildren(el('p', '', 'ไม่สามารถโหลดรายการสินค้าได้ กรุณาลองใหม่อีกครั้ง'));
    return;
  }

  const moods = [...new Set(products.map(p => p.mood))];
  const requested = (new URLSearchParams(location.search).get('mood') || '').trim().toLowerCase();
  let current = moods.find(m => m.toLowerCase() === requested) || 'all';

  function renderFilters() {
    if (!filterBar) return;
    filterBar.replaceChildren();
    [{ value: 'all', label: 'ทั้งหมด' }, ...moods.map(m => ({ value: m, label: m }))].forEach(({ value, label }) => {
      const btn = el('button', 'btn filter-btn' + (value === current ? ' is-active' : ''), label);
      btn.type = 'button';
      btn.dataset.mood = value;
      btn.setAttribute('aria-pressed', String(value === current));
      btn.addEventListener('click', () => {
        current = value;
        const url = new URL(location.href);
        if (value === 'all') url.searchParams.delete('mood');
        else url.searchParams.set('mood', value);
        history.replaceState(null, '', url);
        renderFilters();
        renderProducts();
      });
      filterBar.appendChild(btn);
    });
  }

  function renderProducts() {
    const items = current === 'all' ? products : products.filter(p => p.mood === current);
    list.replaceChildren(...items.map(createProductCard));
    if (!items.length) list.appendChild(el('p', '', 'ไม่พบสินค้า'));
  }

  renderFilters();
  renderProducts();
}

function createProductCard(product) {
  const card = el('article', 'product-card');
  card.dataset.mood = product.mood;

  const img = el('img');
  img.src = product.image;
  img.alt = product.name;
  img.loading = 'lazy';

  const meta = el('div', 'product-meta');
  meta.append(el('span', '', product.size), el('span', 'price', `${Number(product.price).toLocaleString('th-TH')} บาท`));

  const params = new URLSearchParams({ item: buildItemLabel(product), price: product.price });
  const buy = el('a', 'btn', 'สั่งซื้อ');
  buy.href = `order.html?${params.toString()}`;

  card.append(img, el('span', 'mood-tag', product.mood), el('h3', '', product.name), meta, buy);
  return card;
}

/* ---------- order.html ---------- */

function initOrderPage() {
  const form = document.getElementById('orderForm');
  const params = new URLSearchParams(location.search);

  // เติมทั้งชื่อสินค้า (#items) และราคา (#total) อัตโนมัติ
  const itemsField = document.getElementById('items');
  const totalField = document.getElementById('total');
  if (params.has('item')) itemsField.value = params.get('item');
  if (params.has('price')) totalField.value = params.get('price');

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const payload = {
      customerName: document.getElementById('customerName').value.trim(),
      contact: document.getElementById('contact').value.trim(),
      items: itemsField.value.trim(),
      total: totalField.value.trim(),
      note: document.getElementById('note').value.trim()
    };

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    fetch(ORDER_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(() => { window.location.href = 'thankyou.html'; })
    .catch(error => {
      console.error(error);
      if (submitBtn) submitBtn.disabled = false;
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    });
  });
}

/* ---------- admin.html ---------- */

// CSV parser: รองรับ "ข้อความมี, comma", "" แทน ", ขึ้นบรรทัดใหม่ในเครื่องหมายคำพูด, CRLF และ BOM
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

async function initAdminPage() {
  const table = document.getElementById('ordersTable');
  const tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
  const COLS = 6; // วันเวลา, ชื่อลูกค้า, เบอร์โทร/Line, รายการสินค้า, จำนวนเงินรวม, หมายเหตุ

  function showMessage(message) {
    const tr = document.createElement('tr');
    const td = el('td', '', message);
    td.colSpan = COLS;
    tr.appendChild(td);
    tbody.replaceChildren(tr);
  }

  showMessage('กำลังโหลดข้อมูล...');

  try {
    const res = await fetch(`${ORDERS_CSV_URL}&_=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = parseCSV(await res.text());

    const orders = rows.slice(1).reverse(); // ข้ามหัวตาราง, ล่าสุดขึ้นก่อน (ชีตเพิ่มแถวต่อท้ายตามลำดับเวลา)
    if (!orders.length) return showMessage('ยังไม่มีรายการสั่งซื้อ');

    tbody.replaceChildren(...orders.map(order => {
      const tr = document.createElement('tr');
      for (let i = 0; i < COLS; i++) {
        let value = (order[i] || '').trim();
        if (i === 4 && value !== '' && !isNaN(Number(value))) {
          value = `${Number(value).toLocaleString('th-TH')} บาท`;
        }
        tr.appendChild(el('td', '', value));
      }
      return tr;
    }));
  } catch (error) {
    console.error(error);
    showMessage('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
  }
}
