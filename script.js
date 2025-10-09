// script.js
// Versión 4.0: Implementado modal de confirmación para el resaltado.

(function () {
    const orig = console.error;
    console.error = function (...args) {
        if (args[0] && typeof args[0] === 'string' && args[0].includes('Expected number')) {
            return;
        }
        orig.apply(console, args);
    };
})();

const api = './api.php';
const ACCESS_KEY = '565';
const DELETION_KEY = '0101';
let fullList = [];
let pendingDeleteId = null;
let intervalId = null;

// --- FUNCIONES UTILITARIAS ---
function startPolling(refreshFn) { stopPolling(); intervalId = setInterval(refreshFn, 60000); }
function stopPolling() { if (intervalId !== null) clearInterval(intervalId); intervalId = null; }
function toast(msg, type = 'info', d = 4000) { const c = document.getElementById('toast-container'); if (!c) return; const e = document.createElement('div'); e.className = `toast ${type}`; e.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()">×</button>`; c.appendChild(e); setTimeout(() => e.remove(), d); }
function confirmDialog(msg) { return new Promise(resolve => { const ov = document.getElementById('confirmOverlay'); document.getElementById('confirmMsg').textContent = msg; ov.classList.remove('hidden'); document.getElementById('confirmOk').onclick = () => { ov.classList.add('hidden'); resolve(true); }; document.getElementById('confirmCancel').onclick = () => { ov.classList.add('hidden'); resolve(false); }; }); }
async function handleApiResponse(response) { const json = await response.json(); if (response.ok && json.success) { if (json.message) toast(json.message, 'success'); return json; } else { const errorMessage = json.message || 'Ocurrió un error inesperado en el servidor.'; const errorDetails = json.details || 'No hay detalles técnicos disponibles.'; toast(errorMessage, 'error'); console.error("Error de API:", errorMessage, "\nDetalles:", errorDetails); return Promise.reject(json); } }
async function applyConfig() { try { const response = await fetch(`${api}?action=get_config`); const config = await response.json(); const titleEl = document.getElementById('appHeaderTitle'); if (titleEl) titleEl.textContent = config.headerTitle || 'Buscador'; const appLogo = document.getElementById('appLogo'); if (appLogo && config.logoPath) { appLogo.src = config.logoPath; appLogo.classList.remove('hidden'); } } catch (error) { console.error('Error al cargar la configuración:', error); } }

// --- LÓGICA DE LA APLICACIÓN ---

function initApp() {
    applyConfig();
    
    const mainContent = document.getElementById('mainContent');
    if (mainContent) {
        mainContent.addEventListener('click', (event) => {
            const target = event.target.closest('button');
            if (!target) return;

            if (target.classList.contains('btn-highlight')) {
                const docId = target.dataset.id;
                const codes = target.dataset.codes;
                const docName = target.dataset.docname;
                const pdfPath = target.dataset.pdfpath;
                showHighlightConfirmation(docId, codes, docName, pdfPath);
            }
            
            if (target.classList.contains('btn-toggle-codes')) {
                toggleCodes(target);
            }
        });
    }

    const highlightConfirmCancel = document.getElementById('highlightConfirmCancel');
    if (highlightConfirmCancel) {
        highlightConfirmCancel.onclick = () => {
            document.getElementById('highlightConfirmOverlay').classList.add('hidden');
        };
    }

    const deleteKeyInput = document.getElementById('deleteKeyInput');
    const deleteKeyOk = document.getElementById('deleteKeyOk');
    if(deleteKeyOk){ 
        deleteKeyOk.onclick = async () => { 
            if (deleteKeyInput.value !== DELETION_KEY) { 
                document.getElementById('deleteKeyError').classList.remove('hidden');
                deleteKeyInput.value = ''; 
                deleteKeyInput.focus();
                return; 
            } 
            document.getElementById('deleteOverlay').classList.add('hidden'); 
            document.getElementById('deleteKeyError').classList.add('hidden');
            deleteKeyInput.value = '';
            const ok = await confirmDialog('¿Está seguro de eliminar este documento? Esta acción no se puede deshacer.'); 
            if (ok) await deleteDoc(pendingDeleteId); 
        }; 
    }
    
    const deleteKeyCancel = document.getElementById('deleteKeyCancel');
    if(deleteKeyCancel){
        deleteKeyCancel.onclick = () => {
            document.getElementById('deleteOverlay').classList.add('hidden');
            document.getElementById('deleteKeyError').classList.add('hidden');
            deleteKeyInput.value = '';
        };
    }
    
    const highlightClose = document.getElementById('highlightResultClose'); 
    if (highlightClose) { 
        highlightClose.onclick = () => { 
            document.getElementById('highlightResultOverlay').classList.add('hidden'); 
        }; 
    }

    async function refreshList() { 
        try { 
            const response = await fetch(`${api}?action=list`); 
            const json = await handleApiResponse(response); 
            fullList = json.data || []; 
            const activeTab = document.querySelector('.tab.active');
            if (activeTab && activeTab.dataset.tab === 'tab-list') {
                doConsultFilter();
            }
        } catch (error) { 
            console.error('Error al refrescar lista:', error); 
        } 
    }
    refreshList();
    startPolling(refreshList);
    
    document.querySelectorAll('.tab').forEach(tab => { 
        tab.onclick = () => { 
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); 
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden')); 
            tab.classList.add('active'); 
            const tabContent = document.getElementById(tab.dataset.tab);
            if(tabContent) tabContent.classList.remove('hidden'); 
            if (tab.dataset.tab === 'tab-list') { 
                refreshList(); 
                startPolling(refreshList); 
            } else { 
                stopPolling(); 
            } 
            if (tab.dataset.tab === 'tab-upload' && !document.getElementById('docId').value) {
                clearUploadForm();
            }
        }; 
    });
    const firstTab = document.querySelector('.tab.active');
    if (firstTab) firstTab.click();
}

