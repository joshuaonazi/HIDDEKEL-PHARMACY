const B='http://localhost:5000/api';
let fails=0;
const ok=(c,m)=>{ if(!c){fails++;console.log('FAIL:',m)} else console.log('ok  :',m) };
async function call(method,path,token,body){
  const r=await fetch(B+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  let data=null; try{data=await r.json()}catch{}
  return {s:r.status,d:data};
}
const loginAs=async(e,p='StrongPass123')=> call('POST','/auth/login',null,{email:e,password:p});
const A=(await loginAs('admin@example.com')).d.token, M=(await loginAs('manager@example.com')).d.token, C=(await loginAs('cashier@example.com')).d.token;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

// access
let r=await call('GET','/users',A); ok(r.s===200 && r.d.users.length===3 && !JSON.stringify(r.d).includes('password'),'admin lists users, no password data');
r=await call('GET','/users',M); ok(r.s===403,'manager cannot list users');
r=await call('GET','/users',C); ok(r.s===403,'cashier cannot list users');
r=await call('POST','/users',M,{fullName:'Hack',email:'h@x.com',role:'admin'}); ok(r.s===403,'manager cannot create users');
r=await call('GET','/users',null); ok(r.s===401,'login required');

// create
r=await call('POST','/users',A,{fullName:'Grace Okafor',email:'Grace@Example.com',role:'cashier'});
const grace=r.d.user, temp=r.d.temporaryPassword;
ok(r.s===201 && grace.email==='grace@example.com' && grace.mustChangePassword===true,'user created, email lower-cased, must change password');
ok(/^[A-HJ-NP-Za-km-z2-9]{12}$/.test(temp) && /[A-Z]/.test(temp) && /[a-z]/.test(temp) && /[0-9]/.test(temp),'temporary password is 12 readable characters: '+temp.replace(/./g,'*'));
r=await call('POST','/users',A,{fullName:'Dup',email:'GRACE@example.com',role:'cashier'}); ok(r.s===409,'duplicate email (any capitals) refused');
r=await call('POST','/users',A,{fullName:'X',email:'x@example.com',role:'cashier'}); ok(r.s===400,'one-letter name refused');
r=await call('POST','/users',A,{fullName:'Bad Mail',email:'nope',role:'cashier'}); ok(r.s===400,'bad email refused');
r=await call('POST','/users',A,{fullName:'Bad Role',email:'b@example.com',role:'owner'}); ok(r.s===400,'unknown role refused');

// first login must change password
r=await loginAs('grace@example.com',temp); const tok1=r.d.token;
ok(r.s===200 && r.d.user.mustChangePassword===true,'temp password logs in and flags the change');
r=await call('GET','/products',tok1); ok(r.s===403 && r.d.code==='PASSWORD_CHANGE_REQUIRED','everything else is locked until the password is changed');
r=await call('GET','/auth/me',tok1); ok(r.s===200 && r.d.user.mustChangePassword===true,'/auth/me still works');
r=await call('POST','/auth/change-password',tok1,{currentPassword:'wrong-one',newPassword:'Brand-New-Pass-77'}); ok(r.s===400,'wrong current password refused');
r=await call('POST','/auth/change-password',tok1,{currentPassword:temp,newPassword:'short1'}); ok(r.s===400 && /10 characters/.test(r.d.error),'short password refused: '+r.d.error);
r=await call('POST','/auth/change-password',tok1,{currentPassword:temp,newPassword:'onlylettersonly'}); ok(r.s===400,'letters-only password refused: '+r.d.error);
r=await call('POST','/auth/change-password',tok1,{currentPassword:temp,newPassword:'Password12345'}); ok(r.s===400 && /common/.test(r.d.error),'common password refused: '+r.d.error);
r=await call('POST','/auth/change-password',tok1,{currentPassword:temp,newPassword:'graceokafor2026'}); ok(r.s===400,'password containing the name/email refused: '+r.d.error);
r=await call('POST','/auth/change-password',tok1,{currentPassword:temp,newPassword:temp}); ok(r.s===400,'same password refused');
r=await call('POST','/auth/change-password',null,{currentPassword:'a',newPassword:'b'}); ok(r.s===401,'change-password needs login');
r=await call('POST','/auth/change-password',tok1,{currentPassword:temp,newPassword:'Zebra-Quartz-4821'});
const tok2=r.d.token; ok(r.s===200 && r.d.user.mustChangePassword===false && tok2,'strong password accepted, new token issued');
r=await call('GET','/products',tok1); ok(r.s===401,'old token no longer works');
r=await call('GET','/products',tok2); ok(r.s===200,'new token works everywhere');
r=await loginAs('grace@example.com',temp); ok(r.s===401,'temporary password no longer works');
r=await loginAs('grace@example.com','Zebra-Quartz-4821'); ok(r.s===200 && r.d.user.mustChangePassword===false,'new password logs in normally');

// update and guards
r=await call('PUT','/users/'+grace.id,A,{fullName:'Grace Okafor-Eze',email:'grace@example.com',role:'manager',isActive:true});
ok(r.s===200 && r.d.user.role==='manager' && r.d.user.fullName==='Grace Okafor-Eze','admin changes name and role');
const adminId=(await call('GET','/users',A)).d.users.find(u=>u.email==='admin@example.com').id;
r=await call('PUT','/users/'+adminId,A,{fullName:'Test Admin',email:'admin@example.com',role:'manager',isActive:true}); ok(r.s===400,'admin cannot demote themselves: '+r.d.error);
r=await call('PUT','/users/'+adminId,A,{fullName:'Test Admin',email:'admin@example.com',role:'admin',isActive:false}); ok(r.s===400,'admin cannot deactivate themselves: '+r.d.error);
r=await call('PUT','/users/'+grace.id,A,{fullName:'Grace',email:'manager@example.com',role:'manager',isActive:true}); ok(r.s===409,'cannot take another account\'s email');
r=await call('PUT','/users/'+grace.id,C,{fullName:'Grace',email:'grace@example.com',role:'admin',isActive:true}); ok(r.s===403,'cashier cannot edit users');
r=await call('PUT','/users/00000000-0000-4000-8000-000000000000',A,{fullName:'Nobody',email:'n@example.com',role:'cashier',isActive:true}); ok(r.s===404,'unknown user 404');
r=await call('PUT','/users/not-a-uuid',A,{fullName:'Nobody',email:'n@example.com',role:'cashier',isActive:true}); ok(r.s===400,'bad id 400');

// deactivate / reactivate
r=await call('PUT','/users/'+grace.id,A,{fullName:'Grace Okafor-Eze',email:'grace@example.com',role:'manager',isActive:false}); ok(r.s===200 && r.d.user.isActive===false,'deactivated');
r=await call('GET','/products',tok2); ok(r.s===401,'deactivated user is signed out immediately');
r=await loginAs('grace@example.com','Zebra-Quartz-4821'); ok(r.s===403,'deactivated user cannot log in');
r=await call('PUT','/users/'+grace.id,A,{fullName:'Grace Okafor-Eze',email:'grace@example.com',role:'manager',isActive:true}); ok(r.s===200,'reactivated');
r=await call('GET','/products',tok2); ok(r.s===401,'old sessions stay dead after reactivation');
r=await loginAs('grace@example.com','Zebra-Quartz-4821'); ok(r.s===200,'can log in again');

// second admin and the last-admin rule
r=await call('POST','/users',A,{fullName:'Second Admin',email:'second@example.com',role:'admin'}); const second=r.d.user;
r=await call('PUT','/users/'+second.id,A,{fullName:'Second Admin',email:'second@example.com',role:'manager',isActive:true}); ok(r.s===200,'one admin may demote another while an active admin remains');

// reset password
r=await call('POST','/users/'+grace.id+'/reset-password',A); const temp2=r.d.temporaryPassword;
ok(r.s===200 && temp2 && temp2!==temp,'admin resets a password and gets a new temporary one');
r=await loginAs('grace@example.com','Zebra-Quartz-4821'); ok(r.s===401,'old password stops working');
r=await loginAs('grace@example.com',temp2); ok(r.s===200 && r.d.user.mustChangePassword===true,'temporary password forces another change');
r=await call('POST','/users/'+adminId+'/reset-password',A); ok(r.s===400,'admin cannot reset their own password this way');
r=await call('POST','/users/'+grace.id+'/reset-password',C); ok(r.s===403,'cashier cannot reset passwords');

// audit trail
await sleep(100);
const {execSync}=await import('node:child_process');
const q=(sql)=>execSync(`PGPASSWORD=testpw psql -h localhost -U postgres -d hiddekel -tAc "${sql}"`).toString().trim();
ok(Number(q("select count(*) from audit_logs where action in ('user.create','user.update','user.reset_password','user.change_password')"))>=7,'user actions are in the audit log');
ok(Number(q(`select count(*) from audit_logs where details::text like '%${temp}%' or details::text like '%${temp2}%' or details::text like '%Zebra%'`))===0,'no password appears in the audit log');
ok(q("select count(*) from users where password_hash like '$2%'")===q("select count(*) from users"),'all passwords are stored as bcrypt hashes');
console.log(fails?`\n${fails} FAILED`:'\nALL PASSED');
