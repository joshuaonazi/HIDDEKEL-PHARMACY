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

// categories
let r=await call('GET','/categories',A); ok(r.s===200 && r.d.categories.length===8,'seeded categories listed ('+r.d.categories.length+')');
const analg=r.d.categories.find(c=>c.name==='Analgesics').id, antib=r.d.categories.find(c=>c.name==='Antibiotics').id;
r=await call('POST','/categories',C,{name:'Hacked'}); ok(r.s===403,'cashier cannot create category');
r=await call('POST','/categories',M,{name:'analgesics'}); ok(r.s===409,'duplicate category (case-insensitive) rejected');
r=await call('POST','/categories',M,{name:'Eye Care'}); ok(r.s===201,'manager creates category');
const eye=r.d.category.id;
r=await call('PUT','/categories/'+eye,M,{name:'Eye and Ear'}); ok(r.s===200,'rename category');
r=await call('GET','/products/not-a-uuid',A); ok(r.s===400,'bad id gives 400');

// products
const yesterday=new Date(Date.now()-86400000*30).toISOString().slice(0,10);
r=await call('POST','/products',M,{name:'Paracetamol 500mg',genericName:'Paracetamol',strength:'500mg',dosageForm:'Tablet',categoryId:analg,barcodes:['1234567890123'],reorderLevel:100,
  batches:[{batchNo:'EXPIRED1',expiryDate:yesterday,quantity:50,costPrice:100,sellingPrice:300},{batchNo:'PCT24001',expiryDate:'2027-12-31',quantity:500,costPrice:180,sellingPrice:350},{batchNo:'PCT24002',expiryDate:'2027-02-28',quantity:300,costPrice:185,sellingPrice:360}]});
ok(r.s===201 && r.d.product.stock===850,'create product with 3 batches, stock 850 (got '+r.d.product?.stock+')');
const pid=r.d.product.id;
r=await call('POST','/products',M,{name:'Other',barcodes:['1234567890123']}); ok(r.s===409 && /already belongs/.test(r.d.error),'duplicate barcode rejected: '+r.d.error);
r=await call('POST','/products',C,{name:'Nope'}); ok(r.s===403,'cashier cannot create product');
r=await call('POST','/products',M,{name:''}); ok(r.s===400,'empty name rejected');
r=await call('POST','/products',M,{name:'Bad price',batches:[{costPrice:-1,sellingPrice:5,quantity:1}]}); ok(r.s===400,'negative price rejected');
r=await call('POST','/products',M,{name:'Hand Sanitizer 100ml',itemType:'general',strength:'x',requiresPrescription:true,categoryId:eye,barcodes:['999'],batches:[{quantity:10,costPrice:400,sellingPrice:750}]});
ok(r.s===201 && r.d.product.strength===null && r.d.product.requiresPrescription===false,'general item ignores strength/Rx');
r=await call('POST','/products',M,{name:'Amoxicillin 500mg',genericName:'Amoxicillin',strength:'500mg',dosageForm:'Capsule',categoryId:antib,barcodes:['2222'],reorderLevel:50,batches:[{expiryDate:'2027-06-30',quantity:20,costPrice:220,sellingPrice:400}]});
const amox=r.d.product.id;
r=await call('POST','/products',M,{name:'Vitamin C 1000mg',strength:'1000mg',categoryId:analg,barcodes:[]}); const vitc=r.d.product.id;

r=await call('GET','/products',A); ok(r.d.total===4,'list total 4 (got '+r.d.total+')');
const para=r.d.items.find(i=>i.id===pid); ok(para.sellingPrice===360 && para.stock===850 && para.status==='in','FEFO selling price skips expired, status in ('+para.sellingPrice+')');
ok(r.d.items.find(i=>i.id===amox).status==='low','amoxicillin status low (20<=50)');
ok(r.d.items.find(i=>i.id===vitc).status==='out','no stock -> out');
r=await call('GET','/products?search=1234567',A); ok(r.d.total===1,'search by partial barcode');
r=await call('GET','/products?search=paraceta',A); ok(r.d.total===1,'search by name');
r=await call('GET','/products?search=100%25',A); ok(r.d.total===0,'percent sign is not a wildcard');
r=await call('GET','/products?categoryId='+analg,A); ok(r.d.total===2,'filter by category');
r=await call('GET','/products?status=low',A); ok(r.d.total===1,'filter status low');
r=await call('GET','/products?status=out',A); ok(r.d.total===1,'filter status out');
r=await call('GET','/products?pageSize=2&page=2',A); ok(r.d.items.length===2 && r.d.total===4,'pagination');
r=await call('GET','/products',C); ok(r.s===200 && !JSON.stringify(r.d).includes('costPrice'),'cashier list has no cost');
r=await call('GET','/products/'+pid,C); ok(r.s===200 && !JSON.stringify(r.d).includes('costPrice') && r.d.product.batches.length===3,'cashier detail hides cost');
r=await call('GET','/products/'+pid,M); ok(r.d.product.batches.every(b=>typeof b.costPrice==='number'),'manager sees cost');

