import {test,expect} from '@playwright/test';
test('home, real keyboard play, pause and return',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:'さあ、何して遊ぶ？'})).toBeVisible();
  await page.screenshot({path:'.local/home.png',fullPage:true});
  await page.getByRole('button',{name:/02 \/ TIME ATTACK/}).click();
  await expect(page.getByRole('heading',{name:'40 LINES',exact:true})).toBeVisible();
  await page.keyboard.press('ArrowUp');await page.keyboard.press('KeyC');
  await expect(page.locator('.hold-rail .mini-piece i')).toHaveCount(4);
  await page.keyboard.press('Escape');await expect(page.getByRole('heading',{name:'PAUSED'})).toBeVisible();
  await page.getByRole('button',{name:'ホームに戻る',exact:true}).click();
  await expect(page.getByRole('heading',{name:'さあ、何して遊ぶ？'})).toBeVisible();expect(errors).toEqual([]);
});
test('three completed games can be retried without stale hold or board state',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/01 \/ SOLO/}).click();
  for(let round=0;round<3;round++){
    for(let i=0;i<40;i++){
      if(await page.getByRole('heading',{name:'おつかれさま。'}).isVisible())break;
      await page.keyboard.press('ArrowUp');await page.waitForTimeout(45);
    }
    await expect(page.getByRole('heading',{name:'おつかれさま。'})).toBeVisible();
    await page.getByRole('button',{name:/もう一度プレイ/}).click();
    await expect(page.locator('.hold-rail .mini-piece i')).toHaveCount(0);
  }
});
test('input and accessibility settings survive reload',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'設定を開く'}).click();
  await page.getByLabel('DAS (ms)',{exact:true}).fill('0');await page.getByLabel('ARR (ms)',{exact:true}).fill('0');
  await page.getByRole('button',{name:'画面・音',exact:true}).click();await page.getByLabel('ミノに文字・輪郭を表示').check();
  await page.getByRole('button',{name:/保存して閉じる/}).click();await page.reload();
  await page.getByRole('button',{name:'設定を開く'}).click();await expect(page.getByLabel('DAS (ms)',{exact:true})).toHaveValue('0');
  await page.getByRole('button',{name:'画面・音',exact:true}).click();await expect(page.getByLabel('ミノに文字・輪郭を表示')).toBeChecked();
});
