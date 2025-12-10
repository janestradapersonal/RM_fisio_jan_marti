/* ResoView — app.js
   Versió demo client-side. 
   Guarda dades a localStorage només per demostració.
*/

(function(){
  // Helpers
  const $ = id => document.getElementById(id);
  const lsKeyUsers = 'resoview_users';
  const lsKeySession = 'resoview_session';
  const lsKeyData = 'resoview_data'; // optional persisted manifest

  // State
  let state = {
    users: JSON.parse(localStorage.getItem(lsKeyUsers)||'{}'),
    session: JSON.parse(localStorage.getItem(lsKeySession)||'null'),
    // data structure: { folders: { folderPath: { files: [ {name, relativePath, blobUrl, file} ], createdAt } } }
    data: JSON.parse(localStorage.getItem(lsKeyData)||'{}')
  };

  // UI elements
  const authSection = $('auth');
  const appSection = $('app');
  const userArea = $('user-area');
  const welcomeLine = $('welcome-line');
  const profileTitle = $('profile-title');

  const loginUsername = $('login-username');
  const loginPassword = $('login-password');
  const btnLogin = $('btn-login');

  const regUsername = $('reg-username');
  const regPassword = $('reg-password');
  const btnRegister = $('btn-register');

  const folderInput = $('folder-input');
  const folderList = $('folder-list');
  const imagesGrid = $('images-grid');
  const imagesTitle = $('images-title');

  const btnLogout = $('btn-logout');
  const searchInput = $('search-input');
  const clearSearch = $('clear-search');

  // Init
  function init(){
    attachEvents();
    renderAuthOrApp();
    renderUserArea();
  }

  // Event wiring
  function attachEvents(){
    btnRegister.addEventListener('click', handleRegister);
    btnLogin.addEventListener('click', handleLogin);
    btnLogout.addEventListener('click', handleLogout);
    folderInput.addEventListener('change', handleFolderImport);
    searchInput.addEventListener('input', renderFolders);
    clearSearch.addEventListener('click', ()=>{ searchInput.value=''; renderFolders(); });

    // delegate for folder clicks
    folderList.addEventListener('click', (ev)=>{
      const li = ev.target.closest('li[data-folder]');
      if(!li) return;
      document.querySelectorAll('#folder-list li').forEach(x=>x.classList.remove('active'));
      li.classList.add('active');
      const key = li.getAttribute('data-folder');
      showImagesForFolder(key);
    });

    imagesGrid.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('button[data-action]');
      if(!btn) return;
      const action = btn.getAttribute('data-action');
      const folder = btn.getAttribute('data-folder');
      const file = btn.getAttribute('data-file');
      if(action==='open') openViewer(folder,file);
      if(action==='download') downloadFile(folder,file);
      if(action==='delete') deleteFile(folder,file);
    });
  }

  // Auth
  function handleRegister(){
    const u = regUsername.value.trim();
    const p = regPassword.value;
    if(!u || !p){ alert('Introdueix usuari i contrasenya'); return; }
    if(state.users[u]){ alert('Usuari ja existeix'); return; }
    state.users[u] = { password: p, createdAt: new Date().toISOString() };
    persistUsers();
    regUsername.value=''; regPassword.value='';
    alert('Usuari creat. Ara pots entrar.');
  }
  function handleLogin(){
    const u = loginUsername.value.trim();
    const p = loginPassword.value;
    if(!state.users[u] || state.users[u].password !== p){ alert('Usuari o contrasenya incorrectes'); return; }
    state.session = { user: u, at: new Date().toISOString() };
    localStorage.setItem(lsKeySession, JSON.stringify(state.session));
    loginUsername.value=''; loginPassword.value='';
    renderAuthOrApp();
    renderUserArea();
  }
  function handleLogout(){
    state.session = null;
    localStorage.removeItem(lsKeySession);
    renderAuthOrApp();
    renderUserArea();
  }

  // Switch UI
  function renderAuthOrApp(){
    if(state.session){
      authSection.classList.add('hidden');
      appSection.classList.remove('hidden');
      profileTitle.textContent = `Perfil — ${state.session.user}`;
      welcomeLine.textContent = `Benvingut — ${state.session.user}`;
      renderFolders();
    }else{
      authSection.classList.remove('hidden');
      appSection.classList.add('hidden');
    }
  }

  function renderUserArea(){
    userArea.innerHTML = '';
    if(state.session){
      const span = document.createElement('span');
      span.textContent = state.session.user;
      userArea.appendChild(span);
    }else{
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = 'No autenticat';
      userArea.appendChild(span);
    }
  }

  // Import folder (user selects a directory). We'll group by folder path relative to selection.
  function handleFolderImport(ev){
    const files = Array.from(ev.target.files || []);
    if(!files.length) return;
    // Build map: top-level folder name (first path segment) => files
    // file.webkitRelativePath exists in Chromium-based browsers; fallback to name
    files.forEach(f=>{
      const rel = f.webkitRelativePath || f.name;
      // Normalize: use first directory in path as folder key OR full directory excluding file
      const parts = rel.split('/');
      let folderKey;
      if(parts.length>1){
        // treat the path up to last segment as folder key
        parts.pop();
        folderKey = parts.join('/');
      } else {
        folderKey = 'arrel';
      }
      if(!state.data.folders) state.data.folders = {};
      if(!state.data.folders[folderKey]) state.data.folders[folderKey] = { files: [], createdAt: new Date().toISOString() };

      const reader = new FileReader();
      reader.onload = (e)=>{
        // create blob URL for preview (not persisted between sessions)
        const blob = new Blob([e.target.result], { type: f.type || 'image/*' });
        const url = URL.createObjectURL(blob);
        state.data.folders[folderKey].files.push({
          name: f.name,
          relativePath: rel,
          type: f.type,
          size: f.size,
          blobUrl: url
          // we purposely do not store the File object in localStorage
        });
        persistData();
        renderFolders();
      };
      // Only read image files (jpg/png/gif) — for demo. If DICOM, user should convert or use a DICOM viewer.
      if(/image\/.*/.test(f.type) || /\.(jpg|jpeg|png|gif)$/i.test(f.name)){
        reader.readAsArrayBuffer(f);
      } else {
        // For non-image, skip in this demo
        console.warn("Fitxer no imatge (s'ha ignorat):", f.name);
      }
    });

    // clear input so user can re-select same folder again if needed
    ev.target.value = '';
  }

  // Render folder list
  function renderFolders(){
    folderList.innerHTML = '';
    const q = (searchInput.value || '').toLowerCase();
    const folders = state.data.folders ? Object.keys(state.data.folders) : [];
    if(!folders.length){
      folderList.innerHTML = '<li class="muted">Cap estudi importat. Importa una carpeta per començar.</li>';
      imagesGrid.innerHTML = '';
      imagesTitle.textContent = 'Cap estudi seleccionat';
      return;
    }
    const filtered = folders.filter(k => k.toLowerCase().includes(q) || (state.data.folders[k].files||[]).some(f=>f.name.toLowerCase().includes(q)));
    filtered.forEach(k=>{
      const li = document.createElement('li');
      li.setAttribute('data-folder', k);
      li.innerHTML = `<strong>${escapeHtml(k)}</strong><div class="muted">${(state.data.folders[k].files||[]).length} fitxers</div>`;
      folderList.appendChild(li);
    });
    // Auto-select first folder if none selected
    const active = folderList.querySelector('li.active');
    if(!active && folderList.querySelector('li[data-folder]')){
      folderList.querySelector('li[data-folder]').classList.add('active');
      showImagesForFolder(folderList.querySelector('li[data-folder]').getAttribute('data-folder'));
    }
  }

  // Show images for folder
  function showImagesForFolder(folderKey){
    const folder = state.data.folders[folderKey];
    imagesTitle.textContent = `Estudi: ${folderKey}`;
    imagesGrid.innerHTML = '';
    if(!folder || !folder.files.length){
      imagesGrid.innerHTML = '<div class="muted">Carpeta buida.</div>';
      return;
    }
    folder.files.forEach(f=>{
      const div = document.createElement('div');
      div.className = 'thumb card';
      div.innerHTML = `
        <img src="${f.blobUrl}" alt="${escapeHtml(f.name)}" />
        <div class="meta"><div class="name">${escapeHtml(f.name)}</div><div>${formatBytes(f.size)}</div></div>
        <div style="display:flex; gap:6px; width:100%; justify-content:center;">
          <button class="btn small" data-action="open" data-folder="${encodeURIComponent(folderKey)}" data-file="${encodeURIComponent(f.name)}">Obrir</button>
          <button class="btn small" data-action="download" data-folder="${encodeURIComponent(folderKey)}" data-file="${encodeURIComponent(f.name)}">Descarrega</button>
          <button class="btn small" data-action="delete" data-folder="${encodeURIComponent(folderKey)}" data-file="${encodeURIComponent(f.name)}">Eliminar</button>
        </div>
      `;
      imagesGrid.appendChild(div);
    });
  }

  // Viewer
  function openViewer(folderEncoded, fileEncoded){
    const folderKey = decodeURIComponent(folderEncoded);
    const fileName = decodeURIComponent(fileEncoded);
    const folder = state.data.folders[folderKey];
    if(!folder) return;
    const f = folder.files.find(x=>x.name === fileName);
    if(!f) return;
    const viewer = document.createElement('div');
    viewer.className = 'viewer';
    viewer.innerHTML = `
      <div class="box">
        <img src="${f.blobUrl}" alt="${escapeHtml(f.name)}" />
        <div class="muted">${escapeHtml(f.relativePath)} — ${formatBytes(f.size)}</div>
        <div class="controls" style="margin-top:8px;">
          <button id="v-download" class="btn small">Descarregar</button>
          <button id="v-close" class="btn small">Tanca</button>
        </div>
      </div>
    `;
    document.body.appendChild(viewer);
    $('v-close').addEventListener('click', ()=>viewer.remove());
    $('v-download').addEventListener('click', ()=>{
      downloadFile(encodeURIComponent(folderKey), encodeURIComponent(fileName));
    });
    viewer.addEventListener('click', (e)=>{ if(e.target === viewer) viewer.remove(); });
  }

  // Download file
  function downloadFile(folderEncoded, fileEncoded){
    const folderKey = decodeURIComponent(folderEncoded);
    const fileName = decodeURIComponent(fileEncoded);
    const folder = state.data.folders[folderKey];
    if(!folder) return;
    const f = folder.files.find(x=>x.name === fileName);
    if(!f) return;
    const a = document.createElement('a');
    a.href = f.blobUrl;
    a.download = f.name;
    a.click();
  }

  // Delete file
  function deleteFile(folderEncoded, fileEncoded){
    if(!confirm('Eliminar aquest fitxer només eliminarà la vista d\'aquesta sessió (local). Vols continuar?')) return;
    const folderKey = decodeURIComponent(folderEncoded);
    const fileName = decodeURIComponent(fileEncoded);
    const folder = state.data.folders[folderKey];
    if(!folder) return;
    const idx = folder.files.findIndex(x=>x.name === fileName);
    if(idx>=0){
      // revoke blob url
      try{ URL.revokeObjectURL(folder.files[idx].blobUrl); } catch(e){}
      folder.files.splice(idx,1);
      if(folder.files.length===0){
        delete state.data.folders[folderKey];
      }
      persistData();
      renderFolders();
    }
  }

  // Persistence helpers
  function persistUsers(){ localStorage.setItem(lsKeyUsers, JSON.stringify(state.users)); }
  function persistData(){ 
    // We cannot store blobUrls or binary; for demo we store limited metadata only.
    // However to keep the demo usable across reloads, we store a lightweight manifest but blobUrls are ephemeral.
    const copy = { folders: {} };
    if(state.data.folders){
      Object.keys(state.data.folders).forEach(k=>{
        copy.folders[k] = { files: state.data.folders[k].files.map(f=>({ name:f.name, relativePath:f.relativePath, size:f.size, type:f.type })), createdAt: state.data.folders[k].createdAt };
      });
    }
    localStorage.setItem(lsKeyData, JSON.stringify(copy));
    // keep the full in-memory copy (with blobUrls) intact
  }

  // Utility
  function formatBytes(bytes){
    if(!bytes) return '0 B';
    const sizes = ['B','KB','MB','GB','TB'];
    const i = Math.floor(Math.log(bytes)/Math.log(1024));
    return (bytes / Math.pow(1024,i)).toFixed(1) + ' ' + sizes[i];
  }
  function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Boot
  init();
})();
