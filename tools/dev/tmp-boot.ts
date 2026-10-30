import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--window-size=1280,720", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-webgl"],
  defaultViewport: { width: 1280, height: 720 },
});
try {
  const page = await browser.newPage();
  // a slow connection: every module and model takes a while, so that the message has time to be seen
  const client = await page.createCDPSession();
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1024 * 1024) / 8, uploadThroughput: (1024 * 1024) / 8 });
  // not awaited: the page only reports it has loaded when every module is there, and the message is for the time before that
  void page.goto("http://localhost:5174/?seed=boot-test", { timeout: 180000 }).catch(() => undefined);
  const started = Date.now();
  let shot = 0;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const text = await page
      .evaluate("(() => { const b = document.getElementById('boot'); return b ? b.innerText.replace(/\\n+/g, ' | ') + ' | bar ' + document.querySelector('#boot .fill').style.width : 'gone'; })()")
      .catch(() => "(navigating)");
    console.log(`${((Date.now() - started) / 1000).toFixed(0)} s:`, text);
    if (shot < 3 && (i === 0 || String(text).includes("%") || text === "gone")) {
      await page.screenshot({ path: `C:/Users/spend/AppData/Local/Temp/claude-shots/boot${shot++}.png` });
    }
    if (text === "gone") break;
  }
} finally {
  await browser.close();
}
