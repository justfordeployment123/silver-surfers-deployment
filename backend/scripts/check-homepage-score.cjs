const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const assert = require('node:assert/strict');

// Execute the scanner's actual browser checks so diagnostics match production.
const source = fs.readFileSync(path.join(__dirname, '../python-scanner/camoufox_auditor.py'), 'utf8');
function check(name) {
  return source.split(`${name} = page.evaluate("""`)[1].split('""")')[0].replaceAll('\\\\', '\\');
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    if (process.argv[2] === '--test') {
      await page.setContent(`
        <style>
          body { background: white; color: black; }
          label { color: #ddd; }
          .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
          .clipped { clip: auto; clip-path: inset(50%); }
          button { width: 48px; height: 48px; }
        </style>
        <label class="sr">Clipped label</label>
        <div class="sr clipped"><label>Clipped ancestor</label></div>
        <label style="visibility:hidden">Hidden label</label>
        <p>Readable text</p>
        <button style="display:none">Hidden</button>
        <button style="visibility:hidden">Hidden</button>
        <button>OK</button>
      `);
      const run = name => page.evaluate(`(${check(name)})()`);
      assert.equal((await run('color_contrast_results')).failing, 0);
      assert.equal((await run('target_size_results')).total, 1);
      assert.equal((await run('target_size_results')).small, 0);
      await page.evaluate(() => {
        const text = document.createElement('p');
        text.textContent = 'Visible low contrast';
        text.style.color = '#ddd';
        document.body.append(text);
        const button = document.createElement('button');
        button.textContent = 'X';
        button.style.cssText = 'width:20px;height:20px';
        document.body.append(button);
      });
      assert.equal((await run('color_contrast_results')).failing, 1);
      assert.equal((await run('target_size_results')).small, 1);
      console.log('PASS: hidden labels/controls excluded; visible contrast and target failures retained.');
      return;
    }
    await page.goto(process.argv[2] || 'https://staging.silversurfers.ai/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input');
    const contrast = check('color_contrast_results')
      .replace('ratio: ratio,', 'html: el.outerHTML, ratio: ratio,')
      .replace('total: total,', 'items: textElements.filter(e => !e.passes), total: total,');
    console.log(JSON.stringify({
      contrast: await page.evaluate(`(${contrast})()`),
      targets: await page.evaluate(`(${check('target_size_results')})()`),
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
