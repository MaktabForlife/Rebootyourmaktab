import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const script = await readFile(new URL('../../js/m4l-academy-catalogue.js', import.meta.url), 'utf8');
function element() {
  const classes = new Set(), handlers = new Map(), attrs = {};
  return { handlers, attrs, dataset: {}, classList: {
    add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
    toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }
  }, setAttribute(key,value) { attrs[key]=value; }, addEventListener(type,fn) { handlers.set(type,fn); } };
}
const cards = Array.from({length:35},(_,index) => {
  const card=element();card.offsetLeft=index*100;card.image={loading:'lazy'};
  card.href=`https://ummabbadacademy.com/course-${index}/`;
  card.querySelector=()=>card.image;card.focus=()=>{card.focused=true;};
  card.cloneNode=()=>({...element(),href:card.href,querySelector:()=>({loading:'lazy'})});
  return card;
});
const track=element();track.scrollLeft=0;track.querySelectorAll=()=>cards;track.children=[];
track.appendChild=card=>{card.offsetLeft=3500+track.children.length*100;track.children.push(card);};
track.contains=()=>false;
const ids=Object.fromEntries(['film-prev','film-next','film-toggle','film-status','overview'].map(id=>[id,element()]));
ids['film-track']=track;ids.overview.classList.add('active');
const pages=Array.from({length:4},(_,index)=>({...element(),dataset:{filmPage:String(index)}}));
const document={visibilityState:'visible',getElementById:id=>ids[id],querySelectorAll:()=>pages,...element()};
const window=element(), motion={matches:false,...element()}, frames=new Map();let serial=0, time=0, observer;
runInNewContext(script,{document,window,matchMedia:()=>motion,
  requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),
  IntersectionObserver:class{constructor(fn){observer=fn;}observe(){}}});
const click=node=>node.handlers.get('click')();
const step=(count=1,delta=16)=>{for(let n=0;n<count;n++){time+=delta;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));}};
assert.equal(ids['film-toggle'].textContent,'Play');
assert.equal(frames.size,0);
assert.equal(track.children.length,35);
assert.equal(track.children[0].href,cards[0].href);
assert.equal(track.children[0].attrs['aria-hidden'],'true');
assert.equal(track.children[0].tabIndex,-1);
click(ids['film-toggle']);step(61);
assert.ok(track.scrollLeft>25&&track.scrollLeft<35,'Play glides continuously at a stable speed');
const beforePause=track.scrollLeft;
track.handlers.get('pointerenter')();step(10);
assert.equal(track.scrollLeft,beforePause,'Hover pauses motion');
track.handlers.get('pointerleave')();step(2);assert.ok(track.scrollLeft>beforePause);
document.visibilityState='hidden';document.handlers.get('visibilitychange')();step(10);
const hiddenPosition=track.scrollLeft;
assert.equal(frames.size,0);
document.visibilityState='visible';document.handlers.get('visibilitychange')();step(2,5000);
assert.ok(track.scrollLeft-hiddenPosition<3,'Resuming after a background stall must not jump');
observer([{isIntersecting:false}]);assert.equal(frames.size,0);
observer([{isIntersecting:true}]);step(2);assert.ok(track.scrollLeft>hiddenPosition);
track.handlers.get('pointerdown')();assert.equal(ids['film-toggle'].textContent,'Play');assert.equal(frames.size,0);
track.scrollLeft=3499;track.handlers.get('scroll')();click(ids['film-toggle']);step(5);
assert.ok(track.scrollLeft<3,'The final poster loops seamlessly into the first copy');
click(pages[2]);step(43);
assert.equal(Math.round(track.scrollLeft),2000);
assert.equal(ids['film-status'].textContent,'21 / 35');
assert.equal(pages[2].attrs['aria-pressed'],'true');
click(ids['film-prev']);step(43);assert.equal(Math.round(track.scrollLeft),1900);
click(ids['film-next']);step(43);assert.equal(Math.round(track.scrollLeft),2000);
motion.matches=true;motion.handlers.get('change')();
click(pages[0]);assert.equal(track.scrollLeft,0,'Reduced motion uses direct manual changes');
click(ids['film-toggle']);step(100);assert.equal(track.scrollLeft,0);
step(202);assert.equal(track.scrollLeft,100,'Explicit reduced-motion playback changes posters at a reading interval');
click(ids['film-toggle']);assert.equal(frames.size,0);
const html=await readFile(new URL('../../academy/index.html',import.meta.url),'utf8');
assert.doesNotMatch(html,/>Catalogue page<|>page 1<|>page 2<|>page 3<|>page 4</);
assert.match(html,/Read public lessons on the original Academy site/);
console.log('Academy catalogue: smooth playback, loop seam, manual controls, hover/visibility pauses, reduced motion and public destinations passed.');
