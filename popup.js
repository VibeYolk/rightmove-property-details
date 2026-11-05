const option = document.getElementById('auto-ocr');
const status = document.getElementById('status');
chrome.storage.local.get({ocrEnabled:false}).then(settings => { option.checked = settings.ocrEnabled === true; });
option.addEventListener('change', async () => {
  option.disabled = true;
  try {
    await chrome.storage.local.set({ocrEnabled:option.checked});
    status.textContent = option.checked ? '自动识别已开启。' : '自动识别已关闭。';
  } catch {
    option.checked = !option.checked;
    status.textContent = '保存失败，请重试。';
  } finally { option.disabled = false; }
});
