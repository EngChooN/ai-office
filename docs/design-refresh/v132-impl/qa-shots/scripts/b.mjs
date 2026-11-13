import {connect} from './lib.mjs'
const c=await connect();
await c.send('Emulation.clearDeviceMetricsOverride');
for (const o of [{format:'png'},{format:'jpeg',quality:60},{format:'png',fromSurface:false}]){
const r=await Promise.race([c.send('Page.captureScreenshot',o).then(m=>'shot '+(m.result?.data?.length)+JSON.stringify(m.error||'')),c.sleep(6000).then(()=>'timeout')]);
console.log(JSON.stringify(o),r);}
c.close()
