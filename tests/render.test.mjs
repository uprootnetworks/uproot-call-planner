import test from 'node:test';
import assert from 'node:assert/strict';
import {render} from '../scripts/render.mjs';
const result={receipt_status:'confirmed',receipt_id:'receipt-test',run_id:'test',csv_sha256:'a'.repeat(64),destination:'https://uprootnetworks.com/wp-json/uproot-demo/v1/enrich',received_rows:2,duplicates_removed:1,ranked_prospects:[{priority:1,name:'Alex <script>alert(1)</script>',company:'Example & Co',deal_value:65000,stage:'Negotiation',suggested_next_step:'Confirm status'}]};
test('renders confirmed result safely without active scripts or external resources',()=>{const html=render(result);assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('Example &amp; Co'));assert.ok(html.includes('$65,000'));assert.ok(html.includes('receipt-test'));assert.ok(!/<script|<link|<iframe|<img/i.test(html));});
test('does not turn failed or missing receipts into a successful dashboard',()=>{for(const value of [{...result,receipt_status:'unconfirmed'},{...result,receipt_id:''},{...result,destination:'https://other.example'}])assert.throws(()=>render(value));});
test('rejects inconsistent counts and invalid results',()=>{assert.throws(()=>render({...result,received_rows:10}));assert.throws(()=>render({...result,ranked_prospects:[]}));});
