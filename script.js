(function () {
    const orig = console.error;
    console.error = function (...args) {
        if (args[0] && typeof args[0] === 'string' && args[0].includes('Expected number')) {
            return;
        }
        orig.apply(console, args);
    };
    window.onerror = function () { return true; };
})();

const api = './api.php';
const ACCESS_KEY = '565';
const DELETION_KEY = '0101';
let fullList = [];
let pendingDeleteId = null;
let intervalId = null;

function startPolling(refreshFn) {
    stopPolling();
    intervalId = setInterval(refreshFn, 60000);
}

function stopPolling() {
    if (intervalId !== null) clearInterval(intervalId);
    intervalId = null;
}

document.getElementById('submitAccess').onclick = () => {
    if (document.getElementById('accessInput').value === ACCESS_KEY) {
        document.getElementById('loginOverlay').classList.add('hidden');
        document.getElementById('mainContent').classList.remove('hidden');
        initApp();
    } else {
        document.getElementById('errorMsg').classList.remove('hidden');
    }
};
document.getElementById('accessInput').addEventListener('keypress', e => { if (e.key === 'Enter') document.getElementById('submitAccess').click(); });

function toast(msg, d = 3000) {
    const c = document.getElementById('toast-container');
    const e = document.createElement('div');
    e.className = 'toast';
    e.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()">×</button>`;
    c.appendChild(e);
    setTimeout(() => e.remove(), d);
}

function confirmDialog(msg) {
    return new Promise(resolve => {
        const ov = document.getElementById('confirmOverlay');
        document.getElementById('confirmMsg').textContent = msg;
        ov.classList.remove('hidden');
        document.getElementById('confirmOk').onclick = () => { ov.classList.add('hidden'); resolve(true); };
        document.getElementById('confirmCancel').onclick = () => { ov.classList.add('hidden'); resolve(false); };
    });
}

async function applyConfig() {
    try {
        const response = await fetch(`${api}?action=get_config`);
        const config = await response.json();
        document.getElementById('appHeaderTitle').textContent = config.headerTitle || 'Buscador';
        const appLogo = document.getElementById('appLogo');
        if (appLogo && config.logoPath) {
            appLogo.src = config.logoPath;
            appLogo.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error al cargar la configuración:', error);
    }
}

function initApp() {
    applyConfig();
    const deleteKeyInput = document.getElementById('deleteKeyInput');

    document.getElementById('deleteKeyOk').onclick = async () => {
        if (deleteKeyInput.value !== DELETION_KEY) {
            document.getElementById('deleteKeyError').classList.remove('hidden');
            deleteKeyInput.value = '';
            deleteKeyInput.focus();
            return;
        }
        document.getElementById('deleteOverlay').classList.add('hidden');
        document.getElementById('deleteKeyError').classList.add('hidden');
        deleteKeyInput.value = '';
        const ok = await confirmDialog('¿Está seguro de eliminar este documento?');
        if (ok) {
            await deleteDoc(pendingDeleteId);
        }
    };
    document.getElementById('deleteKeyCancel').onclick = () => {
        document.getElementById('deleteOverlay').classList.add('hidden');
        document.getElementById('deleteKeyError').classList.add('hidden');
        deleteKeyInput.value = '';
    };
    document.getElementById('highlightResultClose').onclick = () => {
        document.getElementById('highlightResultOverlay').classList.add('hidden');
    };

    async function refreshList() {
        try {
            const response = await fetch(`${api}?action=list`);
            const json = await response.json();
            fullList = json.data || [];
            if (document.querySelector('.tab.active').dataset.tab === 'tab-list') {
                doConsultFilter();
            }
        } catch (error) {
            console.error("Error al refrescar:", error);
            toast("No se pudo conectar al servidor.");
        }
    }

    refreshList();
    startPolling(refreshList);

    document.querySelectorAll('.tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.remove('hidden');
            if (tab.dataset.tab === 'tab-list') {
                refreshList();
                startPolling(refreshList);
            } else {
                stopPolling();
            }
            if (tab.dataset.tab === 'tab-search') clearSearch();
            if (tab.dataset.tab === 'tab-code') clearCode();
        };
    });
    document.querySelector('.tab.active').click();
}

