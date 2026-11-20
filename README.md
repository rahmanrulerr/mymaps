# PetaKu

Aplikasi penanda titik lokasi menggunakan Google Maps, penyimpanan lokal browser, dan impor/ekspor JSON.

## Struktur folder

- `index.html` — struktur halaman dan komponen UI.
- `css/styles.css` — styling dasar dan layout responsif mobile.
- `js/app.js` — logika aplikasi, Google Maps, CRUD titik, foto, serta impor/ekspor JSON.

## Menjalankan

1. Buka `index.html` melalui browser dengan koneksi internet.
2. Google Maps JavaScript API harus aktif pada Google Cloud project dan API key harus memiliki pembatasan/referrer yang sesuai.
3. Untuk menghindari masalah pembatasan API key saat membuka file langsung, jalankan melalui local server, misalnya ekstensi Live Server atau `python -m http.server`.

## Tampilan mobile

- Peta memenuhi layar.
- Daftar titik muncul sebagai panel bawah yang dapat diciutkan/dibuka.
- Tombol lokasi dan tambah titik menyesuaikan posisi panel.
- Modal form dan area sentuh dibuat lebih nyaman untuk layar kecil.

## Catatan keamanan

API key Google Maps yang ditanam di HTML/JavaScript dapat dilihat oleh pengunjung. Batasi key berdasarkan HTTP referrer dan API yang diizinkan di Google Cloud Console. Jika key yang ada pernah terekspos secara publik, pertimbangkan untuk merotasi key tersebut.
