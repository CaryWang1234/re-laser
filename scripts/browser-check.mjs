import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
const sleep = ms => new Promise(r => setTimeout(r,ms));
const out = path.resolve('.checks'); await mkdir(out,{recursive:true});
const server = createServer(async (req,res) => {
  try {
    const pathname = new URL(req.url,'http://localhost').pathname;
    const file = path.resolve('dist', '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(path.resolve('dist') + path.sep)) { res.writeHead(403).end(); return; }
    const content = await readFile(file);
    res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)] || 'application/octet-stream');
    res.end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(5174,'127.0.0.1',resolve));
const chrome = process.env.CHROME_PATH || path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium-1234/chrome-win64/chrome.exe');
const child = spawn(chrome,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9333',`--user-data-dir=${path.join(out,'browser-profile')}`],{windowsHide:true,stdio:'ignore'});
let ws; const errors = [];
try {
  let pages;
  for(let i=0;i<80;i++){ try { pages = await (await fetch('http://127.0.0.1:9333/json')).json(); if(pages.length)break; }catch{} await sleep(100); }
  assert.ok(pages?.length,'Chromium did not start');
  ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0; const pending = new Map();
  ws.onmessage = e => {
    const data = JSON.parse(e.data);
    if(data.method==='Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text + ' ' + JSON.stringify(data.params.exceptionDetails.exception));
    if(data.id){const p=pending.get(data.id);pending.delete(data.id);data.error?p?.reject(data.error):p?.resolve(data.result);}
  };
  const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const click = async text => { assert.ok(await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b||b.disabled)return false;b.click();return true})()`),`Missing button ${text}`); };
  const has = text => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`);
  const waitFor = async text => {for(let i=0;i<100;i++){if(await has(text))return;await sleep(100);}throw Error('Timeout: '+text+' '+await evaluate('document.body.innerText'));};
  const screenshot=async name=>{const r=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));};
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:5174'}); await waitFor('选择关卡');
  await evaluate('localStorage.clear()'); await call('Page.reload'); await waitFor('开始第一束光');
  await screenshot('home-desktop');
  await click('玩法说明'); await click('明白了');
  await click('开始第一束光'); await click('光路预览');
  await screenshot('game-desktop');
  await click('执行回合');
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('光束运行')).disabled`),true);
  await waitFor('通关成功'); await click('关卡选择'); await click('强力突破');
  const cell = async(row,col,w,h)=>{
    const coords = await evaluate(`(()=>{const tools=document.querySelector('.editor-tools');const top=tools?Math.max(130,tools.getBoundingClientRect().bottom+48):130;const bottom=tools?30:160;const ah=Math.max(80,innerHeight-top-bottom);const cs=Math.max(4,Math.min(60,Math.floor((innerWidth-40)/${w}),Math.floor(ah/${h})));return {x:Math.round((innerWidth-${w}*cs)/2)+(${col}+.5)*cs,y:Math.round(top+(ah-${h}*cs)/2)+(${row}+.5)*cs}})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...coords});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...coords});
  };
  await cell(1,1,5,3); await waitFor('强力模式');
  await click('执行回合'); await sleep(700); await waitFor('正在蓄能：1/3');
  await click('撤销'); await waitFor('已撤销');
  assert.ok(await has('0/8'));
  await click('执行回合'); await click('重试'); await sleep(900); assert.ok(await has('0/8'),'stale timer must not leave reset level');
  await cell(1,1,5,3);
  for(let i=0;i<3;i++){await click('执行回合');await sleep(900);}
  await waitFor('通关成功');
  await click('关卡选择'); await click('旋转镜面'); await click('执行回合'); await click('退出'); await sleep(900); assert.ok(await has('选择关卡'));
  await click('返回'); await click('创意工坊'); await click('新建关卡');
  await cell(2,0,8,6); await click('发射器'); await cell(2,1,8,6); await click('障碍'); await cell(2,3,8,6); await click('验证'); await waitFor('✓ 可解');
  await screenshot('editor-desktop');
  await click('清空');
  await evaluate(`(()=>{const s=document.querySelector('select[aria-label="棋盘尺寸"]');s.value='12×10';s.dispatchEvent(new Event('change'));})()`);
  await click('电池'); await cell(4,0,12,10);
  await click('发射器'); await cell(4,1,12,10);
  await click('转电器'); await cell(4,5,12,10);
  await click('导线'); for(let col=6;col<=8;col++)await cell(4,col,12,10);
  await click('发射器'); await cell(4,9,12,10);
  await click('传感器'); await cell(4,11,12,10);
  await click('试玩'); await waitFor('WORKSHOP');
  await click('执行回合'); await sleep(1500); await click('执行回合'); await waitFor('通关成功');
  await click('返回编辑器');
  assert.equal(await evaluate(`document.querySelector('select[aria-label="棋盘尺寸"]').value`),'12×10');
  await click('传送门'); await cell(7,3,12,10); await cell(7,9,12,10);
  await click('散射器'); await cell(7,5,12,10);
  await click('自动开关'); await cell(2,9,12,10);
  await click('单向光阀'); await cell(2,3,12,10); await cell(2,3,12,10);
  await click('传感器'); await cell(4,11,12,10);
  await click('验证'); await waitFor('✓ 可解');
  await screenshot('circuit-editor-desktop');
  await click('返回'); await click('返回');
  await click('新：光电实验室');
  await waitFor('光电接力');
  await cell(1,5,12,10); await waitFor('转电器：储能');
  await cell(4,5,12,10); await click('执行回合'); await sleep(1500);
  await click('执行回合'); await waitFor('通关成功');
  await click('关卡选择'); await click('光电核心');
  await screenshot('circuit-desktop');
  await click('＋');
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:700,y:380,button:'left',clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:760,y:440,button:'left',buttons:1});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:760,y:440,button:'left',clickCount:1});
  await click('全图'); await click('退出'); await click('返回');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true}); await sleep(200); await screenshot('home-mobile');
  await click('巨构回路挑战'); await screenshot('circuit-mobile');
  await click('＋'); await click('全图');
  assert.ok(await evaluate(`(()=>{const r=document.querySelector('.game-dock').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`),'mobile controls fit');
  assert.deepEqual(errors,[],'browser runtime errors');
  console.log('PASS browser: menu, help, preview, win, strong charge, undo, rapid fire lock, restart/exit timers, editor placement/validation, circuit relay win, large-board zoom and pan, desktop and mobile layouts.');
} finally { ws?.close(); child.kill(); server.close(); }