// ===== FUNCIÓN RENDER MODIFICADA Y REFORZADA =====
function render(items, containerId, isSearchResult) {
    const container = document.getElementById(containerId);
    if (!items || items.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No se encontraron documentos.</p>';
        return;
    }
    container.innerHTML = items.map(item => {
        // Asegura que 'codes' sea siempre un array para evitar errores.
        const codesArray = Array.isArray(item.codes) ? item.codes : [];
        const codesStringForHighlight = codesArray.join(',');
        const codesStringForDisplay = codesArray.join('\n');

        let actionButtons = '';
        if (isSearchResult) {
            actionButtons = `<button onclick="highlightPdf(${item.id}, '${codesStringForHighlight}')" class="btn btn--dark px-2 py-1 text-base">Resaltar Códigos</button>`;
        } else {
            actionButtons = `
                <button onclick="editDoc(${item.id})" class="btn btn--warning px-2 py-1 text-base">Editar</button>
                <button onclick="requestDelete(${item.id})" class="btn btn--primary px-2 py-1 text-base">Eliminar</button>
            `;
        }

        return `
            <div class="border rounded p-4 bg-gray-50">
                <div class="flex justify-between items-start">
                    <div class="flex-grow">
                        <h3 class="font-semibold text-lg">${item.name}</h3>
                        <p class="text-gray-600">${item.date}</p>
                        <p class="text-gray-600 text-sm">Archivo: ${item.path}</p>
                        <a href="uploads/${item.path}" target="_blank" class="text-indigo-600 underline">Ver PDF Original</a>
                    </div>
                    <div class="button-group text-right ml-4">
                        ${actionButtons}
                        <button data-id="${item.id}" onclick="toggleCodes(this)" class="btn btn--secondary px-2 py-1 text-base">Ver Códigos</button>
                    </div>
                </div>
                <pre id="codes${item.id}" class="mt-2 p-2 bg-white rounded hidden whitespace-pre-wrap">${codesStringForDisplay}</pre>
            </div>`;
    }).join('');
}
// ===== FIN DE LA FUNCIÓN MODIFICADA =====

function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('results-search').innerHTML = '';
    document.getElementById('search-alert').innerText = '';
}

async function doSearch() {
    const rawInput = document.getElementById('searchInput').value.trim();
    if (!rawInput) return;
    const codes = [...new Set(
        rawInput
            .split(/\\r?\\n/)
            .map(line => line.trim().split(/\\s+/)[0])
            .filter(Boolean)
    )];
    const formData = new FormData();
    formData.append('action', 'search');
    formData.append('codes', codes.join('\n'));
    const response = await fetch(api, { method: 'POST', body: formData });
    const data = await response.json();
    const foundCodes = new Set(data.flatMap(doc => doc.codes || []));
    const missingCodes = codes.filter(c => !foundCodes.has(c));
    document.getElementById('search-alert').innerText = missingCodes.length ? 'No encontrados: ' + missingCodes.join(', ') : '';
    render(data, 'results-search', true);
}

document.getElementById('form-upload').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.file.files[0] && form.file.files[0].size > 10 * 1024 * 1024) {
        document.getElementById('uploadWarning').classList.remove('hidden');
        return;
    }
    document.getElementById('uploadWarning').classList.add('hidden');
    let codesArray = form.codes.value.split(/\\r?\\n/).map(s => s.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    form.codes.value = codesArray.join('\n');
    const formData = new FormData(form);
    formData.append('action', form.id.value ? 'edit' : 'upload');
    const response = await fetch(api, { method: 'POST', body: formData });
    const json = await response.json();
    toast(json.message || json.error);
    form.reset();
    document.getElementById('docId').value = '';
    document.querySelector('[data-tab="tab-list"]').click();
};

function clearConsultFilter() {
    document.getElementById('consultFilterInput').value = '';
    doConsultFilter();
}

function doConsultFilter() {
    const term = document.getElementById('consultFilterInput').value.trim().toLowerCase();
    const filtered = fullList.filter(doc => doc.name.toLowerCase().includes(term) || doc.path.toLowerCase().includes(term));
    render(filtered, 'results-list', false);
}

function downloadCsv() {
    let csv = 'Código,Documento\\n';
    fullList.forEach(doc => {
        if (doc.codes && doc.codes.length) {
            doc.codes.forEach(code => {
                csv += `"${code.replace(/"/g, '""')}","${doc.name.replace(/"/g, '""')}"\\n`;
            });
        }
    });
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'documentos.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function downloadPdfs() {
    window.location.href = `${api}?action=download_pdfs`;
}

