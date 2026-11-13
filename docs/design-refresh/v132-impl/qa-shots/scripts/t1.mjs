import {connect} from './lib.mjs'
const c=await connect();
await c.vp(1400,860,'light');
console.log(await c.click('직원'));
await c.shot('01-staff-list-1400-light');
console.log((await c.text()).slice(0,1800));
c.close()