function render(items, containerId, isSearchResult) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!items || items.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No se encontraron documentos.</p>';
        return;
    }
    
    container.innerHTML = items.map(item => {
        const codesArray = Array.isArray(item.codes) ? item.codes : [];
        const codesStringForDisplay = codesArray.join('\n');
        
        let actionButtons = '';
        if (isSearchResult) {
            if (codesArray.length > 0) {
                const codesStringForDataAttr = codesArray.join(',');
                const escapedCodes = codesStringForDataAttr.replace(/"/g, '&quot;');
                actionButtons = `<button class="btn btn--dark px-2 py-1 text-base btn-highlight" 
                    data-id="${item.id}" 
                    data-codes="${escapedCodes}"
                    data-docname="${item.name.replace(/"/g, '&quot;')}"
                    data-pdfpath="${item.path.replace(/"/g, '&quot;')}">
                    Preparar Resaltado
                </button>`;
            }
        } else {
            actionButtons = `<button onclick="editDoc(${item.id})" class="btn btn--warning px-2 py-1 text-base">Editar</button> <button onclick="requestDelete(${item.id})" class="btn btn--primary px-2 py-1 text-base">Eliminar</button>`;
        }

        return `<div class="border rounded p-4 bg-gray-50"><div class="flex justify-between items-start"><div class="flex-grow"><h3 class="font-semibold text-lg">${item.name}</h3><p class="text-gray-600">${item.date}</p><p class="text-gray-600 text-sm">Archivo: ${item.path}</p><a href="uploads/${item.path}" target="_blank" class="text-indigo-600 underline">Ver PDF Original</a></div><div class="button-group text-right ml-4">${actionButtons} <button class="btn btn--secondary px-2 py-1 text-base btn-toggle-codes" data-id="${item.id}">Ver Códigos</button></div></div><pre id="codes${item.id}" class="mt-2 p-2 bg-white rounded hidden whitespace-pre-wrap">${codesStringForDisplay}</pre></div>`;
    }).join('');
}

function showHighlightConfirmation(docId, codes, docName, pdfPath) {
    console.log("Paso 1: Mostrando modal de confirmación con:", { docId, codes, docName, pdfPath });

    if (!docId || !codes || codes.trim() === "") {
        toast('Error: Faltan datos en el documento para poder resaltar.', 'error');
        console.error("showHighlightConfirmation bloqueado por falta de datos.");
        return;
    }
    
    document.getElementById('highlightConfirmDocName').textContent = docName;
    document.getElementById('highlightConfirmPdfPath').textContent = pdfPath;
    document.getElementById('highlightConfirmCodes').textContent = codes.replace(/,/g, '\n');
    
    const okButton = document.getElementById('highlightConfirmOk');
    okButton.onclick = () => {
        document.getElementById('highlightConfirmOverlay').classList.add('hidden');
        highlightPdf(docId, codes);
    };
    
    document.getElementById('highlightConfirmOverlay').classList.remove('hidden');
}

