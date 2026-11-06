import {it,expect} from 'vitest';
import {balance,estimateSkills} from './balance';
import type {Skill} from '../../../../packages/protocol/src/index';
const s=(value:number):Skill=>({value,confidence:1,matches:20,pps:1,apm:30,app:.5});
it('assigns ten players exactly once, caps at six, and is reproducible',()=>{
  const p=Array.from({length:10},(_,i)=>({id:String(i),skill:s(1+i/3)}));const results=balance(p,4,6,123);
  expect(results).toEqual(balance(p,4,6,123));expect(results.length).toBe(3);
  for(const result of results){expect(Object.keys(result.assignments).sort()).toEqual(p.map(p=>p.id).sort());expect(result.teams.every(t=>t.count<=6)).toBe(true);}
});
it('permits uneven headcounts when skills balance',()=>{
  const p=[{id:'strong',skill:s(3)},...Array.from({length:3},(_,i)=>({id:String(i),skill:s(1)}))];
  expect(balance(p,2,6,33,0)[0].teams.map(t=>t.count).sort()).toEqual([1,3]);
});
it('shrinks new guests to a provisional population mean and clips outliers',()=>{
  const players=[{id:'new',skill:{...s(1),matches:0}},{id:'old',skill:{...s(1),pps:999,apm:99999,app:999}}];
  const result=estimateSkills(players);expect(result.new.value).toBe(1);expect(result.new.confidence).toBe(0);expect(result.old.value).toBeLessThanOrEqual(2.05);
});
