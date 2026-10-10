import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const events=new Map(),context={window:{},document:{addEventListener:(name,fn)=>events.set(name,fn)}};
vm.runInNewContext(readFileSync(new URL('../../js/m4l-time.js',import.meta.url),'utf8'),context);
const {parse}=context.window.M4L_TIME;
for(const [input,expected] of Object.entries({'830':'08:30','0830':'08:30','2100':'21:00','2130':'21:30','8h30':'08:30','08:30':'08:30','4pm':'16:00','4:30 PM':'16:30','12am':'00:00','12pm':'12:00','0':'00:00','2359':'23:59'}))assert.equal(parse(input),expected,input);
for(const input of ['','2400','1260','8:75','25:00','0pm','13pm','8.5','9:3','830anything','-830'])assert.equal(parse(input),'',input);
const input={value:'830',validity:'',hasAttribute:key=>key==='data-time24',setCustomValidity(value){this.validity=value;}};
events.get('change')({target:input});assert.equal(input.value,'08:30');assert.equal(input.validity,'');
input.value='2460';events.get('change')({target:input});assert.equal(input.value,'2460');assert.match(input.validity,/valid time/);
events.get('input')({target:input});assert.equal(input.validity,'');
console.log('Clock input: compact and AM/PM entries convert to HH:mm; invalid times remain visible for correction.');