async function highlightPdf(docId, codes) {
    console.log("Paso 2: Datos confirmados. Enviando al servidor...", { docId, codes });
    toast('Procesando PDF, por favor espera...', 'info');
    
    const formData = new FormData();
    formData.append('action', 'highlight_pdf');
    formData.append('id', docId);
    formData.append('codes', codes);

    try {
        const response = await fetch(api, { method: 'POST', body: formData });
        const contentType = response.headers.get('Content-Type');
        
        if (response.ok && contentType && contentType.includes('application/pdf')) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
            
            let pagesFound = [];
            const pagesHeader = response.headers.get('X-Pages-Found');
            if (pagesHeader) { try { pagesFound = JSON.parse(pagesHeader); } catch (e) { console.error("Error al parsear X-Pages-Found:", e); } }
            
            const resultModal = document.getElementById('highlightResultOverlay');
            const resultContent = document.getElementById('highlightResultContent');
            
            let pagesHtml = '<p class="font-semibold">No se encontraron los códigos en el PDF.</p><p>Se ha abierto el documento original para su revisión.</p>';
            if (pagesFound.length > 0) { pagesHtml = `<p class="font-semibold">Códigos encontrados en las páginas del documento original:</p><ul class="list-disc list-inside mt-2"><li>${pagesFound.join('</li><li>')}</li></ul>`; }
            
            if (resultContent) { resultContent.innerHTML = `<p class="mb-4">El PDF con las páginas extraídas se ha abierto en una nueva pestaña.</p><div class="mt-4 p-2 bg-gray-100 rounded">${pagesHtml}</div><a href="${url}" download="extracto.pdf" class="btn btn--secondary btn--full mt-4">Descargar de nuevo</a>`; }
            if (resultModal) resultModal.classList.remove('hidden');
        } else {
            await handleApiResponse(response);
        }
    } catch (error) {
        toast('Falló la comunicación con el servicio de resaltado.', 'error');
        console.error('Error CRÍTICO en highlightPdf:', error);
    }
}

function clearSearch() { const input = document.getElementById('searchInput'); const results = document.getElementById('results-search'); const alert = document.getElementById('search-alert'); if (input) input.value = ''; if (results) results.innerHTML = ''; if (alert) alert.innerText = ''; }
async function doSearch() { const rawInput = document.getElementById('searchInput').value.trim(); if (!rawInput) return; const codes = [...new Set( rawInput .split(/\r?\n/) .map(line => line.trim().split(/\s+/)[0]) .filter(Boolean) )]; const formData = new FormData(); formData.append('action', 'search'); formData.append('codes', codes.join('\n')); try { const response = await fetch(api, { method: 'POST', body: formData }); const data = await response.json(); const foundCodes = new Set(data.flatMap(doc => doc.codes || [])); const missingCodes = codes.filter(c => !foundCodes.has(c)); const alertEl = document.getElementById('search-alert'); if (alertEl) { alertEl.innerText = missingCodes.length ? 'Códigos no encontrados: ' + missingCodes.join(', ') : ''; } render(data, 'results-search', true); } catch (error) { toast('Error de red al realizar la búsqueda.', 'error'); console.error(error); } }
function clearUploadForm(event) { if (event) event.preventDefault(); const form = document.getElementById('form-upload'); const docId = document.getElementById('docId'); if (form) form.reset(); if (docId) docId.value = ''; toast('Formulario limpiado.', 'info'); }
function clearConsultFilter() { const input = document.getElementById('consultFilterInput'); if (input) input.value = ''; doConsultFilter(); }
function doConsultFilter() { const input = document.getElementById('consultFilterInput'); const term = input ? input.value.trim().toLowerCase() : ''; const filtered = fullList.filter(doc => doc.name.toLowerCase().includes(term) || doc.path.toLowerCase().includes(term)); render(filtered, 'results-list', false); }
function downloadCsv() { let csv = 'Código,Documento\n'; fullList.forEach(doc => { if (doc.codes && doc.codes.length) { doc.codes.forEach(code => { csv += `"${code.replace(/"/g, '""')}","${doc.name.replace(/"/g, '""')}"\n`; }); } }); const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'documentos.csv'; a.click(); URL.revokeObjectURL(url); }
function downloadPdfs() { window.location.href = `${api}?action=download_pdfs`; }
async function doCodeSearch() { const input = document.getElementById('codeInput'); const code = input ? input.value.trim() : ''; if (!code) return; const formData = new FormData(); formData.append('action', 'search_by_code'); formData.append('code', code); try { const response = await fetch(api, { method: 'POST', body: formData }); const data = await response.json(); render(data, 'results-code', true); } catch(e) { toast('Error de red al buscar por código.', 'error'); } }
function editDoc(id) { const doc = fullList.find(d => d.id === id); if (doc) { const uploadTab = document.querySelector('[data-tab="tab-upload"]'); if (uploadTab) uploadTab.click(); clearUploadForm(); document.getElementById('docId').value = doc.id; document.getElementById('name').value = doc.name; document.getElementById('date').value = doc.date; document.getElementById('codes').value = (doc.codes || []).join('\n'); } }
async function deleteDoc(id) { try { const response = await fetch(`${api}?action=delete&id=${id}`); await handleApiResponse(response); const activeTab = document.querySelector('.tab.active'); if(activeTab) activeTab.click(); } catch (error) { console.error('Error al eliminar:', error); } }
function requestDelete(id) { pendingDeleteId = id; const overlay = document.getElementById('deleteOverlay'); if(overlay) overlay.classList.remove('hidden'); const input = document.getElementById('deleteKeyInput'); if(input) input.focus(); }
function toggleCodes(btn) { const id = btn.dataset.id; const pre = document.getElementById(`codes${id}`); if (!pre) return; const isHidden = pre.classList.toggle('hidden'); btn.textContent = isHidden ? 'Ver Códigos' : 'Ocultar Códigos'; }

