import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Lazy Google GenAI Client
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    database: 'firebase_firestore',
  });
});


// 2. AI Assistant Konter Endpoint (Gemini 3.8 Flash + Deep Context-Aware Operational Knowledge)
app.post('/api/ai/assistant', async (req, res) => {
  try {
    const { message, contextData, history } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Pesan pengguna harus diisi.' });
    }

    const ai = getGenAI();
    const a = contextData?.analytics;
    const sufficiency = a?.dataSufficiency;
    const salesSummary = a?.salesSummary;
    const inv = a?.inventorySummary;
    const fastMoving = a?.fastMovingProducts || [];
    const slowMoving = a?.slowMovingProducts || [];
    const urgentRestock = a?.restockRecommendations?.urgentRestock || [];
    const bufferRestock = a?.restockRecommendations?.highMarginBuffer || [];
    const forbiddenRestock = a?.restockRecommendations?.forbiddenRestock || [];
    const serviceSummary = a?.serviceSummary;

    // Prepare deep system instructions with live shop dataset
    const contextSummary = contextData
      ? `
[STATUS VALIDITAS & INTEGRITAS DATA TRANSAKSI]:
- Jumlah Transaksi Penjualan Retail: ${salesSummary?.totalTransactions ?? contextData.retailSalesCount ?? 0} transaksi
- Status Kecukupan Sampel Data: ${sufficiency?.sampleStatus || (contextData.retailSalesCount >= 5 ? 'SUFFICIENT' : contextData.retailSalesCount > 0 ? 'PRELIMINARY' : 'INSUFFICIENT')}
- Keabsahan Data: ${sufficiency?.notice || (contextData.retailSalesCount >= 5 ? 'Data transaksi valid & mencukupi' : 'Data transaksi masih minim, analisis memerlukan kehati-hatian')}
- Total Fisik Produk Terjual: ${salesSummary?.totalUnitsSold || 0} unit
- Total Omset Retail: Rp ${Number(salesSummary?.totalRevenue ?? contextData.retailSalesTotal ?? 0).toLocaleString('id-ID')}
- Total Laba Kotor Retail: Rp ${Number(salesSummary?.totalGrossProfit || 0).toLocaleString('id-ID')} (Margin Rata-rata: ${salesSummary?.overallMarginPercent || 0}%)

[INVENTARIS & VALUASI MODAL TOKO]:
- Total SKU Produk Aktif: ${inv?.totalProducts || 0} barang
- Total Fisik Stok Seluruh Toko: ${inv?.totalStockUnits || 0} pcs
- Total Nilai Modal Toko (HPP): Rp ${Number(inv?.totalCostValuation || 0).toLocaleString('id-ID')}
- Total Potensi Nilai Jual Eceran: Rp ${Number(inv?.totalRetailValuation || 0).toLocaleString('id-ID')}
- Jumlah Barang Menipis/Habis: ${inv?.lowStockCount ?? contextData.lowStockCount ?? 0} produk (Stok 0: ${inv?.outOfStockCount || 0} produk)
- Jumlah Barang Mengendap / Dead-Stock (0 Penjualan): ${inv?.deadStockItemCount || 0} produk
- Total Modal Macet Tertahan di Dead-Stock: Rp ${Number(inv?.deadStockCapitalLocked || 0).toLocaleString('id-ID')}

[DAFTAR 10 BARANG PALING LAKU (FAST-MOVING)]:
${fastMoving.length > 0 
  ? fastMoving.map((p: any, idx: number) => `${idx + 1}. ${p.name} (Kode: ${p.code}) | Terjual: ${p.unitsSold} ${p.unit} | Omset: Rp ${Number(p.revenue).toLocaleString('id-ID')} | Laba: Rp ${Number(p.grossProfit).toLocaleString('id-ID')} (Margin ${p.profitMarginPercent}%) | Sisa Stok: ${p.stock} (Batas Min: ${p.minStock})`).join('\n') 
  : '- Belum ada data transaksi penjualan retail yang tercatat.'}

[DAFTAR BARANG SUSAH LAKU / DEAD-STOCK (MODAL MACET DI ETALASE)]:
${slowMoving.length > 0 
  ? slowMoving.map((p: any, idx: number) => `${idx + 1}. ${p.name} (Kode: ${p.code}) | Stok Tertahan: ${p.stock} ${p.unit} | Modal/Pcs: Rp ${Number(p.costPrice).toLocaleString('id-ID')} | Total Uang Macet: Rp ${Number(p.tiedUpCapital).toLocaleString('id-ID')} | Penjualan: 0 unit`).join('\n') 
  : '- Tidak ada produk yang terdeteksi mengendap.'}

[SARAN RESTOCK & STRATEGI BELANJA MODAL]:
1. PRIORITAS UTAMA (URGENT / BARANG LARIS YANG STOKNYA MENIPIS - HARUS DISTOK BANYAK):
${urgentRestock.length > 0 
  ? urgentRestock.map((r: any) => `• ${r.name}: Sisa stok ${r.currentStock} ${r.minStock ? '(Min ' + r.minStock + ')' : ''}, Terjual ${r.unitsSold} pcs -> REKOMENDASI BELANJA: ${r.suggestedReorderQty} pcs (Estimasi modal: Rp ${Number(r.estimatedBudgetNeeded).toLocaleString('id-ID')}). Alasan: ${r.reason}`).join('\n') 
  : '• Semua barang fast-moving saat ini memiliki stok aman.'}

2. BUFFER GROSIR TINGGI (MARGIN TEBAL > 50% & PERPUTARAN STABIL - AMAN DISTOK BANYAK):
${bufferRestock.length > 0 
  ? bufferRestock.map((r: any) => `• ${r.name}: Sisa stok ${r.currentStock} pcs -> REKOMENDASI STOK BANYAK: ${r.suggestedReorderQty} pcs (Estimasi modal: Rp ${Number(r.estimatedBudgetNeeded).toLocaleString('id-ID')}). Alasan: ${r.reason}`).join('\n') 
  : '• Belum ada rekomendasi buffer tambahan.'}

3. JANGAN DIBELI DULU / HINDARI RESTOCK (DEAD-STOCK TINGGI):
${forbiddenRestock.length > 0 
  ? forbiddenRestock.map((r: any) => `• ${r.name}: Masih ada ${r.currentStock} pcs (Modal Rp ${Number(r.currentStock * r.costPrice).toLocaleString('id-ID')}). Tindakan: ${r.recommendedAction}`).join('\n') 
  : '• Tidak ada produk yang diblokir restock.'}

[DATA OPERASIONAL SERVIS HP & KEBUTUHAN SPAREPART]:
- Total Tiket Servis: ${serviceSummary?.totalTickets ?? contextData.servicesTotal ?? 0} unit (Antrean: ${serviceSummary?.queued ?? contextData.servicesQueued ?? 0}, Proses: ${serviceSummary?.inProgress ?? contextData.servicesInProgress ?? 0}, Siap Diambil: ${serviceSummary?.ready ?? contextData.servicesReady ?? 0}, Selesai Lunas: ${serviceSummary?.completed ?? contextData.servicesCompleted ?? 0})
- Total Estimasi Biaya Servis: Rp ${Number(serviceSummary?.totalEstimatedRevenue || 0).toLocaleString('id-ID')}
- Total Modal Sparepart (HPP): Rp ${Number(serviceSummary?.totalSparepartCost || 0).toLocaleString('id-ID')}
- Estimasi Laba Jasa Servis: Rp ${Number(serviceSummary?.grossProfitService || 0).toLocaleString('id-ID')} (Margin: ${serviceSummary?.serviceMarginPercent || 0}%)
- Merek HP Paling Sering Masuk Servis: ${(serviceSummary?.topBrands || []).map((b: any) => `${b.brand} (${b.count} unit, ${b.percentage}%)`).join(', ') || 'Belum ada'}
- Jenis Kerusakan / Keluhan Terbanyak: ${(serviceSummary?.topComplaints || []).map((c: any) => `${c.complaintType} (${c.count} kasus)`).join(', ') || 'Belum ada'}
- Sparepart Fast-Moving Rekomendasi Standby: ${(serviceSummary?.criticalSparepartsAdvice || []).join('; ') || 'Lem LCD T7000/B7000, LCD seri terpopuler, Baterai universal'}

[STATUS KASIR LACI & AUDIT PPOB SHIFT SAAT INI]:
- Petugas Shift Aktif: ${contextData.activeStaffName || 'Kasir/Teknisi'}
- Status Shift Laci: ${contextData.shiftStatus || 'BUKA'} (Modal Awal Kasir: Rp ${Number(contextData.startingCash || 0).toLocaleString('id-ID')})
- Estimasi Fisik Uang di Laci: Rp ${Number(contextData.expectedCash || 0).toLocaleString('id-ID')}
- Total Pemasukan Kasir: Rp ${Number(contextData.totalCashIn || 0).toLocaleString('id-ID')}
- Total Pengeluaran Kasir: Rp ${Number(contextData.totalCashOut || 0).toLocaleString('id-ID')}
- Rata-rata Fee Transaksi PPOB Terakhir: Rp ${Number(contextData.ppobAverageFee || 0).toLocaleString('id-ID')} / transaksi (Status: ${
  contextData.ppobFeeStatus === 'TOO_LOW'
    ? '⚠️ TERLALU RENDAH (< Rp 1.500)'
    : contextData.ppobFeeStatus === 'TOO_HIGH'
    ? '⚠️ TERLALU TINGGI (> Rp 2.500)'
    : '✅ Normal & Sehat'
})
`
      : '';

    const systemInstruction = `
Kamu adalah "Asisten AI & Partner Bisnis Toko" untuk konter "Aldi Service Phone - POS, Servis HP & PPOB".
Lawan bicaramu adalah Mas Aldi (Owner/Pemilik) atau staf kasir/teknisi konter.

[1. PERAN UTAMA AI]:
Kamu bertindak dalam 3 peran terintegrasi:
1. TUTOR OPERASIONAL: Memberikan panduan praktis langkah demi langkah (step-by-step) tentang cara kerja seluruh fitur aplikasi konter bagi kasir, teknisi, maupun owner baru.
2. KONSULTAN KEUANGAN: Membantu menganalisis arus kas laci, margin keuntungan retail & jasa servis, perputaran saldo modal PPOB, serta strategi peningkatan profit toko.
3. PENGAWAS SISTEM: Memantau integritas data stok fisik vs sistem, mencegah kebocoran saldo PPOB, memastikan selisih laci shift Rp 0 saat tutup kasir, dan mengingatkan kepatuhan SOP segel garansi 14 hari.

[2. PENGETAHUAN MENDALAM ALUR APLIKASI KONTER]:
1. SISTEM KASIR POS (RETAIL):
   - Alur Penjualan: Kasir memilih barang/aksesoris dari katalog produk atau scan barcode. Produk masuk ke Keranjang Belanja yang muncul dalam bentuk Pop-up / Modal Melayang saat tombol keranjang melayang di pojok kanan bawah diklik.
   - Pembayaran Cepat: Terdapat tombol "Bayar Uang Pas" berukuran besar serta tombol pecahan tunai cepat (20k, 50k, 100k, 200k, 500k), atau metode non-tunai (QRIS, Transfer Bank, Kartu Debit).
   - Pemotongan Stok Otomatis: Begitu tombol "Bayar & Cetak Struk" ditekan, kuantitas stok produk otomatis berkurang seketika di koleksi \`products\` Cloud Firestore, dan transaksi tersimpan rapi di koleksi \`sales\`.
   - Arus Kas: Jika pembayaran metode TUNAI (CASH), sistem otomatis menambahkan nominal ke kas masuk laci kasir (\`cashInRetail\`) pada shift aktif.

2. SISTEM SERVIS HP (SERVICE MANAGEMENT):
   - Alur Pengerjaan 5 Tahap:
     a. ANTREAN (QUEUED): Unit baru masuk dari konsumen. Staf mencatat nama pelanggan, tipe HP, nomor WhatsApp, keluhan kerusakan, kelengkapan unit, password/pola kunci layar, dan uang muka (DP jika ada).
     b. PENGECEKAN / DIAGNOSA & SPAREPART (DIAGNOSING / ESTIMATING): Teknisi membongkar/memeriksa kondisi unit, menentukan jenis sparepart yang dibutuhkan (LCD, Baterai, IC, Fleksibel cas, dll.) serta biaya jasa perbaikan.
     c. PROSES PENGERJAAN (IN_PROGRESS): Teknisi melakukan tindakan teknis perbaikan atau penggantian komponen.
     d. SELESAI / SIAP DIAMBIL (READY): Unit selesai diperbaiki, lolos uji fungsi (QC), dan siap diambil. Sistem menyediakan tombol kirim notifikasi pesan WhatsApp ke pelanggan bahwa HP sudah selesai.
     e. PELUNASAN & DIAMBIL (COMPLETED): Pelanggan datang, melakukan pengecekan unit bersama kasir/teknisi, melunasi sisa tagihan (uang pelunasan tunai otomatis masuk ke kas laci shift \`cashInServiceSettlement\`), serah terima unit, dan cetak nota servis ber-barcode.
     f. GARANSI (WARRANTY 14 HARI): Toko memberikan garansi pengerjaan 14 hari dengan syarat mutlak: stiker segel toko masih utuh, serta bukan akibat kelalaian pemakaian baru (terjatuh, terkena cairan/air, atau segel rusak/dibongkar pihak lain).
   - Rumus Fundamental Biaya Servis:
     * Total Biaya Servis = (Harga Modal Sparepart + Biaya Jasa Teknisi).
     * Tagihan Akhir = Total Biaya Servis - Uang Muka (DP).

3. SISTEM PPOB (PULSA, PAKET DATA, TOKEN PLN, TOP-UP E-WALLET):
   - Pemisahan Modal Digital vs Kas Laci Fisik: Saldo PPOB (aplikasi pihak ketiga seperti Sinergi, GoPay, GoMerchant, dll.) adalah modal uang digital di server virtual, TERPISAH dari kas laci fisik toko.
   - Alur Uang Transaksi Tunai: Ketika pelanggan membeli pulsa/token secara TUNAI di konter, kas laci fisik toko BERTAMBAH (karena menerima lembaran uang fisik dari konsumen), sedangkan saldo digital PPOB konter BERKURANG (terpotong oleh server provider).
   - Fitur Audit PPOB: Membantu kasir dan Mas Aldi mencocokkan saldo awal digital vs saldo akhir digital, total perputaran omset PPOB, laba kotor fee, dan memastikan rata-rata fee per transaksi berada di rentang sehat (standar ideal Rp 1.500 - Rp 2.500 per transaksi) agar tidak terjadi kebocoran modal digital atau salah tarif loket.

4. SISTEM LACI SHIFT KASIR (CASH DRAWER SHIFT):
   - Alur Shift Kasir Terstruktur:
     a. Buka Shift: Kasir menghitung fisik uang modal awal pecahan kecil di laci dan menginputnya sebagai "Kas Awal" (\`startingCash\`).
     b. Transaksi Operasional Sepanjang Hari: Penjualan tunai retail, DP tunai servis HP, pelunasan tunai servis HP, dan penerimaan transaksi tunai loket PPOB otomatis menambah akumulasi kas masuk di sistem.
     c. Pengeluaran Kas Toko: Kasir/owner mencatat setiap pengeluaran uang tunai laci (biaya makan staf, air minum, operasional, atau bayar supplier restock tunai) agar tercatat sebagai pengeluaran kasir (\`cashOutExpenses\` / \`cashOutRestock\`).
     d. Tutup Shift: Kasir menghitung lembar uang nyata di laci (*cash count*), lalu sistem mencocokkannya dengan Kas Ekspektasi (Kas Awal + Total Kas Masuk - Total Kas Keluar). Jika ada selisih lebih (+/Surplus) atau selisih kurang (-/Minus), sistem mencatat deviasi untuk dianalisis penyebabnya.

5. CLOUD FIRESTORE (DATABASE REAL-TIME):
   - Seluruh data toko (koleksi \`products\`, \`sales\`, \`services\`, \`shifts\`, \`ppobAudits\`, \`expenses\`, \`staff\`, \`settings\`) tersimpan dan tersinkronisasi secara real-time multi-device di Google Cloud Firestore.
   - Ketika kasir menginput transaksi di komputer meja kasir, data stok dan kas langsung terupdate seketika di smartphone Mas Aldi di rumah tanpa perlu refresh halaman manual.

[3. CARA MERESPONS DARI AI TOKO]:
1. Bahasa Santai, Ramah, Komunikatif, dan Profesional:
   - Gunakan sapaan akrab seperti rekan kerja/konsultan satu meja (misal: "Halo Mas Aldi & Tim!", "Pertanyaan bagus nih Mas...").
   - Jangan kaku seperti robot template FAQ; buat diskusi mengalir hangat, cerdas, dan solutif.
2. Panduan Langkah Demi Langkah (Step-by-Step):
   - Jika pengguna bertanya CARA MENGGUNAKAN FITUR (Kasir POS, Servis HP, PPOB, Laci Shift, atau Firestore): Sajikan panduan langkah demi langkah bernomor (1, 2, 3...) yang sangat jelas, terstruktur, dan langsung bisa dipraktikkan di layar.
3. Analisis Ringkas & Tajam:
   - Jika pengguna meminta SARAN STOK, PENANGANAN SELISIH KAS LACI, atau STRATEGI PROFIT: Berikan analisis ringkas berbasis data riil toko, sertakan solusi konkret (misal: rekomendasi SKU fast-moving, taktik tebus murah dead-stock, atau investigasi selisih kas).

[DATA RIIL TOKO SAAT INI]:
${contextSummary}
`;

    if (ai) {
      try {
        // Build multi-turn conversation history for rich dialogue context
        const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

        if (Array.isArray(history) && history.length > 0) {
          for (const h of history) {
            if (!h || !h.content) continue;
            const role = (h.role === 'assistant' || h.role === 'model') ? 'model' : 'user';
            // Skip initial welcome message to keep prompt concise
            if (h.id === 'welcome' && role === 'model') continue;
            contents.push({
              role,
              parts: [{ text: h.content }],
            });
          }
        }

        // Add current user message
        contents.push({
          role: 'user',
          parts: [{ text: message }],
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI response timed out')), 25000)
        );

        const apiPromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: contents as any,
          config: {
            systemInstruction,
            temperature: 0.75,
          },
        });

        const response: any = await Promise.race([apiPromise, timeoutPromise]);
        const replyText = response.text || 'Maaf, saya belum dapat menghasilkan respons saat ini.';
        return res.json({ reply: replyText });
      } catch (geminiError: any) {
        console.warn('Gemini API call failed or timed out, using intelligent operational tutor & business partner fallback:', geminiError?.message);
      }
    }

    // High-quality intelligent conversational domain fallback
    // Speaks naturally as an Operational Tutor, Financial Consultant, and System Supervisor
    const q = message.toLowerCase();
    let fallbackReply = '';

    const txCount = salesSummary?.totalTransactions ?? contextData?.retailSalesCount ?? 0;
    const isDataSufficient = txCount >= 5;

    // 1. TUTOR OPERASIONAL: CARA MENGGUNAKAN KASIR POS & POP-UP KERANJANG
    if (
      q.includes('cara kasir') ||
      q.includes('cara pakai kasir') ||
      q.includes('cara belanja') ||
      q.includes('pop-up keranjang') ||
      q.includes('popup keranjang') ||
      q.includes('potong stok') ||
      q.includes('alur pos') ||
      q.includes('transaksi pos') ||
      (q.includes('kasir') && (q.includes('cara') || q.includes('langkah') || q.includes('alur') || q.includes('keranjang')))
    ) {
      fallbackReply = `Halo Mas Aldi dan rekan kasir! 👋 Sebagai **Tutor Operasional**, berikut panduan langkah demi langkah cara menggunakan **Menu Kasir POS** toko kita:\n\n` +
        `**Langkah-Langkah Transaksi Kasir POS:**\n` +
        `1. **Pilih Barang dari Katalog:** Cari produk menggunakan kolom pencarian (ketik nama barang, kode SKU, atau tipe HP) atau filter kategori aksesoris. Klik kartu produk untuk memasukkannya ke keranjang belanja.\n` +
        `2. **Buka Pop-up Keranjang:** Klik tombol **Keranjang Belanja Melayang (Floating Cart Button)** di pojok kanan bawah layar. Tombol ini menampilkan jumlah item dan total belanja secara langsung.\n` +
        `3. **Atur Kuantitas & Pelanggan:** Di dalam jendela pop-up, kasir bisa mengubah jumlah beli (+/-), menghapus item, dan menginput nama pelanggan jika diperlukan.\n` +
        `4. **Pilih Metode Pembayaran:**\n` +
        `   - **Tunai (CASH):** Tekan tombol besar **"Bayar Uang Pas"** jika pembeli membayar sesuai total, atau pilih tombol pecahan cepat (20k, 50k, 100k, 200k, 500k). Sistem langsung menghitung uang kembalian secara otomatis.\n` +
        `   - **Non-Tunai:** Pilih tab QRIS, Transfer Bank, atau Kartu jika pelanggan membayar digital.\n` +
        `5. **Selesaikan Transaksi:** Klik tombol **"Bayar & Cetak Struk"** yang terkunci di bagian bawah modal.\n\n` +
        `**⚡ Otomatisasi Sistem yang Terjadi:**\n` +
        `- Stok barang di etalase otomatis berkurang di koleksi \`products\` Cloud Firestore.\n` +
        `- Transaksi tersimpan ke koleksi \`sales\` secara real-time.\n` +
        `- Jika pembayaran TUNAI, fisik kas laci bertambah dan otomatis tercatat ke akumulasi kas masuk shift saat ini.`;
    }
    // 2. TUTOR OPERASIONAL: ALUR SERVIS HP, RUMUS BIAYA & GARANSI 14 HARI
    else if (
      q.includes('alur servis') ||
      q.includes('cara servis') ||
      q.includes('tahap servis') ||
      q.includes('biaya servis') ||
      q.includes('hitung servis') ||
      q.includes('garansi') ||
      (q.includes('servis') && (q.includes('cara') || q.includes('langkah') || q.includes('sop') || q.includes('rumus')))
    ) {
      fallbackReply = `Halo Mas Aldi dan Tim Teknisi! 👋 Sebagai **Tutor Operasional & Pengawas Sistem**, berikut alur lengkap SOP pengerjaan servis HP di konter kita:\n\n` +
        `**Alur 5 Tahap Pengerjaan Servis HP:**\n` +
        `1. **Antrean (QUEUED):** Pelanggan datang menyerahkan HP. Kasir/teknisi membuat tiket baru: catat nama, nomor WhatsApp, tipe HP, keluhan kerusakan, kelengkapan unit, password/pola kunci layar, dan uang muka (DP jika ada).\n` +
        `2. **Pengecekan & Diagnosa (DIAGNOSING / ESTIMATING):** Teknisi membongkar/memeriksa unit, mendiagnosa komponen yang rusak, dan menentukan estimasi sparepart serta biaya jasa.\n` +
        `3. **Proses Pengerjaan (IN_PROGRESS):** Teknisi melakukan perbaikan (ganti LCD, konektor cas, ganti IC, baterai, dsb.).\n` +
        `4. **Selesai / Siap Diambil (READY):** Unit selesai diperbaiki dan telah lulus uji fungsi (QC). Kasir mengirim notifikasi WhatsApp kepada pelanggan bahwa HP sudah bisa diambil.\n` +
        `5. **Pelunasan & Selesai (COMPLETED):** Pelanggan datang, menguji fungsi HP di depan kasir/teknisi, melunasi sisa tagihan (uang pelunasan tunai otomatis menambah kas laci shift), dan menerima nota servis ber-barcode.\n\n` +
        `**📐 Rumus Fundamental Perhitungan Biaya Servis:**\n` +
        `> **Total Biaya Servis = Harga Sparepart + Biaya Jasa Teknisi**\n` +
        `> **Sisa Pelunasan = Total Biaya Servis - Uang Muka (DP)**\n\n` +
        `**🛡️ SOP Garansi 14 Hari:**\n` +
        `Toko memberikan garansi pengerjaan 14 hari penuh dengan syarat mutlak: **stiker segel toko masih utuh**, serta bukan akibat kesalahan pemakaian baru (terjatuh, layar pecah lagi, atau kemasukan air).`;
    }
    // 3. TUTOR OPERASIONAL: SISTEM PPOB (SALDO DIGITAL VS KAS LACI & AUDIT PPOB)
    else if (
      q.includes('ppob') ||
      q.includes('saldo digital') ||
      q.includes('laci fisik') ||
      q.includes('audit ppob') ||
      q.includes('pulsa') ||
      q.includes('token')
    ) {
      const avgFee = Number(contextData?.ppobAverageFee || 1850).toLocaleString('id-ID');
      fallbackReply = `Halo Mas Aldi dan Tim! 👋 Sebagai **Konsultan Keuangan & Pengawas Sistem**, mari kita bedah prinsip fundamental loket PPOB konter kita:\n\n` +
        `**1. Pemisahan Mutlak: Saldo Digital vs Kas Laci Fisik**\n` +
        `- **Saldo PPOB (Modal Digital):** Berada di server aplikasi pihak ketiga (Sinergi, GoPay, GoMerchant, dll.). Ini adalah modal virtual, **bukan uang fisik di laci**.\n` +
        `- **Uang Laci Fisik (Kas Toko):** Merupakan uang kertas/koin nyata yang ada di meja kasir.\n\n` +
        `**2. Alur Transaksi PPOB Tunai di Toko:**\n` +
        `- Saat pelanggan membeli pulsa/token/top up tunai di konter, pelanggan menyerahkan uang kertas ke kasir.\n` +
        `- **Dampaknya:** Uang fisik kas laci toko **BERTAMBAH**, sementara saldo modal digital PPOB toko **BERKURANG**.\n` +
        `- Karena itu, uang kasir bertambah bukan berarti laba bersih bertambah semua, melainkan sebagian besar adalah penggantian modal saldo digital yang terpakai!\n\n` +
        `**3. Fungsi Fitur Audit PPOB:**\n` +
        `- Mencocokkan saldo awal digital vs saldo akhir digital setiap hari agar kebocoran saldo langsung terdeteksi.\n` +
        `- Mengukur rata-rata margin fee per transaksi. Saat ini rata-rata fee loket kita: **Rp ${avgFee} / transaksi**.\n` +
        `- **Standar Sehat:** Rata-rata fee ideal adalah Rp 1.500 - Rp 2.500 per transaksi. Jika di bawah Rp 1.500, segera naikkan biaya admin loket agar tenaga kasir tidak sia-sia!`;
    }
    // 4. TUTOR OPERASIONAL: SISTEM LACI SHIFT & SOLUSI SELISIH KAS
    else if (
      q.includes('shift') ||
      q.includes('buka shift') ||
      q.includes('tutup shift') ||
      q.includes('selisih kas') ||
      q.includes('kas awal') ||
      q.includes('cash drawer') ||
      q.includes('laci')
    ) {
      const expCash = Number(contextData?.expectedCash || 0).toLocaleString('id-ID');
      const inCash = Number(contextData?.totalCashIn || 0).toLocaleString('id-ID');
      const outCash = Number(contextData?.totalCashOut || 0).toLocaleString('id-ID');

      fallbackReply = `Halo Mas Aldi dan rekan kasir! 👋 Sebagai **Tutor Operasional & Konsultan Keuangan**, berikut alur disiplin **Sistem Laci Shift Kasir**:\n\n` +
        `**Langkah-Langkah Siklus Shift Kasir:**\n` +
        `1. **Buka Shift (Kas Awal):** Saat toko buka atau pergantian kasir, hitung pecahan uang kecil di laci dan input sebagai **Modal Awal** (misal Rp 100.000 - Rp 300.000).\n` +
        `2. **Transaksi Berjalan:** Setiap penjualan tunai retail, DP servis tunai, pelunasan servis tunai, dan penerimaan PPOB tunai otomatis menambah akumulasi kas masuk sistem.\n` +
        `3. **Pencatatan Pengeluaran:** Jika mengambil uang laci untuk operasional (beli air galon, makan siang tim, atau bayar supplier COD), wajib input di menu **Pengeluaran Kas**.\n` +
        `4. **Tutup Shift (Cash Count):** Kasir menghitung fisik seluruh uang kertas & koin di laci. Masukkan total fisik uang ke form Tutup Shift.\n` +
        `5. **Pencocokan Kas Ekspektasi:**\n` +
        `   > **Kas Ekspektasi = Modal Awal + Total Kas Masuk - Total Kas Keluar**\n` +
        `   Saat ini estimasi fisik laci shift: **Rp ${expCash}** (Kas Masuk: +Rp ${inCash}, Kas Keluar: -Rp ${outCash}).\n\n` +
        `**🔍 Analisis & Solusi Penanganan Selisih Kas:**\n` +
        `- **Jika Kas Minus (Fisik < Ekspektasi):** Cek apakah ada pengeluaran kecil yang lupa diinput, kembalian ke konsumen berlebih, atau ada transaksi nontunai yang terinput tunai.\n` +
        `- **Jika Kas Surplus (Fisik > Ekspektasi):** Cek apakah ada konsumen yang tidak mengambil kembalian, atau ada transaksi retail/servis tunai yang belum diselesaikan di sistem.\n` +
        `- **Target Utama:** Selisih laci kasir wajib Rp 0 sebelum kasir pulang!`;
    }
    // 5. PENGAWAS SISTEM: CLOUD FIRESTORE & MULTI-DEVICE REAL-TIME
    else if (
      q.includes('firestore') ||
      q.includes('firebase') ||
      q.includes('multi device') ||
      q.includes('multi-device') ||
      q.includes('cloud') ||
      q.includes('sinkron') ||
      q.includes('database')
    ) {
      fallbackReply = `Halo Mas Aldi dan Tim! 👋 Sebagai **Pengawas Sistem**, berikut penjelasan arsitektur data toko kita di **Google Cloud Firestore**:\n\n` +
        `**Karakteristik & Keunggulan Cloud Firestore Toko Kita:**\n` +
        `1. **Real-Time Sinkronisasi Multi-Device:** Seluruh koleksi data (\`products\`, \`sales\`, \`services\`, \`shifts\`, \`ppobAudits\`, \`expenses\`, \`staff\`) tersimpan di awan (cloud) Google.\n` +
        `2. **Monitoring Jarak Jauh Tanpa Delay:** Ketika kasir melayani transaksi di komputer meja depan, data stok etalase dan omset laci langsung terupdate detik itu juga di smartphone Mas Aldi di rumah tanpa perlu refresh halaman.\n` +
        `3. **Pencegahan Konflik Stok:** Jika stok tempered glass tinggal 1 pcs dan terjual di kasir, sistem langsung memperbarui status stok menjadi "Habis" di seluruh perangkat staf lainnya secara seketika.\n` +
        `4. **Keamanan & Backup Terpusat:** Data transaksi tersimpan aman di server Google, tidak akan hilang meskipun laptop kasir mengalami mati lampu atau restart mendadak.`;
    }
    // 6. KONSULTAN KEUANGAN: STRATEGI PROFIT, OMSET & DEAD-STOCK
    else if (
      q.includes('laba') ||
      q.includes('profit') ||
      q.includes('omset') ||
      q.includes('untung') ||
      q.includes('keuntungan') ||
      q.includes('dead stock') ||
      q.includes('dead-stock') ||
      q.includes('stok')
    ) {
      const deadStockCount = inv?.deadStockItemCount || 0;
      const deadStockVal = Number(inv?.deadStockCapitalLocked || 0).toLocaleString('id-ID');
      const topFast = fastMoving.slice(0, 3);

      fallbackReply = `Halo Mas Aldi dan Tim! 👋 Sebagai **Konsultan Keuangan & Strategi Bisnis**, berikut analisis ringkas profitabilitas dan modal konter kita:\n\n` +
        `**1. Kondisi Valuasi & Perputaran Modal:**\n` +
        `- Total modal inventaris fisik: **Rp ${Number(inv?.totalCostValuation || 0).toLocaleString('id-ID')}** (${inv?.totalStockUnits || 0} pcs barang).\n` +
        `- Modal tertahan di dead-stock (belum bergerak): **Rp ${deadStockVal}** (${deadStockCount} produk).\n\n` +
        `**2. Strategi Dongkrak Profit & Bebaskan Modal:**\n` +
        `- **Tebus Murah Aksesoris:** Pasang program tebus murah Tempered Glass atau kabel data bagi pelanggan yang mengambil unit servis HP. Karena psikologi pelanggan sedang puas, peluang terjual mencapai 40-60%.\n` +
        `- **Bundling Cuci Gudang Dead-Stock:** Paketkan aksesoris dead-stock seharga Rp ${deadStockVal} dengan barang fast-moving (misal beli charger original gratis tempered glass tipe lama) agar modal cepat kembali jadi uang segar.\n` +
        `- **Fokus Stok Barang Juara:** Perbanyak kuantiti pembelian pada produk terlaris agar dapat harga grosir terbaik dari distributor:\n` +
        (topFast.length > 0
          ? topFast.map((p: any, i: number) => `  ${i + 1}. **${p.name}** (Terjual ${p.unitsSold} pcs, margin ${p.profitMarginPercent}%).`).join('\n')
          : `  • Kabel data Type-C, charger 20W/33W fast charging, dan tempered glass universal selalu menjadi penopang omset harian.`) +
        `\n\nMau kita buatkan draf rincian promo tebus murah di meja kasir sekarang, Mas Aldi?`;
    }
    // 7. DEFAULT COLLABORATIVE GREETING / OPEN DISCUSSION
    else {
      fallbackReply = `Halo Mas Aldi dan rekan tim! 👋 Saya adalah **Asisten AI & Partner Bisnis** konter Aldi Service Phone.\n\n` +
        `Saya siap membantu dalam 3 peran terpadu:\n` +
        `1. 📘 **Tutor Operasional:** Tanyakan langkah demi langkah cara transaksi Kasir POS (Pop-up Keranjang), SOP alur Servis HP (5 tahapan & rumus biaya), manajemen saldo PPOB, atau cara buka/tutup shift laci kasir.\n` +
        `2. 💰 **Konsultan Keuangan:** Tanyakan analisis arus kas laci, strategi membebaskan modal dead-stock, margin laba servis vs retail, atau cara menaikkan rata-rata transaksi harian.\n` +
        `3. 🛡️ **Pengawas Sistem:** Tanyakan integrasi Cloud Firestore multi-device, audit selisih kas laci, atau pengawasan kepatuhan segel garansi 14 hari.\n\n` +
        `Silakan tanyakan apa saja seputar operasional konter atau ketik topik yang ingin kita bahas bareng-bareng!`;
    }

    return res.json({ reply: fallbackReply });
  } catch (error: any) {
    console.error('Error in /api/ai/assistant:', error);
    return res.status(500).json({
      error: 'Terjadi kendala pada AI Assistant. Silakan coba beberapa saat lagi.',
      details: error?.message,
    });
  }
});

// Vite middleware & Static SPA serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Aldi Service Phone] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