(function () {
    const codeInput = document.getElementById('codeInput');
    const suggestions = document.getElementById('suggestions');
    let timeoutId;
    codeInput.addEventListener('input', () => {
        clearTimeout(timeoutId);
        const term = codeInput.value.trim();
        if (!term) {
            suggestions.classList.add('hidden');
            return;
        }
        timeoutId = setTimeout(async () => {
            const response = await fetch(`${api}?action=suggest&term=${encodeURIComponent(term)}`);
            const data = await response.json();
            if (data.length) {
                suggestions.innerHTML = data.map(code => `<div class="py-1 px-2 hover:bg-gray-100 cursor-pointer" data-code="${code}">${code}</div>`).join('');
                suggestions.classList.remove('hidden');
            } else {
                suggestions.classList.add('hidden');
            }
        }, 200);
    });
    suggestions.addEventListener('click', e => {
        const code = e.target.dataset.code;
        if (code) {
            codeInput.value = code;
            suggestions.classList.add('hidden');
            doCodeSearch();
        }
    });
    document.addEventListener('click', (e) => {
        if (!suggestions.contains(e.target) && e.target !== codeInput) {
            suggestions.classList.add('hidden');
        }
    });
})();

function clearCode() {
    document.getElementById('codeInput').value = '';
    document.getElementById('results-code').innerHTML = '';
}

async function doCodeSearch() {
    const code = document.getElementById('codeInput').value.trim();
    if (!code) return;
    const formData = new FormData();
    formData.append('action', 'search_by_code');
    formData.append('code', code);
    const response = await fetch(api, { method: 'POST', body: formData });
    const data = await response.json();
    render(data, 'results-code', true);
}

function editDoc(id) {
    const doc = fullList.find(d => d.id === id);
    if (doc) {
        document.querySelector('[data-tab="tab-upload"]').click();
        document.getElementById('docId').value = doc.id;
        document.getElementById('name').value = doc.name;
        document.getElementById('date').value = doc.date;
        document.getElementById('codes').value = (doc.codes || []).join('\\n');
    }
}

async function deleteDoc(id) {
    const response = await fetch(`${api}?action=delete&id=${id}`);
    const json = await response.json();
    toast(json.message || json.error);
    document.querySelector('.tab.active').click();
}

function requestDelete(id) {
    pendingDeleteId = id;
    document.getElementById('deleteOverlay').classList.remove('hidden');
    document.getElementById('deleteKeyInput').focus();
}

function toggleCodes(btn) {
    const id = btn.dataset.id;
    const pre = document.getElementById(`codes${id}`);
    const isHidden = pre.classList.toggle('hidden');
    btn.textContent = isHidden ? 'Ver Códigos' : 'Ocultar Códigos';
}

async function highlightPdf(docId, codes) {
    if (!codes) {
        toast('Este documento no tiene códigos para resaltar.');
        return;
    }
    toast('Procesando PDF, por favor espera...');
    const formData = new FormData();
    formData.append('action', 'highlight_pdf');
    formData.append('id', docId);
    formData.append('codes', codes);
    try {
        const response = await fetch(api, { method: 'POST', body: formData });
        if (!response.ok || !response.headers.get('Content-Type')?.includes('application/pdf')) {
            const error = await response.json();
            throw new Error(error.error || 'Error al procesar el PDF.');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        let pagesFound = [];
        const pagesHeader = response.headers.get('X-Pages-Found');
        if (pagesHeader) {
            try { pagesFound = JSON.parse(pagesHeader); }
            catch (e) { console.error("Error al parsear X-Pages-Found:", e); }
        }
        const resultModal = document.getElementById('highlightResultOverlay');
        const resultContent = document.getElementById('highlightResultContent');
        let pagesHtml = '<p class="font-semibold">No se encontraron los códigos en el contenido del PDF.</p><p>Puedes descargar el archivo para revisarlo.</p>';
        if (pagesFound.length > 0) {
            pagesHtml = `<p class="font-semibold">Códigos encontrados en las páginas:</p><ul class="list-disc list-inside mt-2"><li>${pagesFound.join('</li><li>')}</li></ul>`;
        }
        resultContent.innerHTML = `
            <p class="mb-4">El PDF resaltado se ha abierto en una nueva pestaña.</p>
            <div class="mt-4 p-2 bg-gray-100 rounded">${pagesHtml}</div>
            <a href="${url}" download="resaltado.pdf" class="btn btn--secondary btn--full mt-4">Descargar de nuevo</a>
        `;
        resultModal.classList.remove('hidden');
    } catch (error) {
        console.error('Error en highlightPdf:', error);
        toast('Error: ' + error.message);
    }
}