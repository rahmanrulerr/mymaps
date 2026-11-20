    window.initPetaKu = function () {
      // ==========================================
      // KONFIGURASI & STATE APLIKASI
      // ==========================================
      const STORAGE_KEY = 'petaku_saved_markers_v1';

      const CATEGORY_COLORS = {
        Umum: '#3b82f6',    // Blue
        Kuliner: '#f97316', // Orange
        Wisata: '#10b981',  // Emerald
        Penting: '#f43f5e', // Rose
        Bisnis: '#a855f7'   // Purple
      };

      let markersData = [];
      let googleMarkers = {};
      let activeCategoryFilter = 'all';
      let searchQuery = '';
      let tempClickMarker = null;
      let currentPhotoBase64 = '';

      // Panel daftar titik dapat diciutkan pada layar mobile.
      const mobilePanelToggle = document.getElementById('mobilePanelToggle');
      const sidebar = document.getElementById('sidebar');
      if (mobilePanelToggle && sidebar) {
        mobilePanelToggle.addEventListener('click', () => {
          const collapsed = sidebar.classList.toggle('mobile-collapsed');
          mobilePanelToggle.textContent = collapsed ? 'Tampilkan titik' : 'Sembunyikan';
          mobilePanelToggle.setAttribute('aria-expanded', String(!collapsed));
          mobilePanelToggle.setAttribute('aria-label', collapsed ? 'Tampilkan daftar titik' : 'Ciutkan daftar titik');
          // Google Maps perlu menghitung ulang ukuran viewport setelah panel berubah.
          window.setTimeout(() => google.maps.event.trigger(map, 'resize'), 230);
        });
      }

      // ==========================================
      // INISIALISASI GOOGLE MAPS
      // ==========================================
      const defaultCenter = [-3.3186, 114.5944];
      const map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: defaultCenter[0], lng: defaultCenter[1] },
        zoom: 13,
        mapTypeControl: true,
        mapTypeControlOptions: {
          position: google.maps.ControlPosition.TOP_RIGHT,
          mapTypeIds: ['roadmap', 'satellite', 'terrain', 'hybrid']
        },
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER }
      });

      // ==========================================
      // GENERATOR IKON PIN SVG KUSTOM
      // ==========================================
      function createCustomPinIcon(category) {
        const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Umum;
        const svg = encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 46" width="34" height="44">
            <path d="M18 1C8.6 1 1 8.6 1 18c0 12.2 15.3 26.1 16 26.7.6.5 1.4.5 2 0 .7-.6 16-14.5 16-26.7C35 8.6 27.4 1 18 1z" fill="${color}" stroke="#fff" stroke-width="2.2"/>
            <circle cx="18" cy="17.5" r="6" fill="#fff"/>
          </svg>
        `);
        return {
          url: `data:image/svg+xml;charset=UTF-8,${svg}`,
          scaledSize: new google.maps.Size(34, 44),
          anchor: new google.maps.Point(17, 43)
        };
      }

      // ==========================================
      // KOMPRESI FOTO OTOMATIS (AGAR HEMAT STORAGE)
      // ==========================================
      function compressImageToBase64(file, maxWidth = 800, quality = 0.72) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;

              if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = event.target.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      // ==========================================
      // PENYIMPANAN LOKAL (LOCALSTORAGE)
      // ==========================================
      function loadFromStorage() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            markersData = JSON.parse(raw);
          } else {
            markersData = [
              {
                id: 'sample-1',
                name: 'Menara Pandang Banjarmasin',
                category: 'Wisata',
                lat: -3.3177,
                lng: 114.5925,
                photo: '',
                description: 'Ikon wisata tepi Sungai Martapura. Klik titik ini atau klik peta di mana saja untuk membuat penanda baru!',
                createdAt: new Date().toISOString()
              }
            ];
            saveToStorage();
          }
        } catch (e) {
          console.error('Gagal memuat data:', e);
          markersData = [];
        }
      }

      function saveToStorage() {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(markersData));
          return true;
        } catch (e) {
          showToast('Penyimpanan penuh! Coba hapus foto atau titik lama.');
          return false;
        }
      }

      // ==========================================
      // RENDER MARKER DI PETA & SIDEBAR
      // ==========================================
      function renderAll() {
        Object.values(googleMarkers).forEach(marker => marker.setMap(null));
        googleMarkers = {};

        const filtered = markersData.filter(item => {
          const matchCat = activeCategoryFilter === 'all' || item.category === activeCategoryFilter;
          const q = searchQuery.toLowerCase();
          const matchText =
            item.name.toLowerCase().includes(q) ||
            (item.description && item.description.toLowerCase().includes(q)) ||
            item.category.toLowerCase().includes(q);
          return matchCat && matchText;
        });

        filtered.forEach(item => {
          const marker = new google.maps.Marker({
            position: { lat: item.lat, lng: item.lng },
            map,
            icon: createCustomPinIcon(item.category),
            draggable: true
          });
          const infoWindow = new google.maps.InfoWindow({ content: createPopupHTML(item) });
          marker.addListener('click', () => infoWindow.open({ map, anchor: marker }));

          marker.addListener('dragend', function (e) {
            const newPos = e.latLng;
            const idx = markersData.findIndex(m => m.id === item.id);
            if (idx !== -1) {
              markersData[idx].lat = parseFloat(newPos.lat().toFixed(6));
              markersData[idx].lng = parseFloat(newPos.lng().toFixed(6));
              saveToStorage();
              infoWindow.setContent(createPopupHTML(markersData[idx]));
              renderSidebarList(filtered);
              showToast('Koordinat titik diperbarui');
            }
          });

          googleMarkers[item.id] = marker;
        });

        renderSidebarList(filtered);
        document.getElementById('markerCountBadge').textContent = `${markersData.length} Titik`;
      }

      function createPopupHTML(item) {
        const color = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Umum;
        const safeName = escapeHTML(item.name);
        const safeDesc = item.description ? escapeHTML(item.description) : '<span class="italic text-slate-400">Tidak ada catatan</span>';
        const photoSection = item.photo
          ? `<img src="${item.photo}" alt="${safeName}" class="w-full h-32 object-cover border-b border-slate-100" />`
          : '';

        return `
          <div class="w-64 text-slate-800 overflow-hidden">
            ${photoSection}
            <div class="p-3.5">
              <div class="flex items-center gap-1.5 mb-1">
                <span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${color}"></span>
                <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">${escapeHTML(item.category)}</span>
              </div>
              <h3 class="font-bold text-sm text-slate-900 leading-snug mb-1">${safeName}</h3>
              <p class="text-xs text-slate-600 leading-relaxed mb-2.5">${safeDesc}</p>
              <div class="text-[11px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100 mb-3">
                ${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}
              </div>
              <div class="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                <button onclick="openEditModal('${item.id}')" class="flex-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition">
                  Edit
                </button>
                <button onclick="deleteMarker('${item.id}')" class="flex-1 py-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg transition">
                  Hapus
                </button>
              </div>
            </div>
          </div>
        `;
      }

      function renderSidebarList(items) {
        const container = document.getElementById('markerList');
        if (items.length === 0) {
          container.innerHTML = `
            <div class="text-center py-10 px-4">
              <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
              </div>
              <p class="text-sm font-semibold text-slate-600">Belum ada titik ditemukan</p>
              <p class="text-xs text-slate-400 mt-1">Klik di mana saja pada peta untuk menandai lokasi baru.</p>
            </div>
          `;
          return;
        }

        container.innerHTML = items.map(item => {
          const color = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Umum;
          const thumbHTML = item.photo
            ? `<img src="${item.photo}" alt="${escapeHTML(item.name)}" class="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0" />`
            : '';

          return `
            <div onclick="focusMarker('${item.id}')" class="group p-3 bg-white hover:bg-blue-50/40 border border-slate-200/90 hover:border-blue-300 rounded-xl cursor-pointer transition shadow-2xs flex gap-2.5 items-start">
              ${thumbHTML}
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="w-3 h-3 rounded-full shrink-0" style="background:${color}"></span>
                    <h4 class="font-semibold text-sm text-slate-800 truncate group-hover:text-blue-700 transition">${escapeHTML(item.name)}</h4>
                  </div>
                  <div class="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition shrink-0" onclick="event.stopPropagation()">
                    <button onclick="openEditModal('${item.id}')" title="Edit" class="p-1 text-slate-400 hover:text-blue-600 rounded">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button onclick="deleteMarker('${item.id}')" title="Hapus" class="p-1 text-slate-400 hover:text-rose-600 rounded">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="pl-5 mt-1">
                  <span class="inline-block text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 mb-1">${escapeHTML(item.category)}</span>
                  ${item.description ? `<p class="text-xs text-slate-500 line-clamp-2">${escapeHTML(item.description)}</p>` : ''}
                  <p class="text-[10px] font-mono text-slate-400 mt-1.5">📍 ${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}</p>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

      // ==========================================
      // INTERAKSI UPLOAD FOTO DI MODAL
      // ==========================================
      const photoUploadBox = document.getElementById('photoUploadBox');
      const pointPhotoInput = document.getElementById('pointPhotoInput');
      const photoPlaceholder = document.getElementById('photoPlaceholder');
      const photoPreviewWrapper = document.getElementById('photoPreviewWrapper');
      const photoPreviewImg = document.getElementById('photoPreviewImg');
      const removePhotoBtn = document.getElementById('removePhotoBtn');

      function setPhotoPreview(base64Str) {
        currentPhotoBase64 = base64Str || '';
        if (currentPhotoBase64) {
          photoPreviewImg.src = currentPhotoBase64;
          photoPlaceholder.classList.add('hidden');
          photoPreviewWrapper.classList.remove('hidden');
        } else {
          photoPreviewImg.src = '';
          photoPreviewWrapper.classList.add('hidden');
          photoPlaceholder.classList.remove('hidden');
          pointPhotoInput.value = '';
        }
      }

      photoUploadBox.addEventListener('click', (e) => {
        if (e.target.closest('#removePhotoBtn')) return;
        pointPhotoInput.click();
      });

      pointPhotoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
          showToast('File harus berupa gambar');
          return;
        }

        try {
          const compressed = await compressImageToBase64(file);
          setPhotoPreview(compressed);
        } catch (err) {
          showToast('Gagal memproses gambar');
        }
      });

      removePhotoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setPhotoPreview('');
      });

      // ==========================================
      // INTERAKSI PETA & MODAL FORM
      // ==========================================
      const modal = document.getElementById('markerModal');
      const markerForm = document.getElementById('markerForm');

      map.addListener('click', function (e) {
        openAddModal(e.latLng.lat(), e.latLng.lng());
      });

      function openAddModal(lat, lng) {
        document.getElementById('modalTitle').textContent = 'Tambah Titik Lokasi';
        document.getElementById('editMarkerId').value = '';
        document.getElementById('pointName').value = '';
        document.getElementById('pointDesc').value = '';
        document.getElementById('pointLat').value = lat.toFixed(6);
        document.getElementById('pointLng').value = lng.toFixed(6);
        document.querySelector('input[name="pointCategory"][value="Umum"]').checked = true;
        setPhotoPreview('');

        if (tempClickMarker) tempClickMarker.setMap(null);
        tempClickMarker = new google.maps.Marker({
          position: { lat, lng },
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#3b82f6',
            fillOpacity: 0.5,
            strokeColor: '#2563eb',
            strokeWeight: 2
          }
        });

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => document.getElementById('pointName').focus(), 50);
      }

      window.openEditModal = function (id) {
        const item = markersData.find(m => m.id === id);
        if (!item) return;

        document.getElementById('modalTitle').textContent = 'Edit Titik Lokasi';
        document.getElementById('editMarkerId').value = item.id;
        document.getElementById('pointName').value = item.name;
        document.getElementById('pointDesc').value = item.description || '';
        document.getElementById('pointLat').value = item.lat;
        document.getElementById('pointLng').value = item.lng;
        setPhotoPreview(item.photo || '');

        const radio = document.querySelector(`input[name="pointCategory"][value="${item.category}"]`);
        if (radio) radio.checked = true;

        modal.classList.remove('hidden');
        modal.classList.add('flex');
      };

      function closeModal() {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        setPhotoPreview('');
        if (tempClickMarker) {
          tempClickMarker.setMap(null);
          tempClickMarker = null;
        }
      }

      document.getElementById('closeModalBtn').addEventListener('click', closeModal);
      document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      markerForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const id = document.getElementById('editMarkerId').value;
        const name = document.getElementById('pointName').value.trim();
        const category = document.querySelector('input[name="pointCategory"]:checked').value;
        const lat = parseFloat(document.getElementById('pointLat').value);
        const lng = parseFloat(document.getElementById('pointLng').value);
        const description = document.getElementById('pointDesc').value.trim();
        const photo = currentPhotoBase64;

        if (!name || isNaN(lat) || isNaN(lng)) return;

        const backupData = JSON.parse(JSON.stringify(markersData));

        if (id) {
          const idx = markersData.findIndex(m => m.id === id);
          if (idx !== -1) {
            markersData[idx] = { ...markersData[idx], name, category, lat, lng, description, photo };
          }
        } else {
          const newMarker = {
            id: 'pt-' + Date.now(),
            name,
            category,
            lat,
            lng,
            photo,
            description,
            createdAt: new Date().toISOString()
          };
          markersData.unshift(newMarker);
        }

        if (!saveToStorage()) {
          markersData = backupData;
          return;
        }

        showToast(id ? 'Titik berhasil diperbarui' : 'Titik baru ditambahkan');
        closeModal();
        renderAll();
      });

      window.deleteMarker = function (id) {
        markersData = markersData.filter(m => m.id !== id);
        saveToStorage();
        renderAll();
        showToast('Titik dihapus');
      };

      window.focusMarker = function (id) {
        const item = markersData.find(m => m.id === id);
        if (!item) return;
        map.setCenter({ lat: item.lat, lng: item.lng });
        map.setZoom(16);
        const marker = googleMarkers[id];
        if (marker) {
          google.maps.event.trigger(marker, 'click');
        }
      };

      // ==========================================
      // FILTER SIDEBAR & PENCARIAN LOKASI GLOBAL
      // ==========================================
      document.getElementById('filterInput').addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderAll();
      });

      document.querySelectorAll('.cat-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.cat-filter-btn').forEach(b => {
            b.classList.remove('bg-blue-600', 'text-white');
            b.classList.add('bg-white', 'text-slate-600', 'border', 'border-slate-200');
          });
          btn.classList.remove('bg-white', 'text-slate-600', 'border', 'border-slate-200');
          btn.classList.add('bg-blue-600', 'text-white');
          activeCategoryFilter = btn.dataset.cat;
          renderAll();
        });
      });

      document.getElementById('geoSearchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = document.getElementById('geoSearchInput').value.trim();
        if (!query) return;

        const coordMatch = query.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
        if (coordMatch) {
          const lat = parseFloat(coordMatch[1]);
          const lng = parseFloat(coordMatch[3]);
          if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            map.setCenter({ lat, lng });
            map.setZoom(15);
            openAddModal(lat, lng);
            return;
          }
        }

        const btn = document.getElementById('geoSearchBtn');
        btn.textContent = '...';
        btn.disabled = true;

        try {
          const geocoder = new google.maps.Geocoder();
          geocoder.geocode({ address: query }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
              const location = results[0].geometry.location;
              map.setCenter(location);
              map.setZoom(14);
              showToast(`Ditemukan: ${results[0].formatted_address}`);
            } else {
              showToast('Lokasi tidak ditemukan');
            }
            btn.textContent = 'Cari';
            btn.disabled = false;
          });
        } catch (err) {
          showToast('Gunakan format koordinat: lat, lng');
          btn.textContent = 'Cari';
          btn.disabled = false;
        }
      });

      // ==========================================
      // GEOLOCATION & TOMBOL BANTUAN
      // ==========================================
      document.getElementById('locateMeBtn').addEventListener('click', () => {
        if (!navigator.geolocation) {
          showToast('Browser tidak mendukung GPS');
          return;
        }
        showToast('Mencari posisi Anda...');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            map.setCenter({ lat: latitude, lng: longitude });
            map.setZoom(16);
            const locationMarker = new google.maps.Marker({
              position: { lat: latitude, lng: longitude },
              map,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: '#2563eb',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2
              },
              title: 'Posisi Anda saat ini'
            });
            new google.maps.InfoWindow({
              content: 'Posisi Anda saat ini'
            }).open({ map, anchor: locationMarker });
          },
          () => {
            showToast('Izin lokasi ditolak atau tidak tersedia');
          }
        );
      });

      document.getElementById('addCenterBtn').addEventListener('click', () => {
        const center = map.getCenter();
        openAddModal(center.lat(), center.lng());
      });

      // ==========================================
      // EKSPOR, IMPOR JSON & HAPUS SEMUA
      // ==========================================
      document.getElementById('exportBtn').addEventListener('click', () => {
        if (markersData.length === 0) {
          showToast('Tidak ada data titik untuk diekspor');
          return;
        }
        const dataStr = JSON.stringify(markersData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `petaku-titik-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('File JSON berhasil diunduh');
      });

      document.getElementById('importInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
          try {
            const imported = JSON.parse(event.target.result);
            if (!Array.isArray(imported)) throw new Error('Format JSON harus berupa array');

            let addedCount = 0;
            imported.forEach(item => {
              if (item.name && typeof item.lat === 'number' && typeof item.lng === 'number') {
                markersData.push({
                  id: item.id || 'pt-' + Date.now() + Math.random().toString(36).slice(2, 6),
                  name: String(item.name),
                  category: CATEGORY_COLORS[item.category] ? item.category : 'Umum',
                  lat: item.lat,
                  lng: item.lng,
                  photo: typeof item.photo === 'string' && item.photo.startsWith('data:image/') ? item.photo : '',
                  description: item.description ? String(item.description) : '',
                  createdAt: item.createdAt || new Date().toISOString()
                });
                addedCount++;
              }
            });

            if (saveToStorage()) {
              renderAll();
              if (markersData.length > 0) {
                const bounds = new google.maps.LatLngBounds();
                markersData.forEach(item => bounds.extend({ lat: item.lat, lng: item.lng }));
                map.fitBounds(bounds);
              }
              showToast(`Berhasil mengimpor ${addedCount} titik`);
            }
          } catch (err) {
            showToast('File JSON tidak valid');
          }
          e.target.value = '';
        };
        reader.readAsText(file);
      });

      document.getElementById('clearAllBtn').addEventListener('click', () => {
        if (markersData.length === 0) return;
        if (confirm('Hapus semua titik yang tersimpan di browser ini?')) {
          markersData = [];
          saveToStorage();
          renderAll();
          showToast('Semua data titik dihapus');
        }
      });

      // ==========================================
      // UTILITAS
      // ==========================================
      function escapeHTML(str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      let toastTimeout;
      function showToast(msg) {
        const toast = document.getElementById('toast');
        document.getElementById('toastMessage').textContent = msg;
        toast.classList.remove('translate-x-full', 'opacity-0');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
          toast.classList.add('translate-x-full', 'opacity-0');
        }, 2800);
      }

      // Jalankan Aplikasi
      loadFromStorage();
      renderAll();
    };

    // API Key otomatis dimuat saat halaman dibuka
    const GOOGLE_MAPS_API_KEY = 'AIzaSyAWZ3tvL2nBqWWzwQzZcXbsFZUWIZSCzZI';
    const googleMapsKeyNotice = document.getElementById('googleMapsKeyNotice');
    const googleMapsKeyMessage = document.getElementById('googleMapsKeyMessage');

    function showGoogleMapsKeyNotice(message) {
      if (message) googleMapsKeyMessage.textContent = message;
      googleMapsKeyNotice.classList.remove('hidden');
    }

    function loadGoogleMaps(apiKey) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=initPetaKu`;
      script.async = true;
      script.onerror = () => {
        showGoogleMapsKeyNotice('Google Maps gagal dimuat. Periksa koneksi internet dan API key Anda.');
      };
      document.head.appendChild(script);
    }

    window.gm_authFailure = () => {
      showGoogleMapsKeyNotice('Google menolak API key. Pastikan Maps JavaScript API aktif, billing tersedia, dan pembatasan key mengizinkan situs ini.');
    };

    loadGoogleMaps(GOOGLE_MAPS_API_KEY);