document.addEventListener('DOMContentLoaded', function() {
    const submitBtn=document.getElementById("submitAccess");const accessInput=document.getElementById("accessInput");const loginOverlay=document.getElementById("loginOverlay");const mainContent=document.getElementById("mainContent");const errorMsg=document.getElementById("errorMsg");if(submitBtn){submitBtn.addEventListener("click",function(){if(accessInput&&accessInput.value===ACCESS_KEY){if(loginOverlay)loginOverlay.classList.add("hidden");if(mainContent)mainContent.classList.remove("hidden");initApp()}else{if(errorMsg)errorMsg.classList.remove("hidden")}})}
    if(accessInput){accessInput.addEventListener("keypress",function(e){if(e.key==="Enter"&&submitBtn)submitBtn.click()})}
    const uploadForm=document.getElementById("form-upload");if(uploadForm){uploadForm.addEventListener("submit",async function(e){e.preventDefault();const fileInput=uploadForm.querySelector('[name="file"]');const warningEl=document.getElementById("uploadWarning");if(fileInput&&fileInput.files[0]&&fileInput.files[0].size>10*1024*1024){if(warningEl)warningEl.classList.remove("hidden");return}
    if(warningEl)warningEl.classList.add("hidden");const codesField=uploadForm.querySelector('[name="codes"]');if(codesField){let codesArray=codesField.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));codesField.value=codesArray.join("\n")}
    const formData=new FormData(uploadForm);const docId=document.getElementById("docId");formData.append("action",docId&&docId.value?"edit":"upload");try{const response=await fetch(api,{method:"POST",body:formData});await handleApiResponse(response);clearUploadForm();const listTab=document.querySelector('[data-tab="tab-list"]');if(listTab)listTab.click()}catch(error){console.error("Error en upload:",error)}})}
    const codeInput=document.getElementById("codeInput");const suggestions=document.getElementById("suggestions");let timeoutId;if(codeInput&&suggestions){codeInput.addEventListener("input",function(){clearTimeout(timeoutId);const term=codeInput.value.trim();if(!term){suggestions.classList.add("hidden");return}
    timeoutId=setTimeout(async function(){try{const response=await fetch(`${api}?action=suggest&term=${encodeURIComponent(term)}`);const data=await response.json();if(data.length){suggestions.innerHTML=data.map(code=>`<div class="py-1 px-2 hover:bg-gray-100 cursor-pointer" data-code="${code}">${code}</div>`).join("");suggestions.classList.remove("hidden")}else{suggestions.classList.add("hidden")}}catch(error){console.error("Error en sugerencias:",error)}},200)});suggestions.addEventListener("click",function(e){const code=e.target.dataset.code;if(code){codeInput.value=code;suggestions.classList.add("hidden");doCodeSearch()}});document.addEventListener("click",function(e){if(!suggestions.contains(e.target)&&e.target!==codeInput){suggestions.classList.add("hidden")}})};
});
