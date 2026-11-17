// On-device text recognition (Tesseract). Free; the screenshot never leaves the phone.
// The Russian language data (~15 MB) downloads once on first use and is cached by the browser.

let workerPromise = null;
let onProgress = () => {};

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker(['rus', 'eng'], 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') onProgress({ stage: 'read', p: m.progress });
          else if (/loading|initializ/.test(m.status)) onProgress({ stage: 'load', p: m.progress });
        },
      });
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

/** Bank apps are often dark: OCR reads dark text on light much better, so invert dark images. */
async function prepare(file) {
  const bmp = await createImageBitmap(file);
  const scale = bmp.width < 900 ? 2 : 1;
  const c = document.createElement('canvas');
  c.width = bmp.width * scale;
  c.height = bmp.height * scale;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4 * 16) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const dark = sum / (d.length / (4 * 16)) < 110;
  // Coloured text (red expenses, green income) loses contrast in plain grey.
  // Dark theme: brightest channel, inverted. Light theme: darkest channel.
  for (let i = 0; i < d.length; i += 4) {
    const y = dark ? 255 - Math.max(d[i], d[i + 1], d[i + 2]) : Math.min(d[i], d[i + 1], d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, preview: URL.createObjectURL(file) };
}

/**
 * @param {File[]} files
 * @param {(p:{stage:string,p:number,index:number,total:number})=>void} progress
 * @returns {Promise<string>} text of all screenshots, in order
 */
export async function readScreenshots(files, progress = () => {}) {
  const texts = [];
  for (let i = 0; i < files.length; i++) {
    onProgress = (p) => progress({ ...p, index: i, total: files.length });
    const worker = await getWorker();
    const { canvas } = await prepare(files[i]);
    const { data } = await worker.recognize(canvas);
    texts.push(data.text);
  }
  return texts.join('\n');
}

export { prepare as previewOf };
