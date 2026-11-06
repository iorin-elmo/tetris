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
