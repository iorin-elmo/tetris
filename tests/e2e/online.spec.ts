import {test,expect} from '@playwright/test';
test('two browsers: invite, authoritative battle, reload resume, result and rematch',async({page,browser})=>{
  const other=await browser.newContext();const guest=await other.newPage();
  try{
    await page.goto('/');await page.getByRole('button',{name:/オンラインで遊ぶ/}).click();await page.getByLabel('ゲスト名').fill('HOST');await page.getByRole('button',{name:/新しい部屋を作る/}).click();
    await expect(page.getByRole('heading',{name:'ROOM LOBBY'})).toBeVisible();const code=(await page.locator('.room-code').textContent())!;
    await guest.goto(`/?room=${code}`);await guest.getByLabel('ゲスト名').fill('GUEST');await guest.getByRole('button',{name:/コードで参加する/}).click();
    await expect(page.locator('.member-row')).toHaveCount(2);await expect(guest.getByRole('button',{name:/対戦をはじめる/})).toBeDisabled();
    await page.getByRole('button',{name:/対戦をはじめる/}).click();await expect(page.getByRole('heading',{name:'FREE FOR ALL'})).toBeVisible({timeout:10000});await expect(guest.getByRole('heading',{name:'FREE FOR ALL'})).toBeVisible();
    await page.keyboard.press('KeyC');await expect(page.locator('.hold-rail .mini-piece i')).toHaveCount(4);await page.waitForTimeout(400);
    await page.reload();await expect(page.getByRole('heading',{name:'FREE FOR ALL'})).toBeVisible({timeout:10000});await expect(page.locator('.hold-rail .mini-piece i')).toHaveCount(4);
    await page.screenshot({path:'.local/online.png',fullPage:true});
    for(let i=0;i<45;i++){if(await page.locator('.results-modal').isVisible())break;await page.keyboard.press('ArrowUp');await page.waitForTimeout(90);}
    await expect(page.locator('.results-modal')).toBeVisible({timeout:10000});await expect(guest.locator('.results-modal')).toBeVisible();await expect(page.locator('.results-modal tbody tr')).toHaveCount(2);
    await page.getByRole('button',{name:/ロビーへ戻る/}).click();await guest.getByRole('button',{name:/ロビーへ戻る/}).click();await expect(page.getByRole('heading',{name:'ROOM LOBBY'})).toBeVisible();
    await page.getByRole('button',{name:/対戦をはじめる/}).click();await expect(page.getByRole('heading',{name:'FREE FOR ALL'})).toBeVisible({timeout:10000});
  }finally{await other.close();}
});