// barcode lookup
r=await call('GET','/products/barcode/1234567890123',C); ok(r.s===200 && r.d.sellBatch.batchNo==='PCT24002' && r.d.hasExpiredStock===true,'barcode -> FEFO batch skipping expired ('+r.d.sellBatch?.batchNo+')');
ok(!JSON.stringify(r.d).includes('costPrice'),'barcode lookup hides cost for cashier');
r=await call('GET','/products/barcode/000',C); ok(r.s===404,'unknown barcode 404');

// update
let full=(await call('GET','/products/'+pid,M)).d.product;
const b1=full.batches.find(b=>b.batchNo==='PCT24001');
r=await call('PUT','/products/'+pid,M,{name:'Paracetamol 500mg',genericName:'Paracetamol',strength:'500mg',dosageForm:'Tablet',categoryId:analg,reorderLevel:100,barcodes:['1234567890123','5555'],
  batches:[{id:b1.id,batchNo:'PCT24001',expiryDate:'2027-12-31',quantity:99999,costPrice:190,sellingPrice:380},{batchNo:'NEW1',expiryDate:'2028-01-31',quantity:10,costPrice:200,sellingPrice:390}]});
ok(r.s===200 && r.d.product.barcodes.length===2,'update adds barcode');
const after=r.d.product.batches; ok(after.find(b=>b.id===b1.id).qtyRemaining===500,'quantity not editable through update');
ok(after.find(b=>b.id===b1.id).sellingPrice===380 && after.length===4,'price edited, new batch added, untouched batches kept');
r=await call('PUT','/products/'+amox,M,{name:'Amoxicillin 500mg',barcodes:['1234567890123']}); ok(r.s===409,'cannot steal another product barcode');

// import
r=await call('POST','/products/import',M,{rows:[
 {row:2,name:'Ibuprofen 400mg',genericName:'Ibuprofen',strength:'400mg',dosageForm:'Tablet',category:'Analgesics',barcode:'7001',reorderLevel:'20',batchNo:'IB1',expiryDate:'2027-09-01',quantity:'100',costPrice:'120',sellingPrice:'420'},
 {row:3,name:'Metformin 850mg',category:'Antidiabetic',barcode:'7002',quantity:'60',costPrice:'120',sellingPrice:'220',expiryDate:'2027-01-31'},
 {row:4,name:'Face Mask (3pcs)',itemType:'general',category:'New Cat From Import',barcode:'7003',quantity:'40',costPrice:'200',sellingPrice:'600'},
 {row:5,name:'Paracetamol 500mg',strength:'500mg',dosageForm:'Tablet'},
 {row:6,name:'',category:'x'},
 {row:7,name:'Bad dates',expiryDate:'soon'},
 {row:8,name:'Missing sell',quantity:'5',costPrice:'10'},
 {row:9,name:'Dup barcode in file',barcode:'7001'},
]});
ok(r.s===200 && r.d.created===3,'import created 3 (got '+r.d.created+')');
ok(r.d.skipped.length===2,'import skipped existing by name and by barcode ('+r.d.skipped.length+')');
ok(r.d.errors.length===3,'import reported 3 bad rows: '+r.d.errors.map(e=>e.row).join(','));
r=await call('GET','/categories',A); ok(r.d.categories.some(c=>c.name==='New Cat From Import'),'import created missing category');
r=await call('POST','/products/import',C,{rows:[{name:'x'}]}); ok(r.s===403,'cashier cannot import');

// delete
r=await call('DELETE','/categories/'+analg,M); ok(r.s===409,'cannot delete category in use');
r=await call('DELETE','/products/'+vitc,M); ok(r.s===200,'soft delete product');
r=await call('GET','/products?search=vitamin',A); ok(r.d.total===0,'deleted product hidden');
r=await call('POST','/products',M,{name:'Vitamin C again',barcodes:[]}); ok(r.s===201,'name reusable after delete');
r=await call('DELETE','/products/'+vitc,M); ok(r.s===404,'delete twice gives 404');
r=await call('DELETE','/categories/'+eye,M); ok(r.s===409,'category with product cannot be deleted');
console.log(fails? `\n${fails} FAILED`:'\nALL PASSED');
