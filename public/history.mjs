let database;
function openDatabase() {
  return database ||= new Promise((resolve,reject) => {
    const request=indexedDB.open('pdf-html-conversions',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('conversions',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function transaction(mode,action) {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('conversions',mode);
    const request=action(tx.objectStore('conversions'));
    tx.oncomplete=()=>resolve(request.result);
    tx.onerror=()=>reject(tx.error || request.error);
    tx.onabort=()=>reject(tx.error || new Error('Storage operation was interrupted.'));
  });
}
export const saveConversion = record => transaction('readwrite',store=>store.put(record));
export const readConversion = id => transaction('readonly',store=>store.get(id));
export const deleteConversion = id => transaction('readwrite',store=>store.delete(id));
export async function listConversions() {
  const records=await transaction('readonly',store=>store.getAll());
  return records.map(({id,name,createdAt,updatedAt,pageCount,format})=>({id,name,createdAt,updatedAt,pageCount,format})).sort((a,b)=>b.updatedAt-a.updatedAt);
}
