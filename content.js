(function () {
  'use strict';

  // ---- Config: 여기서 동작을 바꿀 수 있습니다.
  const CONFIG = {
    dockLeftPx: 24,        // 좌측 여백
    dockTopPx: 24,         // 상단 여백
    showMinimize: true,    // 접기 버튼을 보이게
    showClose: false,      // 닫기 버튼을 숨김(원하면 true)
    miniLabel: '열기',      // 미니 버튼 라벨
    panelTitle: 'NamuWiki Exporter',

    // ✅ 우선순위 선택자 목록 (위에서부터 시도)
    targetSelectors: [
      'div.Ye3tUbwV.JztYnNb7',
      'article.Ye3tUbwV.JztYnNb7',
      'article',
      'main'
    ]
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function absolutizeUrl(url) {
    try { return new URL(url, location.href).href; } catch (_) { return url; }
  }
  function nowStamp() {
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
  function makeFilename(ext = 'txt') {
    const pathPart = decodeURIComponent(location.pathname.replace(/\/+$/, '').split('/').pop() || 'namuwiki');
    return `namuwiki_${pathPart}_${nowStamp()}.${ext}`;
  }

  // ✅ 대상 컨테이너 탐색 (어떤 선택자가 매칭됐는지 함께 반환)
  function getTargetContainer() {
    for (const sel of CONFIG.targetSelectors) {
      const el = document.querySelector(sel);
      if (el) return { el, matchedSelector: sel };
    }
    return { el: null, matchedSelector: null };
  }

  // 태그 단위 직렬화
  function serializeTagwise(rootEl) {
    const items = [];
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const parent = node.parentElement;
        const tag = parent ? parent.tagName.toLowerCase() : '#text';
        items.push({ type: 'text', tag, text });
        continue;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        const tag = el.tagName.toLowerCase();
        if (['img','a','table','ul','ol','li','code','pre','h1','h2','h3','h4','h5','h6','blockquote'].includes(tag)) {
          const entry = { type: 'element', tag };
          if (tag === 'img') {
            entry.src = absolutizeUrl(el.getAttribute('src') || '');
            entry.alt = el.getAttribute('alt') || '';
          } else if (tag === 'a') {
            entry.href = absolutizeUrl(el.getAttribute('href') || '');
            entry.text = el.textContent.trim();
          } else if (tag === 'table') {
            const rows = $$('tr', el).map((tr) => $$('.th,th,td', tr).map((c) => c.textContent.trim()));
            entry.rows = rows;
          } else if (tag === 'ul' || tag === 'ol') {
            entry.items = $$('li', el).map((li) => li.textContent.trim());
          } else if (tag === 'li' || tag === 'blockquote' || tag.startsWith('h')) {
            entry.text = el.textContent.trim();
          } else if (tag === 'code' || tag === 'pre') {
            entry.text = el.textContent;
          }
          items.push(entry);
        }
      }
    }
    return items;
  }

  function buildTxt(items, selectorUsed) {
    let txt = `URL: ${location.href}\nTITLE: ${document.title}\nEXTRACTED_AT: ${new Date().toISOString()}\nSELECTOR_USED: ${selectorUsed || '(none)'}\n\n`;
    for (const it of items) {
      if (it.type === 'text') {
        txt += `[text in <${it.tag}>] ${it.text}\n`;
      } else {
        switch (it.tag) {
          case 'img': txt += `[img] src=${it.src} alt="${it.alt}"\n`; break;
          case 'a': txt += `[a] text="${it.text}" href=${it.href}\n`; break;
          case 'table': txt += `[table]\n` + (it.rows || []).map((r) => '  - ' + r.join(' | ')).join('\n') + '\n'; break;
          case 'ul':
          case 'ol': txt += `[${it.tag}]\n` + (it.items || []).map((s, i) => `  ${it.tag === 'ol' ? (i+1)+'.' : '-'} ${s}`).join('\n') + '\n'; break;
          default: if (it.text) txt += `[${it.tag}] ${it.text}\n`;
        }
      }
    }
    txt += `\n----- JSON BEGIN -----\n` + JSON.stringify(items, null, 2) + `\n----- JSON END -----\n`;
    return txt;
  }

  function makeBlobDownload(filename, mime, data) {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // 현재 창에서 해당 섹션만 인쇄(PDF 저장)
  function printSectionInPlace(targetEl) {
    $('#nmw-print-target')?.remove();
    $('#nmw-print-style')?.remove();

    const wrapper = document.createElement('div');
    wrapper.id = 'nmw-print-target';

    const cloned = targetEl.cloneNode(true);
    $$('img', cloned).forEach((img) => img.setAttribute('src', absolutizeUrl(img.getAttribute('src') || '')));
    $$('a', cloned).forEach((a) => a.setAttribute('href', absolutizeUrl(a.getAttribute('href') || '')));

    wrapper.appendChild(cloned);
    document.body.appendChild(wrapper);

    const style = document.createElement('style');
    style.id = 'nmw-print-style';
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #nmw-print-target, #nmw-print-target * { visibility: visible !important; }
        #nmw-print-target { position: absolute; left: 0; top: 0; width: 100%; background: white; }
        #nmw-exporter-root, #nmw-mini { display: none !important; }
      }
    `;
    document.head.appendChild(style);

    const cleanup = () => { wrapper.remove(); style.remove(); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);

    window.print();
  }

  // 미니 버튼 생성/제거
  function showMiniButton() {
    if ($('#nmw-mini')) return;
    const mini = document.createElement('button');
    mini.id = 'nmw-mini';
    mini.textContent = CONFIG.miniLabel;
    mini.title = '패널 열기';
    mini.style.left = CONFIG.dockLeftPx + 'px';
    mini.style.top = CONFIG.dockTopPx + 'px';
    document.documentElement.appendChild(mini);
    mini.addEventListener('click', () => {
      $('#nmw-exporter-root')?.classList.remove('nmw-hidden');
      mini.remove();
    });
  }
  function hideMiniButton() {
    $('#nmw-mini')?.remove();
  }

  // UI 주입
  function injectUI() {
    if ($('#nmw-exporter-root')) return;
    const root = document.createElement('div');
    root.id = 'nmw-exporter-root';
    root.style.left = CONFIG.dockLeftPx + 'px';
    root.style.top  = CONFIG.dockTopPx + 'px';

    // 버튼 영역 구성
    const buttons = [
      { id: 'nmw-export-txt', label: 'TXT 내보내기' },
      { id: 'nmw-export-pdf', label: 'PDF 내보내기(현재창)' },
      ...(CONFIG.showMinimize ? [{ id: 'nmw-minimize', label: '접기' }] : []),
      ...(CONFIG.showClose ? [{ id: 'nmw-close', label: '닫기', extraClass: 'nmw-secondary' }] : [])
    ];

    const btnHtml = buttons.map(b =>
      `<button id="${b.id}" class="nmw-btn ${b.extraClass || ''}">${b.label}</button>`
    ).join('');

    root.innerHTML = `
      <div class="nmw-card">
        <div class="nmw-title">${CONFIG.panelTitle}</div>
        ${btnHtml}
      </div>
      <div class="nmw-handle" title="드래그로 이동">⇲</div>`;
    document.documentElement.appendChild(root);

    // 드래그
    let dragging = false, sx=0, sy=0, ox=0, oy=0;
    const handle = root.querySelector('.nmw-handle');
    handle.addEventListener('mousedown', (e) => {
      dragging = true; sx = e.clientX; sy = e.clientY;
      const rect = root.getBoundingClientRect(); ox = rect.left; oy = rect.top;
      document.body.classList.add('nmw-dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx; const dy = e.clientY - sy;
      root.style.left = Math.max(0, ox + dx) + 'px';
      root.style.top = Math.max(0, oy + dy) + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; document.body.classList.remove('nmw-dragging'); });

    // 동작 바인딩
    $('#nmw-export-txt')?.addEventListener('click', async () => {
      const { el: container, matchedSelector } = getTargetContainer();
      if (!container) return alert(`대상 컨테이너를 찾을 수 없습니다.\n시도한 선택자: ${CONFIG.targetSelectors.join(', ')}`);
      const cloned = container.cloneNode(true);
      $$('img', cloned).forEach((img) => img.setAttribute('src', absolutizeUrl(img.getAttribute('src') || '')));
      $$('a', cloned).forEach((a) => a.setAttribute('href', absolutizeUrl(a.getAttribute('href') || '')));

      const items = serializeTagwise(cloned);
      const txt = buildTxt(items, matchedSelector);
      makeBlobDownload(makeFilename('txt'), 'text/plain;charset=utf-8', txt);
    });

    $('#nmw-export-pdf')?.addEventListener('click', async () => {
      const { el: container } = getTargetContainer();
      if (!container) return alert(`대상 컨테이너를 찾을 수 없습니다.\n시도한 선택자: ${CONFIG.targetSelectors.join(', ')}`);
      printSectionInPlace(container);
    });

    // 접기(미니모드)
    $('#nmw-minimize')?.addEventListener('click', () => {
      root.classList.add('nmw-hidden'); // display:none
      showMiniButton();
    });

    // 닫기(완전히 제거)
    $('#nmw-close')?.addEventListener('click', () => {
      hideMiniButton();
      root.remove();
    });
  }

  async function waitAndInject() {
    for (let i = 0; i < 20; i++) {
      if (document.readyState === 'complete' || document.readyState === 'interactive') break;
      await sleep(150);
    }
    injectUI();
  }
  waitAndInject();
})();