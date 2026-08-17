import { chromium, devices } from '@playwright/test';
import { MOCK_RALLY_SETTINGS } from './tests/mocks/data.ts';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['Pixel 7'] });
const p = await ctx.newPage();
await p.route('**/api/rally/v1/rally/settings/public**', r => r.fulfill({status:200,contentType:'application/json',
  body:JSON.stringify({...MOCK_RALLY_SETTINGS, public_access_enabled:true})}));
await p.goto('http://localhost:4174/rally/', {waitUntil:'networkidle'});
console.log(await p.evaluate(() => {
  const out=[];
  for (const el of document.querySelectorAll(String.raw`.tracking-\[0\.16em\]`)) {
    const cs=getComputedStyle(el);
    let n=el.parentElement, bg='rgba(0, 0, 0, 0)';
    while(n){ const c=getComputedStyle(n).backgroundColor; if(c!=='rgba(0, 0, 0, 0)'){bg=c;break;} n=n.parentElement; }
    out.push({text:el.textContent, color:cs.color, size:cs.fontSize, weight:cs.fontWeight, bg, cls:el.className});
  }
  return out;
}));
await b.close();
