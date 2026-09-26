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
    const coords = await evaluate(`(()=>{const cs=Math.max(12,Math.min(60,Math.floor((innerWidth-40)/${w}),Math.floor((innerHeight-260)/${h})));return {x:Math.round((innerWidth-${w}*cs)/2)+(${col}+.5)*cs,y:Math.max(130,Math.round((innerHeight-${h}*cs)/2))+(${row}+.5)*cs}})()`);
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
  await click('返回'); await click('返回');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true}); await sleep(200); await screenshot('home-mobile');
  await click('选择关卡'); await click('Re-Laser'); await screenshot('game-mobile');
  assert.ok(await evaluate(`(()=>{const r=document.querySelector('.game-dock').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`),'mobile controls fit');
  assert.deepEqual(errors,[],'browser runtime errors');
  console.log('PASS browser: menu, help, preview, win, strong charge, undo, rapid fire lock, restart/exit timers, editor placement/validation, desktop and mobile layouts.');
} finally { ws?.close(); child.kill(); server.close(); }
