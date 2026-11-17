const B='http://localhost:5000/api';
let fails=0;
const ok=(c,m)=>{ if(!c){fails++;console.log('FAIL:',m)} else console.log('ok  :',m) };
async function call(method,path,token,body){
  const r=await fetch(B+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  let data=null; try{data=await r.json()}catch{}
  return {s:r.status,d:data};
}
const login=async(e)=> (await call('POST','/auth/login',null,{email:e,password:'StrongPass123'})).d.token;
const A=await login('admin@example.com'), M=await login('manager@example.com'), C=await login('cashier@example.com');
const uuid=()=>crypto.randomUUID();

const cat=(await call('GET','/categories',A)).d.categories[0].id;
const past=new Date(Date.now()-86400000*30).toISOString().slice(0,10);
const mk=async(body)=> (await call('POST','/products',M,{categoryId:cat,...body})).d.product;
const P1=await mk({name:'Paracetamol 500mg',strength:'500mg',barcodes:['111'],batches:[
  {batchNo:'EXP',expiryDate:past,quantity:50,costPrice:100,sellingPrice:300},
  {batchNo:'B1',expiryDate:'2027-02-28',quantity:5,costPrice:185,sellingPrice:360},
  {batchNo:'B2',expiryDate:'2027-12-31',quantity:500,costPrice:180,sellingPrice:350}]});
const P2=await mk({name:'Amoxicillin 500mg',strength:'500mg',requiresPrescription:true,batches:[{expiryDate:'2027-06-30',quantity:20,costPrice:220,sellingPrice:400}]});
const P3=await mk({name:'Hand Sanitizer 100ml',itemType:'general',batches:[{quantity:10,costPrice:400,sellingPrice:750}]});
const P4=await mk({name:'Last One',batches:[{quantity:1,costPrice:10,sellingPrice:100}]});

// quotes
let r=await call('POST','/sales/quote',C,{items:[{productId:P1.id,quantity:7}]});
ok(r.s===200 && r.d.total===2500 && r.d.problems.length===0,'quote spans two batches: 5x360 + 2x350 = 2500 (got '+r.d.total+')');
r=await call('POST','/sales/quote',C,{items:[{productId:P1.id,quantity:600}]});
ok(r.d.problems.length===1 && r.d.problems[0].available===505,'quote flags insufficient stock, expired excluded (available '+r.d.problems[0]?.available+')');
r=await call('POST','/sales/quote',C,{items:[{productId:P1.id,quantity:7}],discount:{type:'percent',value:10}});
ok(r.d.discount===250 && r.d.total===2250,'quote with 10% discount');
r=await call('POST','/sales/quote',C,{items:[{productId:P1.id,quantity:7}],discount:{type:'amount',value:99999}});
ok(r.d.discountError && r.d.total===2500,'quote rejects discount larger than subtotal: '+r.d.discountError);
r=await call('POST','/sales/quote',C,{items:[]}); ok(r.s===400,'empty cart rejected');
r=await call('POST','/sales/quote',C,{items:[{productId:'nope',quantity:1}]}); ok(r.s===400,'bad product id rejected');
r=await call('POST','/sales/quote',C,{items:[{productId:P1.id,quantity:0}]}); ok(r.s===400,'zero quantity rejected');
r=await call('POST','/sales/quote',C,{items:[{productId:P1.id,quantity:1.5}]}); ok(r.s===400,'fractional quantity rejected');
r=await call('POST','/sales/quote',null,{items:[{productId:P1.id,quantity:1}]}); ok(r.s===401,'quote needs login');

// prescription rule
r=await call('POST','/sales',C,{items:[{productId:P2.id,quantity:1}],paymentMethod:'cash'});
ok(r.s===400 && /prescription/i.test(r.d.error),'Rx item blocked without confirmation');
r=await call('POST','/sales',C,{items:[{productId:P2.id,quantity:1}],paymentMethod:'cash',rxConfirmed:true});
ok(r.s===201,'Rx item sells once confirmed');

// main sale
const ref=uuid();
const body={items:[{productId:P1.id,quantity:7,unitPrice:1},{productId:P3.id,quantity:1}],discount:{type:'percent',value:10},paymentMethod:'cash',amountTendered:5000,clientRef:ref};
r=await call('POST','/sales',C,body);
const sale=r.d.sale;
ok(r.s===201 && sale.subtotal===3250 && sale.discount===325 && sale.total===2925,'sale totals 3250 - 325 = 2925 (got '+sale?.total+')');
ok(sale.change===2075 && sale.amountTendered===5000,'cash change 2075');
ok(/^HPS-\d{8}-\d{4}$/.test(sale.receiptNo),'receipt number format '+sale.receiptNo);
ok(sale.items.length===3,'receipt lines (batch prices differ so 360 and 350 stay separate): '+sale.items.map(i=>i.quantity+'x'+i.unitPrice).join(', '));
ok(sale.pharmacy.name==='Hiddekel Pharmacy and Store' && sale.cashier==='Cathy Cashier','receipt carries pharmacy and cashier');
let list=(await call('GET','/products?search=Paracetamol',M)).d.items[0];
ok(list.stock===548 && list.sellableStock===498,'stock 548 (50 expired kept), sellable 498 (got '+list.stock+'/'+list.sellableStock+')');
// idempotency
r=await call('POST','/sales',C,body);
ok(r.s===200 && r.d.sale.receiptNo===sale.receiptNo,'same clientRef returns the same sale');
list=(await call('GET','/products?search=Paracetamol',M)).d.items[0];
ok(list.stock===548,'stock deducted only once after the repeat');
// next receipt number
r=await call('POST','/sales',C,{items:[{productId:P3.id,quantity:1}],paymentMethod:'pos'});
ok(r.s===201 && Number(r.d.sale.receiptNo.slice(-4))===Number(sale.receiptNo.slice(-4))+1,'receipt numbers increase: '+r.d.sale.receiptNo);
ok(r.d.sale.amountTendered===null && r.d.sale.change===null,'non-cash sale has no change');
// payment checks
r=await call('POST','/sales',C,{items:[{productId:P3.id,quantity:1}],paymentMethod:'cash',amountTendered:100}); ok(r.s===400,'cash short of total rejected');
r=await call('POST','/sales',C,{items:[{productId:P3.id,quantity:1}],paymentMethod:'bitcoin'}); ok(r.s===400,'unknown payment type rejected');
r=await call('POST','/sales',C,{items:[{productId:P3.id,quantity:9999}],paymentMethod:'cash'}); ok(r.s===409,'selling more than stock rejected');
r=await call('POST','/sales',C,{items:[{productId:P3.id,quantity:1}],paymentMethod:'cash',discount:{type:'percent',value:150}}); ok(r.s===400,'discount over 100% rejected');
list=(await call('GET','/products?search=Hand',M)).d.items[0]; ok(list.stock===8,'rejected sales left stock untouched (P3 stock '+list.stock+')');

// two cashiers racing for the last unit
const results=await Promise.all(Array.from({length:6},()=>call('POST','/sales',C,{items:[{productId:P4.id,quantity:1}],paymentMethod:'cash',clientRef:uuid()})));
const wins=results.filter(x=>x.s===201).length, losses=results.filter(x=>x.s===409).length;
ok(wins===1 && losses===5,'6 simultaneous sales of the last unit: 1 wins, 5 refused (wins '+wins+', refused '+losses+')');
list=(await call('GET','/products?search=Last',M)).d.items[0]; ok(list.stock===0,'stock never goes negative');

// access
r=await call('GET','/sales/'+sale.id,C); ok(r.s===200,'cashier opens own sale');
const mSale=(await call('POST','/sales',M,{items:[{productId:P3.id,quantity:1}],paymentMethod:'cash'})).d.sale;
r=await call('GET','/sales/'+mSale.id,C); ok(r.s===404,'cashier cannot open a manager sale');
r=await call('GET','/sales/'+mSale.id,A); ok(r.s===200,'admin opens any sale');
r=await call('GET','/sales/not-a-uuid',A); ok(r.s===400,'bad sale id gives 400');

// settings + tax
r=await call('GET','/settings',C); ok(r.s===200 && r.d.settings.name==='Hiddekel Pharmacy and Store','cashier can read settings');
r=await call('PUT','/settings',M,{name:'X',taxRate:0}); ok(r.s===403,'manager cannot change settings');
r=await call('PUT','/settings',A,{name:'Hiddekel Pharmacy and Store',address:'12 Test Road',phone:'08000000000',receiptFooter:'Get well soon',taxRate:150}); ok(r.s===400,'tax over 100 rejected');
r=await call('PUT','/settings',A,{name:'Hiddekel Pharmacy and Store',address:'12 Test Road',phone:'08000000000',receiptFooter:'Get well soon',taxRate:7.5}); ok(r.s===200 && r.d.settings.taxRate===7.5,'admin saves settings');
r=await call('POST','/sales',C,{items:[{productId:P3.id,quantity:1}],paymentMethod:'cash'});
ok(r.d.sale.tax===56.25 && r.d.sale.total===806.25 && r.d.sale.pharmacy.address==='12 Test Road' && r.d.sale.pharmacy.receiptFooter==='Get well soon','7.5% VAT: 750 + 56.25 = 806.25, receipt shows new settings');
r=await call('POST','/sales/quote',C,{items:[{productId:P3.id,quantity:2}]}); ok(r.d.tax===112.5 && r.d.total===1612.5,'quote includes VAT');
await call('PUT','/settings',A,{name:'Hiddekel Pharmacy and Store',address:'12 Test Road',phone:'08000000000',receiptFooter:'Get well soon',taxRate:0});

// deleted product
await call('DELETE','/products/'+P3.id,M);
r=await call('POST','/sales',C,{items:[{productId:P3.id,quantity:1}],paymentMethod:'cash'}); ok(r.s===409,'deleted product cannot be sold');

console.log(fails?`\n${fails} FAILED`:'\nALL PASSED');
