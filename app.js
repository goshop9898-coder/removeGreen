(() => {
  const $ = (id) => document.getElementById(id);
  const fileInput = $('fileInput'), sourceImage = $('sourceImage'), sourceStage = $('sourceStage'), emptyState = $('emptyState');
  const resultCanvas = $('resultCanvas'), ctx = resultCanvas.getContext('2d', { willReadFrequently: true });
  const state = { image: null, url: null, key: [0, 210, 106], keyMode: 'green', tolerance: 24, softness: 18, busy: false, dirty: true, fileName: 'cutout' };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const hexToRgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const rgbToHex = (rgb) => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const setStatus = (s) => $('statusText').textContent = s;

  function chooseFile(file) {
    if (!file) return;
    if (file.type.startsWith('video/')) {
      setStatus('Video selected. Transparent video export is not available here; choose a still image to continue.');
      $('fileInfo').textContent = `${file.name} · video not supported for export`;
      $('sourceStage').classList.add('shake'); setTimeout(() => $('sourceStage').classList.remove('shake'), 260);
      return;
    }
    if (!file.type.startsWith('image/')) { setStatus('That file type is not supported. Choose a PNG, JPG, WebP, GIF, or BMP image.'); return; }
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = URL.createObjectURL(file); state.fileName = file.name.replace(/\.[^.]+$/, '') || 'cutout';
    const img = new Image();
    img.onload = () => {
      state.image = img; sourceImage.src = state.url; sourceImage.hidden = false; emptyState.hidden = true; $('sourceBadge').hidden = false;
      $('sourceMeta').textContent = 'IMAGE READY'; $('fileInfo').textContent = `${file.name} · ${img.naturalWidth} × ${img.naturalHeight}`;
      $('replaceButton').hidden = false; $('processButton').disabled = false; $('eyedropperButton').disabled = false;
      $('resultPlaceholder').hidden = false; resultCanvas.hidden = true; $('resultBadge').hidden = true; $('downloadButton').disabled = true;
      $('resultInfo').textContent = 'PNG with transparency'; state.dirty = true;
      setStatus('Image ready. Sample the screen color or keep the green preset, then remove the background.');
    };
    img.onerror = () => setStatus('This image could not be opened by the browser. Try PNG, JPG, WebP, GIF, or BMP.');
    img.src = state.url;
  }
  $('chooseButton').addEventListener('click', () => fileInput.click());
  $('replaceButton').addEventListener('click', () => fileInput.click());
  $('sampleButton').addEventListener('click', async () => {
    try {
      const response = await fetch('sample-green-screen.png');
      if (!response.ok) throw new Error('Sample image is unavailable.');
      const blob = await response.blob();
      chooseFile(new File([blob], 'sample-green-screen.png', { type: 'image/png' }));
    } catch (_) { setStatus('The sample image could not be loaded. Choose or drop an image instead.'); }
  });
  $('pasteButton').addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.read) throw new Error('Clipboard image access is unavailable.');
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith('image/'));
        if (type) { chooseFile(new File([await item.getType(type)], `clipboard-image.${type.split('/')[1]}`, { type })); return; }
      }
      setStatus('No image found in the clipboard. Copy an image, then try again.');
    } catch (_) { setStatus('Clipboard image access was blocked. Use Ctrl+V on the page, or drop/choose an image.'); }
  });
  document.addEventListener('paste', e => {
    const image = Array.from(e.clipboardData?.items || []).find(item => item.type.startsWith('image/'));
    if (image) { e.preventDefault(); chooseFile(image.getAsFile()); }
  });
  fileInput.addEventListener('change', (e) => { chooseFile(e.target.files[0]); fileInput.value = ''; });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); fileInput.click(); } });
  ['dragenter','dragover'].forEach(type => document.addEventListener(type, e => { e.preventDefault(); document.body.classList.add('is-dragging'); }));
  ['dragleave','drop'].forEach(type => document.addEventListener(type, e => { e.preventDefault(); if (type === 'drop') chooseFile(e.dataTransfer.files[0]); document.body.classList.remove('is-dragging'); }));

  function updateKey(rgb, active) {
    state.key = rgb; state.keyMode = active?.dataset.color?.toLowerCase() === '#00d26a' ? 'green' : 'sampled'; const hex = rgbToHex(rgb); $('colorChip').style.background = hex; $('colorValue').textContent = hex;
    document.querySelectorAll('.swatch').forEach(b => { const on = b === active; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    state.dirty = true;
  }
  document.querySelectorAll('.swatch[data-color]').forEach(button => button.addEventListener('click', () => updateKey(hexToRgb(button.dataset.color), button)));
  $('customColorButton').addEventListener('click', () => $('colorInput').click());
  $('colorInput').addEventListener('input', e => { $('customDot').style.setProperty('--custom-color', e.target.value); updateKey(hexToRgb(e.target.value), $('customColorButton')); });
  $('tolerance').addEventListener('input', e => { state.tolerance = +e.target.value; $('toleranceOutput').textContent = `${state.tolerance}%`; state.dirty = true; });
  $('softness').addEventListener('input', e => { state.softness = +e.target.value; $('softnessOutput').textContent = `${state.softness}%`; state.dirty = true; });
  $('eyedropperButton').addEventListener('click', () => { if (!state.image) return; setStatus('Click a background pixel in the source image to sample its color.'); sourceImage.style.cursor = 'crosshair'; });
  sourceImage.addEventListener('click', e => {
    if (!state.image || sourceImage.style.cursor !== 'crosshair') return;
    const rect = sourceImage.getBoundingClientRect(); const x = Math.floor((e.clientX - rect.left) / rect.width * state.image.naturalWidth); const y = Math.floor((e.clientY - rect.top) / rect.height * state.image.naturalHeight);
    const sample = document.createElement('canvas'); sample.width = state.image.naturalWidth; sample.height = state.image.naturalHeight;
    const sc = sample.getContext('2d', { willReadFrequently: true }); sc.drawImage(state.image, 0, 0); const rgb = Array.from(sc.getImageData(clamp(x,0,sample.width-1), clamp(y,0,sample.height-1),1,1).data).slice(0,3);
    sourceImage.style.cursor = ''; updateKey(rgb, null); $('customDot').style.setProperty('--custom-color', rgbToHex(rgb)); setStatus(`Sampled ${rgbToHex(rgb)} from the source. Adjust tolerance, then process.`);
  });

  function processImage() {
    if (!state.image || state.busy) return;
    state.busy = true; $('processButton').disabled = true; $('downloadButton').disabled = true;
    $('progressWrap').hidden = false; $('progressBar').style.width = '0%'; $('progressText').textContent = 'Reading pixels…'; $('progressPercent').textContent = '0%';
    setStatus('Processing locally in your browser…');
    const img = state.image, w = img.naturalWidth, h = img.naturalHeight;
    resultCanvas.width = w; resultCanvas.height = h;
    ctx.clearRect(0,0,w,h); ctx.drawImage(img,0,0);
    // Work in horizontal slices so progress remains visible and the UI can repaint.
    const imageData = ctx.getImageData(0,0,w,h), data = imageData.data;
    const [kr,kg,kb] = state.key;
    const greenMode = state.keyMode === 'green';
    // The Green preset looks for green dominance, so it handles common studio
    // greens even when their brightness differs from the swatch. Other colors
    // continue to use the sampled-color chroma distance.
    const greenCutoff = clamp(72 - state.tolerance * 0.65, 8, 72);
    const threshold = greenMode ? 255 - greenCutoff : 4 + state.tolerance * 0.35;
    const feather = 15 + state.softness * 2.8;
    const pixels = w * h;
    const connected = new Uint8Array(pixels);
    let row = 0, connectedKeyPixels = 0; const rowsPerFrame = Math.max(1, Math.floor(400000 / w));
    // Compare color proportions as well as brightness. A real green screen is
    // rarely one exact RGB value: shadows and light falloff change its level.
    // Chroma distance keeps those greens connected while retaining hue shifts.
    const keySum = Math.max(1, kr + kg + kb);
    const keyChroma = [kr / keySum, kg / keySum, kb / keySum];
    const distance = (i) => {
      const r=data[i], g=data[i+1], b=data[i+2], sum=r+g+b;
      if (greenMode) {
        if (sum < 45) return 255;
        const greenExcess = (g - Math.max(r,b)) / sum * 255;
        return 255 - clamp(greenExcess, 0, 255);
      }
      if (sum < 45) {
        const dr=r-kr, dg=g-kg, db=b-kb;
        return Math.sqrt(dr*dr+dg*dg+db*db);
      }
      const dr=r/sum-keyChroma[0], dg=g/sum-keyChroma[1], db=b/sum-keyChroma[2];
      return Math.sqrt(dr*dr+dg*dg+db*db)*255;
    };
    const scanCore = () => {
      const end = Math.min(h, row + rowsPerFrame);
      for (let y=row; y<end; y++) for (let x=0; x<w; x++) {
        const p=y*w+x, i=p*4;
        if (data[i+3] && distance(i) <= threshold) connected[p] = 1;
      }
      row=end; const pct=Math.round(row/h*35); $('progressBar').style.width=`${pct}%`; $('progressPercent').textContent=`${pct}%`; $('progressText').textContent='Finding connected screen pixels…';
      if (row<h) requestAnimationFrame(scanCore); else requestAnimationFrame(floodFromEdges);
    };
    const floodFromEdges = () => {
      // Flood only key-colored pixels connected to the image perimeter. This
      // protects similar colors inside the subject from being keyed away.
      const queue = new Int32Array(pixels); let head=0, tail=0;
      const add = p => { if (connected[p]===1) { connected[p]=2; queue[tail++]=p; } };
      for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}
      for(let y=1;y<h-1;y++){add(y*w);add(y*w+w-1);}
      while(head<tail){
        const p=queue[head++], x=p%w;
        if(x>0)add(p-1); if(x+1<w)add(p+1);
        if(p>=w)add(p-w); if(p+w<pixels)add(p+w);
        if(x>0&&p>=w)add(p-w-1); if(x+1<w&&p>=w)add(p-w+1);
        if(x>0&&p+w<pixels)add(p+w-1); if(x+1<w&&p+w<pixels)add(p+w+1);
      }
      connectedKeyPixels = tail;
      // Also clear sizable key-colored pockets enclosed by the subject (for
      // example, the green gap between a tail and a hind leg). Tiny isolated
      // matches are retained to avoid erasing small subject details.
      for(let start=0;start<pixels;start++) if(connected[start]===1){
        head=0; tail=0; queue[tail++]=start; connected[start]=3;
        while(head<tail){
          const p=queue[head++], x=p%w;
          const addPocket = q => { if(connected[q]===1){connected[q]=3;queue[tail++]=q;} };
          if(x>0)addPocket(p-1); if(x+1<w)addPocket(p+1);
          if(p>=w)addPocket(p-w); if(p+w<pixels)addPocket(p+w);
          if(x>0&&p>=w)addPocket(p-w-1); if(x+1<w&&p>=w)addPocket(p-w+1);
          if(x>0&&p+w<pixels)addPocket(p+w-1); if(x+1<w&&p+w<pixels)addPocket(p+w+1);
        }
        if(tail>=3){
          connectedKeyPixels+=tail;
          for(let q=0;q<tail;q++)connected[queue[q]]=2;
        } else {
          for(let q=0;q<tail;q++)connected[queue[q]]=1;
        }
      }
      $('progressBar').style.width='40%'; $('progressPercent').textContent='40%'; $('progressText').textContent='Refining connected edges…';
      row=0; requestAnimationFrame(applyMatte);
    };
    const smoothstep = t => { t=clamp(t,0,1); return t*t*(3-2*t); };
    const applyMatte = () => {
      const end = Math.min(h, row + rowsPerFrame);
      for(let y=row;y<end;y++) for(let x=0;x<w;x++){
        const p=y*w+x, i=p*4; if(!data[i+3])continue;
        if(connected[p]===2){data[i+3]=0;continue;}
        // Only soften pixels immediately adjacent to the connected key region.
        let near=false;
        for(let dy=-1;dy<=1&&!near;dy++) for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue; const nx=x+dx,ny=y+dy;
          if(nx>=0&&nx<w&&ny>=0&&ny<h&&connected[ny*w+nx]===2){near=true;break;}
        }
        if(!near)continue;
        const d=distance(i); if(d>=threshold+feather)continue;
        const alpha=smoothstep((d-threshold)/feather);
        if(alpha<=0.01){data[i+3]=0;continue;}
        // Unmix the sampled screen color from translucent boundary pixels.
        // This removes the familiar green/white fringe on a checkerboard.
        if(alpha<0.995 && greenMode){
          // Reduce green spill proportionally without assuming the screen was
          // exactly #00D26A; the Green preset intentionally accepts varied greens.
          const spill = Math.max(0, data[i+1] - Math.max(data[i], data[i+2]));
          data[i+1] = clamp(data[i+1] - spill * (1-alpha), 0, 255);
        } else if(alpha<0.995){
          const inv=1/alpha;
          data[i]=clamp((data[i]-(1-alpha)*kr)*inv,0,255);
          data[i+1]=clamp((data[i+1]-(1-alpha)*kg)*inv,0,255);
          data[i+2]=clamp((data[i+2]-(1-alpha)*kb)*inv,0,255);
        }
        data[i+3]=Math.round(data[i+3]*alpha);
      }
      row=end; const pct=40+Math.round(row/h*55); $('progressBar').style.width=`${pct}%`; $('progressPercent').textContent=`${pct}%`; $('progressText').textContent='Refining connected edges…';
      if(row<h) requestAnimationFrame(applyMatte); else {
        ctx.putImageData(imageData,0,0); resultCanvas.hidden=false; $('resultPlaceholder').hidden=true; $('resultBadge').hidden=false; $('downloadButton').disabled=false;
        $('resultMeta').textContent='PNG · ALPHA'; $('resultInfo').textContent=`${w} × ${h} · transparent PNG`; $('progressWrap').hidden=true; $('processButton').disabled=false; state.busy=false; state.dirty=false;
        setStatus(connectedKeyPixels ? 'Background removed. Edge pixels were refined; preview and download your transparent PNG.' : 'No matching screen color was connected to the image edge. Sample the background or raise tolerance.');
      }
    };
    requestAnimationFrame(scanCore);
  }
  $('processButton').addEventListener('click', processImage);
  $('downloadButton').addEventListener('click', () => { if (!state.image) return; resultCanvas.toBlob(blob => { if (!blob) { setStatus('Could not export this image. Try a smaller file or another browser.'); return; } const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${state.fileName}-transparent.png`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); setStatus('Transparent PNG downloaded.'); },'image/png'); });
})();
