const B='http://localhost:5000/api';
let fails=0;
const ok=(c,m)=>{ if(!c){fails++;console.log('FAIL:',m)} else console.log('ok  :',m) };
async function call(method,path,token,body){
  const r=await fetch(B+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  let data=null; try{data=await r.json()}catch{}
  return {s:r.status,d:data};
}
const login=async(e)=> (await call('POST','/auth/login',null,{email:e,password:'StrongPass123'})).d.token;
const M=await login('manager@example.com'), C=await login('cashier@example.com');
const cat=(await call('GET','/categories',M)).d.categories[0].id;
const mk=async(b)=> (await call('POST','/products',M,{categoryId:cat,...b})).d.product;
const A=await mk({name:'Paracetamol 500mg',strength:'500mg',dosageForm:'Tablet',barcodes:['111']});
const Bp=await mk({name:'Amoxicillin',strength:'500mg',dosageForm:'Capsule',barcodes:['222']});
const Cp=await mk({name:'Amoxicillin',strength:'250mg',dosageForm:'Capsule',barcodes:['223']});
const D=await mk({name:'Vitamin C',itemType:'general'});
const stockOf=async(id)=> (await call('GET','/products/'+id,M)).d.product.stock;
const imp=(rows,extra={})=>call('POST','/products/stock-import',M,{rows,...extra});

const good=[
 {row:2,barcode:'111',batchNo:'P1',expiryDate:'2028-01-31',quantity:'100',costPrice:'180',sellingPrice:'350'},
 {row:3,name:'Vitamin C',quantity:'50',costPrice:'150',sellingPrice:'280'},
];
let r=await imp(good,{dryRun:true});
ok(r.s===200 && r.d.summary.batches===2 && r.d.summary.units===150 && r.d.summary.errors===0 && r.d.committed===false,'dry run previews 2 batches / 150 units, nothing committed');
ok(await stockOf(A.id)===0 && await stockOf(D.id)===0,'dry run changed no stock');

// matching rules
r=await imp([{row:2,name:'Amoxicillin',quantity:'5',costPrice:'1',sellingPrice:'2'}],{dryRun:true});
ok(r.d.rows[0].status==='error' && /More than one/.test(r.d.rows[0].message),'ambiguous name refused: '+r.d.rows[0].message);
r=await imp([{row:2,name:'Amoxicillin',strength:'250mg',quantity:'5',costPrice:'1',sellingPrice:'2'}],{dryRun:true});
ok(r.d.rows[0].status==='ok' && r.d.rows[0].productId===Cp.id,'strength picks the right Amoxicillin');
r=await imp([{row:2,name:'amoxicillin',strength:'500mg',dosageForm:'capsule',quantity:'5',costPrice:'1',sellingPrice:'2'}],{dryRun:true});
ok(r.d.rows[0].productId===Bp.id,'name, strength and form matching ignore capitals');
r=await imp([{row:2,barcode:'222',quantity:'5',costPrice:'1',sellingPrice:'2'}],{dryRun:true});
ok(r.d.rows[0].productId===Bp.id,'barcode alone finds the product');
r=await imp([{row:2,barcode:'000',name:'Vitamin C',quantity:'5',costPrice:'1',sellingPrice:'2'}],{dryRun:true});
ok(r.d.rows[0].productId===D.id,'unknown barcode falls back to the name');

// bad rows
const bad=[
 {row:2,name:'Nothing Like This',quantity:'5',costPrice:'1',sellingPrice:'2'},
 {row:3,barcode:'000',quantity:'5',costPrice:'1',sellingPrice:'2'},
 {row:4,barcode:'111',quantity:'0',costPrice:'1',sellingPrice:'2'},
 {row:5,barcode:'111',quantity:'1.5',costPrice:'1',sellingPrice:'2'},
 {row:6,barcode:'111',quantity:'5',costPrice:'',sellingPrice:'2'},
 {row:7,barcode:'111',quantity:'5',costPrice:'1',sellingPrice:'-4'},
 {row:8,barcode:'111',quantity:'5',costPrice:'1',sellingPrice:'2',expiryDate:'2020-01-01'},
 {row:9,quantity:'5',costPrice:'1',sellingPrice:'2'},
 {row:10,barcode:'111',quantity:'5',costPrice:'1',sellingPrice:'2',expiryDate:'soon'},
 {row:11,barcode:'111',quantity:'abc',costPrice:'1',sellingPrice:'2'},
];
r=await imp(bad,{dryRun:true});
ok(r.d.summary.errors===10 && r.d.rows.every(x=>x.status==='error' && x.message),'10 bad rows each get one clear message');
console.log('   messages:',r.d.rows.map(x=>x.row+': '+x.message).join(' | ').slice(0,400));

// all-or-nothing
r=await imp([...good,bad[0]],{dryRun:false});
ok(r.s===409 && await stockOf(A.id)===0 && await stockOf(D.id)===0,'one bad row blocks the whole import: no stock added');

// commit
r=await imp(good,{dryRun:false});
ok(r.s===200 && r.d.committed===true && r.d.summary.units===150,'valid file commits');
ok(await stockOf(A.id)===100 && await stockOf(D.id)===50,'stock is now 100 and 50');
let pr=(await call('GET','/products/'+A.id,M)).d.product.batches[0];
ok(pr.costPrice===180 && pr.sellingPrice===350 && pr.batchNo==='P1' && pr.expiryDate==='2028-01-31' && pr.qtyReceived===100,'batch holds quantity, prices, batch number and expiry');

// repeat protection
r=await imp(good,{dryRun:true}); ok(r.d.previouslyImportedAt!==null,'dry run warns that this file was imported before');
r=await imp(good,{dryRun:false}); ok(r.s===409 && await stockOf(A.id)===100,'repeat import refused, stock unchanged');
const noBatch=[{row:2,name:'Vitamin C',quantity:'10',costPrice:'150',sellingPrice:'280'}];
r=await imp(noBatch,{dryRun:false}); ok(r.s===200 && await stockOf(D.id)===60,'restock without batch number adds 10 (stock 60)');
r=await imp(noBatch,{dryRun:false}); ok(r.s===409 && await stockOf(D.id)===60,'same restock file refused a second time');
r=await imp(noBatch,{dryRun:false,allowRepeat:true}); ok(r.s===200 && await stockOf(D.id)===70,'allowRepeat lets a deliberate repeat through (stock 70)');

// duplicate batches
r=await imp([{row:2,barcode:'111',batchNo:'p1',expiryDate:'2028-01-31',quantity:'5',costPrice:'1',sellingPrice:'2'}],{dryRun:true});
ok(r.d.rows[0].status==='error' && /already exists/.test(r.d.rows[0].message),'existing batch number + expiry is refused');
r=await imp([
 {row:2,barcode:'222',batchNo:'X1',expiryDate:'2028-05-01',quantity:'5',costPrice:'1',sellingPrice:'2'},
 {row:3,barcode:'222',batchNo:'x1',expiryDate:'2028-05-01',quantity:'5',costPrice:'1',sellingPrice:'2'}],{dryRun:true});
ok(r.d.rows[1].status==='error' && /Same batch as row 2/.test(r.d.rows[1].message),'same batch twice in one file is flagged');

// limits and permissions
r=await call('POST','/products/stock-import',C,{rows:good,dryRun:true}); ok(r.s===403,'cashier cannot import stock');
r=await imp([],{dryRun:true}); ok(r.s===400,'empty file rejected');
r=await imp(Array.from({length:2001},(_,i)=>({row:i+2,barcode:'111',quantity:'1',costPrice:'1',sellingPrice:'1'})),{dryRun:true}); ok(r.s===400,'more than 2000 rows rejected');
r=await call('POST','/products/stock-import',null,{rows:good}); ok(r.s===401,'login required');

// the stock can be sold at the imported price
r=await call('POST','/sales/quote',C,{items:[{productId:A.id,quantity:5}]}); ok(r.d.total===1750 && r.d.problems.length===0,'imported stock sells at the imported price (5 x 350 = 1750)');
const list=(await call('GET','/products?search=Paracetamol',M)).d.items[0]; ok(list.status==='in' && list.sellingPrice===350,'product list shows In Stock and the price');
console.log(fails?`\n${fails} FAILED`:'\nALL PASSED');
